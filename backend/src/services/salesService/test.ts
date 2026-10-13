import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { pool } from "../../config/db";
import { createSale, SaleError } from "../salesService";

let userId: number;
let productId: number;

async function stockOf(id: number): Promise<number> {
  const [rows]: any = await pool.query("SELECT stock FROM products WHERE id = ?", [id]);
  return rows[0].stock;
}

async function count(table: string): Promise<number> {
  const [rows]: any = await pool.query(`SELECT COUNT(*) AS n FROM ${table}`);
  return rows[0].n;
}

beforeAll(() => {
  // Pengaman: jangan pernah menghapus data di database asli
  if (process.env.DB_NAME !== "stockflow_test") {
    throw new Error("Tes harus memakai database stockflow_test");
  }
});

beforeEach(async () => {
  // Urutan hapus mengikuti foreign key
  for (const t of ["stock_movements", "sale_items", "sales", "products", "categories", "users"]) {
    await pool.query(`DELETE FROM ${t}`);
  }
  const [u]: any = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ('Tester', 'tester@test.local', 'x', 'staff')"
  );
  userId = u.insertId;
  const [p]: any = await pool.query(
    `INSERT INTO products (sku, name, cost_price, selling_price, stock, minimum_stock)
     VALUES ('T-1', 'Produk Tes', 6000, 10000, 5, 2)`
  );
  productId = p.insertId;
});

afterAll(async () => {
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

    const results = await Promise.allSettled([
      createSale(userId, [{ product_id: productId, quantity: 1 }]),
      createSale(userId, [{ product_id: productId, quantity: 1 }]),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await stockOf(productId)).toBe(0); // tidak pernah negatif
    expect(await count("sales")).toBe(1);
  });
});