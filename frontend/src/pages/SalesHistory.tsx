import { useEffect, useState } from "react";
import { getSales, getSale } from "../services/api";
import type { Sale, SaleDetail } from "../services/api";

const rupiah = (v: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));

export default function SalesHistory() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getSales().then(setSales).catch((e) => setError(e.message));
  }, []);

  const open = async (id: number) => {
    try {
      setDetail(await getSale(id));
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div style={{ padding: 24, textAlign: "left" }}>
      <h1>Riwayat Penjualan</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {detail && (
        <div style={{ border: "1px solid #999", padding: 16, marginBottom: 16, maxWidth: 520 }}>
          <h2 style={{ marginTop: 0 }}>{detail.invoice_number}</h2>
          <p>{new Date(detail.created_at).toLocaleString("id-ID")} | Kasir: {detail.user_name}</p>
          <table border={1} cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
            <tbody>
              {detail.items.map((i, idx) => (
                <tr key={idx}>
                  <td>{i.sku} - {i.product_name}</td>
                  <td>{i.quantity}</td>
                  <td>{rupiah(i.unit_price)}</td>
                  <td>{rupiah(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><strong>Total: {rupiah(detail.total_amount)}</strong></p>
          <button onClick={() => setDetail(null)}>Tutup</button>
        </div>
      )}

      <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr><th>Invoice</th><th>Waktu</th><th>Kasir</th><th>Total</th><th></th></tr>
        </thead>
        <tbody>
          {sales.length === 0 && <tr><td colSpan={5}>Belum ada transaksi</td></tr>}
          {sales.map((s) => (
            <tr key={s.id}>
              <td>{s.invoice_number}</td>
              <td>{new Date(s.created_at).toLocaleString("id-ID")}</td>
              <td>{s.user_name}</td>
              <td>{rupiah(s.total_amount)}</td>
              <td><button onClick={() => open(s.id)}>Detail</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}