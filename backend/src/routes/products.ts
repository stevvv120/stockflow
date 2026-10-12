import { Router } from "express";
import { pool } from "../config/db";

const router = Router();

// GET /api/products?search=...&category_id=...
router.get("/", async (req, res) => {
  try {
    const { search, category_id } = req.query;
    let sql = `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE 1=1`;
    const params: any[] = [];

    if (search) {
      sql += " AND (p.name LIKE ? OR p.sku LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category_id) {
      sql += " AND p.category_id = ?";
      params.push(Number(category_id));
    }
    sql += " ORDER BY p.id DESC";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// POST /api/products
router.post("/", async (req, res) => {
  try {
    const { category_id, sku, name, cost_price, selling_price, stock, minimum_stock } = req.body;

    if (!sku || !name || selling_price == null) {
      return res.status(400).json({ message: "sku, name, dan selling_price wajib diisi" });
    }

    const [result]: any = await pool.query(
      `INSERT INTO products
        (category_id, sku, name, cost_price, selling_price, stock, minimum_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [category_id ?? null, sku, name, cost_price ?? 0, selling_price, stock ?? 0, minimum_stock ?? 5]
    );

    res.status(201).json({ id: result.insertId, message: "Produk ditambahkan" });
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "SKU sudah dipakai" });
    }
    res.status(500).json({ message: String(err) });
  }
});

export default router;