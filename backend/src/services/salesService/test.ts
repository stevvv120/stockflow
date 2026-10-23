import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { pool } from "../../config/db";
import { createSale, SaleError } from "../salesService";
import workflowRoutes from "../../routes/workflows";

let userId: number;
let productId: number;
let server: Server;
let baseUrl: string;

function adminToken() {
  return jwt.sign({ id: userId, name: "Tester", role: "admin" }, process.env.JWT_SECRET as string);
}

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${adminToken()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) console.error("Workflow test request failed:", method, path, response.status, data);
  return { status: response.status, data };
}

async function stockOf(id: number): Promise<number> {
  const [rows]: any = await pool.query("SELECT stock FROM products WHERE id = ?", [id]);
  return rows[0].stock;
}

async function count(table: string): Promise<number> {
  const [rows]: any = await pool.query(`SELECT COUNT(*) AS n FROM ${table}`);
  return rows[0].n;
}

beforeAll(async () => {
  // Pengaman: jangan pernah menghapus data di database asli
  if (process.env.DB_NAME !== "stockflow_test") {
    throw new Error("Tes harus memakai database stockflow_test");
  }
  const app = express();
  app.use(express.json());
  app.use("/workflows", workflowRoutes);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Gagal memulai server uji");
  baseUrl = `http://127.0.0.1:${address.port}/workflows`;
});

beforeEach(async () => {
  // Urutan hapus mengikuti foreign key
  for (const t of [
    "shipment_events", "shipments", "customer_order_items", "customer_orders",
    "purchase_order_items", "purchase_orders", "suppliers", "audit_logs", "stock_movements",
    "sale_items", "sales", "warehouse_stocks", "products", "categories", "users",
  ]) {
    await pool.query(`DELETE FROM ${t}`);
  }
  await pool.query("DELETE FROM warehouses WHERE is_default = FALSE");
  const [u]: any = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ('Tester', 'tester@test.local', 'x', 'staff')"
  );
  userId = u.insertId;
  const [p]: any = await pool.query(
    `INSERT INTO products (sku, name, cost_price, selling_price, stock, minimum_stock)
     VALUES ('T-1', 'Produk Tes', 6000, 10000, 5, 2)`
  );
  productId = p.insertId;
  await pool.query(
    `INSERT INTO warehouse_stocks (warehouse_id, product_id, on_hand)
     SELECT id, ?, 5 FROM warehouses WHERE is_default = TRUE ORDER BY id LIMIT 1`,
    [productId]
  );
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

describe("createSale", () => {
  it("menyimpan transaksi, mengurangi stok, dan mencatat pergerakan stok", async () => {
    const sale = await createSale(userId, [{ product_id: productId, quantity: 2 }]);

    expect(sale.total_amount).toBe(20000);
    expect(sale.invoice_number).toMatch(/^INV-\d{8}-\d{5}$/);
    expect(await stockOf(productId)).toBe(3);
    expect(await count("sales")).toBe(1);
    expect(await count("sale_items")).toBe(1);

    const [mv]: any = await pool.query("SELECT movement_type, quantity FROM stock_movements");
    expect(mv).toHaveLength(1);
    expect(mv[0].movement_type).toBe("out");
    expect(mv[0].quantity).toBe(-2);
  });

  it("menolak penjualan saat stok tidak cukup dan tidak mengubah data apa pun", async () => {
    await expect(
      createSale(userId, [{ product_id: productId, quantity: 6 }])
    ).rejects.toThrow(SaleError);

    expect(await stockOf(productId)).toBe(5);
    expect(await count("sales")).toBe(0);
    expect(await count("sale_items")).toBe(0);
    expect(await count("stock_movements")).toBe(0);
  });

  it("menolak keranjang kosong", async () => {
    await expect(createSale(userId, [])).rejects.toThrow("Keranjang kosong");
  });

  it("menolak jumlah nol, negatif, atau pecahan", async () => {
    for (const quantity of [0, -1, 1.5]) {
      await expect(
        createSale(userId, [{ product_id: productId, quantity }])
      ).rejects.toThrow(SaleError);
    }
    expect(await stockOf(productId)).toBe(5);
  });

  it("menolak produk yang tidak ada", async () => {
    await expect(
      createSale(userId, [{ product_id: 999999, quantity: 1 }])
    ).rejects.toThrow(SaleError);
  });

  it("menggabungkan produk yang sama dalam satu keranjang", async () => {
    const sale = await createSale(userId, [
      { product_id: productId, quantity: 1 },
      { product_id: productId, quantity: 2 },
    ]);
    expect(sale.total_amount).toBe(30000);
    expect(await stockOf(productId)).toBe(2);
  });

  it("dua penjualan bersamaan untuk stok terakhir: hanya satu yang berhasil", async () => {
    await pool.query("UPDATE products SET stock = 1 WHERE id = ?", [productId]);
    await pool.query("UPDATE warehouse_stocks SET on_hand = 1 WHERE product_id = ?", [productId]);

    const results = await Promise.allSettled([
      createSale(userId, [{ product_id: productId, quantity: 1 }]),
      createSale(userId, [{ product_id: productId, quantity: 1 }]),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await stockOf(productId)).toBe(0); // tidak pernah negatif
    expect(await count("sales")).toBe(1);
  });

  it("mentransfer stok antar gudang tanpa mengubah total produk", async () => {
    const created = await request("/warehouses", "POST", { code: "BRANCH", name: "Gudang Cabang" });
    expect(created.status).toBe(201);
    const [main]: any = await pool.query("SELECT id FROM warehouses WHERE is_default = TRUE");
    const [sourceBalance]: any = await pool.query(
      "SELECT on_hand, reserved FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ?",
      [main[0].id, productId]
    );
    expect(sourceBalance[0]).toMatchObject({ on_hand: 5, reserved: 0 });
    const transferred = await request("/stock/transfers", "POST", {
      from_warehouse_id: main[0].id,
      to_warehouse_id: created.data.id,
      product_id: productId,
      quantity: 2,
    });
    expect(transferred.status).toBe(201);
    const [levels]: any = await pool.query(
      "SELECT warehouse_id, on_hand FROM warehouse_stocks WHERE product_id = ? ORDER BY warehouse_id",
      [productId]
    );
    expect(levels.map((row: any) => Number(row.on_hand))).toEqual([3, 2]);
    expect(await stockOf(productId)).toBe(5);
  });

  it("mereservasi pesanan, membuat invoice saat dikirim, dan menutup fulfillment", async () => {
    const [main]: any = await pool.query("SELECT id FROM warehouses WHERE is_default = TRUE");
    const created = await request("/orders", "POST", {
      warehouse_id: main[0].id,
      items: [{ product_id: productId, quantity: 2 }],
    });
    expect(created.status).toBe(201);
    let [levels]: any = await pool.query(
      "SELECT on_hand, reserved FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ?",
      [main[0].id, productId]
    );
    expect(levels[0]).toMatchObject({ on_hand: 5, reserved: 2 });

    const approved = await request(`/orders/${created.data.id}/review`, "POST", { action: "approve" });
    expect(approved.status).toBe(200);
    const [shipments]: any = await pool.query("SELECT id FROM shipments WHERE customer_order_id = ?", [created.data.id]);
    const shipped = await request(`/shipments/${shipments[0].id}/status`, "POST", {
      status: "shipped",
      tracking_number: "TEST-TRACK-1",
    });
    expect(shipped.status).toBe(200);
    const inTransit = await request(`/shipments/${shipments[0].id}/status`, "POST", { status: "in_transit" });
    const delivered = await request(`/shipments/${shipments[0].id}/status`, "POST", { status: "delivered" });
    expect(inTransit.status).toBe(200);
    expect(delivered.status).toBe(200);
    expect(await stockOf(productId)).toBe(3);
    expect(await count("sales")).toBe(1);
    const [order]: any = await pool.query("SELECT status, sale_id FROM customer_orders WHERE id = ?", [created.data.id]);
    expect(order[0].status).toBe("fulfilled");
    expect(order[0].sale_id).toBeTruthy();
  });

  it("menerima PO secara parsial dan menambah stok pada setiap penerimaan", async () => {
    const supplier = await request("/suppliers", "POST", { name: "Supplier Tes" });
    const [main]: any = await pool.query("SELECT id FROM warehouses WHERE is_default = TRUE");
    const purchase = await request("/purchase-orders", "POST", {
      supplier_id: supplier.data.id,
      warehouse_id: main[0].id,
      items: [{ product_id: productId, quantity: 4 }],
    });
    expect(purchase.status).toBe(201);
    expect((await request(`/purchase-orders/${purchase.data.id}/submit`, "POST")).status).toBe(200);
    expect((await request(`/purchase-orders/${purchase.data.id}/review`, "POST", { action: "approve" })).status).toBe(200);
    const [details]: any = await pool.query("SELECT id FROM purchase_order_items WHERE purchase_order_id = ?", [purchase.data.id]);
    const first = await request(`/purchase-orders/${purchase.data.id}/receive`, "POST", {
      items: [{ item_id: details[0].id, quantity: 2 }],
    });
    expect(first.data.status).toBe("partially_received");
    const second = await request(`/purchase-orders/${purchase.data.id}/receive`, "POST", {
      items: [{ item_id: details[0].id, quantity: 2 }],
    });
    expect(second.data.status).toBe("received");
    expect(await stockOf(productId)).toBe(9);
  });
});