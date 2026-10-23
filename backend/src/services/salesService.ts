import { pool } from "../config/db";
import { writeAudit } from "./auditService";

export class SaleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface SaleItemInput {
  product_id: number;
  quantity: number;
}

export async function createSale(userId: number, rawItems: SaleItemInput[], requestedWarehouseId?: number) {
  // 1. Validasi input dan gabungkan produk yang sama
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new SaleError("Keranjang kosong");
  }
  const wanted = new Map<number, number>();
  for (const it of rawItems) {
    const pid = Number(it?.product_id);
    const qty = Number(it?.quantity);
    if (!Number.isInteger(pid) || !Number.isInteger(qty) || qty <= 0) {
      throw new SaleError("Item tidak valid: jumlah harus bilangan bulat positif");
    }
    wanted.set(pid, (wanted.get(pid) ?? 0) + qty);
  }
  const ids = [...wanted.keys()].sort((a, b) => a - b);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [warehouses]: any = requestedWarehouseId
      ? await conn.query("SELECT id FROM warehouses WHERE id = ? AND is_active = TRUE FOR UPDATE", [requestedWarehouseId])
      : await conn.query("SELECT id FROM warehouses WHERE is_default = TRUE AND is_active = TRUE ORDER BY id LIMIT 1 FOR UPDATE");
    if (!warehouses.length) throw new SaleError("Gudang tidak ditemukan atau tidak aktif", 404);
    const warehouseId = Number(warehouses[0].id);

    // Lock products and warehouse balances in stable order to avoid overselling.
    const [products]: any = await conn.query(
      `SELECT id, name, selling_price, cost_price, stock
       FROM products WHERE id IN (?) ORDER BY id FOR UPDATE`,
      [ids]
    );
    if (products.length !== ids.length) {
      throw new SaleError("Ada produk yang tidak ditemukan", 404);
    }
    for (const id of ids) {
      await conn.query(
        "INSERT IGNORE INTO warehouse_stocks (warehouse_id, product_id) VALUES (?, ?)",
        [warehouseId, id]
      );
    }
    const [balances]: any = await conn.query(
      `SELECT product_id, on_hand, reserved FROM warehouse_stocks
       WHERE warehouse_id = ? AND product_id IN (?) ORDER BY product_id FOR UPDATE`,
      [warehouseId, ids]
    );
    const stockByProduct = new Map<number, { on_hand: number; reserved: number }>(
      balances.map((balance: any) => [Number(balance.product_id), balance])
    );

    // 3. Cek stok dan hitung total DI BACKEND memakai harga dari database
    let total = 0;
    const lines = products.map((p: any) => {
      const qty = wanted.get(p.id)!;
      const balance = stockByProduct.get(Number(p.id));
      const available = balance ? balance.on_hand - balance.reserved : 0;
      if (!balance || available < qty) {
        throw new SaleError(`Stok "${p.name}" tidak cukup (tersedia ${available})`, 409);
      }
      const unitPrice = Number(p.selling_price);
      const subtotal = Math.round(unitPrice * qty * 100) / 100;
      total += subtotal;
      return { id: p.id, qty, unitPrice, unitCost: Number(p.cost_price), subtotal };
    });

    // 4. Simpan transaksi, lalu buat nomor invoice dari id
    const [sale]: any = await conn.query(
      "INSERT INTO sales (invoice_number, user_id, warehouse_id, total_amount) VALUES (?, ?, ?, ?)",
      [`TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, userId, warehouseId, total]
    );
    const saleId: number = sale.insertId;
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const invoice = `INV-${ymd}-${String(saleId).padStart(5, "0")}`;
    await conn.query("UPDATE sales SET invoice_number = ? WHERE id = ?", [invoice, saleId]);

    // 5. Simpan item, kurangi stok, catat pergerakan stok
    for (const l of lines) {
      await conn.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, unit_cost, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [saleId, l.id, l.qty, l.unitPrice, l.unitCost, l.subtotal]
      );
      await conn.query(
        "UPDATE warehouse_stocks SET on_hand = on_hand - ? WHERE warehouse_id = ? AND product_id = ?",
        [l.qty, warehouseId, l.id]
      );
      await conn.query("UPDATE products SET stock = stock - ? WHERE id = ?", [l.qty, l.id]);
      await conn.query(
        `INSERT INTO stock_movements (warehouse_id, product_id, user_id, movement_type, quantity, reference_id, note)
         VALUES (?, ?, ?, 'out', ?, ?, ?)`,
        [warehouseId, l.id, userId, -l.qty, saleId, `Penjualan ${invoice}`]
      );
    }

    await writeAudit(conn, userId, "sale.created", "sale", saleId, {
      warehouse_id: warehouseId, total_amount: total, line_count: lines.length,
    });
    await conn.commit();
    return { id: saleId, invoice_number: invoice, total_amount: total };
  } catch (err) {
    await conn.rollback(); // satu langkah gagal = semua dibatalkan
    throw err;
  } finally {
    conn.release();
  }
}