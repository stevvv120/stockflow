import { pool } from "../config/db";

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

export async function createSale(userId: number, rawItems: SaleItemInput[]) {
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

    // 2. Kunci baris produk (urut berdasarkan id agar tidak deadlock)
    const [products]: any = await conn.query(
      `SELECT id, name, selling_price, cost_price, stock
       FROM products WHERE id IN (?) ORDER BY id FOR UPDATE`,
      [ids]
    );
    if (products.length !== ids.length) {
      throw new SaleError("Ada produk yang tidak ditemukan", 404);
    }

    // 3. Cek stok dan hitung total DI BACKEND memakai harga dari database
    let total = 0;
    const lines = products.map((p: any) => {
      const qty = wanted.get(p.id)!;
      if (p.stock < qty) {
        throw new SaleError(`Stok "${p.name}" tidak cukup (tersisa ${p.stock})`, 409);
      }
      const unitPrice = Number(p.selling_price);
      const subtotal = Math.round(unitPrice * qty * 100) / 100;
      total += subtotal;
      return { id: p.id, qty, unitPrice, unitCost: Number(p.cost_price), subtotal };
    });

    // 4. Simpan transaksi, lalu buat nomor invoice dari id
    const [sale]: any = await conn.query(
      "INSERT INTO sales (invoice_number, user_id, total_amount) VALUES (?, ?, ?)",
      [`TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, userId, total]
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
      await conn.query("UPDATE products SET stock = stock - ? WHERE id = ?", [l.qty, l.id]);
      await conn.query(
        `INSERT INTO stock_movements (product_id, user_id, movement_type, quantity, reference_id, note)
         VALUES (?, ?, 'out', ?, ?, ?)`,
        [l.id, userId, -l.qty, saleId, `Penjualan ${invoice}`]
      );
    }

    await conn.commit();
    return { id: saleId, invoice_number: invoice, total_amount: total };
  } catch (err) {
    await conn.rollback(); // satu langkah gagal = semua dibatalkan
    throw err;
  } finally {
    conn.release();
  }
}