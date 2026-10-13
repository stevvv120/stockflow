import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { getDashboard } from "../services/api";
import type { DashboardData } from "../services/api";

const rupiah = (v: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));

const card = { border: "1px solid #999", padding: 16, minWidth: 180 };

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getDashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: "red", padding: 24 }}>{error}</p>;
  if (!data) return <p style={{ padding: 24 }}>Memuat...</p>;

  return (
    <div style={{ padding: 24, textAlign: "left" }}>
      <h1>Dashboard</h1>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div style={card}><div>Total produk</div><h2>{data.total_products}</h2></div>
        <div style={card}>
          <div>Stok menipis</div>
          <h2 style={{ color: data.low_stock_count > 0 ? "red" : "inherit" }}>{data.low_stock_count}</h2>
        </div>
        <div style={card}><div>Penjualan hari ini</div><h2>{rupiah(data.today_revenue)}</h2></div>
        <div style={card}><div>Transaksi hari ini</div><h2>{data.today_transactions}</h2></div>
      </div>

      <h2>Penjualan 7 hari terakhir</h2>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data.daily_sales}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} />
            <YAxis tickFormatter={(v) => `${v / 1000}rb`} />
            <Tooltip formatter={(v) => rupiah(Number(v))} />
            <Bar dataKey="total" name="Penjualan" fill="#4f7cff" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h2>Stok menipis</h2>
      <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", maxWidth: 600 }}>
        <thead><tr><th>SKU</th><th>Nama</th><th>Stok</th><th>Minimum</th></tr></thead>
        <tbody>
          {data.low_stock.length === 0 && <tr><td colSpan={4}>Semua stok aman</td></tr>}
          {data.low_stock.map((p) => (
            <tr key={p.sku}>
              <td>{p.sku}</td><td>{p.name}</td>
              <td style={{ color: "red" }}>{p.stock}</td><td>{p.minimum_stock}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}