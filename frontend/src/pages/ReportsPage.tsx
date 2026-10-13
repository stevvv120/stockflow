import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { getSalesReport, downloadSalesCsv } from "../services/api";
import type { SalesReport } from "../services/api";

const rupiah = (v: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function ReportsPage() {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 29);

  const [from, setFrom] = useState(fmt(monthAgo));
  const [to, setTo] = useState(fmt(today));
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (from > to) return setError("Tanggal awal tidak boleh setelah tanggal akhir");
    setError("");
    setLoading(true);
    getSalesReport(from, to)
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // muat sekali saat halaman dibuka

  const exportCsv = async () => {
    try {
      await downloadSalesCsv(from, to);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const card = { border: "1px solid #999", padding: 16, minWidth: 180 };

  return (
    <div style={{ padding: 24, textAlign: "left" }}>
      <h1>Laporan Penjualan</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label>Dari <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Sampai <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button onClick={load} disabled={loading}>{loading ? "Memuat..." : "Tampilkan"}</button>
        <button onClick={exportCsv}>Ekspor CSV</button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {report && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            <div style={card}><div>Pendapatan</div><h2>{rupiah(report.revenue)}</h2></div>
            <div style={card}><div>Laba kotor</div><h2>{rupiah(report.profit)}</h2></div>
            <div style={card}><div>Transaksi</div><h2>{report.transactions}</h2></div>
            <div style={card}><div>Barang terjual</div><h2>{report.items_sold}</h2></div>
          </div>

          <h2>Tren penjualan harian</h2>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={report.daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} />
                <YAxis tickFormatter={(v) => `${v / 1000}rb`} />
                <Tooltip formatter={(v) => rupiah(Number(v))} />
                <Line type="monotone" dataKey="total" name="Penjualan" stroke="#4f7cff" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h2>Produk terlaris</h2>
          <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", maxWidth: 700 }}>
            <thead><tr><th>#</th><th>SKU</th><th>Produk</th><th>Terjual</th><th>Pendapatan</th></tr></thead>
            <tbody>
              {report.top_products.length === 0 && <tr><td colSpan={5}>Belum ada penjualan pada periode ini</td></tr>}
              {report.top_products.map((p, i) => (
                <tr key={p.sku}>
                  <td>{i + 1}</td><td>{p.sku}</td><td>{p.name}</td>
                  <td>{p.quantity}</td><td>{rupiah(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}