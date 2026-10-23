import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db";
import { authenticate } from "../middleware/auth";
import rateLimit from "express-rate-limit";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { message: "Terlalu banyak percobaan login. Coba lagi nanti." },
});

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email dan password wajib diisi" });
    }

    const [rows]: any = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    const user = rows[0];

    // Pesan sengaja sama agar tidak membocorkan email mana yang terdaftar
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Email atau password salah" });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: 60 * 60 * 8 } // 8 jam
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, (req, res) => {
  res.json((req as any).user);
});

export default router;