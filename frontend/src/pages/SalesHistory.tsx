import { useEffect, useMemo, useState } from "react";
import { getSales, getSale } from "../services/api";
import type { Sale, SaleDetail } from "../services/api";

const rupiah = (v: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));

const dateInputValue = (date: Date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

export default function SalesHistory() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getSales()
      .then((result) => { if (active) { setSales(result); setError(""); } })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const filteredSales = useMemo(() => sales.filter((sale) => {
    const query = search.trim().toLocaleLowerCase("id");
    const saleDate = dateInputValue(new Date(sale.created_at));
    return (!query || sale.invoice_number.toLocaleLowerCase("id").includes(query) || sale.user_name.toLocaleLowerCase("id").includes(query))
      && (!from || saleDate >= from)
      && (!to || saleDate <= to);
  }), [sales, search, from, to]);

  const open = async (id: number) => {
    setError("");
    setDetailLoading(true);
    try {
      setDetail(await getSale(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat detail transaksi");
    } finally {
      setDetailLoading(false);
    }
  };

  const clearFilters = () => { setSearch(""); setFrom(""); setTo(""); };
  const reload = () => { setLoading(true); setReloadKey((key) => key + 1); };

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Riwayat penjualan</h2>
          <p>Cari transaksi, lihat detail, dan cetak bukti pembayaran.</p>
        </div>
        <button className="button button-secondary" onClick={reload} disabled={loading}>
          {loading ? "Memuat..." : "Muat ulang"}
        </button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {detail && (
        <section className="receipt-card print-area">
          <div className="section-heading receipt-heading">
            <div>
              <span className="eyebrow">Detail transaksi</span>
              <h3>{detail.invoice_number}</h3>
              <p>{new Date(detail.created_at).toLocaleString("id-ID")} · Gudang: {detail.warehouse_name} · Kasir: {detail.user_name}</p>
            </div>
            <div className="row-actions no-print">
              <button className="button button-primary" onClick={() => window.print()}>Cetak struk</button>
              <button className="button button-secondary" onClick={() => setDetail(null)}>Tutup</button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
              <tbody>
                {detail.items.map((item, index) => (
                  <tr key={`${item.sku}-${index}`}>
                    <td><span className="cell-strong">{item.product_name}</span><br /><span className="cell-muted">{item.sku}</span></td>
                    <td>{item.quantity}</td>
                    <td>{rupiah(item.unit_price)}</td>
                    <td>{rupiah(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="receipt-total"><span>Total pembayaran</span><strong>{rupiah(detail.total_amount)}</strong></div>
        </section>
      )}

      <div className="toolbar history-toolbar">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Cari invoice atau kasir" placeholder="Cari invoice atau nama kasir..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="date-field">Dari<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="date-field">Sampai<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        {(search || from || to) && <button className="text-button" onClick={clearFilters}>Hapus filter</button>}
      </div>

      <div className="table-card">
        <div className="table-summary">{loading ? "Memuat transaksi..." : `${filteredSales.length} dari ${sales.length} transaksi`}</div>
        {loading ? <div className="table-message">Memuat riwayat penjualan...</div> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Invoice</th><th>Tanggal &amp; waktu</th><th>Gudang</th><th>Kasir</th><th>Total</th><th>Aksi</th></tr></thead>
              <tbody>
                {filteredSales.length === 0 && <tr><td colSpan={6} className="table-empty">Transaksi tidak ditemukan pada filter ini.</td></tr>}
                {filteredSales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="cell-strong">{sale.invoice_number}</td>
                    <td>{new Date(sale.created_at).toLocaleString("id-ID")}</td>
                    <td>{sale.warehouse_name}</td>
                    <td>{sale.user_name}</td>
                    <td>{rupiah(sale.total_amount)}</td>
                    <td><button className="button button-subtle" onClick={() => open(sale.id)} disabled={detailLoading}>
                      {detailLoading ? "Memuat..." : "Detail"}
                    </button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
