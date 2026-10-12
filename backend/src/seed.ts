import bcrypt from "bcryptjs";
import { pool } from "./config/db";

async function main() {
  const users = [
    { name: "Admin", email: "admin@stockflow.test", password: "admin123", role: "admin" },
    { name: "Staff", email: "staff@stockflow.test", password: "staff123", role: "staff" },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      "INSERT IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [u.name, u.email, hash, u.role]
    );
  }
  console.log("Seed selesai");
  await pool.end();
}

main();