import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getProducts, getMovements, addStock } from "../services/api";
import type { StockMovement, User } from "../services/api";
import type { Product } from "../../types";

type MovementFilter = "all" | "initial" | "in" | "out" | "adjustment";

const labels: Record<StockMovement["movement_type"], string> = {
  initial: "Stok awal",
  in: "Barang masuk",
  out: "Penjualan",
  adjustment: "Penyesuaian",
};

export default function StockPage({ user }: { user: User }) {
  const isAdmin = user.role === "admin";
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [productId, setProductId] = useState("");
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"in" | "adjustment">("in");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([getProducts(), getMovements(productId)])
      .then(([productList, history]) => {
        if (!active) return;
        setProducts(productList);
        setMovements(history);
        setError("");
      })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey, productId]);

  const filteredMovements = useMemo(() => movements.filter((movement) => {
    const matchesType = movementFilter === "all" || movement.movement_type === movementFilter;
    const query = search.trim().toLocaleLowerCase("id");
    const matchesSearch = !query || [movement.sku, movement.product_name, movement.user_name ?? "", movement.note ?? ""]
      .some((value) => value.toLocaleLowerCase("id").includes(query));
    return matchesType && matchesSearch;
  }), [movements, movementFilter, search]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!productId) return setError("Pilih produk yang akan diperbarui");
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty === 0) return setError("Jumlah harus bilangan bulat selain 0");
    if (type === "in" && qty < 0) return setError("Barang masuk harus bernilai positif");
    if (type === "adjustment" && !note.trim()) return setError("Penyesuaian wajib diberi catatan alasan");

    setSaving(true);
    try {
      await addStock({ product_id: Number(productId), movement_type: type, quantity: qty, note: note.trim() });
      setQuantity("");
      setNote("");
      setSuccess("Perubahan stok berhasil disimpan.");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memperbarui stok");
    } finally {
      setSaving(false);
    }
  };

  const incoming = movements.filter((movement) => movement.movement_type === "in" || movement.movement_type === "initial").length;
  const outgoing = movements.filter((movement) => movement.movement_type === "out").length;
  const adjustments = movements.filter((movement) => movement.movement_type === "adjustment").length;
  const reload = () => { setLoading(true); setReloadKey((key) => key + 1); };

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Manajemen stok</h2>
          <p>Catat barang masuk dan telusuri riwayat perubahan stok.</p>
        </div>
        <button className="button button-secondary" onClick={reload} disabled={loading}>
          {loading ? "Memuat..." : "Muat ulang"}
        </button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      {isAdmin && (
        <form className="form-card stock-form" onSubmit={handleSubmit}>
          <div className="section-heading form-heading">
            <div><h3>Perbarui stok</h3><p>Catat penerimaan barang atau penyesuaian inventaris.</p></div>
          </div>
          <div className="form-grid stock-form-grid">
            <label className="form-field">Produk
              <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
                <option value="">Pilih produk</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name} (stok {product.stock})</option>)}
              </select>
            </label>
            <label className="form-field">Jenis perubahan
              <select value={type} onChange={(event) => setType(event.target.value as "in" | "adjustment")}>
                <option value="in">Barang masuk</option>
                <option value="adjustment">Penyesuaian stok</option>
              </select>
            </label>
            <label className="form-field">Jumlah {type === "adjustment" && "(gunakan tanda minus untuk mengurangi)"}
              <input type="number" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={type === "in" ? "Contoh: 20" : "Contoh: -2 atau 5"} required />
            </label>
            <label className="form-field">Catatan {type === "adjustment" && "(wajib)"}
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={type === "in" ? "Nomor penerimaan atau keterangan" : "Alasan penyesuaian"} required={type === "adjustment"} />
            </label>
          </div>
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={saving || loading || products.length === 0}>
              {saving ? "Menyimpan..." : "Simpan perubahan stok"}
            </button>
          </div>
        </form>
      )}

      <div className="metrics-grid stock-metrics">
        <article className="mini-metric"><span>Barang masuk</span><strong>{incoming}</strong></article>
        <article className="mini-metric"><span>Penjualan tercatat</span><strong>{outgoing}</strong></article>
        <article className="mini-metric"><span>Penyesuaian</span><strong>{adjustments}</strong></article>
      </div>

      <div className="section-heading movement-heading">
        <div><h3>Riwayat pergerakan</h3><p>Menampilkan maksimal 200 catatan stok terbaru.</p></div>
      </div>
      <div className="toolbar">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Cari riwayat stok" placeholder="Cari produk, SKU, catatan..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <select aria-label="Filter produk" value={productId} onChange={(event) => { setLoading(true); setProductId(event.target.value); }}>
          <option value="">Semua produk</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <select aria-label="Filter jenis pergerakan" value={movementFilter} onChange={(event) => setMovementFilter(event.target.value as MovementFilter)}>
          <option value="all">Semua jenis</option>
          <option value="initial">Stok awal</option>
          <option value="in">Barang masuk</option>
          <option value="out">Penjualan</option>
          <option value="adjustment">Penyesuaian</option>
        </select>
      </div>
      <div className="table-card">
        <div className="table-summary">{loading ? "Memuat riwayat..." : `${filteredMovements.length} pergerakan ditampilkan`}</div>
        {loading ? <div className="table-message">Memuat riwayat pergerakan...</div> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Waktu</th><th>Produk</th><th>Jenis</th><th>Jumlah</th><th>Oleh</th><th>Catatan</th></tr></thead>
              <tbody>
                {filteredMovements.length === 0 && <tr><td className="table-empty" colSpan={6}>Belum ada pergerakan yang cocok dengan filter.</td></tr>}
                {filteredMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{new Date(movement.created_at).toLocaleString("id-ID")}</td>
                    <td><span className="cell-strong">{movement.product_name}</span><br /><span className="cell-muted">{movement.sku}</span></td>
                    <td><span className={`status-badge ${movement.quantity < 0 || movement.movement_type === "out" ? "status-warning" : "status-neutral"}`}>{labels[movement.movement_type]}</span></td>
                    <td className={movement.quantity < 0 ? "quantity-negative" : "quantity-positive"}>{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</td>
                    <td>{movement.user_name ?? "—"}</td>
                    <td>{movement.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
