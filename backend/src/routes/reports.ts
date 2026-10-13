import { Router } from "express";
import { pool } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDate = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function getRange(q: any) {
  const to = isDate(q.to) ? q.to : fmt(new Date());
  const fromDefault = new Date();
  fromDefault.setDate(fromDefault.getDate() - 29);
  const from = isDate(q.from) ? q.from : fmt(fromDefault);
  return { from, to };
}

// Isi hari yang tidak ada penjualan dengan 0 supaya grafik tidak bolong
function fillDays(rows: any[], from: string, to: string) {
  const map = new Map(rows.map((r) => [r.date, Number(r.total)]));
  const out: { date: string; total: number }[] = [];
  const cur = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (cur <= end) {
    const key = fmt(cur);
    out.push({ date: key, total: map.get(key) ?? 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// GET /api/reports/dashboard : semua user login
router.get("/dashboard", authenticate, async (_req, res) => {
  try {
    const [[p]]: any = await pool.query("SELECT COUNT(*) AS total FROM products");
    const [[low]]: any = await pool.query("SELECT COUNT(*) AS total FROM products WHERE stock <= minimum_stock");
    const [[today]]: any = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS revenue, COUNT(*) AS count
       FROM sales WHERE DATE(created_at) = CURDATE()`
    );
    const [lowList]: any = await pool.query(
      `SELECT sku, name, stock, minimum_stock FROM products
       WHERE stock <= minimum_stock ORDER BY stock ASC LIMIT 10`
    );

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const [daily]: any = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, SUM(total_amount) AS total
       FROM sales WHERE created_at >= CURDATE() - INTERVAL 6 DAY
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')`
    );

    res.json({
      total_products: p.total,
      low_stock_count: low.total,
      today_revenue: Number(today.revenue),
      today_transactions: today.count,
      low_stock: lowList,
      daily_sales: fillDays(daily, fmt(start), fmt(end)),
    });
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD : admin
router.get("/sales", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { from, to } = getRange(req.query);
    const where = "s.created_at >= ? AND s.created_at < DATE_ADD(?, INTERVAL 1 DAY)";

    const [[sum]]: any = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS revenue, COUNT(*) AS transactions
       FROM sales s WHERE ${where}`,
      [from, to]
    );
    const [[prof]]: any = await pool.query(
      `SELECT COALESCE(SUM(si.subtotal - si.unit_cost * si.quantity),0) AS profit,
              COALESCE(SUM(si.quantity),0) AS items_sold
       FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${where}`,
      [from, to]
    );
    const [daily]: any = await pool.query(
      `SELECT DATE_FORMAT(s.created_at, '%Y-%m-%d') AS date, SUM(s.total_amount) AS total
       FROM sales s WHERE ${where}
       GROUP BY DATE_FORMAT(s.created_at, '%Y-%m-%d')`,
      [from, to]
    );
    const [top]: any = await pool.query(
      `SELECT p.sku, p.name, SUM(si.quantity) AS quantity, SUM(si.subtotal) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE ${where}
       GROUP BY p.id, p.sku, p.name
       ORDER BY quantity DESC LIMIT 10`,
      [from, to]
    );

    res.json({
      from, to,
      revenue: Number(sum.revenue),
      transactions: sum.transactions,
      profit: Number(prof.profit),
      items_sold: Number(prof.items_sold),
      daily: fillDays(daily, from, to),
      top_products: top.map((t: any) => ({ ...t, quantity: Number(t.quantity), revenue: Number(t.revenue) })),
    });
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// Cegah CSV injection (sel diawali = + - @ dianggap rumus oleh Excel)
function csvCell(v: any) {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

// GET /api/reports/sales/export : unduh CSV (admin)
router.get("/sales/export", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { from, to } = getRange(req.query);
    const [rows]: any = await pool.query(
      `SELECT s.invoice_number, s.created_at, u.name AS cashier,
              p.sku, p.name AS product, si.quantity, si.unit_price, si.subtotal
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN users u ON u.id = s.user_id
       JOIN products p ON p.id = si.product_id
       WHERE s.created_at >= ? AND s.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY s.id, si.id`,
      [from, to]
    );

    const header = ["Invoice", "Waktu", "Kasir", "SKU", "Produk", "Qty", "Harga", "Subtotal"];
    const lines = rows.map((r: any) =>
      [r.invoice_number, new Date(r.created_at).toLocaleString("id-ID"), r.cashier, r.sku, r.product,
       r.quantity, r.unit_price, r.subtotal].map(csvCell).join(",")
    );
    const csv = "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="penjualan_${from}_${to}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

export default router;