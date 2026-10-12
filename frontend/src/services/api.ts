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

export interface ProductInput {
  category_id: number | null;
  sku: string;
  name: string;
  cost_price: number;
  selling_price: number;
  stock?: number;
  minimum_stock: number;
}

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Terjadi kesalahan");
  return data;
}

export async function createProduct(input: ProductInput) {
  const res = await fetch(`${BASE_URL}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function updateProduct(id: number, input: ProductInput) {
  const res = await fetch(`${BASE_URL}/products/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function deleteProduct(id: number) {
  const res = await fetch(`${BASE_URL}/products/${id}`, { method: "DELETE" });
  return handle(res);
}