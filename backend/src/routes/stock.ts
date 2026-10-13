import { Router } from "express";
import { pool } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

// POST /api/stock : barang masuk atau penyesuaian stok (admin)
router.post("/", authenticate, requireRole("admin"), async (req, res) => {
  const { product_id, movement_type, quantity, note } = req.body;
  const qty = Number(quantity);

  if (!product_id || !Number.isInteger(qty) || qty === 0) {
    return res.status(400).json({ message: "product_id dan quantity (bilangan bulat, bukan 0) wajib diisi" });
  }
  if (!["in", "adjustment"].includes(movement_type)) {
    return res.status(400).json({ message: "movement_type harus 'in' atau 'adjustment'" });
  }
  if (movement_type === "in" && qty < 0) {
    return res.status(400).json({ message: "Barang masuk harus bernilai positif" });
  }
  if (movement_type === "adjustment" && !note) {
    return res.status(400).json({ message: "Penyesuaian wajib disertai catatan alasan" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // FOR UPDATE mengunci baris produk agar tidak bentrok dengan transaksi lain
    const [rows]: any = await conn.query(
      "SELECT stock FROM products WHERE id = ? FOR UPDATE",
      [Number(product_id)]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }

    const newStock = rows[0].stock + qty;
    if (newStock < 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Stok tidak boleh negatif" });
    }

    await conn.query("UPDATE products SET stock = ? WHERE id = ?", [newStock, Number(product_id)]);
    await conn.query(
      `INSERT INTO stock_movements (product_id, user_id, movement_type, quantity, note)
       VALUES (?, ?, ?, ?, ?)`,
      [Number(product_id), (req as any).user.id, movement_type, qty, note ?? null]
    );

    await conn.commit();
    res.status(201).json({ message: "Stok diperbarui", stock: newStock });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    conn.release();
  }
});

// GET /api/stock/movements?product_id=...
router.get("/movements", authenticate, async (req, res) => {
  try {
    const { product_id } = req.query;
    let sql = `
      SELECT m.id, m.movement_type, m.quantity, m.note, m.created_at,
             p.sku, p.name AS product_name, u.name AS user_name
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN users u ON u.id = m.user_id
      WHERE 1=1`;
    const params: any[] = [];
    if (product_id) {
      sql += " AND m.product_id = ?";
      params.push(Number(product_id));
    }
    sql += " ORDER BY m.id DESC LIMIT 200";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

export default router;