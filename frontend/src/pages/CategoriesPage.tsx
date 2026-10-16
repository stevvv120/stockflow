import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getCategories, createCategory, updateCategory, deleteCategory } from "../services/api";
import type { Category } from "../../types";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getCategories()
      .then((result) => { if (active) { setCategories(result); setError(""); } })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const visibleCategories = useMemo(
    () => categories.filter((category) => category.name.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id"))),
    [categories, search],
  );

  const reload = () => { setLoading(true); setReloadKey((key) => key + 1); };

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!newName.trim()) return setError("Nama kategori wajib diisi");
    setSaving(true);
    try {
      await createCategory(newName.trim());
      setNewName("");
      setSuccess("Kategori berhasil ditambahkan.");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menambahkan kategori");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (id: number) => {
    setError("");
    setSuccess("");
    if (!editName.trim()) return setError("Nama kategori wajib diisi");
    setBusyId(id);
    try {
      await updateCategory(id, editName.trim());
      setEditingId(null);
      setSuccess("Kategori berhasil diperbarui.");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memperbarui kategori");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (category: Category) => {
    if (!window.confirm(`Hapus kategori "${category.name}"?`)) return;
    setError("");
    setSuccess("");
    setBusyId(category.id);
    try {
      await deleteCategory(category.id);
      setSuccess("Kategori berhasil dihapus.");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus kategori");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="page-section">
      <div className="section-heading">
        <div><h2>Kategori produk</h2><p>Kelompokkan produk agar lebih mudah dikelola dan dicari.</p></div>
      </div>

      <form className="inline-create-form" onSubmit={add}>
        <label className="form-field">Nama kategori baru
          <input
            placeholder="Contoh: Minuman"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
          />
        </label>
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Menyimpan..." : "+ Tambah kategori"}</button>
      </form>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      <div className="toolbar category-toolbar">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Cari kategori" placeholder="Cari kategori..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>
      <div className="table-card">
        <div className="table-summary">{loading ? "Memuat kategori..." : `${visibleCategories.length} kategori`}</div>
        {loading ? <div className="table-message">Memuat kategori...</div> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Nama kategori</th><th>Aksi</th></tr></thead>
              <tbody>
                {visibleCategories.length === 0 && <tr><td className="table-empty" colSpan={2}>Kategori tidak ditemukan.</td></tr>}
                {visibleCategories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      {editingId === category.id ? (
                        <input aria-label={`Nama kategori ${category.name}`} value={editName} onChange={(event) => setEditName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveEdit(category.id)} />
                      ) : <span className="cell-strong">{category.name}</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        {editingId === category.id ? (
                          <>
                            <button className="button button-primary" onClick={() => saveEdit(category.id)} disabled={busyId === category.id}>Simpan</button>
                            <button className="button button-secondary" onClick={() => setEditingId(null)} disabled={busyId === category.id}>Batal</button>
                          </>
                        ) : (
                          <>
                            <button className="button button-subtle" onClick={() => { setEditingId(category.id); setEditName(category.name); setError(""); }}>Edit</button>
                            <button className="button button-danger-subtle" onClick={() => remove(category)} disabled={busyId === category.id}>{busyId === category.id ? "..." : "Hapus"}</button>
                          </>
                        )}
                      </div>
                    </td>
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
