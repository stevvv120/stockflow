import { useState } from "react";
import ProductList from "./pages/ProductList";
import Login from "./pages/Login";
import type { User } from "./services/api";
import StockPage from "./pages/StockPage";  


function loadUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(loadUser());
  const [page, setPage] = useState<"products" | "stock">("products");

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
          <button onClick={() => setPage("products")}>Produk</button>{" "}
          <button onClick={() => setPage("stock")}>Stok</button>
        </span>
        <span>
          {user.name} ({user.role}) <button onClick={logout}>Keluar</button>
        </span>
      </div>
      {page === "products" ? <ProductList user={user} /> : <StockPage user={user} />}
    </div>
  );
}