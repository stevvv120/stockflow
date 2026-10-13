import { useEffect, useState } from "react";
import { getProducts, getMovements, addStock } from "../services/api";
import type { StockMovement, User } from "../services/api";
import type { Product } from "../../types";

const labels: Record<string, string> = {
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
  const [type, setType] = useState<"in" | "adjustment">("in");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getProducts().then(setProducts).catch((e) => setError(e.message));
  }, [reloadKey]);

  useEffect(() => {
    getMovements().then(setMovements).catch((e) => setError(e.message));
  }, [reloadKey]);

  const handleSubmit = async () => {
    setError("");
    if (!productId) return setError("Pilih produk");
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty === 0) return setError("Jumlah harus bilangan bulat, bukan 0");
    if (type === "in" && qty < 0) return setError("Barang masuk harus positif");
    if (type === "adjustment" && !note.trim()) return setError("Penyesuaian wajib diberi catatan");

    setSaving(true);
    try {
      await addStock({ product_id: Number(productId), movement_type: type, quantity: qty, note: note.trim() });
      setQuantity("");
      setNote("");
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24, textAlign: "left" }}>
      <h1>Manajemen Stok</h1>

      {isAdmin && (
        <div style={{ border: "1px solid #999", padding: 16, marginBottom: 16, maxWidth: 420, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Catat Pergerakan Stok</h2>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Pilih produk</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.sku} - {p.name} (stok {p.stock})</option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as "in" | "adjustment")}>
            <option value="in">Barang masuk</option>
            <option value="adjustment">Penyesuaian (boleh negatif)</option>
          </select>
          <input type="number" placeholder="Jumlah" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <input placeholder="Catatan (wajib untuk penyesuaian)" value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p style={{ color: "red", margin: 0 }}>{error}</p>}
          <button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</button>
        </div>
      )}
      {!isAdmin && error && <p style={{ color: "red" }}>{error}</p>}

      <h2>Riwayat Pergerakan Stok</h2>
      <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr><th>Waktu</th><th>Produk</th><th>Jenis</th><th>Jumlah</th><th>Oleh</th><th>Catatan</th></tr>
        </thead>
        <tbody>
          {movements.length === 0 && <tr><td colSpan={6}>Belum ada riwayat</td></tr>}
          {movements.map((m) => (
            <tr key={m.id}>
              <td>{new Date(m.created_at).toLocaleString("id-ID")}</td>
              <td>{m.sku} - {m.product_name}</td>
              <td>{labels[m.movement_type]}</td>
              <td style={{ color: m.quantity < 0 ? "red" : "green" }}>
                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
              </td>
              <td>{m.user_name ?? "-"}</td>
              <td>{m.note ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}