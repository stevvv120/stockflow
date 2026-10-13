import { useEffect, useState } from "react";
import { getCategories, createCategory, updateCategory, deleteCategory } from "../services/api";
import type { Category } from "../../types";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getCategories().then(setCategories).catch((e) => setError(e.message));
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const add = async () => {
    setError("");
    if (!newName.trim()) return setError("Nama kategori wajib diisi");
    try {
      await createCategory(newName.trim());
      setNewName("");
      reload();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveEdit = async (id: number) => {
    setError("");
    if (!editName.trim()) return setError("Nama kategori wajib diisi");
    try {
      await updateCategory(id, editName.trim());
      setEditingId(null);
      reload();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (c: Category) => {
    if (!window.confirm(`Hapus kategori "${c.name}"?`)) return;
    setError("");
    try {
      await deleteCategory(c.id);
      reload();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div style={{ padding: 24, textAlign: "left" }}>
      <h1>Kategori</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Nama kategori baru"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add}>+ Tambah</button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", maxWidth: 500 }}>
        <thead><tr><th>Nama</th><th>Aksi</th></tr></thead>
        <tbody>
          {categories.length === 0 && <tr><td colSpan={2}>Belum ada kategori</td></tr>}
          {categories.map((c) => (
            <tr key={c.id}>
              <td>
                {editingId === c.id ? (
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : (
                  c.name
                )}
              </td>
              <td>
                {editingId === c.id ? (
                  <>
                    <button onClick={() => saveEdit(c.id)}>Simpan</button>{" "}
                    <button onClick={() => setEditingId(null)}>Batal</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditingId(c.id); setEditName(c.name); }}>Edit</button>{" "}
                    <button onClick={() => remove(c)}>Hapus</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}