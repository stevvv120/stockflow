import { useState } from "react";
import ProductList from "./pages/ProductList";
import StockPage from "./pages/StockPage";  
import SalesPage from "./pages/SalesPage";
import SalesHistory from "./pages/SalesHistory";
import Login from "./pages/Login";
import type { User } from "./services/api";

type Page = "products" | "stock" | "sales" | "history";


function loadUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(loadUser());
  const [page, setPage] = useState<Page>("sales");

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 24px", borderBottom: "1px solid #ccc" }}>
        <span>
          <strong>StockFlow</strong>{" "}
          <button onClick={() => setPage("sales")}>Kasir</button>{" "}
          <button onClick={() => setPage("history")}>Riwayat</button>{" "}
          <button onClick={() => setPage("products")}>Produk</button>{" "}
          <button onClick={() => setPage("stock")}>Stok</button>
        </span>
        <span>
          {user.name} ({user.role}) <button onClick={logout}>Keluar</button>
        </span>
      </div>
      {page === "sales" && <SalesPage />}
      {page === "history" && <SalesHistory />}
      {page === "products" && <ProductList user={user} />}
      {page === "stock" && <StockPage user={user} />}
    </div>
  );
}