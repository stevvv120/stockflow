import bcrypt from "bcryptjs";
import { pool } from "./config/db";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) {
    throw new Error("Isi ADMIN_EMAIL dan ADMIN_PASSWORD (minimal 10 karakter)");
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT IGNORE INTO users (name, email, password_hash, role) VALUES ('Admin', ?, ?, 'admin')",
    [email, hash]
  );
  console.log("Admin dibuat");
  await pool.end();
}

main();