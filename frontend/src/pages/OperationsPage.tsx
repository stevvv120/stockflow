import { useEffect, useMemo, useState } from "react";
import type { Product } from "../../types";
import {
  createCustomerOrder,
  createPurchaseOrder,
  createSupplier,
  createWarehouse,
  cancelCustomerOrder,
  cancelPurchaseOrder,
  getAuditLogs,
  getCustomerOrders,
  getProducts,
  getPurchaseOrder,
  getPurchaseOrders,
  getShipmentEvents,
  getStockLevels,
  getSuppliers,
  getWarehouses,
  receivePurchaseOrder,
  reviewCustomerOrder,
  reviewPurchaseOrder,
  submitPurchaseOrder,
  transferStock,
  updateShipmentStatus,
} from "../services/api";
import type {
  AuditLog,
  CustomerOrder,
  PurchaseOrder,
  Supplier,
  ShipmentEvent,
  User,
  Warehouse,
} from "../services/api";

type Tab = "inventory" | "purchasing" | "orders" | "audit";
type StockLevel = {
  warehouse_id: number;
  warehouse_name: string;
  product_id: number;
  sku: string;
  name: string;
  minimum_stock: number;
  on_hand: number;
  reserved: number;
  available: number;
};
type OrderLine = { product_id: string; quantity: string };
type ReceiptLine = {
  item_id: number;
  product_name: string;
  quantity: string;
  remaining: number;
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Menunggu persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
  partially_received: "Diterima sebagian",
  received: "Diterima",
  cancelled: "Dibatalkan",
  fulfilled: "Terpenuhi",
  pending: "Menunggu",
  shipped: "Dikirim",
  in_transit: "Dalam perjalanan",
  delivered: "Terkirim",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`operation-status operation-status-${status.replace(/[^a-z0-9_]+/g, "-")}`}>
      {statusLabels[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}

const tabs: { id: Tab; label: string }[] = [
  { id: "inventory", label: "Gudang & stok" },
  { id: "purchasing", label: "Procurement" },
  { id: "orders", label: "Pesanan & pengiriman" },
  { id: "audit", label: "Audit log" },
];

export default function OperationsPage({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>("inventory");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [shipmentEvents, setShipmentEvents] = useState<ShipmentEvent[]>([]);
  const [eventShipmentId, setEventShipmentId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [receipt, setReceipt] = useState<{ orderId: number; orderNumber: string; items: ReceiptLine[] } | null>(null);
  const [newWarehouse, setNewWarehouse] = useState({ code: "", name: "", address: "" });
  const [transfer, setTransfer] = useState({ from: "", to: "", product: "", quantity: "1", note: "" });
  const [supplierInput, setSupplierInput] = useState({ name: "", email: "", phone: "" });
  const [poInput, setPoInput] = useState({ supplier: "", warehouse: "", notes: "" });
  const [poFormOpen, setPoFormOpen] = useState(false);
  const [poLines, setPoLines] = useState<OrderLine[]>([{ product_id: "", quantity: "1" }]);
  const [orderInput, setOrderInput] = useState({ warehouse: "", notes: "" });
  const [orderLines, setOrderLines] = useState<OrderLine[]>([{ product_id: "", quantity: "1" }]);
  const [trackingNumbers, setTrackingNumbers] = useState<Record<number, string>>({});

  const isAdmin = user.role === "admin";
  useEffect(() => {
    let active = true;
    const loads: Promise<unknown>[] = [
      getWarehouses().then((items) => { if (active) setWarehouses(items); }),
      getSuppliers().then((items) => { if (active) setSuppliers(items); }),
      getProducts().then((items) => { if (active) setProducts(items); }),
      getStockLevels(warehouseFilter ? Number(warehouseFilter) : undefined)
        .then((items) => { if (active) setLevels(items); }),
      getPurchaseOrders().then((items) => { if (active) setPurchaseOrders(items); }),
      getCustomerOrders().then((items) => { if (active) setOrders(items); }),
    ];
    if (isAdmin) loads.push(getAuditLogs().then((items) => { if (active) setAuditLogs(items); }));
    Promise.all(loads).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Gagal memuat data operasional");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [isAdmin, reloadKey, warehouseFilter]);

  const refresh = () => {
    setError("");
    setLoading(true);
    setReloadKey((key) => key + 1);
  };
  const run = async (action: () => Promise<unknown>, message: string): Promise<boolean> => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await action();
      setSuccess(message);
      refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aksi gagal diproses");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const runAfterConfirmation = (question: string, action: () => Promise<unknown>, message: string) => {
    if (window.confirm(question)) void run(action, message);
  };

  const addLine = (setter: (lines: OrderLine[]) => void, lines: OrderLine[]) =>
    setter([...lines, { product_id: "", quantity: "1" }]);
  const updateLine = (
    setter: (lines: OrderLine[]) => void,
    lines: OrderLine[],
    index: number,
    field: keyof OrderLine,
    value: string,
  ) => setter(lines.map((line, i) => i === index ? { ...line, [field]: value } : line));
  const removeLine = (setter: (lines: OrderLine[]) => void, lines: OrderLine[], index: number) =>
    setter(lines.filter((_, i) => i !== index));
  const validLines = (lines: OrderLine[]) =>
    lines.map((line) => ({ product_id: Number(line.product_id), quantity: Number(line.quantity) }));
  const validateLines = (lines: OrderLine[]) => {
    if (lines.some((line) => !Number.isSafeInteger(Number(line.product_id)) || Number(line.product_id) <= 0
      || !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) <= 0)) {
      return "Pilih produk dan masukkan jumlah berupa bilangan bulat positif untuk setiap item.";
    }
    if (new Set(lines.map((line) => line.product_id)).size !== lines.length) {
      return "Produk yang sama tidak boleh ditambahkan lebih dari satu kali.";
    }
    return "";
  };
  const warehouseOptions = warehouses.filter((warehouse) => Boolean(warehouse.is_active));
  const pendingApprovals = purchaseOrders.filter((order) => order.status === "pending_approval").length;
  const awaitingReceipt = purchaseOrders.filter((order) => ["approved", "partially_received"].includes(order.status)).length;
  const pendingOrders = orders.filter((order) => order.status === "pending_approval").length;
  const activeShipments = orders.filter((order) => ["pending", "shipped", "in_transit"].includes(order.shipment_status ?? "")).length;
  const closeReceipt = () => {
    setReceipt(null);
    setError("");
  };
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("id-ID");
  const visibleLevels = useMemo(() => levels.filter((row) => {
    const matchesQuery = !normalizedQuery
      || `${row.warehouse_name} ${row.sku} ${row.name}`.toLocaleLowerCase("id-ID").includes(normalizedQuery);
    const matchesStock = !statusFilter
      || (statusFilter === "low" ? row.available < row.minimum_stock : statusFilter === "reserved" ? row.reserved > 0 : row.available <= 0);
    return matchesQuery && matchesStock;
  }), [levels, normalizedQuery, statusFilter]);
  const restockSuggestions = useMemo(() => {
    const activeWarehouseIds = new Set(warehouses.filter((warehouse) => Boolean(warehouse.is_active)).map((warehouse) => warehouse.id));
    return visibleLevels
      .filter((row) => activeWarehouseIds.has(row.warehouse_id) && row.available < row.minimum_stock)
      .map((row) => ({ ...row, suggestedQuantity: row.minimum_stock - row.available }))
      .sort((a, b) => a.available / Math.max(a.minimum_stock, 1) - b.available / Math.max(b.minimum_stock, 1));
  }, [visibleLevels, warehouses]);
  const suggestedRestockUnits = restockSuggestions.reduce((total, row) => total + row.suggestedQuantity, 0);
  const visiblePurchaseOrders = useMemo(() => purchaseOrders.filter((order) => {
    const matchesQuery = !normalizedQuery
      || `${order.order_number} ${order.supplier_name} ${order.warehouse_name} ${order.created_by_name}`.toLocaleLowerCase("id-ID").includes(normalizedQuery);
    return matchesQuery && (!statusFilter || order.status === statusFilter);
  }), [purchaseOrders, normalizedQuery, statusFilter]);
  const visibleOrders = useMemo(() => orders.filter((order) => {
    const matchesQuery = !normalizedQuery
      || `${order.order_number} ${order.warehouse_name} ${order.tracking_number ?? ""} ${order.invoice_number ?? ""} ${order.created_by_name}`.toLocaleLowerCase("id-ID").includes(normalizedQuery);
    return matchesQuery && (!statusFilter || order.status === statusFilter || order.shipment_status === statusFilter);
  }), [orders, normalizedQuery, statusFilter]);
  const visibleAuditLogs = useMemo(() => auditLogs.filter((log) => {
    const details = typeof log.details === "string" ? log.details : JSON.stringify(log.details ?? {});
    return !normalizedQuery
      || `${log.action} ${log.entity_type} ${log.entity_id ?? ""} ${log.user_name ?? ""} ${details}`.toLocaleLowerCase("id-ID").includes(normalizedQuery);
  }), [auditLogs, normalizedQuery]);

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    setSearchQuery("");
    setStatusFilter("");
    setError("");
    setSuccess("");
  };

  const prepareRestockDraft = (suggestion: (typeof restockSuggestions)[number]) => {
    const hasUnsavedDraft = Boolean(
      poInput.supplier || poInput.notes.trim() || poLines.some((line) => line.product_id),
    );
    if (hasUnsavedDraft && !window.confirm("Isi draft PO saat ini dengan saran restok ini? Perubahan draft yang belum disimpan akan diganti.")) {
      return;
    }
    setPoInput({ supplier: "", warehouse: String(suggestion.warehouse_id), notes: "" });
    setPoLines([{ product_id: String(suggestion.product_id), quantity: String(suggestion.suggestedQuantity) }]);
    setPoFormOpen(true);
    selectTab("purchasing");
    setSuccess(`Draft PO disiapkan untuk ${suggestion.name}. Pilih supplier dan tinjau jumlahnya sebelum menyimpan.`);
  };

  const createPO = async () => {
    if (!poInput.supplier) return setError("Pilih supplier terlebih dahulu");
    const linesError = validateLines(poLines);
    if (linesError) return setError(linesError);
    const completed = await run(
      () => createPurchaseOrder({
        supplier_id: Number(poInput.supplier),
        warehouse_id: poInput.warehouse ? Number(poInput.warehouse) : undefined,
        notes: poInput.notes,
        items: validLines(poLines),
      }),
      "Draft purchase order berhasil dibuat.",
    );
    if (completed) {
      setPoLines([{ product_id: "", quantity: "1" }]);
      setPoInput({ supplier: "", warehouse: "", notes: "" });
      setPoFormOpen(false);
    }
  };

  const createOrder = async () => {
    const linesError = validateLines(orderLines);
    if (linesError) return setError(linesError);
    const completed = await run(
      () => createCustomerOrder({
        warehouse_id: orderInput.warehouse ? Number(orderInput.warehouse) : undefined,
        notes: orderInput.notes,
        items: validLines(orderLines),
      }),
      "Pesanan dibuat dan stok tersedia direservasi untuk persetujuan.",
    );
    if (completed) {
      setOrderLines([{ product_id: "", quantity: "1" }]);
      setOrderInput({ warehouse: "", notes: "" });
    }
  };

  const moveStock = async () => {
    if (transfer.from === transfer.to) return setError("Gudang asal dan tujuan harus berbeda.");
    if (!Number.isSafeInteger(Number(transfer.quantity)) || Number(transfer.quantity) <= 0) {
      return setError("Jumlah transfer harus berupa bilangan bulat positif.");
    }
    const completed = await run(() => transferStock({
      from_warehouse_id: Number(transfer.from),
      to_warehouse_id: Number(transfer.to),
      product_id: Number(transfer.product),
      quantity: Number(transfer.quantity),
      note: transfer.note,
    }), "Transfer stok berhasil dicatat.");
    if (completed) setTransfer({ from: "", to: "", product: "", quantity: "1", note: "" });
  };

  const addWarehouse = async () => {
    const completed = await run(() => createWarehouse(newWarehouse), "Gudang berhasil ditambahkan.");
    if (completed) setNewWarehouse({ code: "", name: "", address: "" });
  };

  const addSupplier = async () => {
    const completed = await run(() => createSupplier(supplierInput), "Supplier berhasil ditambahkan.");
    if (completed) setSupplierInput({ name: "", email: "", phone: "" });
  };

  const receivePO = async (orderId: number, orderNumber: string) => {
    try {
      const order = await getPurchaseOrder(orderId);
      const items = order.items
        .map((item) => ({
          item_id: item.item_id,
          product_name: item.product_name,
          remaining: item.quantity - item.received_quantity,
          quantity: "",
        }))
        .filter((item) => item.remaining > 0);
      if (items.length === 0) return setError("Semua barang pada PO ini sudah diterima.");
      setError("");
      setReceipt({ orderId, orderNumber, items });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat detail PO");
    }
  };

  const updateShipment = (order: CustomerOrder, status: "shipped" | "in_transit" | "delivered" | "cancelled") => {
    if (!order.shipment_id) return;
    const trackingNumber = trackingNumbers[order.id]?.trim();
    void run(
      () => updateShipmentStatus(order.shipment_id!, status, trackingNumber || undefined),
      `Status pengiriman diperbarui menjadi ${statusLabels[status]?.toLowerCase() ?? status.replace("_", " ")}.`,
    );
  };
  const showShipmentEvents = async (shipmentId: number) => {
    setError("");
    try {
      setShipmentEvents(await getShipmentEvents(shipmentId));
      setEventShipmentId(shipmentId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat riwayat pengiriman");
    }
  };

  return (
    <section className="page-section operations-page">
      <div className="section-heading">
        <div>
          <h2>Operasional supply chain</h2>
          <p>Kelola gudang, pengadaan, reservasi pesanan, pengiriman, dan jejak audit.</p>
        </div>
        <button className="button button-secondary operation-refresh" onClick={refresh} disabled={loading || busy}>
          <span aria-hidden="true">↻</span>{loading ? "Memuat..." : "Perbarui data"}
        </button>
      </div>
      <div className="operation-metrics" aria-label="Ringkasan operasional">
        <article className="operation-metric">
          <span>PO menunggu persetujuan</span>
          <strong>{pendingApprovals}</strong>
        </article>
        <article className="operation-metric">
          <span>PO siap diterima</span>
          <strong>{awaitingReceipt}</strong>
        </article>
        <article className="operation-metric">
          <span>Pesanan menunggu</span>
          <strong>{pendingOrders}</strong>
        </article>
        <article className="operation-metric">
          <span>Pengiriman aktif</span>
          <strong>{activeShipments}</strong>
        </article>
      </div>
      <div className="toolbar operation-tabs" role="tablist" aria-label="Modul operasional">
        {tabs.filter((item) => item.id !== "audit" || isAdmin).map((item) => (
          <button
            className={`button ${tab === item.id ? "button-primary" : "button-secondary"} operation-tab`}
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
            <span className="operation-tab-count">
              {item.id === "inventory" ? levels.length
                : item.id === "purchasing" ? purchaseOrders.length
                  : item.id === "orders" ? orders.length : auditLogs.length}
            </span>
          </button>
        ))}
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}
      <div className="operation-controls">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label={tab === "inventory" ? "Cari stok" : tab === "purchasing" ? "Cari purchase order" : tab === "orders" ? "Cari pesanan" : "Cari aktivitas"}
            placeholder={tab === "inventory" ? "Cari SKU, produk, atau gudang..." : tab === "purchasing" ? "Cari nomor PO, supplier, gudang..." : tab === "orders" ? "Cari nomor pesanan, resi, invoice..." : "Cari pengguna, aksi, atau detail..."}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        {tab !== "audit" && (
          <label className="operation-filter">
            <span>{tab === "inventory" ? "Kondisi stok" : "Status"}</span>
            <select aria-label={tab === "inventory" ? "Filter kondisi stok" : "Filter status"} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {tab === "inventory" ? <>
                <option value="">Semua kondisi</option>
                <option value="low">Di bawah stok minimum</option>
                <option value="reserved">Memiliki reservasi</option>
                <option value="empty">Stok habis</option>
              </> : tab === "purchasing" ? <>
                <option value="">Semua status PO</option>
                {["draft", "pending_approval", "approved", "partially_received", "received", "rejected", "cancelled"].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </> : <>
                <option value="">Semua status pesanan/pengiriman</option>
                {["draft", "pending_approval", "approved", "rejected", "cancelled", "fulfilled", "pending", "shipped", "in_transit", "delivered"].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </>}
            </select>
          </label>
        )}
        {(searchQuery || statusFilter) && (
          <button className="button button-secondary" onClick={() => { setSearchQuery(""); setStatusFilter(""); }}>
            Hapus filter
          </button>
        )}
        <span className="operation-result-count" aria-live="polite">
          {tab === "inventory" ? `${visibleLevels.length} saldo`
            : tab === "purchasing" ? `${visiblePurchaseOrders.length} PO`
              : tab === "orders" ? `${visibleOrders.length} pesanan` : `${visibleAuditLogs.length} aktivitas`}
        </span>
      </div>

      {tab === "inventory" && (
        <>
          <section className="operation-restock-card" aria-labelledby="restock-heading">
            <div className="operation-restock-heading">
              <div>
                <span className="operation-eyebrow">Rekomendasi pengadaan</span>
                <h3 id="restock-heading">Saran restok</h3>
                <p>Jumlah saran membawa stok tersedia kembali ke batas minimum. Tinjau dahulu sebelum membuat draft PO.</p>
              </div>
              <div className="operation-restock-total">
                <strong>{restockSuggestions.length}</strong>
                <span>produk · {suggestedRestockUnits.toLocaleString("id-ID")} unit</span>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table operation-restock-table">
                <thead><tr><th>Produk</th><th>Gudang</th><th>Tersedia</th><th>Minimum</th><th>Saran pesan</th><th>Aksi</th></tr></thead>
                <tbody>
                  {restockSuggestions.map((row) => (
                    <tr key={`${row.warehouse_id}-${row.product_id}`}>
                      <td><span className="cell-strong">{row.name}</span><small className="operation-stock-minimum">{row.sku}</small></td>
                      <td>{row.warehouse_name}</td>
                      <td><span className="operation-stock-low">{row.available.toLocaleString("id-ID")}</span></td>
                      <td>{row.minimum_stock.toLocaleString("id-ID")}</td>
                      <td><strong>{row.suggestedQuantity.toLocaleString("id-ID")} unit</strong></td>
                      <td><button className="button button-secondary" onClick={() => prepareRestockDraft(row)}>Siapkan draft PO</button></td>
                    </tr>
                  ))}
                  {!restockSuggestions.length && (
                    <tr><td className="table-empty" colSpan={6}>
                      {loading ? "Memuat saran restok..." : "Semua gudang aktif berada pada atau di atas stok minimum."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          {isAdmin && (
            <details className="operation-disclosure">
              <summary><span><strong>Tambah gudang</strong><small>Daftarkan lokasi stok baru</small></span><span className="operation-disclosure-icon" aria-hidden="true">+</span></summary>
              <div className="form-card">
                <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void addWarehouse(); }}>
                  <label>Kode<input required maxLength={30} value={newWarehouse.code} onChange={(event) => setNewWarehouse({ ...newWarehouse, code: event.target.value })} /></label>
                  <label>Nama<input required maxLength={120} value={newWarehouse.name} onChange={(event) => setNewWarehouse({ ...newWarehouse, name: event.target.value })} /></label>
                  <label>Alamat<input value={newWarehouse.address} onChange={(event) => setNewWarehouse({ ...newWarehouse, address: event.target.value })} /></label>
                  <button className="button button-primary" disabled={busy}>Tambah gudang</button>
                </form>
              </div>
            </details>
          )}
          {isAdmin && warehouseOptions.length > 1 && products.length > 0 && (
            <details className="operation-disclosure">
              <summary><span><strong>Transfer antar-gudang</strong><small>Pindahkan stok tanpa mengubah total persediaan</small></span><span className="operation-disclosure-icon" aria-hidden="true">+</span></summary>
              <div className="form-card">
                <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void moveStock(); }}>
                  <label>Dari<select required value={transfer.from} onChange={(event) => setTransfer({ ...transfer, from: event.target.value })}><option value="">Pilih gudang asal</option>{warehouseOptions.map((w) => <option key={w.id} value={w.id} disabled={String(w.id) === transfer.to}>{w.name}</option>)}</select></label>
                  <label>Ke<select required value={transfer.to} onChange={(event) => setTransfer({ ...transfer, to: event.target.value })}><option value="">Pilih gudang tujuan</option>{warehouseOptions.map((w) => <option key={w.id} value={w.id} disabled={String(w.id) === transfer.from}>{w.name}</option>)}</select></label>
                  <label>Produk<select required value={transfer.product} onChange={(event) => setTransfer({ ...transfer, product: event.target.value })}><option value="">Pilih produk</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></label>
                  <label>Jumlah<input required type="number" min="1" step="1" value={transfer.quantity} onChange={(event) => setTransfer({ ...transfer, quantity: event.target.value })} /></label>
                  <label>Catatan<input value={transfer.note} onChange={(event) => setTransfer({ ...transfer, note: event.target.value })} /></label>
                  <button className="button button-primary" disabled={busy}>Transfer stok</button>
                </form>
              </div>
            </details>
          )}
          <div className="table-card">
            <div className="card-toolbar">
              <h3>Saldo stok per gudang</h3>
              <select aria-label="Filter gudang" value={warehouseFilter} onChange={(event) => {
                setError("");
                setLoading(true);
                setWarehouseFilter(event.target.value);
              }}>
                <option value="">Semua gudang</option>
                {warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </div>
            <div className="table-scroll"><table className="data-table">
              <thead><tr><th>Gudang</th><th>SKU</th><th>Produk</th><th>Fisik</th><th>Reservasi</th><th>Tersedia</th></tr></thead>
              <tbody>{visibleLevels.map((row) => <tr key={`${row.warehouse_id}-${row.product_id}`}>
                <td>{row.warehouse_name}</td><td>{row.sku}</td><td className="cell-strong">{row.name}</td>
                <td>{row.on_hand.toLocaleString("id-ID")}</td><td>{row.reserved.toLocaleString("id-ID")}</td>
                <td><span className={row.available < row.minimum_stock ? "operation-stock-low" : "operation-stock-ok"}>{row.available.toLocaleString("id-ID")}</span><small className="operation-stock-minimum">Minimum {row.minimum_stock.toLocaleString("id-ID")}</small></td>
              </tr>)}
              {!visibleLevels.length && <tr><td className="table-empty" colSpan={6}>{loading ? "Memuat saldo stok..." : levels.length ? "Tidak ada saldo yang cocok dengan pencarian atau filter." : "Belum ada saldo stok untuk filter ini."}</td></tr>}</tbody>
            </table></div>
          </div>
        </>
      )}

      {tab === "purchasing" && (
        <>
          <details className="operation-disclosure" open={poFormOpen} onToggle={(event) => setPoFormOpen(event.currentTarget.open)}>
            <summary><span><strong>Buat purchase order</strong><small>Catat kebutuhan barang dari supplier</small></span><span className="operation-disclosure-icon" aria-hidden="true">+</span></summary>
            <div className="form-card">
              <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void createPO(); }}>
              <label>Supplier<select required value={poInput.supplier} onChange={(event) => setPoInput({ ...poInput, supplier: event.target.value })}><option value="">Pilih supplier</option>{suppliers.filter((s) => Boolean(s.is_active)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>Gudang penerimaan<select value={poInput.warehouse} onChange={(event) => setPoInput({ ...poInput, warehouse: event.target.value })}><option value="">Gudang utama</option>{warehouseOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
              <label>Catatan<input value={poInput.notes} onChange={(event) => setPoInput({ ...poInput, notes: event.target.value })} /></label>
              <div className="form-grid">{poLines.map((line, index) => (
                <div className="toolbar" key={`po-line-${index}`}>
                  <select required aria-label={`Produk PO ${index + 1}`} value={line.product_id} onChange={(event) => updateLine(setPoLines, poLines, index, "product_id", event.target.value)}><option value="">Pilih produk</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select>
                  <input required aria-label={`Jumlah PO ${index + 1}`} type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(setPoLines, poLines, index, "quantity", event.target.value)} />
                  {poLines.length > 1 && <button type="button" className="button button-secondary" onClick={() => removeLine(setPoLines, poLines, index)}>Hapus</button>}
                </div>
              ))}</div>
              <div className="toolbar">
                <button type="button" className="button button-secondary" onClick={() => addLine(setPoLines, poLines)}>Tambah item</button>
                <button className="button button-primary" disabled={busy || !suppliers.length}>Simpan draft PO</button>
              </div>
              </form>
            </div>
          </details>
          {isAdmin && (
            <details className="operation-disclosure">
              <summary><span><strong>Tambah supplier</strong><small>Daftarkan rekan pemasok baru</small></span><span className="operation-disclosure-icon" aria-hidden="true">+</span></summary>
              <div className="form-card">
                <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void addSupplier(); }}>
                  <label>Nama<input required maxLength={150} value={supplierInput.name} onChange={(event) => setSupplierInput({ ...supplierInput, name: event.target.value })} /></label>
                  <label>Email<input type="email" value={supplierInput.email} onChange={(event) => setSupplierInput({ ...supplierInput, email: event.target.value })} /></label>
                  <label>Telepon<input value={supplierInput.phone} onChange={(event) => setSupplierInput({ ...supplierInput, phone: event.target.value })} /></label>
                  <button className="button button-primary" disabled={busy}>Tambah supplier</button>
                </form>
              </div>
            </details>
          )}
          <div className="table-card"><div className="table-summary">Purchase order terbaru</div><div className="table-scroll"><table className="data-table">
            <thead><tr><th>Nomor</th><th>Supplier</th><th>Gudang</th><th>Status</th><th>Dibuat oleh</th><th>Aksi</th></tr></thead>
            <tbody>{visiblePurchaseOrders.map((po) => <tr key={po.id}>
              <td className="cell-strong">{po.order_number}</td><td>{po.supplier_name}</td><td>{po.warehouse_name}</td><td><StatusBadge status={po.status} /></td><td>{po.created_by_name}</td>
              <td><div className="row-actions">
                {po.status === "draft" && po.created_by === user.id && <button className="button button-secondary" disabled={busy} onClick={() => void run(() => submitPurchaseOrder(po.id), "PO diajukan untuk persetujuan Admin.")}>Ajukan</button>}
                {["draft", "pending_approval", "approved"].includes(po.status)
                  && (po.created_by === user.id || isAdmin)
                  && <button className="button button-danger-subtle" disabled={busy} onClick={() => runAfterConfirmation(`Batalkan ${po.order_number}?`, () => cancelPurchaseOrder(po.id), "PO dibatalkan.")}>Batalkan</button>}
                {isAdmin && po.status === "pending_approval" && <>
                  <button className="button button-secondary" disabled={busy} onClick={() => void run(() => reviewPurchaseOrder(po.id, "approve"), "PO disetujui.")}>Setujui</button>
                  <button className="button button-danger-subtle" disabled={busy} onClick={() => runAfterConfirmation(`Tolak ${po.order_number}?`, () => reviewPurchaseOrder(po.id, "reject"), "PO ditolak.")}>Tolak</button>
                </>}
                {isAdmin && ["approved", "partially_received"].includes(po.status) && <button className="button button-secondary" disabled={busy} onClick={() => void receivePO(po.id, po.order_number)}>Terima barang</button>}
              </div></td>
            </tr>)}
            {!visiblePurchaseOrders.length && <tr><td className="table-empty" colSpan={6}>{loading ? "Memuat purchase order..." : purchaseOrders.length ? "Tidak ada PO yang cocok dengan pencarian atau filter." : "Belum ada purchase order."}</td></tr>}</tbody>
          </table></div></div>
        </>
      )}

      {tab === "orders" && (
        <>
          <details className="operation-disclosure">
            <summary><span><strong>Buat pesanan dan reservasi stok</strong><small>Stok tersedia akan ditahan hingga pesanan diproses</small></span><span className="operation-disclosure-icon" aria-hidden="true">+</span></summary>
            <div className="form-card"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); void createOrder(); }}>
              <label>Gudang<select value={orderInput.warehouse} onChange={(event) => setOrderInput({ ...orderInput, warehouse: event.target.value })}><option value="">Gudang utama</option>{warehouseOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
              <label>Catatan<input value={orderInput.notes} onChange={(event) => setOrderInput({ ...orderInput, notes: event.target.value })} /></label>
              <div className="form-grid">{orderLines.map((line, index) => (
                <div className="toolbar operation-order-line" key={`order-line-${index}`}>
                  <select required aria-label={`Produk pesanan ${index + 1}`} value={line.product_id} onChange={(event) => updateLine(setOrderLines, orderLines, index, "product_id", event.target.value)}><option value="">Pilih produk</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select>
                  <input required aria-label={`Jumlah pesanan ${index + 1}`} type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(setOrderLines, orderLines, index, "quantity", event.target.value)} />
                  {orderLines.length > 1 && <button type="button" className="button button-secondary" aria-label={`Hapus produk pesanan ${index + 1}`} onClick={() => removeLine(setOrderLines, orderLines, index)}>Hapus</button>}
                </div>
              ))}</div>
              <div className="toolbar">
                <button type="button" className="button button-secondary" onClick={() => addLine(setOrderLines, orderLines)}>Tambah item</button>
                <button className="button button-primary" disabled={busy}>Buat & reservasi</button>
              </div>
            </form></div>
          </details>
          <div className="table-card"><div className="table-summary">Pesanan terbaru</div><div className="table-scroll"><table className="data-table">
            <thead><tr><th>Nomor</th><th>Gudang</th><th>Status pesanan</th><th>Pengiriman</th><th>Resi</th><th>Invoice penjualan</th><th>Aksi</th></tr></thead>
            <tbody>{visibleOrders.map((order) => <tr key={order.id}>
              <td className="cell-strong">{order.order_number}</td><td>{order.warehouse_name}</td><td><StatusBadge status={order.status} /></td><td>{order.shipment_status ? <StatusBadge status={order.shipment_status} /> : "—"}</td><td>{order.tracking_number ?? "—"}</td><td>{order.invoice_number ?? "—"}</td>
              <td><div className="row-actions">
                {isAdmin && order.status === "pending_approval" && <>
                  <button className="button button-secondary" disabled={busy} onClick={() => void run(() => reviewCustomerOrder(order.id, "approve"), "Pesanan disetujui; pengiriman siap diproses.")}>Setujui</button>
                  <button className="button button-danger-subtle" disabled={busy} onClick={() => runAfterConfirmation(`Tolak ${order.order_number} dan lepaskan reservasi stok?`, () => reviewCustomerOrder(order.id, "reject"), "Pesanan ditolak dan reservasi dilepas.")}>Tolak</button>
                </>}
                {["draft", "pending_approval"].includes(order.status)
                  && (order.created_by === user.id || isAdmin)
                  && <button className="button button-danger-subtle" disabled={busy} onClick={() => runAfterConfirmation(`Batalkan ${order.order_number} dan lepaskan reservasi stok?`, () => cancelCustomerOrder(order.id), "Pesanan dibatalkan dan reservasi dilepas.")}>Batalkan pesanan</button>}
                {order.shipment_id && order.shipment_status === "pending" && <>
                  <input aria-label={`Nomor resi ${order.order_number}`} placeholder="Nomor resi (opsional)" value={trackingNumbers[order.id] ?? ""} onChange={(event) => setTrackingNumbers({ ...trackingNumbers, [order.id]: event.target.value })} />
                  <button className="button button-primary" disabled={busy} onClick={() => runAfterConfirmation(`Kirim ${order.order_number}? Stok akan dikurangi dan transaksi penjualan dibuat.`, () => updateShipmentStatus(order.shipment_id!, "shipped", trackingNumbers[order.id]?.trim() || undefined), "Pesanan dikirim; stok dan transaksi penjualan telah diperbarui.")}>Kirim</button>
                  <button className="button button-danger-subtle" disabled={busy} onClick={() => runAfterConfirmation(`Batalkan pengiriman ${order.order_number}?`, () => updateShipmentStatus(order.shipment_id!, "cancelled"), "Pengiriman dibatalkan.")}>Batalkan</button>
                </>}
                {order.shipment_id && order.shipment_status === "shipped" && <button className="button button-secondary" disabled={busy} onClick={() => updateShipment(order, "in_transit")}>Dalam perjalanan</button>}
                {order.shipment_id && order.shipment_status === "in_transit" && <button className="button button-secondary" disabled={busy} onClick={() => updateShipment(order, "delivered")}>Terkirim</button>}
                {order.shipment_id && <button className="button button-secondary" onClick={() => void showShipmentEvents(order.shipment_id!)}>Riwayat</button>}
              </div></td>
            </tr>)}
            {!visibleOrders.length && <tr><td className="table-empty" colSpan={7}>{loading ? "Memuat pesanan..." : orders.length ? "Tidak ada pesanan yang cocok dengan pencarian atau filter." : "Belum ada pesanan."}</td></tr>}</tbody>
          </table></div></div>
          {eventShipmentId !== null && <div className="table-card">
            <div className="card-toolbar"><h3>Riwayat pengiriman #{eventShipmentId}</h3><button className="button button-secondary" onClick={() => setEventShipmentId(null)}>Tutup</button></div>
            <div className="table-scroll"><table className="data-table">
              <thead><tr><th>Waktu</th><th>Status</th><th>Catatan</th><th>Oleh</th></tr></thead>
              <tbody>{shipmentEvents.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString("id-ID")}</td><td>{event.status}</td><td>{event.note ?? "—"}</td><td>{event.user_name}</td></tr>)}
                {!shipmentEvents.length && <tr><td className="table-empty" colSpan={4}>Belum ada riwayat.</td></tr>}
              </tbody>
            </table></div>
          </div>}
        </>
      )}

      {tab === "audit" && isAdmin && (
        <div className="table-card"><div className="table-summary">200 aktivitas terbaru</div><div className="table-scroll"><table className="data-table">
          <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Entitas</th><th>ID</th><th>Detail</th></tr></thead>
          <tbody>{visibleAuditLogs.map((log) => <tr key={log.id}>
            <td>{new Date(log.created_at).toLocaleString("id-ID")}</td><td>{log.user_name ?? "System"}</td><td>{log.action}</td>
            <td>{log.entity_type}</td><td>{log.entity_id ?? "—"}</td><td>{typeof log.details === "string" ? log.details : JSON.stringify(log.details ?? {})}</td>
          </tr>)}
          {!visibleAuditLogs.length && <tr><td className="table-empty" colSpan={6}>{loading ? "Memuat aktivitas..." : auditLogs.length ? "Tidak ada aktivitas yang cocok dengan pencarian." : "Belum ada aktivitas yang tercatat."}</td></tr>}</tbody>
        </table></div></div>
      )}
      {receipt && (
        <div className="operation-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) closeReceipt();
        }}>
          <section className="operation-dialog" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
            <div className="section-heading">
              <div>
                <h3 id="receipt-title">Terima barang</h3>
                <p>{receipt.orderNumber} · Kosongkan jumlah item yang belum diterima.</p>
              </div>
              <button type="button" className="button button-secondary" disabled={busy} onClick={closeReceipt}>Tutup</button>
            </div>
            <form className="form-grid" onSubmit={(event) => {
              event.preventDefault();
              const items: { item_id: number; quantity: number }[] = [];
              for (const item of receipt.items) {
                if (!item.quantity.trim()) continue;
                const quantity = Number(item.quantity);
                if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > item.remaining) {
                  setError(`Jumlah ${item.product_name} harus antara 1 dan ${item.remaining}.`);
                  return;
                }
                items.push({ item_id: item.item_id, quantity });
              }
              if (items.length === 0) {
                setError("Masukkan jumlah untuk setidaknya satu item.");
                return;
              }
              setError("");
              void run(
                () => receivePurchaseOrder(receipt.orderId, items),
                "Penerimaan barang dicatat ke stok gudang.",
              ).then((completed) => {
                if (completed) closeReceipt();
              });
            }}>
              {receipt.items.map((item, index) => (
                <label className="receipt-line" key={item.item_id}>
                  <span>{item.product_name}<small>Sisa pesanan: {item.remaining}</small></span>
                  <input
                    aria-label={`Jumlah diterima untuk ${item.product_name}`}
                    type="number"
                    min="1"
                    max={item.remaining}
                    step="1"
                    placeholder="Lewati"
                    value={item.quantity}
                    onChange={(event) => setReceipt({
                      ...receipt,
                      items: receipt.items.map((line, lineIndex) => lineIndex === index
                        ? { ...line, quantity: event.target.value }
                        : line),
                    })}
                  />
                </label>
              ))}
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              <div className="toolbar">
                <button type="button" className="button button-secondary" disabled={busy} onClick={closeReceipt}>Batal</button>
                <button className="button button-primary" disabled={busy}>{busy ? "Menyimpan..." : "Catat penerimaan"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
