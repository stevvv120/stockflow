import { useEffect, useState } from "react";
import { getProducts, createSale } from "../services/api";
import type { Product } from "../../types";

interface CartLine { product: Product; quantity: number }

const rupiah = (v: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getProducts(search).then(setProducts).catch((e) => setError(e.message));
  }, [search, reloadKey]);

  const addToCart = (p: Product) => {
    setSuccess("");
    setCart((prev) => {
      const found = prev.find((l) => l.product.id === p.id);
      if (found) {
        if (found.quantity >= p.stock) return prev;
        return prev.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product: p, quantity: 1 }];
    });
  };

  const setQty = (id: number, qty: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.product.id === id
          ? { ...l, quantity: Math.max(1, Math.min(qty || 1, l.product.stock)) }
          : l
      )
    );
  };

  const removeLine = (id: number) => setCart((prev) => prev.filter((l) => l.product.id !== id));

  const total = cart.reduce((sum, l) => sum + Number(l.product.selling_price) * l.quantity, 0);

  const checkout = async () => {
    setError("");
    setSuccess("");
    if (cart.length === 0) return setError("Keranjang kosong");
    if (!window.confirm(`Simpan transaksi ${rupiah(total)}?`)) return;

    setSaving(true);
    try {
      const r = await createSale(cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })));
      setSuccess(`Transaksi berhasil. Invoice ${r.invoice_number}, total ${rupiah(r.total_amount)}`);
      setCart([]);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      setError(e.message);
      setReloadKey((k) => k + 1); // muat ulang stok terbaru
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24, textAlign: "left", display: "flex", gap: 24, alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
        <h1>Kasir</h1>
        <input
          placeholder="Cari nama atau SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr><th>SKU</th><th>Nama</th><th>Harga</th><th>Stok</th><th></th></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.sku}</td>
                <td>{p.name}</td>
                <td>{rupiah(p.selling_price)}</td>
                <td>{p.stock}</td>
                <td>
                  <button disabled={p.stock === 0} onClick={() => addToCart(p)}>
                    {p.stock === 0 ? "Habis" : "Tambah"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ width: 340, border: "1px solid #999", padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Keranjang</h2>
        {cart.length === 0 && <p>Belum ada item</p>}
        {cart.map((l) => (
          <div key={l.product.id} style={{ marginBottom: 10 }}>
            <div>{l.product.name}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                min={1}
                max={l.product.stock}
                value={l.quantity}
                onChange={(e) => setQty(l.product.id, Number(e.target.value))}
                style={{ width: 70 }}
              />
              <span>x {rupiah(l.product.selling_price)}</span>
              <button onClick={() => removeLine(l.product.id)}>Hapus</button>
            </div>
          </div>
        ))}
        <hr />
        <p><strong>Total: {rupiah(total)}</strong></p>
        <small>Total final dihitung ulang oleh server.</small>
        {error && <p style={{ color: "red" }}>{error}</p>}
        {success && <p style={{ color: "green" }}>{success}</p>}
        <div style={{ marginTop: 8 }}>
          <button onClick={checkout} disabled={saving || cart.length === 0}>
            {saving ? "Menyimpan..." : "Bayar / Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}