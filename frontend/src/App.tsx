import { useState } from "react";
import ProductList from "./pages/ProductList";
import Login from "./pages/Login";
import type { User } from "./services/api";

function loadUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(loadUser());

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 24px", borderBottom: "1px solid #ccc" }}>
        <strong>StockFlow</strong>
        <span>
          {user.name} ({user.role}){" "}
          <button onClick={logout}>Keluar</button>
        </span>
      </div>
      <ProductList user={user} />
    </div>
  );
}