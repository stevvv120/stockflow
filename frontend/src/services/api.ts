import type { Product, Category } from "../../types";

export function getToken() {
  return localStorage.getItem("token");
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("stockflow:auth-expired"));
  }
  return res;
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

const BASE_URL = import.meta.env.VITE_API_URL?.trim() || "http://localhost:5000/api";

export async function getProducts(search = "", categoryId = ""): Promise<Product[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (categoryId) params.set("category_id", categoryId);

  const res = await apiFetch(`${BASE_URL}/products?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Gagal memuat produk");
  return res.json();
}

export async function getCategories(): Promise<Category[]> {
  const res = await apiFetch(`${BASE_URL}/categories`, { headers: authHeaders() });
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
  movement_type: "initial" | "in" | "out" | "adjustment" | "transfer";
  quantity: number;
  note: string | null;
  created_at: string;
  sku: string;
  product_name: string;
  user_name: string | null;
  warehouse_name: string;
}

export interface Sale {
  id: number;
  invoice_number: string;
  total_amount: string;
  created_at: string;
  user_name: string;
  warehouse_name: string;
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

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  address: string | null;
  is_default: number;
  is_active: number;
}

export interface Supplier {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: number;
}

export interface PurchaseOrder {
  id: number;
  order_number: string;
  status: string;
  notes: string | null;
  supplier_name: string;
  warehouse_name: string;
  created_by_name: string;
  created_by: number;
  line_count: number;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  items: {
    item_id: number;
    product_id: number;
    sku: string;
    product_name: string;
    quantity: number;
    received_quantity: number;
    unit_cost: string;
  }[];
}

export interface CustomerOrder {
  id: number;
  order_number: string;
  status: string;
  notes: string | null;
  warehouse_name: string;
  created_by_name: string;
  created_by: number;
  shipment_id: number | null;
  shipment_status: string | null;
  tracking_number: string | null;
  invoice_number: string | null;
}

export interface AuditLog {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: string | Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
}

export interface ShipmentEvent {
  id: number;
  status: string;
  note: string | null;
  created_at: string;
  user_name: string;
}

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Terjadi kesalahan");
  return data;
}

async function workflowFetch(path: string, init?: RequestInit) {
  const res = await apiFetch(`${BASE_URL}/workflows${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });
  return handle(res);
}

export async function getWarehouses(): Promise<Warehouse[]> {
  return workflowFetch("/warehouses");
}

export async function createWarehouse(input: { code: string; name: string; address?: string }) {
  return workflowFetch("/warehouses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getStockLevels(warehouseId?: number) {
  return workflowFetch(`/stock/levels${warehouseId ? `?warehouse_id=${warehouseId}` : ""}`);
}

export async function transferStock(input: {
  from_warehouse_id: number;
  to_warehouse_id: number;
  product_id: number;
  quantity: number;
  note?: string;
}) {
  return workflowFetch("/stock/transfers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getSuppliers(): Promise<Supplier[]> {
  return workflowFetch("/suppliers");
}

export async function createSupplier(input: { name: string; email?: string; phone?: string; address?: string }) {
  return workflowFetch("/suppliers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  return workflowFetch("/purchase-orders");
}

export async function getPurchaseOrder(id: number): Promise<PurchaseOrderDetail> {
  return workflowFetch(`/purchase-orders/${id}`);
}

export async function createPurchaseOrder(input: {
  supplier_id: number;
  warehouse_id?: number;
  notes?: string;
  items: { product_id: number; quantity: number }[];
}) {
  return workflowFetch("/purchase-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function submitPurchaseOrder(id: number) {
  return workflowFetch(`/purchase-orders/${id}/submit`, { method: "POST" });
}

export async function cancelPurchaseOrder(id: number) {
  return workflowFetch(`/purchase-orders/${id}/cancel`, { method: "POST" });
}

export async function reviewPurchaseOrder(id: number, action: "approve" | "reject") {
  return workflowFetch(`/purchase-orders/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export async function receivePurchaseOrder(id: number, items: { item_id: number; quantity: number }[]) {
  return workflowFetch(`/purchase-orders/${id}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

export async function getCustomerOrders(): Promise<CustomerOrder[]> {
  return workflowFetch("/orders");
}

export async function createCustomerOrder(input: {
  warehouse_id?: number;
  notes?: string;
  items: { product_id: number; quantity: number }[];
}) {
  return workflowFetch("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function reviewCustomerOrder(id: number, action: "approve" | "reject") {
  return workflowFetch(`/orders/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export async function cancelCustomerOrder(id: number) {
  return workflowFetch(`/orders/${id}/cancel`, { method: "POST" });
}

export async function updateShipmentStatus(
  id: number,
  status: "shipped" | "in_transit" | "delivered" | "cancelled",
  tracking_number?: string,
  note?: string,
) {
  return workflowFetch(`/shipments/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, tracking_number, note }),
  });
}

export async function getShipmentEvents(id: number): Promise<ShipmentEvent[]> {
  return workflowFetch(`/shipments/${id}/events`);
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  return workflowFetch("/audit-logs");
}

export async function createProduct(input: ProductInput) {
  const res = await apiFetch(`${BASE_URL}/products`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function updateProduct(id: number, input: ProductInput) {
  const res = await apiFetch(`${BASE_URL}/products/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function deleteProduct(id: number) {
  const res = await apiFetch(`${BASE_URL}/products/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function getMovements(productId = "", warehouseId = ""): Promise<StockMovement[]> {
  const params = new URLSearchParams();
  if (productId) params.set("product_id", productId);
  if (warehouseId) params.set("warehouse_id", warehouseId);
  const res = await apiFetch(`${BASE_URL}/stock/movements?${params}`, { headers: authHeaders() });
  return handle(res);
}

export async function addStock(input: {
  product_id: number;
  warehouse_id?: number;
  movement_type: "in" | "adjustment";
  quantity: number;
  note: string;
}) {
  const res = await apiFetch(`${BASE_URL}/stock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function createSale(items: { product_id: number; quantity: number }[], warehouseId?: number) {
  const res = await apiFetch(`${BASE_URL}/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ items, warehouse_id: warehouseId }),
  });
  return handle(res) as Promise<{ id: number; invoice_number: string; total_amount: number }>;
}

export async function getSales(): Promise<Sale[]> {
  const res = await apiFetch(`${BASE_URL}/sales`, { headers: authHeaders() });
  return handle(res);
}

export async function getSale(id: number): Promise<SaleDetail> {
  const res = await apiFetch(`${BASE_URL}/sales/${id}`, { headers: authHeaders() });
  return handle(res);
}

export async function getDashboard(): Promise<DashboardData> {
  const res = await apiFetch(`${BASE_URL}/reports/dashboard`, { headers: authHeaders() });
  return handle(res);
}

export async function getSalesReport(from: string, to: string): Promise<SalesReport> {
  const res = await apiFetch(`${BASE_URL}/reports/sales?from=${from}&to=${to}`, { headers: authHeaders() });
  return handle(res);
}

export async function downloadSalesCsv(from: string, to: string) {
  const res = await apiFetch(`${BASE_URL}/reports/sales/export?from=${from}&to=${to}`, { headers: authHeaders() });
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
  const res = await apiFetch(`${BASE_URL}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  return handle(res);
}

export async function updateCategory(id: number, name: string) {
  const res = await apiFetch(`${BASE_URL}/categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  return handle(res);
}

export async function deleteCategory(id: number) {
  const res = await apiFetch(`${BASE_URL}/categories/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}