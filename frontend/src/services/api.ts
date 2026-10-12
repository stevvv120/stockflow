import type { Product, Category } from "../../types";

const BASE_URL = "http://localhost:5000/api";

export async function getProducts(search = "", categoryId = ""): Promise<Product[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (categoryId) params.set("category_id", categoryId);

  const res = await fetch(`${BASE_URL}/products?${params}`);
  if (!res.ok) throw new Error("Gagal memuat produk");
  return res.json();
}

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE_URL}/categories`);
  if (!res.ok) throw new Error("Gagal memuat kategori");
  return res.json();
}