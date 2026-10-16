import { useEffect, useMemo, useState } from "react";
import { getProducts, createSale } from "../services/api";
import type { Product } from "../../types";

interface CartLine { product: Product; quantity: number }

const rupiah = (v: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getProducts(search)
      .then((result) => { if (active) { setProducts(result); setError(""); } })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, reloadKey]);

  const visibleProducts = useMemo(
    () => availableOnly ? products.filter((product) => product.stock > 0) : products,
    [products, availableOnly],
  );

  const addToCart = (product: Product) => {
    setError("");
    setSuccess("");
    const found = cart.find((line) => line.product.id === product.id);
    if (found && found.quantity >= product.stock) {
      setError(`Stok ${product.name} hanya ${product.stock} item`);
      return;
    }
    if (found) {
      setCart((previous) => previous.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line));
      return;
    }
    setCart((previous) => [...previous, { product, quantity: 1 }]);
  };

  const setQuantity = (id: number, quantity: number) => {
    setCart((previous) => previous.map((line) => line.product.id === id
      ? { ...line, quantity: Math.max(1, Math.min(quantity || 1, line.product.stock)) }
      : line));
  };

  const removeLine = (id: number) => setCart((previous) => previous.filter((line) => line.product.id !== id));
  const total = cart.reduce((sum, line) => sum + Number(line.product.selling_price) * line.quantity, 0);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const reloadProducts = () => { setLoading(true); setReloadKey((key) => key + 1); };

  const checkout = async () => {
    setError("");
    setSuccess("");
    if (cart.length === 0) return setError("Keranjang masih kosong");
    if (!window.confirm(`Simpan transaksi dengan total ${rupiah(total)}?`)) return;

    setSaving(true);
    try {
      const result = await createSale(cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity })));
      setSuccess(`Transaksi berhasil disimpan · Invoice ${result.invoice_number} · ${rupiah(result.total_amount)}`);
      setCart([]);
      reloadProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaksi gagal disimpan");
      reloadProducts();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Kasir</h2>
          <p>Cari produk, masukkan ke keranjang, lalu simpan transaksi.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      <div className="sales-layout">
        <section className="table-card sales-products">
          <div className="card-toolbar">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Cari produk"
                placeholder="Cari nama atau SKU..."
                value={search}
                onChange={(event) => { setLoading(true); setSearch(event.target.value); }}
              />
            </label>
            <label className="toggle-field">
              <input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />
              <span>Stok tersedia</span>
            </label>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>SKU</th><th>Produk</th><th>Harga</th><th>Stok</th><th>Aksi</th></tr></thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="table-empty">Memuat produk...</td></tr>}
                {!loading && visibleProducts.length === 0 && (
                  <tr><td colSpan={5} className="table-empty">
                    {products.length === 0 ? "Produk tidak ditemukan." : "Tidak ada produk dengan stok tersedia."}
                  </td></tr>
                )}
                {!loading && visibleProducts.map((product) => {
                  const inCart = cart.find((line) => line.product.id === product.id)?.quantity ?? 0;
                  return (
                    <tr key={product.id}>
                      <td className="cell-muted">{product.sku}</td>
                      <td className="cell-strong">{product.name}</td>
                      <td>{rupiah(product.selling_price)}</td>
                      <td>{product.stock}</td>
                      <td>
                        <button className="button button-subtle" disabled={product.stock === 0 || inCart >= product.stock} onClick={() => addToCart(product)}>
                          {inCart > 0 ? `Tambah (${inCart})` : "Tambah"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="cart-card">
          <div className="cart-heading">
            <div><h3>Keranjang</h3><p>{itemCount} item dalam transaksi</p></div>
            {cart.length > 0 && <button className="text-button" onClick={() => setCart([])}>Kosongkan</button>}
          </div>
          {cart.length === 0 ? (
            <div className="cart-empty">Keranjang kosong.<br />Tambahkan produk untuk memulai transaksi.</div>
          ) : (
            <div className="cart-lines">
              {cart.map((line) => (
                <div className="cart-line" key={line.product.id}>
                  <div className="cart-line-title">
                    <strong>{line.product.name}</strong>
                    <button className="remove-button" aria-label={`Hapus ${line.product.name}`} onClick={() => removeLine(line.product.id)}>×</button>
                  </div>
                  <div className="cart-line-controls">
                    <div className="quantity-control">
                      <button aria-label={`Kurangi jumlah ${line.product.name}`} onClick={() => setQuantity(line.product.id, line.quantity - 1)} disabled={line.quantity <= 1}>−</button>
                      <input
                        aria-label={`Jumlah ${line.product.name}`}
                        type="number"
                        min={1}
                        max={line.product.stock}
                        value={line.quantity}
                        onChange={(event) => setQuantity(line.product.id, Number(event.target.value))}
                      />
                      <button aria-label={`Tambah jumlah ${line.product.name}`} onClick={() => setQuantity(line.product.id, line.quantity + 1)} disabled={line.quantity >= line.product.stock}>+</button>
                    </div>
                    <span>{rupiah(Number(line.product.selling_price) * line.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="cart-total">
            <span>Total pembayaran</span>
            <strong>{rupiah(total)}</strong>
          </div>
          <p className="cart-note">Total akhir dihitung ulang oleh server.</p>
          <button className="button button-primary checkout-button" onClick={checkout} disabled={saving || cart.length === 0}>
            {saving ? "Menyimpan transaksi..." : "Bayar dan simpan"}
          </button>
        </aside>
      </div>
    </section>
  );
}
