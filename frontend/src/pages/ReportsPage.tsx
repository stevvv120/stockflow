import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { getSalesReport, downloadSalesCsv } from "../services/api";
import type { SalesReport } from "../services/api";

const rupiah = (v: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function getInitialRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: fmt(from), to: fmt(to) };
}

const compactRupiah = (value: number) => value >= 1_000_000
  ? `Rp${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`
  : value >= 1_000
    ? `Rp${(value / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })}rb`
    : `Rp${value}`;

export default function ReportsPage() {
  const [initialRange] = useState(getInitialRange);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadReport = useCallback((start: string, end: string) => {
    if (start > end) {
      setError("Tanggal awal tidak boleh setelah tanggal akhir");
      setReport(null);
      setLoading(false);
      return;
    }
    setError("");
    setLoading(true);
    setReport(null);
    getSalesReport(start, end)
      .then(setReport)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    getSalesReport(initialRange.from, initialRange.to)
      .then((result) => { if (active) setReport(result); })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialRange]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loadReport(from, to);
  };

  const setPreset = (days: 7 | 30 | "month") => {
    const end = new Date();
    const start = new Date(end);
    if (days === "month") start.setDate(1);
    else start.setDate(start.getDate() - days + 1);
    const range = { from: fmt(start), to: fmt(end) };
    setFrom(range.from);
    setTo(range.to);
    loadReport(range.from, range.to);
  };

  const exportCsv = async () => {
    setError("");
    setExporting(true);
    try {
      await downloadSalesCsv(from, to);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunduh CSV");
    } finally {
      setExporting(false);
    }
  };

  const currentReport = report?.from === from && report.to === to ? report : null;

  return (
    <section className="page-section">
      <div className="section-heading">
        <div><h2>Laporan penjualan</h2><p>Analisis pendapatan, laba kotor, dan produk terlaris.</p></div>
      </div>

      <form className="report-toolbar" onSubmit={submit}>
        <label className="date-field">Dari<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></label>
        <label className="date-field">Sampai<input type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></label>
        <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Memuat..." : "Tampilkan laporan"}</button>
        <div className="preset-actions" aria-label="Rentang cepat">
          <button className="button button-secondary" type="button" onClick={() => setPreset(7)}>7 hari</button>
          <button className="button button-secondary" type="button" onClick={() => setPreset(30)}>30 hari</button>
          <button className="button button-secondary" type="button" onClick={() => setPreset("month")}>Bulan ini</button>
        </div>
        <button className="button button-secondary" type="button" onClick={exportCsv} disabled={exporting || loading || !currentReport}>
          {exporting ? "Mengunduh..." : "Ekspor CSV"}
        </button>
      </form>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {loading && <div className="table-card table-message" role="status">Memuat laporan penjualan...</div>}
      {!loading && !error && !currentReport && <div className="empty-state">Pilih rentang tanggal, lalu tampilkan laporan.</div>}

      {currentReport && !loading && (
        <>
          <div className="metrics-grid report-metrics">
            <article className="report-metric"><span>Pendapatan</span><strong>{rupiah(currentReport.revenue)}</strong><small>Selama periode terpilih</small></article>
            <article className="report-metric"><span>Laba kotor</span><strong>{rupiah(currentReport.profit)}</strong><small>Pendapatan dikurangi modal</small></article>
            <article className="report-metric"><span>Transaksi</span><strong>{currentReport.transactions.toLocaleString("id-ID")}</strong><small>Transaksi berhasil</small></article>
            <article className="report-metric"><span>Barang terjual</span><strong>{currentReport.items_sold.toLocaleString("id-ID")}</strong><small>Total unit terjual</small></article>
          </div>

          <article className="dashboard-panel report-chart-panel">
            <div className="panel-heading">
              <div><h3>Tren penjualan harian</h3><p>{new Date(`${currentReport.from}T00:00:00`).toLocaleDateString("id-ID")} – {new Date(`${currentReport.to}T00:00:00`).toLocaleDateString("id-ID")}</p></div>
            </div>
            {currentReport.daily.length === 0 ? <div className="empty-state">Tidak ada penjualan pada periode ini.</div> : (
              <div className="chart-wrap report-chart" role="img" aria-label="Grafik tren penjualan harian">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={currentReport.daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#edf1f6" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} tick={{ fill: "#8490a2", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={compactRupiah} tick={{ fill: "#8490a2", fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip formatter={(value) => [rupiah(Number(value)), "Penjualan"]} labelFormatter={(label) => String(label)} contentStyle={{ border: "1px solid #e6ebf1", borderRadius: 9, fontSize: 12 }} />
                    <Line type="monotone" dataKey="total" name="Penjualan" stroke="#4f7cff" strokeWidth={2.5} dot={{ fill: "#4f7cff", r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>

          <div className="section-heading report-products-heading">
            <div><h3>Produk terlaris</h3><p>Produk dengan jumlah unit terjual tertinggi.</p></div>
          </div>
          <div className="table-card">
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>#</th><th>SKU</th><th>Produk</th><th>Terjual</th><th>Pendapatan</th></tr></thead>
                <tbody>
                  {currentReport.top_products.length === 0 && <tr><td className="table-empty" colSpan={5}>Belum ada penjualan pada periode ini.</td></tr>}
                  {currentReport.top_products.map((product, index) => (
                    <tr key={product.sku}>
                      <td><span className="rank-badge">{index + 1}</span></td>
                      <td className="cell-muted">{product.sku}</td>
                      <td className="cell-strong">{product.name}</td>
                      <td>{product.quantity.toLocaleString("id-ID")}</td>
                      <td>{rupiah(product.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
