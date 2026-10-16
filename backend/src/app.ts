import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./config/db";
import productRoutes from "./routes/products";
import categoryRoutes from "./routes/categories";
import authRoutes from "./routes/auth";
import stockRoutes from "./routes/stock";
import salesRoutes from "./routes/sales";
import reportRoutes from "./routes/reports";

dotenv.config();
const app = express();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET wajib diisi dengan secret acak minimal 32 karakter (jangan gunakan nilai contoh)");
}

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));

app.use(express.json());
app.use("/api/stock", stockRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/sales", salesRoutes);
app.get("/api/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ status: "running", db: rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: String(err) });
  }
});

const port = Number(process.env.PORT) || 5000;
app.listen(port, () => console.log(`Server jalan di port ${port}`));