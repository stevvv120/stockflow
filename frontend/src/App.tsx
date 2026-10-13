import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import ProductList from "./pages/ProductList";
import StockPage from "./pages/StockPage";
import SalesPage from "./pages/SalesPage";
import SalesHistory from "./pages/SalesHistory";
import ReportsPage from "./pages/ReportsPage";
import Login from "./pages/Login";
import type { User } from "./services/api";

type Page = "dashboard" | "sales" | "history" | "products" | "stock" | "reports";

function loadUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(loadUser());
  const [page, setPage] = useState<Page>("dashboard");

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setPage("dashboard");
  };

  if (!user) return <Login onLogin={setUser} />;

  const isAdmin = user.role === "admin";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 24px", borderBottom: "1px solid #ccc", flexWrap: "wrap", gap: 8 }}>
        <span>
          <strong>StockFlow</strong>{" "}
          <button onClick={() => setPage("dashboard")}>Dashboard</button>{" "}
          <button onClick={() => setPage("sales")}>Kasir</button>{" "}
          <button onClick={() => setPage("history")}>Riwayat</button>{" "}
          <button onClick={() => setPage("products")}>Produk</button>{" "}
          <button onClick={() => setPage("stock")}>Stok</button>{" "}
          {isAdmin && <button onClick={() => setPage("reports")}>Laporan</button>}
        </span>
        <span>
          {user.name} ({user.role}) <button onClick={logout}>Keluar</button>
        </span>
      </div>
      {page === "dashboard" && <Dashboard />}
      {page === "sales" && <SalesPage />}
      {page === "history" && <SalesHistory />}
      {page === "products" && <ProductList user={user} />}
      {page === "stock" && <StockPage user={user} />}
      {page === "reports" && isAdmin && <ReportsPage />}
    </div>
  );
}