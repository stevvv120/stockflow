import { useEffect, useMemo, useState } from "react";
import {
  getProducts, getCategories,
  createProduct, updateProduct, deleteProduct,
} from "../services/api";
import type { ProductInput, User } from "../services/api";
import type { Product, Category } from "../../types";
import ProductForm from "../components/ProductForm";

type StockFilter = "all" | "low" | "out" | "available";
type ProductSort = "name" | "sku" | "price-asc" | "price-desc" | "stock-asc" | "stock-desc";

const rupiah = (v: string | number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));

export default function ProductList({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sort, setSort] = useState<ProductSort>("name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const isAdmin = user.role === "admin";

  useEffect(() => {
    getCategories().then(setCategories).catch((e: Error) => setCategoryError(e.message));
  }, []);

  useEffect(() => {
    let active = true;
    getProducts(search, categoryId)
      .then((result) => { if (active) setProducts(result); })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, categoryId, reloadKey]);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      if (stockFilter === "low") return product.stock > 0 && product.stock <= product.minimum_stock;
      if (stockFilter === "out") return product.stock === 0;
      if (stockFilter === "available") return product.stock > product.minimum_stock;
      return true;
    });
    return filtered.sort((a, b) => {
      switch (sort) {
        case "sku": return a.sku.localeCompare(b.sku, "id");
        case "price-asc": return Number(a.selling_price) - Number(b.selling_price);
        case "price-desc": return Number(b.selling_price) - Number(a.selling_price);
        case "stock-asc": return a.stock - b.stock;
        case "stock-desc": return b.stock - a.stock;
        default: return a.name.localeCompare(b.name, "id");
      }
    });
  }, [products, stockFilter, sort]);

  const openAdd = () => { setActionError(""); setEditing(null); setShowForm(true); };
  const openEdit = (product: Product) => { setActionError(""); setEditing(product); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };
  const reload = () => { setLoading(true); setReloadKey((key) => key + 1); };

  const handleSubmit = async (data: ProductInput) => {
    if (editing) await updateProduct(editing.id, data);
    else await createProduct(data);
    setSuccess(editing ? "Produk berhasil diperbarui." : "Produk berhasil ditambahkan.");
    closeForm();
    reload();
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`Hapus produk "${product.name}"?`)) return;
    setActionError("");
    setSuccess("");
    try {
      await deleteProduct(product.id);
      setSuccess("Produk berhasil dihapus.");
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Gagal menghapus produk");
    }
  };

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Daftar produk</h2>
          <p>Kelola katalog, harga, dan ketersediaan stok.</p>
        </div>
        {isAdmin && <button className="button button-primary" onClick={openAdd}>+ Tambah produk</button>}
      </div>

      {showForm && (
        <ProductForm
          key={editing?.id ?? "new"}
          categories={categories}
          product={editing}
          onSubmit={handleSubmit}
          onCancel={closeForm}
        />
      )}
      {categoryError && <div className="alert alert-warning" role="alert">Filter kategori tidak tersedia: {categoryError}</div>}
      {actionError && <div className="alert alert-error" role="alert">{actionError}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      <div className="toolbar">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Cari nama atau SKU"
            placeholder="Cari nama atau SKU..."
            value={search}
            onChange={(event) => { setError(""); setLoading(true); setSearch(event.target.value); }}
          />
        </label>
        <select aria-label="Filter kategori" value={categoryId} onChange={(event) => { setError(""); setLoading(true); setCategoryId(event.target.value); }}>
          <option value="">Semua kategori</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <select aria-label="Filter kondisi stok" value={stockFilter} onChange={(event) => setStockFilter(event.target.value as StockFilter)}>
          <option value="all">Semua kondisi stok</option>
          <option value="low">Stok menipis</option>
          <option value="out">Stok habis</option>
          <option value="available">Stok aman</option>
        </select>
        <select aria-label="Urutkan produk" value={sort} onChange={(event) => setSort(event.target.value as ProductSort)}>
          <option value="name">Nama A–Z</option>
          <option value="sku">SKU A–Z</option>
          <option value="price-asc">Harga terendah</option>
          <option value="price-desc">Harga tertinggi</option>
          <option value="stock-asc">Stok terendah</option>
          <option value="stock-desc">Stok tertinggi</option>
        </select>
      </div>

      <div className="table-card">
        <div className="table-summary">
          {loading ? "Memuat produk..." : `${visibleProducts.length} produk ditampilkan`}
        </div>
        {error ? <div className="alert alert-error table-message" role="alert">{error}</div> : loading ? (
          <div className="table-message">Memuat daftar produk...</div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>SKU</th><th>Nama produk</th><th>Kategori</th><th>Harga jual</th><th>Stok</th>{isAdmin && <th>Aksi</th>}</tr>
              </thead>
              <tbody>
                {visibleProducts.length === 0 && <tr><td className="table-empty" colSpan={isAdmin ? 6 : 5}>Produk tidak ditemukan. Coba ubah pencarian atau filter.</td></tr>}
                {visibleProducts.map((product) => {
                  const low = product.stock <= product.minimum_stock;
                  return (
                    <tr key={product.id}>
                      <td className="cell-muted">{product.sku}</td>
                      <td className="cell-strong">{product.name}</td>
                      <td>{product.category_name ?? "Tanpa kategori"}</td>
                      <td>{rupiah(product.selling_price)}</td>
                      <td><span className={`status-badge ${product.stock === 0 ? "status-danger" : low ? "status-warning" : "status-success"}`}>
                        {product.stock === 0 ? "Habis" : low ? `Menipis · ${product.stock}` : `Aman · ${product.stock}`}
                      </span></td>
                      {isAdmin && <td>
                        <div className="row-actions">
                          <button className="button button-subtle" onClick={() => openEdit(product)}>Edit</button>
                          <button className="button button-danger-subtle" onClick={() => handleDelete(product)}>Hapus</button>
                        </div>
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
