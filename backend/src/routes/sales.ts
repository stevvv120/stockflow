import { Router } from "express";
import { pool } from "../config/db";
import { authenticate } from "../middleware/auth";
import { createSale, SaleError } from "../services/salesService";

const router = Router();

// POST /api/sales : admin dan staff boleh
router.post("/", authenticate, async (req, res) => {
  try {
    const warehouseId = req.body.warehouse_id == null ? undefined : Number(req.body.warehouse_id);
    if (warehouseId !== undefined && (!Number.isInteger(warehouseId) || warehouseId <= 0)) {
      return res.status(400).json({ message: "warehouse_id tidak valid" });
    }
    const result = await createSale((req as any).user.id, req.body.items, warehouseId);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof SaleError) {
      return res.status(err.status).json({ message: err.message });
    }
    res.status(500).json({ message: String(err) });
  }
});

// GET /api/sales
router.get("/", authenticate, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.invoice_number, s.total_amount, s.created_at, u.name AS user_name, w.name AS warehouse_name
       FROM sales s JOIN users u ON u.id = s.user_id
       JOIN warehouses w ON w.id = s.warehouse_id
       ORDER BY s.id DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// GET /api/sales/:id : detail invoice
router.get("/:id", authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [sales]: any = await pool.query(
      `SELECT s.id, s.invoice_number, s.total_amount, s.created_at, u.name AS user_name, w.name AS warehouse_name
       FROM sales s JOIN users u ON u.id = s.user_id
       JOIN warehouses w ON w.id = s.warehouse_id WHERE s.id = ?`,
      [id]
    );
    if (sales.length === 0) return res.status(404).json({ message: "Transaksi tidak ditemukan" });

    const [items] = await pool.query(
      `SELECT si.quantity, si.unit_price, si.subtotal, p.sku, p.name AS product_name
       FROM sale_items si JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = ?`,
      [id]
    );
    res.json({ ...sales[0], items });
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

export default router;