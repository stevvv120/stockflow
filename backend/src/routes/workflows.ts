import { Router } from "express";
import type { PoolConnection } from "mysql2/promise";
import { pool } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/auditService";

const router = Router();

async function defaultWarehouseId(connection: PoolConnection) {
  const [rows]: any = await connection.query(
    "SELECT id FROM warehouses WHERE is_default = TRUE AND is_active = TRUE ORDER BY id LIMIT 1"
  );
  if (!rows.length) throw new Error("Gudang utama aktif tidak ditemukan");
  return Number(rows[0].id);
}

function validId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validLines(value: unknown): { product_id: number; quantity: number }[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const merged = new Map<number, number>();
  for (const item of value) {
    const productId = validId(item?.product_id);
    const quantity = Number(item?.quantity);
    if (!productId || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
    const total = (merged.get(productId) ?? 0) + quantity;
    if (!Number.isSafeInteger(total)) return null;
    merged.set(productId, total);
  }
  return [...merged].map(([product_id, quantity]) => ({ product_id, quantity }));
}

async function lockBalances(connection: PoolConnection, warehouseId: number, productIds: number[]) {
  for (const productId of productIds) {
    await connection.query(
      "INSERT IGNORE INTO warehouse_stocks (warehouse_id, product_id) VALUES (?, ?)",
      [warehouseId, productId]
    );
  }
  const [rows]: any = await connection.query(
    `SELECT product_id, on_hand, reserved
     FROM warehouse_stocks
     WHERE warehouse_id = ? AND product_id IN (?)
     ORDER BY product_id FOR UPDATE`,
    [warehouseId, productIds]
  );
  return rows as { product_id: number; on_hand: number; reserved: number }[];
}

router.get("/warehouses", authenticate, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT w.id, w.code, w.name, w.address, w.is_default, w.is_active,
              COUNT(ws.product_id) AS stocked_products,
              COALESCE(SUM(ws.on_hand), 0) AS units_on_hand
       FROM warehouses w LEFT JOIN warehouse_stocks ws ON ws.warehouse_id = w.id
       GROUP BY w.id ORDER BY w.is_default DESC, w.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

router.post("/warehouses", authenticate, requireRole("admin"), async (req, res) => {
  const code = String(req.body.code ?? "").trim().toUpperCase();
  const name = String(req.body.name ?? "").trim();
  const address = String(req.body.address ?? "").trim() || null;
  if (!/^[A-Z0-9_-]{2,30}$/.test(code) || !name || name.length > 120) {
    return res.status(400).json({ message: "Kode gudang (2-30 karakter) dan nama wajib diisi" });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result]: any = await connection.query(
      "INSERT INTO warehouses (code, name, address) VALUES (?, ?, ?)",
      [code, name, address]
    );
    await writeAudit(connection, (req as any).user.id, "warehouse.created", "warehouse", result.insertId, { code, name });
    await connection.commit();
    res.status(201).json({ id: result.insertId, message: "Gudang ditambahkan" });
  } catch (err: any) {
    await connection.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Kode gudang sudah digunakan" });
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.post("/stock/transfers", authenticate, requireRole("admin"), async (req, res) => {
  const fromId = validId(req.body.from_warehouse_id);
  const toId = validId(req.body.to_warehouse_id);
  const productId = validId(req.body.product_id);
  const quantity = Number(req.body.quantity);
  const note = String(req.body.note ?? "").trim();
  if (!fromId || !toId || !productId || fromId === toId || !Number.isSafeInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: "Gudang asal/tujuan, produk, dan jumlah transfer harus valid" });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [warehouses]: any = await connection.query(
      "SELECT id FROM warehouses WHERE id IN (?, ?) AND is_active = TRUE FOR UPDATE",
      [Math.min(fromId, toId), Math.max(fromId, toId)]
    );
    if (warehouses.length !== 2) {
      await connection.rollback();
      return res.status(404).json({ message: "Gudang tidak ditemukan atau tidak aktif" });
    }
    const [productRows]: any = await connection.query("SELECT id FROM products WHERE id = ? FOR UPDATE", [productId]);
    if (!productRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }
    const balances = await lockBalances(connection, fromId, [productId]);
    const source = balances[0];
    if (!source || source.on_hand - source.reserved < quantity) {
      await connection.rollback();
      return res.status(409).json({ message: "Stok tersedia di gudang asal tidak cukup" });
    }
    await connection.query(
      "INSERT IGNORE INTO warehouse_stocks (warehouse_id, product_id) VALUES (?, ?)",
      [toId, productId]
    );
    await connection.query(
      "UPDATE warehouse_stocks SET on_hand = on_hand - ? WHERE warehouse_id = ? AND product_id = ?",
      [quantity, fromId, productId]
    );
    await connection.query(
      "UPDATE warehouse_stocks SET on_hand = on_hand + ? WHERE warehouse_id = ? AND product_id = ?",
      [quantity, toId, productId]
    );
    const transferNote = note || "Transfer antar-gudang";
    for (const [warehouseId, amount, direction] of [
      [fromId, -quantity, `Keluar menuju gudang ${toId}`],
      [toId, quantity, `Masuk dari gudang ${fromId}`],
    ] as [number, number, string][]) {
      await connection.query(
        `INSERT INTO stock_movements (warehouse_id, product_id, user_id, movement_type, quantity, note)
         VALUES (?, ?, ?, 'transfer', ?, ?)`,
        [warehouseId, productId, (req as any).user.id, amount, `${direction}: ${transferNote}`]
      );
    }
    await writeAudit(connection, (req as any).user.id, "stock.transferred", "product", productId, {
      from_warehouse_id: fromId, to_warehouse_id: toId, quantity, note: transferNote,
    });
    await connection.commit();
    res.status(201).json({ message: "Transfer stok berhasil" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.get("/stock/levels", authenticate, async (req, res) => {
  try {
    const warehouseId = req.query.warehouse_id ? validId(req.query.warehouse_id) : null;
    if (req.query.warehouse_id && !warehouseId) return res.status(400).json({ message: "warehouse_id tidak valid" });
    const params: number[] = [];
    let where = "";
    if (warehouseId) {
      where = "WHERE w.id = ?";
      params.push(warehouseId);
    }
    const [rows] = await pool.query(
      `SELECT w.id AS warehouse_id, w.name AS warehouse_name, p.id AS product_id, p.sku, p.name, p.minimum_stock,
              COALESCE(ws.on_hand, 0) AS on_hand, COALESCE(ws.reserved, 0) AS reserved,
              COALESCE(ws.on_hand, 0) - COALESCE(ws.reserved, 0) AS available
       FROM warehouses w CROSS JOIN products p
       LEFT JOIN warehouse_stocks ws ON ws.warehouse_id = w.id AND ws.product_id = p.id
       ${where} ORDER BY w.name, p.name`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

router.get("/suppliers", authenticate, async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM suppliers ORDER BY name");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

router.post("/suppliers", authenticate, requireRole("admin"), async (req, res) => {
  const name = String(req.body.name ?? "").trim();
  if (!name || name.length > 150) return res.status(400).json({ message: "Nama supplier wajib diisi (maksimal 150 karakter)" });
  const email = String(req.body.email ?? "").trim() || null;
  const phone = String(req.body.phone ?? "").trim() || null;
  const address = String(req.body.address ?? "").trim() || null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result]: any = await connection.query(
      "INSERT INTO suppliers (name, email, phone, address) VALUES (?, ?, ?, ?)",
      [name, email, phone, address]
    );
    await writeAudit(connection, (req as any).user.id, "supplier.created", "supplier", result.insertId, { name });
    await connection.commit();
    res.status(201).json({ id: result.insertId, message: "Supplier ditambahkan" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.get("/purchase-orders", authenticate, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT po.id, po.order_number, po.status, po.notes, po.created_at, po.approved_at, po.received_at,
              s.name AS supplier_name, w.name AS warehouse_name, u.name AS created_by_name, po.created_by,
              COUNT(poi.id) AS line_count
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN warehouses w ON w.id = po.warehouse_id
       JOIN users u ON u.id = po.created_by
       LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       GROUP BY po.id ORDER BY po.id DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

router.get("/purchase-orders/:id", authenticate, async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID PO tidak valid" });
  try {
    const [orders]: any = await pool.query(
      `SELECT po.id, po.order_number, po.status, po.notes, po.created_at,
              s.name AS supplier_name, w.name AS warehouse_name
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
       JOIN warehouses w ON w.id = po.warehouse_id WHERE po.id = ?`,
      [id]
    );
    if (!orders.length) return res.status(404).json({ message: "PO tidak ditemukan" });
    const [items] = await pool.query(
      `SELECT poi.id AS item_id, poi.product_id, p.sku, p.name AS product_name,
              poi.quantity, poi.received_quantity, poi.unit_cost
       FROM purchase_order_items poi JOIN products p ON p.id = poi.product_id
       WHERE poi.purchase_order_id = ? ORDER BY poi.id`,
      [id]
    );
    res.json({ ...orders[0], items });
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

router.post("/purchase-orders", authenticate, async (req, res) => {
  const supplierId = validId(req.body.supplier_id);
  const warehouseId = req.body.warehouse_id == null ? null : validId(req.body.warehouse_id);
  const lines = validLines(req.body.items);
  if (!supplierId || (req.body.warehouse_id != null && !warehouseId) || !lines) {
    return res.status(400).json({ message: "Supplier, gudang, dan item PO yang valid wajib diisi" });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const selectedWarehouse = warehouseId ?? await defaultWarehouseId(connection);
    const [refs]: any = await connection.query(
      `SELECT (SELECT COUNT(*) FROM suppliers WHERE id = ? AND is_active = TRUE) AS supplier_ok,
              (SELECT COUNT(*) FROM warehouses WHERE id = ? AND is_active = TRUE) AS warehouse_ok`,
      [supplierId, selectedWarehouse]
    );
    if (!refs[0].supplier_ok || !refs[0].warehouse_ok) {
      await connection.rollback();
      return res.status(404).json({ message: "Supplier atau gudang aktif tidak ditemukan" });
    }
    const ids = lines.map((line) => line.product_id).sort((a, b) => a - b);
    const [products]: any = await connection.query(
      "SELECT id, cost_price FROM products WHERE id IN (?) ORDER BY id",
      [ids]
    );
    if (products.length !== ids.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Ada produk yang tidak ditemukan" });
    }
    const costs = new Map(products.map((product: any) => [product.id, Number(product.cost_price)]));
    const [insert]: any = await connection.query(
      `INSERT INTO purchase_orders (order_number, supplier_id, warehouse_id, status, notes, created_by)
       VALUES (?, ?, ?, 'draft', ?, ?)`,
      [
        `TMP-PO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        supplierId, selectedWarehouse, String(req.body.notes ?? "").trim() || null, (req as any).user.id,
      ]
    );
    const orderNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(insert.insertId).padStart(5, "0")}`;
    await connection.query("UPDATE purchase_orders SET order_number = ? WHERE id = ?", [orderNumber, insert.insertId]);
    for (const line of lines) {
      await connection.query(
        `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost)
         VALUES (?, ?, ?, ?)`,
        [insert.insertId, line.product_id, line.quantity, costs.get(line.product_id)]
      );
    }
    await writeAudit(connection, (req as any).user.id, "purchase_order.created", "purchase_order", insert.insertId, { order_number: orderNumber });
    await connection.commit();
    res.status(201).json({ id: insert.insertId, order_number: orderNumber, message: "PO dibuat sebagai draft" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.post("/purchase-orders/:id/submit", authenticate, async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID PO tidak valid" });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result]: any = await connection.query(
      "UPDATE purchase_orders SET status = 'pending_approval' WHERE id = ? AND status = 'draft' AND created_by = ?",
      [id, (req as any).user.id]
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ message: "PO bukan draft milik Anda atau sudah diproses" });
    }
    await writeAudit(connection, (req as any).user.id, "purchase_order.submitted", "purchase_order", id);
    await connection.commit();
    res.json({ message: "PO diajukan untuk persetujuan Admin" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.post("/purchase-orders/:id/cancel", authenticate, async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID PO tidak valid" });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result]: any = await connection.query(
      `UPDATE purchase_orders
       SET status = 'cancelled'
       WHERE id = ? AND status IN ('draft', 'pending_approval', 'approved')
         AND (created_by = ? OR ? = 'admin')
         AND NOT EXISTS (
           SELECT 1 FROM purchase_order_items poi
           WHERE poi.purchase_order_id = purchase_orders.id AND poi.received_quantity > 0
         )`,
      [id, (req as any).user.id, (req as any).user.role]
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ message: "PO tidak dapat dibatalkan: hanya PO yang belum diterima milik Anda yang bisa dibatalkan" });
    }
    await writeAudit(connection, (req as any).user.id, "purchase_order.cancelled", "purchase_order", id);
    await connection.commit();
    res.json({ message: "PO dibatalkan" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.post("/purchase-orders/:id/review", authenticate, requireRole("admin"), async (req, res) => {
  const id = validId(req.params.id);
  const action = req.body.action;
  if (!id || !["approve", "reject"].includes(action)) return res.status(400).json({ message: "Keputusan atau ID PO tidak valid" });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result]: any = await connection.query(
      `UPDATE purchase_orders SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending_approval'`,
      [action === "approve" ? "approved" : "rejected", (req as any).user.id, id]
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ message: "PO tidak menunggu persetujuan" });
    }
    await writeAudit(connection, (req as any).user.id, `purchase_order.${action === "approve" ? "approved" : "rejected"}`, "purchase_order", id);
    await connection.commit();
    res.json({ message: action === "approve" ? "PO disetujui" : "PO ditolak" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.post("/purchase-orders/:id/receive", authenticate, requireRole("admin"), async (req, res) => {
  const id = validId(req.params.id);
  const received = req.body.items;
  if (!id || !Array.isArray(received) || received.length === 0) {
    return res.status(400).json({ message: "ID PO dan jumlah penerimaan wajib diisi" });
  }
  const quantities = new Map<number, number>();
  for (const item of received) {
    const itemId = validId(item?.item_id);
    const quantity = Number(item?.quantity);
    if (!itemId || !Number.isSafeInteger(quantity) || quantity <= 0 || quantities.has(itemId)) {
      return res.status(400).json({ message: "Item penerimaan tidak valid atau duplikat" });
    }
    quantities.set(itemId, quantity);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders]: any = await connection.query("SELECT warehouse_id, status FROM purchase_orders WHERE id = ? FOR UPDATE", [id]);
    if (!orders.length || !["approved", "partially_received"].includes(orders[0].status)) {
      await connection.rollback();
      return res.status(409).json({ message: "PO tidak ditemukan atau belum disetujui" });
    }
    const [items]: any = await connection.query(
      `SELECT id, product_id, quantity, received_quantity FROM purchase_order_items
       WHERE purchase_order_id = ? ORDER BY product_id FOR UPDATE`,
      [id]
    );
    if ([...quantities.keys()].some((itemId) => !items.some((item: any) => item.id === itemId))) {
      await connection.rollback();
      return res.status(400).json({ message: "Item penerimaan bukan bagian dari PO ini" });
    }
    const productIds = [...new Set<number>(
      items.filter((item: any) => quantities.has(item.id)).map((item: any) => Number(item.product_id))
    )].sort((a, b) => a - b);
    await connection.query("SELECT id FROM products WHERE id IN (?) ORDER BY id FOR UPDATE", [productIds]);
    for (const item of items) {
      const quantity = quantities.get(item.id);
      if (quantity == null) continue;
      if (item.received_quantity + quantity > item.quantity) {
        await connection.rollback();
        return res.status(409).json({ message: "Jumlah penerimaan melebihi sisa PO" });
      }
      await connection.query("UPDATE purchase_order_items SET received_quantity = received_quantity + ? WHERE id = ?", [quantity, item.id]);
      await connection.query(
        `INSERT INTO warehouse_stocks (warehouse_id, product_id, on_hand)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE on_hand = on_hand + VALUES(on_hand)`,
        [orders[0].warehouse_id, item.product_id, quantity]
      );
      await connection.query("UPDATE products SET stock = stock + ? WHERE id = ?", [quantity, item.product_id]);
      await connection.query(
        `INSERT INTO stock_movements (warehouse_id, product_id, user_id, movement_type, quantity, reference_id, note)
         VALUES (?, ?, ?, 'in', ?, ?, ?)`,
        [orders[0].warehouse_id, item.product_id, (req as any).user.id, quantity, id, `Penerimaan PO #${id}`]
      );
    }
    const [remaining]: any = await connection.query(
      "SELECT COUNT(*) AS incomplete FROM purchase_order_items WHERE purchase_order_id = ? AND received_quantity < quantity",
      [id]
    );
    const newStatus = remaining[0].incomplete ? "partially_received" : "received";
    await connection.query(
      "UPDATE purchase_orders SET status = ?, received_at = IF(? = 'received', CURRENT_TIMESTAMP, received_at) WHERE id = ?",
      [newStatus, newStatus, id]
    );
    await writeAudit(connection, (req as any).user.id, "purchase_order.received", "purchase_order", id, {
      received_items: received.length, status: newStatus,
    });
    await connection.commit();
    res.json({ message: "Penerimaan barang dicatat", status: newStatus });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.get("/orders", authenticate, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.notes, o.created_at, w.name AS warehouse_name,
              u.name AS created_by_name, o.created_by, sh.id AS shipment_id, sh.status AS shipment_status,
              sh.tracking_number, s.invoice_number
       FROM customer_orders o JOIN warehouses w ON w.id = o.warehouse_id
       JOIN users u ON u.id = o.created_by LEFT JOIN shipments sh ON sh.customer_order_id = o.id
       LEFT JOIN sales s ON s.id = o.sale_id
       ORDER BY o.id DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

router.post("/orders", authenticate, async (req, res) => {
  const warehouseId = req.body.warehouse_id == null ? null : validId(req.body.warehouse_id);
  const lines = validLines(req.body.items);
  if ((req.body.warehouse_id != null && !warehouseId) || !lines) {
    return res.status(400).json({ message: "Gudang dan item pesanan yang valid wajib diisi" });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const selectedWarehouse = warehouseId ?? await defaultWarehouseId(connection);
    const ids = lines.map((line) => line.product_id).sort((a, b) => a - b);
    const [products]: any = await connection.query(
      "SELECT id, selling_price, cost_price FROM products WHERE id IN (?) ORDER BY id FOR UPDATE",
      [ids]
    );
    if (products.length !== ids.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Ada produk yang tidak ditemukan" });
    }
    const [warehouses]: any = await connection.query(
      "SELECT id FROM warehouses WHERE id = ? AND is_active = TRUE",
      [selectedWarehouse]
    );
    if (!warehouses.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Gudang aktif tidak ditemukan" });
    }
    const balances = await lockBalances(connection, selectedWarehouse, ids);
    const byId = new Map(balances.map((balance) => [balance.product_id, balance]));
    for (const line of lines) {
      const balance = byId.get(line.product_id);
      if (!balance || balance.on_hand - balance.reserved < line.quantity) {
        await connection.rollback();
        return res.status(409).json({ message: `Stok tersedia tidak cukup untuk produk #${line.product_id}` });
      }
    }
    const prices = new Map<number, { selling: number; cost: number }>(
      products.map((product: any): [number, { selling: number; cost: number }] => [
        Number(product.id),
        { selling: Number(product.selling_price), cost: Number(product.cost_price) },
      ])
    );
    const [insert]: any = await connection.query(
      `INSERT INTO customer_orders (order_number, warehouse_id, status, notes, created_by)
       VALUES (?, ?, 'pending_approval', ?, ?)`,
      [
        `TMP-SO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        selectedWarehouse, String(req.body.notes ?? "").trim() || null, (req as any).user.id,
      ]
    );
    const orderNumber = `SO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(insert.insertId).padStart(5, "0")}`;
    await connection.query("UPDATE customer_orders SET order_number = ? WHERE id = ?", [orderNumber, insert.insertId]);
    for (const line of lines) {
      await connection.query(
        `INSERT INTO customer_order_items (customer_order_id, product_id, quantity, unit_price, unit_cost)
         VALUES (?, ?, ?, ?, ?)`,
        [
          insert.insertId, line.product_id, line.quantity,
          prices.get(line.product_id)!.selling, prices.get(line.product_id)!.cost,
        ]
      );
      await connection.query(
        "UPDATE warehouse_stocks SET reserved = reserved + ? WHERE warehouse_id = ? AND product_id = ?",
        [line.quantity, selectedWarehouse, line.product_id]
      );
    }
    await writeAudit(connection, (req as any).user.id, "customer_order.created", "customer_order", insert.insertId, { order_number: orderNumber });
    await connection.commit();
    res.status(201).json({ id: insert.insertId, order_number: orderNumber, message: "Pesanan dibuat dan stok direservasi untuk persetujuan" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.post("/orders/:id/review", authenticate, requireRole("admin"), async (req, res) => {
  const id = validId(req.params.id);
  const action = req.body.action;
  if (!id || !["approve", "reject"].includes(action)) return res.status(400).json({ message: "Keputusan atau ID pesanan tidak valid" });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders]: any = await connection.query(
      "SELECT id, warehouse_id, status FROM customer_orders WHERE id = ? FOR UPDATE",
      [id]
    );
    if (!orders.length || orders[0].status !== "pending_approval") {
      await connection.rollback();
      return res.status(409).json({ message: "Pesanan tidak menunggu persetujuan" });
    }
    const status = action === "approve" ? "approved" : "rejected";
    await connection.query(
      "UPDATE customer_orders SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?",
      [status, (req as any).user.id, id]
    );
    if (action === "reject") {
      await connection.query(
        `UPDATE warehouse_stocks ws JOIN customer_order_items oi ON oi.product_id = ws.product_id
         SET ws.reserved = ws.reserved - oi.quantity
         WHERE oi.customer_order_id = ? AND ws.warehouse_id = ?`,
        [id, orders[0].warehouse_id]
      );
    } else {
      const [shipment]: any = await connection.query(
        "INSERT INTO shipments (customer_order_id, status) VALUES (?, 'pending')",
        [id]
      );
      await connection.query(
        "INSERT INTO shipment_events (shipment_id, status, note, user_id) VALUES (?, 'pending', 'Pengiriman dibuat', ?)",
        [shipment.insertId, (req as any).user.id]
      );
    }
    await writeAudit(connection, (req as any).user.id, `customer_order.${action === "approve" ? "approved" : "rejected"}`, "customer_order", id);
    await connection.commit();
    res.json({ message: action === "approve" ? "Pesanan disetujui dan pengiriman dibuat" : "Pesanan ditolak dan reservasi dilepas" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.post("/orders/:id/cancel", authenticate, async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID pesanan tidak valid" });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders]: any = await connection.query(
      "SELECT warehouse_id, status, created_by FROM customer_orders WHERE id = ? FOR UPDATE",
      [id]
    );
    if (!orders.length || !["draft", "pending_approval"].includes(orders[0].status)
        || (orders[0].created_by !== (req as any).user.id && (req as any).user.role !== "admin")) {
      await connection.rollback();
      return res.status(409).json({ message: "Pesanan tidak dapat dibatalkan pada status ini" });
    }
    await connection.query(
      `UPDATE warehouse_stocks ws JOIN customer_order_items oi ON oi.product_id = ws.product_id
       SET ws.reserved = ws.reserved - oi.quantity
       WHERE oi.customer_order_id = ? AND ws.warehouse_id = ?`,
      [id, orders[0].warehouse_id]
    );
    await connection.query("UPDATE customer_orders SET status = 'cancelled' WHERE id = ?", [id]);
    await writeAudit(connection, (req as any).user.id, "customer_order.cancelled", "customer_order", id);
    await connection.commit();
    res.json({ message: "Pesanan dibatalkan dan reservasi dilepas" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.post("/shipments/:id/status", authenticate, async (req, res) => {
  const id = validId(req.params.id);
  const nextStatus = String(req.body.status ?? "");
  const tracking = String(req.body.tracking_number ?? "").trim() || null;
  const note = String(req.body.note ?? "").trim() || null;
  if (!id || !["shipped", "in_transit", "delivered", "cancelled"].includes(nextStatus)) {
    return res.status(400).json({ message: "Status atau ID pengiriman tidak valid" });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [shipments]: any = await connection.query(
      `SELECT sh.id, sh.status, o.id AS order_id, o.status AS order_status, o.warehouse_id
       FROM shipments sh JOIN customer_orders o ON o.id = sh.customer_order_id
       WHERE sh.id = ? FOR UPDATE`,
      [id]
    );
    if (!shipments.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Pengiriman tidak ditemukan" });
    }
    const shipment = shipments[0];
    const allowed: Record<string, string[]> = {
      pending: ["shipped", "cancelled"],
      shipped: ["in_transit"],
      in_transit: ["delivered"],
    };
    if (!allowed[shipment.status]?.includes(nextStatus)) {
      await connection.rollback();
      return res.status(409).json({ message: `Perubahan status ${shipment.status} ke ${nextStatus} tidak diizinkan` });
    }
    const [items]: any = await connection.query(
      "SELECT product_id, quantity FROM customer_order_items WHERE customer_order_id = ? ORDER BY product_id FOR UPDATE",
      [shipment.order_id]
    );
    if (nextStatus === "shipped") {
      const productIds = items.map((item: any) => Number(item.product_id));
      await connection.query("SELECT id FROM products WHERE id IN (?) ORDER BY id FOR UPDATE", [productIds]);
      const balances = await lockBalances(connection, shipment.warehouse_id, productIds);
      const byId = new Map(balances.map((balance) => [balance.product_id, balance]));
      for (const item of items) {
        const balance = byId.get(Number(item.product_id));
        if (!balance || balance.reserved < item.quantity || balance.on_hand < item.quantity) {
          await connection.rollback();
          return res.status(409).json({ message: "Reservasi tidak lagi tersedia; pengiriman tidak dapat dikirim" });
        }
      }
      for (const item of items) {
        await connection.query(
          `UPDATE warehouse_stocks SET on_hand = on_hand - ?, reserved = reserved - ?
           WHERE warehouse_id = ? AND product_id = ?`,
          [item.quantity, item.quantity, shipment.warehouse_id, item.product_id]
        );
        await connection.query("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.product_id]);
        await connection.query(
          `INSERT INTO stock_movements (warehouse_id, product_id, user_id, movement_type, quantity, reference_id, note)
           VALUES (?, ?, ?, 'out', ?, ?, ?)`,
          [shipment.warehouse_id, item.product_id, (req as any).user.id, -item.quantity, shipment.order_id, `Pengiriman pesanan #${shipment.order_id}`]
        );
      }
      const [[orderTotal]]: any = await connection.query(
        "SELECT COALESCE(SUM(quantity * unit_price), 0) AS total FROM customer_order_items WHERE customer_order_id = ?",
        [shipment.order_id]
      );
      const [saleResult]: any = await connection.query(
        "INSERT INTO sales (invoice_number, user_id, warehouse_id, total_amount) VALUES (?, ?, ?, ?)",
        [
          `TMP-SO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          (req as any).user.id, shipment.warehouse_id, orderTotal.total,
        ]
      );
      const saleId = Number(saleResult.insertId);
      const now = new Date();
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const invoice = `INV-${ymd}-${String(saleId).padStart(5, "0")}`;
      await connection.query("UPDATE sales SET invoice_number = ? WHERE id = ?", [invoice, saleId]);
      await connection.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, unit_cost, subtotal)
         SELECT ?, product_id, quantity, unit_price, unit_cost, ROUND(quantity * unit_price, 2)
         FROM customer_order_items WHERE customer_order_id = ?`,
        [saleId, shipment.order_id]
      );
      await connection.query("UPDATE customer_orders SET sale_id = ? WHERE id = ?", [saleId, shipment.order_id]);
      await writeAudit(connection, (req as any).user.id, "sale.created", "sale", saleId, {
        source: "customer_order", customer_order_id: shipment.order_id,
        warehouse_id: shipment.warehouse_id, total_amount: Number(orderTotal.total),
      });
    } else if (nextStatus === "cancelled") {
      await connection.query(
        `UPDATE warehouse_stocks ws JOIN customer_order_items oi ON oi.product_id = ws.product_id
         SET ws.reserved = ws.reserved - oi.quantity
         WHERE oi.customer_order_id = ? AND ws.warehouse_id = ?`,
        [shipment.order_id, shipment.warehouse_id]
      );
      await connection.query("UPDATE customer_orders SET status = 'cancelled' WHERE id = ?", [shipment.order_id]);
    } else if (nextStatus === "delivered") {
      await connection.query("UPDATE customer_orders SET status = 'fulfilled' WHERE id = ?", [shipment.order_id]);
    }
    await connection.query(
      `UPDATE shipments SET status = ?, tracking_number = COALESCE(?, tracking_number),
              shipped_at = IF(? = 'shipped', CURRENT_TIMESTAMP, shipped_at),
              delivered_at = IF(? = 'delivered', CURRENT_TIMESTAMP, delivered_at)
       WHERE id = ?`,
      [nextStatus, tracking, nextStatus, nextStatus, id]
    );
    await connection.query(
      "INSERT INTO shipment_events (shipment_id, status, note, user_id) VALUES (?, ?, ?, ?)",
      [id, nextStatus, note, (req as any).user.id]
    );
    await writeAudit(connection, (req as any).user.id, `shipment.${nextStatus}`, "shipment", id, { tracking_number: tracking, note });
    await connection.commit();
    res.json({ message: "Status pengiriman diperbarui" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: String(err) });
  } finally {
    connection.release();
  }
});

router.get("/shipments/:id/events", authenticate, async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ message: "ID pengiriman tidak valid" });
  try {
    const [rows] = await pool.query(
      `SELECT e.id, e.status, e.note, e.created_at, u.name AS user_name
       FROM shipment_events e JOIN users u ON u.id = e.user_id
       WHERE e.shipment_id = ? ORDER BY e.id`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

router.get("/audit-logs", authenticate, requireRole("admin"), async (req, res) => {
  const entityType = typeof req.query.entity_type === "string" ? req.query.entity_type : null;
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE (? IS NULL OR a.entity_type = ?)
       ORDER BY a.id DESC LIMIT 200`,
      [entityType, entityType]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

export default router;
