import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  id: number;
  name: string;
  role: "admin" | "staff";
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Belum login" });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET as string) as AuthUser;
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ message: "Token tidak valid atau kedaluwarsa" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ message: "Akses ditolak" });
    }
    next();
  };
}