import { useState } from "react";
import type { Category, Product } from "../../types";
import type { ProductInput } from "../services/api";

interface Props {
  categories: Category[];
  product: Product | null; // null = mode tambah
  onSubmit: (data: ProductInput) => Promise<void>;
  onCancel: () => void;
}

export default function ProductForm({ categories, product, onSubmit, onCancel }: Props) {
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.category_id?.toString() ?? "");
  const [costPrice, setCostPrice] = useState(product?.cost_price ?? "0");
  const [sellingPrice, setSellingPrice] = useState(product?.selling_price ?? "");
  const [stock, setStock] = useState("0");
  const [minimumStock, setMinimumStock] = useState(product?.minimum_stock?.toString() ?? "5");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!sku.trim() || !name.trim()) return setError("SKU dan nama wajib diisi");
    if (Number(sellingPrice) < 0 || sellingPrice === "") return setError("Harga jual tidak valid");
    if (Number(costPrice) < 0) return setError("Harga modal tidak valid");

    setSaving(true);
    try {
      await onSubmit({
        category_id: categoryId ? Number(categoryId) : null,
        sku: sku.trim(),
        name: name.trim(),
        cost_price: Number(costPrice),
        selling_price: Number(sellingPrice),
        stock: product ? undefined : Number(stock),
        minimum_stock: Number(minimumStock),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const field = { display: "flex", flexDirection: "column" as const, gap: 4 };

  return (
    <div style={{ border: "1px solid #999", padding: 16, marginBottom: 16, maxWidth: 420 }}>
      <h2>{product ? "Edit Produk" : "Tambah Produk"}</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <label style={field}>SKU
          <input value={sku} onChange={(e) => setSku(e.target.value)} />
        </label>
        <label style={field}>Nama
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={field}>Kategori
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tanpa kategori</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label style={field}>Harga modal
          <input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
        </label>
        <label style={field}>Harga jual
          <input type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
        </label>
        {!product && (
          <label style={field}>Stok awal
            <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          </label>
        )}
        <label style={field}>Stok minimum
          <input type="number" value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} />
        </label>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</button>
        <button onClick={onCancel} disabled={saving}>Batal</button>
      </div>
    </div>
  );
}