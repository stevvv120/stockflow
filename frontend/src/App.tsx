import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import ProductList from "./pages/ProductList";
import StockPage from "./pages/StockPage";
import SalesPage from "./pages/SalesPage";
import SalesHistory from "./pages/SalesHistory";
import ReportsPage from "./pages/ReportsPage";
import CategoriesPage from "./pages/CategoriesPage";
import OperationsPage from "./pages/OperationsPage";
import Login from "./pages/Login";
import type { User } from "./services/api";
import { version } from "../package.json";
import "./App.css";

type Page = "dashboard" | "sales" | "history" | "products" | "stock" | "reports" | "categories" | "operations";

const navItems: { page: Page; label: string; icon: string; adminOnly?: boolean }[] = [
  { page: "dashboard", label: "Dashboard", icon: "dashboard" },
  { page: "sales", label: "Kasir", icon: "sales" },
  { page: "history", label: "Riwayat penjualan", icon: "history" },
  { page: "products", label: "Produk", icon: "products" },
  { page: "categories", label: "Kategori", icon: "categories", adminOnly: true },
  { page: "stock", label: "Manajemen stok", icon: "stock" },
  { page: "operations", label: "Operasional", icon: "stock" },
  { page: "reports", label: "Laporan", icon: "reports", adminOnly: true },
];

const pageDetails: Record<Page, { title: string; description: string }> = {
  dashboard: { title: "Dashboard", description: "Ringkasan bisnis dan aktivitas hari ini" },
  sales: { title: "Kasir", description: "Buat transaksi penjualan" },
  history: { title: "Riwayat penjualan", description: "Lihat transaksi yang sudah tercatat" },
  products: { title: "Produk", description: "Kelola katalog dan informasi produk" },
  stock: { title: "Manajemen stok", description: "Pantau dan perbarui pergerakan stok" },
  reports: { title: "Laporan", description: "Analisis performa penjualan" },
  categories: { title: "Kategori", description: "Kelola kategori produk" },
  operations: { title: "Operasional", description: "Gudang, procurement, pesanan, dan pengiriman" },
};

const iconPaths: Record<string, string[]> = {
  dashboard: ["M3 3h8v8H3z", "M13 3h8v5h-8z", "M13 10h8v11h-8z", "M3 13h8v8H3z"],
  sales: ["M5 3h14v18l-2-1.5L15 21l-3-1.5L9 21l-2-1.5L5 21z", "M8 8h8", "M8 12h8", "M8 16h4"],
  history: ["M3 12a9 9 0 1 0 2.6-6.4L3 8", "M3 3v5h5", "M12 7v5l3 2"],
  products: ["m12 3 9 5-9 5-9-5 9-5z", "m3 8 9 5 9-5", "M3 8v9l9 5 9-5V8", "M12 13v9"],
  categories: ["M3 6h7l2 2h9v11H3z", "M3 6V4h7l2 2"],
  stock: ["M3 7h18l-2 13H5L3 7z", "M8 7a4 4 0 0 1 8 0", "M12 11v5", "m10 14 2 2 2-2"],
  reports: ["M3 3v18h18", "m7 14 4-4 4 4 6-7"],
  logout: ["M10 17l5-5-5-5", "M15 12H3", "M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"],
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

function loadUser(): User | null {
  if (!localStorage.getItem("token")) {
    localStorage.removeItem("user");
    return null;
  }
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    localStorage.removeItem("user");
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(loadUser());
  const [page, setPage] = useState<Page>("dashboard");

  useEffect(() => {
    const handleAuthExpired = () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setUser(null);
      setPage("dashboard");
    };
    window.addEventListener("stockflow:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("stockflow:auth-expired", handleAuthExpired);
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setPage("dashboard");
  };

  if (!user) return <Login onLogin={setUser} />;

  const isAdmin = user.role === "admin";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="stock" size={20} /></span>
          <span className="brand-copy"><strong>StockFlow</strong><span>Inventory &amp; Supply Chain</span></span>
        </div>
        <div className="nav-label">Menu utama</div>
        <nav className="main-nav" aria-label="Navigasi utama">
          {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <button
              className="nav-link"
              key={item.page}
              aria-current={page === item.page ? "page" : undefined}
              onClick={() => setPage(item.page)}
            >
              <span className="nav-icon"><Icon name={item.icon} /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>Kelola bisnis Anda dengan lebih mudah</span>
          <span className="sidebar-version">StockFlow v{version}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-heading">
            <h1>{pageDetails[page].title}</h1>
            <p>{pageDetails[page].description}</p>
          </div>
          <div className="user-menu">
            <span className="user-avatar" aria-hidden="true">
              {user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
            </span>
            <span className="user-copy"><strong>{user.name}</strong><span>{user.role}</span></span>
            <button className="logout-button" onClick={logout}>
              <Icon name="logout" size={15} />
              <span>Keluar</span>
            </button>
          </div>
        </header>
        <main className="page-content">
          {page === "dashboard" && <Dashboard onNavigate={setPage} />}
          {page === "sales" && <SalesPage />}
          {page === "history" && <SalesHistory />}
          {page === "products" && <ProductList user={user} />}
          {page === "categories" && isAdmin && <CategoriesPage />}
          {page === "stock" && <StockPage user={user} />}
          {page === "operations" && <OperationsPage user={user} />}
          {page === "reports" && isAdmin && <ReportsPage />}
        </main>
      </div>
    </div>
  );
}