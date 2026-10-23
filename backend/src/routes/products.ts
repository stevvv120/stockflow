import { Router } from "express";
import { pool } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/auditService";

const router = Router();

// GET /api/products?search=...&category_id=...
router.get("/", authenticate, async (req, res) => {  try {
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
router.post("/", authenticate, requireRole("admin"), async (req, res) => {
  const { category_id, sku, name, cost_price, selling_price, stock, minimum_stock } = req.body;

  if (!sku || !name || selling_price == null) {
    return res.status(400).json({ message: "sku, name, dan selling_price wajib diisi" });
  }

  const initialStock = Number(stock ?? 0);
  if (!Number.isSafeInteger(initialStock) || initialStock < 0) {
    return res.status(400).json({ message: "Stok awal harus bilangan bulat non-negatif" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result]: any = await conn.query(
      `INSERT INTO products
        (category_id, sku, name, cost_price, selling_price, stock, minimum_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [category_id ?? null, sku, name, cost_price ?? 0, selling_price, initialStock, minimum_stock ?? 5]
    );

    const [warehouses]: any = await conn.query(
      "SELECT id FROM warehouses WHERE is_default = TRUE AND is_active = TRUE ORDER BY id LIMIT 1 FOR UPDATE"
    );
    if (!warehouses.length) throw new Error("Gudang utama aktif tidak ditemukan");
    const warehouseId = Number(warehouses[0].id);
    await conn.query(
      "INSERT INTO warehouse_stocks (warehouse_id, product_id, on_hand) VALUES (?, ?, ?)",
      [warehouseId, result.insertId, initialStock]
    );

    if (initialStock > 0) {
      await conn.query(
        `INSERT INTO stock_movements (warehouse_id, product_id, user_id, movement_type, quantity, note)
         VALUES (?, ?, ?, 'initial', ?, 'Stok awal')`,
        [warehouseId, result.insertId, (req as any).user.id, initialStock]
      );
    }

    await writeAudit(conn, (req as any).user.id, "product.created", "product", result.insertId, { sku, name, initial_stock: initialStock });
    await conn.commit();
    res.status(201).json({ id: result.insertId, message: "Produk ditambahkan" });
  } catch (err: any) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "SKU sudah dipakai" });
    }
    res.status(500).json({ message: String(err) });
  } finally {
    conn.release();
  }
});

// PUT /api/products/:id
router.put("/:id", authenticate, requireRole("admin"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { category_id, sku, name, cost_price, selling_price, minimum_stock } = req.body;
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "ID produk tidak valid" });
    }
    if (!sku || !name || selling_price == null) {
      return res.status(400).json({ message: "sku, name, dan selling_price wajib diisi" });
    }

    await conn.beginTransaction();
    const [existing]: any = await conn.query("SELECT id FROM products WHERE id = ? FOR UPDATE", [productId]);
    if (existing.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }
    await conn.query(
      `UPDATE products
       SET category_id = ?, sku = ?, name = ?, cost_price = ?, selling_price = ?, minimum_stock = ?
       WHERE id = ?`,
      [category_id ?? null, sku, name, cost_price ?? 0, selling_price, minimum_stock ?? 5, productId]
    );

    await writeAudit(conn, (req as any).user.id, "product.updated", "product", productId, { sku, name });
    await conn.commit();
    res.json({ message: "Produk diperbarui" });
  } catch (err: any) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "SKU sudah dipakai" });
    }
    res.status(500).json({ message: String(err) });
  } finally {
    conn.release();
  }
});

// DELETE /api/products/:id
router.delete("/:id", authenticate, requireRole("admin"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "ID produk tidak valid" });
    }
    await conn.beginTransaction();
    await conn.query("DELETE FROM warehouse_stocks WHERE product_id = ?", [productId]);
    const [result]: any = await conn.query("DELETE FROM products WHERE id = ?", [
      productId,
    ]);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }
    await writeAudit(conn, (req as any).user.id, "product.deleted", "product", productId);
    await conn.commit();
    res.json({ message: "Produk dihapus" });
  } catch (err: any) {
    await conn.rollback();
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({ message: "Produk sudah punya riwayat stok/penjualan dan tidak bisa dihapus" });
    }
    res.status(500).json({ message: String(err) });
  } finally {
    conn.release();
  }
});

export default router;