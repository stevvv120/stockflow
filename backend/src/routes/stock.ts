import { Router } from "express";
import { pool } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/auditService";

const router = Router();

// POST /api/stock : barang masuk atau penyesuaian stok (admin)
router.post("/", authenticate, requireRole("admin"), async (req, res) => {
  const { product_id, warehouse_id, movement_type, quantity, note } = req.body;
  const qty = Number(quantity);

  if (!Number.isInteger(Number(product_id)) || Number(product_id) <= 0 || !Number.isSafeInteger(qty) || qty === 0) {
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

    const [warehouses]: any = warehouse_id
      ? await conn.query("SELECT id FROM warehouses WHERE id = ? AND is_active = TRUE FOR UPDATE", [Number(warehouse_id)])
      : await conn.query("SELECT id FROM warehouses WHERE is_default = TRUE AND is_active = TRUE ORDER BY id LIMIT 1 FOR UPDATE");
    if (!warehouses.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Gudang tidak ditemukan atau tidak aktif" });
    }
    const warehouseId = Number(warehouses[0].id);
    const [rows]: any = await conn.query("SELECT stock FROM products WHERE id = ? FOR UPDATE", [Number(product_id)]);
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }
    await conn.query(
      "INSERT IGNORE INTO warehouse_stocks (warehouse_id, product_id) VALUES (?, ?)",
      [warehouseId, Number(product_id)]
    );
    const [balances]: any = await conn.query(
      "SELECT on_hand, reserved FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? FOR UPDATE",
      [warehouseId, Number(product_id)]
    );
    const newWarehouseStock = Number(balances[0].on_hand) + qty;
    if (newWarehouseStock < 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Stok gudang tidak boleh negatif" });
    }
    if (newWarehouseStock < Number(balances[0].reserved)) {
      await conn.rollback();
      return res.status(409).json({ message: "Penyesuaian tidak boleh mengurangi stok di bawah jumlah yang direservasi" });
    }

    const newStock = Number(rows[0].stock) + qty;
    if (newStock < 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Stok total tidak boleh negatif" });
    }
    await conn.query(
      "UPDATE warehouse_stocks SET on_hand = ? WHERE warehouse_id = ? AND product_id = ?",
      [newWarehouseStock, warehouseId, Number(product_id)]
    );
    await conn.query("UPDATE products SET stock = ? WHERE id = ?", [newStock, Number(product_id)]);
    await conn.query(
      `INSERT INTO stock_movements (warehouse_id, product_id, user_id, movement_type, quantity, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [warehouseId, Number(product_id), (req as any).user.id, movement_type, qty, note ?? null]
    );
    await writeAudit(conn, (req as any).user.id, `stock.${movement_type}`, "product", Number(product_id), {
      warehouse_id: warehouseId, quantity: qty, note: note ?? null,
    });

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
    const { product_id, warehouse_id } = req.query;
    let sql = `
      SELECT m.id, m.movement_type, m.quantity, m.note, m.created_at, w.name AS warehouse_name,
             p.sku, p.name AS product_name, u.name AS user_name
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      JOIN warehouses w ON w.id = m.warehouse_id
      LEFT JOIN users u ON u.id = m.user_id
      WHERE 1=1`;
    const params: any[] = [];
    if (product_id) {
      sql += " AND m.product_id = ?";
      params.push(Number(product_id));
    }
    if (warehouse_id) {
      sql += " AND m.warehouse_id = ?";
      params.push(Number(warehouse_id));
    }
    sql += " ORDER BY m.id DESC LIMIT 200";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

export default router;