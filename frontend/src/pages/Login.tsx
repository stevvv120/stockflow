import { useState, type FormEvent } from "react";
import { login } from "../services/api";
import type { User } from "../services/api";

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await login(email.trim(), password);
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      onLogin(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tidak dapat masuk. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand-mark" aria-hidden="true">S</div>
        <p className="login-eyebrow">INVENTORY &amp; SALES MANAGEMENT</p>
        <h1>Selamat datang</h1>
        <p className="login-description">Masuk ke StockFlow untuk mengelola toko Anda.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="form-field">Email
            <input
              type="email"
              autoComplete="username"
              placeholder="nama@perusahaan.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="form-field">Password
            <span className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Masukkan password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((shown) => !shown)}>
                {showPassword ? "Sembunyikan" : "Lihat"}
              </button>
            </span>
          </label>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button className="button button-primary login-submit" type="submit" disabled={loading}>
            {loading ? "Memverifikasi..." : "Masuk"}
          </button>
        </form>
        <p className="login-footer">Akses hanya untuk pengguna StockFlow yang terdaftar.</p>
      </section>
    </main>
  );
}
