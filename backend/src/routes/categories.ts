import { Router } from "express";
import { pool } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

// GET /api/categories
router.get("/", authenticate, async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name FROM categories ORDER BY name");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// POST /api/categories
router.post("/", authenticate, requireRole("admin"), async (req, res) => {
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

// PUT /api/categories/:id
router.put("/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name wajib diisi" });
    }
    const [result]: any = await pool.query("UPDATE categories SET name = ? WHERE id = ?", [
      String(name).trim(),
      Number(req.params.id),
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Kategori tidak ditemukan" });
    }
    res.json({ message: "Kategori diperbarui" });
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Kategori sudah ada" });
    }
    res.status(500).json({ message: String(err) });
  }
});

// DELETE /api/categories/:id
router.delete("/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const [result]: any = await pool.query("DELETE FROM categories WHERE id = ?", [
      Number(req.params.id),
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Kategori tidak ditemukan" });
    }
    res.json({ message: "Kategori dihapus" });
  } catch (err: any) {
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({ message: "Kategori masih dipakai produk dan tidak bisa dihapus" });
    }
    res.status(500).json({ message: String(err) });
  }
});

export default router;