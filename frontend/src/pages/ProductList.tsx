import { useEffect, useState } from "react";
import {
  getProducts, getCategories,
  createProduct, updateProduct, deleteProduct,
} from "../services/api";
import type { ProductInput } from "../services/api";
import type { Product, Category } from "../../types";
import ProductForm from "../components/ProductForm";

export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    getProducts(search, categoryId)
      .then(setProducts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, categoryId, reloadKey]);

  const rupiah = (v: string | number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));

  const openAdd = () => { setEditing(null); setShowForm(true); };
  const openEdit = (p: Product) => { setEditing(p); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSubmit = async (data: ProductInput) => {
    if (editing) await updateProduct(editing.id, data);
    else await createProduct(data);
    closeForm();
    setReloadKey((k) => k + 1);
  };

  const handleDelete = async (p: Product) => {
    if (!window.confirm(`Hapus produk "${p.name}"?`)) return;
    try {
      await deleteProduct(p.id);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div style={{ padding: 24, textAlign: "left" }}>
      <h1>Daftar Produk</h1>

      {showForm && (
        <ProductForm
          key={editing?.id ?? "new"}
          categories={categories}
          product={editing}
          onSubmit={handleSubmit}
          onCancel={closeForm}
        />
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Cari nama atau SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button onClick={openAdd}>+ Tambah Produk</button>
      </div>

      {loading && <p>Memuat...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && (
        <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th>SKU</th><th>Nama</th><th>Kategori</th>
              <th>Harga Jual</th><th>Stok</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr><td colSpan={6}>Belum ada produk</td></tr>
            )}
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.sku}</td>
                <td>{p.name}</td>
                <td>{p.category_name ?? "-"}</td>
                <td>{rupiah(p.selling_price)}</td>
                <td style={{ color: p.stock <= p.minimum_stock ? "red" : "inherit" }}>
                  {p.stock}
                </td>
                <td>
                  <button onClick={() => openEdit(p)}>Edit</button>{" "}
                  <button onClick={() => handleDelete(p)}>Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}