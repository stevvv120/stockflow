import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { getDashboard } from "../services/api";
import type { DashboardData } from "../services/api";

type DashboardPage = "dashboard" | "sales" | "history" | "products" | "stock" | "reports" | "categories";

const rupiah = (v: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));

const compactRupiah = (value: number) => {
  if (value >= 1_000_000) return `Rp${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (value >= 1_000) return `Rp${(value / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })}rb`;
  return `Rp${value}`;
};

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

export default function Dashboard({ onNavigate }: { onNavigate: (page: DashboardPage) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [currentDate] = useState(() => new Date());

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const reload = () => {
    setError("");
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(currentDate);

  if (loading && !data) {
    return <div className="dashboard-page"><div className="loading-state" role="status">Memuat ringkasan bisnis...</div></div>;
  }

  if (error && !data) {
    return (
      <div className="dashboard-page">
        <div className="error-state" role="alert">
          <p>{error}</p>
          <button className="dashboard-action dashboard-retry" onClick={reload}>
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const metrics = [
    { label: "Total produk", value: data.total_products.toLocaleString("id-ID"), note: "Produk terdaftar", icon: "▦", tone: "blue" },
    { label: "Stok menipis", value: data.low_stock_count.toLocaleString("id-ID"), note: data.low_stock_count ? "Perlu segera diperiksa" : "Semua stok aman", icon: "!", tone: "amber" },
    { label: "Penjualan hari ini", value: rupiah(data.today_revenue), note: "Total pendapatan hari ini", icon: "Rp", tone: "green" },
    { label: "Transaksi hari ini", value: data.today_transactions.toLocaleString("id-ID"), note: "Transaksi berhasil", icon: "#", tone: "violet" },
  ];

  return (
    <div className="dashboard-page">
      <section className="dashboard-intro">
        <div>
          <h2>Ringkasan bisnis</h2>
          <p>Pantau performa toko dan kondisi stok Anda.</p>
        </div>
        <div className="dashboard-meta">
          <time className="dashboard-date" dateTime={currentDate.toISOString().slice(0, 10)}>{todayLabel}</time>
          <button className="dashboard-action" onClick={reload} disabled={loading}>
            {loading ? "Memuat..." : "Perbarui"}
          </button>
        </div>
      </section>

      {error && <div className="error-state dashboard-error" role="alert">{error}</div>}

      <section className="dashboard-actions" aria-label="Aksi cepat">
        <button className="dashboard-action dashboard-action-primary" onClick={() => onNavigate("sales")}>
          Buat transaksi
        </button>
        <button className="dashboard-action" onClick={() => onNavigate("products")}>Kelola produk</button>
        <button className="dashboard-action" onClick={() => onNavigate("stock")}>Perbarui stok</button>
      </section>

      <section className="metrics-grid" aria-label="Ringkasan metrik">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <div className="metric-top">
              <span>{metric.label}</span>
              <span className={`metric-icon metric-icon-${metric.tone}`} aria-hidden="true">{metric.icon}</span>
            </div>
            <div className="metric-value">{metric.value}</div>
            <div className="metric-footnote">{metric.note}</div>
          </article>
        ))}
      </section>

      <section className="dashboard-panels">
        <article className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <h3>Tren penjualan</h3>
              <p>Pendapatan selama 7 hari terakhir</p>
            </div>
          </div>
          {data.daily_sales.length === 0 ? (
            <div className="empty-state">Belum ada data penjualan untuk ditampilkan.</div>
          ) : (
            <div className="chart-wrap" role="img" aria-label="Grafik penjualan tujuh hari terakhir">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily_sales} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#edf1f6" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    tick={{ fill: "#8490a2", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={10}
                  />
                  <YAxis
                    tickFormatter={compactRupiah}
                    tick={{ fill: "#8490a2", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                  />
                  <Tooltip
                    formatter={(value) => [rupiah(Number(value)), "Penjualan"]}
                    labelFormatter={(label) => shortDate(String(label))}
                    contentStyle={{ border: "1px solid #e6ebf1", borderRadius: 9, fontSize: 12 }}
                    cursor={{ fill: "#f3f6fb" }}
                  />
                  <Bar dataKey="total" fill="#4f7cff" radius={[5, 5, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <h3>Perlu restok</h3>
              <p>{data.low_stock_count} produk di bawah batas minimum</p>
            </div>
            <button className="panel-link" onClick={() => onNavigate("stock")}>Lihat stok</button>
          </div>
          {data.low_stock.length === 0 ? (
            <div className="empty-state">Stok semua produk dalam kondisi aman.</div>
          ) : (
            <div className="stock-table-wrap">
              <table className="stock-table">
                <thead>
                  <tr><th>Produk</th><th>Stok</th><th>Minimum</th></tr>
                </thead>
                <tbody>
                  {data.low_stock.slice(0, 6).map((product) => (
                    <tr key={product.sku}>
                      <td>
                        <div className="stock-product">{product.name}</div>
                        <div>{product.sku}</div>
                      </td>
                      <td><span className="stock-badge">{product.stock}</span></td>
                      <td>{product.minimum_stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.low_stock.length > 6 && (
                <button className="panel-link" onClick={() => onNavigate("products")}>
                  Lihat {data.low_stock.length - 6} produk lainnya
                </button>
              )}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
