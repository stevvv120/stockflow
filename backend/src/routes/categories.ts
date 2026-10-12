import { Router } from "express";
import { pool } from "../config/db";

const router = Router();

// GET /api/categories
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name FROM categories ORDER BY name");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// POST /api/categories
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "name wajib diisi" });

    const [result]: any = await pool.query("INSERT INTO categories (name) VALUES (?)", [name]);
    res.status(201).json({ id: result.insertId, message: "Kategori ditambahkan" });
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Kategori sudah ada" });
    }
    res.status(500).json({ message: String(err) });
  }
});

export default router;