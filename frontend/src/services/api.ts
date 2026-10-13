import type { Product, Category } from "../../types";

export function getToken() {
  return localStorage.getItem("token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "staff";
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Login gagal");
  return data;
}

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

export async function getProducts(search = "", categoryId = ""): Promise<Product[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (categoryId) params.set("category_id", categoryId);

  const res = await fetch(`${BASE_URL}/products?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Gagal memuat produk");
  return res.json();
}

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE_URL}/categories`, { headers: authHeaders() });
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

export interface StockMovement {
  id: number;
  movement_type: "initial" | "in" | "out" | "adjustment";
  quantity: number;
  note: string | null;
  created_at: string;
  sku: string;
  product_name: string;
  user_name: string | null;
}

export interface Sale {
  id: number;
  invoice_number: string;
  total_amount: string;
  created_at: string;
  user_name: string;
}

export interface SaleDetail extends Sale {
  items: { sku: string; product_name: string; quantity: number; unit_price: string; subtotal: string }[];
}

export interface DashboardData {
  total_products: number;
  low_stock_count: number;
  today_revenue: number;
  today_transactions: number;
  low_stock: { sku: string; name: string; stock: number; minimum_stock: number }[];
  daily_sales: { date: string; total: number }[];
}

export interface SalesReport {
  from: string;
  to: string;
  revenue: number;
  transactions: number;
  profit: number;
  items_sold: number;
  daily: { date: string; total: number }[];
  top_products: { sku: string; name: string; quantity: number; revenue: number }[];
}

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Terjadi kesalahan");
  return data;
}

export async function createProduct(input: ProductInput) {
  const res = await fetch(`${BASE_URL}/products`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function updateProduct(id: number, input: ProductInput) {
  const res = await fetch(`${BASE_URL}/products/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function deleteProduct(id: number) {
  const res = await fetch(`${BASE_URL}/products/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function getMovements(productId = ""): Promise<StockMovement[]> {
  const params = new URLSearchParams();
  if (productId) params.set("product_id", productId);
  const res = await fetch(`${BASE_URL}/stock/movements?${params}`, { headers: authHeaders() });
  return handle(res);
}

export async function addStock(input: {
  product_id: number;
  movement_type: "in" | "adjustment";
  quantity: number;
  note: string;
}) {
  const res = await fetch(`${BASE_URL}/stock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function createSale(items: { product_id: number; quantity: number }[]) {
  const res = await fetch(`${BASE_URL}/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ items }),
  });
  return handle(res) as Promise<{ id: number; invoice_number: string; total_amount: number }>;
}

export async function getSales(): Promise<Sale[]> {
  const res = await fetch(`${BASE_URL}/sales`, { headers: authHeaders() });
  return handle(res);
}

export async function getSale(id: number): Promise<SaleDetail> {
  const res = await fetch(`${BASE_URL}/sales/${id}`, { headers: authHeaders() });
  return handle(res);
}

export async function getDashboard(): Promise<DashboardData> {
  const res = await fetch(`${BASE_URL}/reports/dashboard`, { headers: authHeaders() });
  return handle(res);
}

export async function getSalesReport(from: string, to: string): Promise<SalesReport> {
  const res = await fetch(`${BASE_URL}/reports/sales?from=${from}&to=${to}`, { headers: authHeaders() });
  return handle(res);
}

export async function downloadSalesCsv(from: string, to: string) {
  const res = await fetch(`${BASE_URL}/reports/sales/export?from=${from}&to=${to}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Gagal mengunduh CSV");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `penjualan_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function createCategory(name: string) {
  const res = await fetch(`${BASE_URL}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  return handle(res);
}

export async function updateCategory(id: number, name: string) {
  const res = await fetch(`${BASE_URL}/categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  return handle(res);
}

export async function deleteCategory(id: number) {
  const res = await fetch(`${BASE_URL}/categories/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}