import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./config/db";
import productRoutes from "./routes/products";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/products", productRoutes);

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