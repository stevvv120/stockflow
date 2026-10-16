import { useState, type FormEvent } from "react";
import type { Category, Product } from "../../types";
import type { ProductInput } from "../services/api";

interface Props {
  categories: Category[];
  product: Product | null;
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const cost = Number(costPrice);
    const selling = Number(sellingPrice);
    const initialStock = Number(stock);
    const minimum = Number(minimumStock);
    if (!sku.trim() || !name.trim()) return setError("SKU dan nama wajib diisi");
    if (!Number.isFinite(selling) || selling < 0 || sellingPrice === "") return setError("Harga jual tidak valid");
    if (!Number.isFinite(cost) || cost < 0) return setError("Harga modal tidak valid");
    if (!Number.isInteger(minimum) || minimum < 0) return setError("Stok minimum harus bilangan bulat positif atau nol");
    if (!product && (!Number.isInteger(initialStock) || initialStock < 0)) return setError("Stok awal harus bilangan bulat positif atau nol");

    setSaving(true);
    try {
      await onSubmit({
        category_id: categoryId ? Number(categoryId) : null,
        sku: sku.trim(),
        name: name.trim(),
        cost_price: cost,
        selling_price: selling,
        stock: product ? undefined : initialStock,
        minimum_stock: minimum,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan produk");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-card product-form" onSubmit={handleSubmit}>
      <div className="section-heading form-heading">
        <div>
          <h3>{product ? "Edit produk" : "Tambah produk baru"}</h3>
          <p>Lengkapi informasi katalog di bawah ini.</p>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Tutup form">×</button>
      </div>
      <div className="form-grid">
        <label className="form-field">SKU
          <input value={sku} onChange={(event) => setSku(event.target.value)} required autoComplete="off" />
        </label>
        <label className="form-field">Nama produk
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="form-field">Kategori
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Tanpa kategori</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="form-field">Harga modal (Rp)
          <input type="number" min="0" step="any" value={costPrice} onChange={(event) => setCostPrice(event.target.value)} required />
        </label>
        <label className="form-field">Harga jual (Rp)
          <input type="number" min="0" step="any" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} required />
        </label>
        {!product && <label className="form-field">Stok awal
          <input type="number" min="0" step="1" value={stock} onChange={(event) => setStock(event.target.value)} required />
        </label>}
        <label className="form-field">Batas stok minimum
          <input type="number" min="0" step="1" value={minimumStock} onChange={(event) => setMinimumStock(event.target.value)} required />
        </label>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan produk"}</button>
        <button className="button button-secondary" type="button" onClick={onCancel} disabled={saving}>Batal</button>
      </div>
    </form>
  );
}
