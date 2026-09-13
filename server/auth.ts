import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "./db.ts";

let cachedJwtSecret: string | null = null;

export function getJwtSecret(): string {
  if (cachedJwtSecret) return cachedJwtSecret;

   if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length > 0) {
    cachedJwtSecret = process.env.JWT_SECRET.trim();
    return cachedJwtSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET environment variable is not set. This is required in production " +
      "(sessions would otherwise be invalidated on every server restart). " +
      "Set JWT_SECRET and restart the server."
    );
  }

  // Ephemeral random secret in non-production environments only.
  cachedJwtSecret = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[Auth] Notice: JWT_SECRET environment variable not set. Using ephemeral session secret (dev only)."
  );
  return cachedJwtSecret;
}
export interface TokenPayload {
  role: "admin" | "hod";
  id?: string;
  userId?: string;
  name?: string;
  email?: string;
  departmentId?: string;
  festivalId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export async function checkAdminPassword(
  password: string,
  email?: string
): Promise<{ success: boolean; user?: any }> {
  return db.verifyAdminCredentials(password, email);
}

export function signAdminToken(adminUser?: {
  id: string;
  name: string;
  email?: string;
  role?: string;
}): string {
  const uid = adminUser?.id || "admin-default";
  return jwt.sign(
    {
      role: "admin",
      id: uid,
      userId: uid,
      name: adminUser?.name || "Festival Administrator",
      email: adminUser?.email || "admin@iskcon.org",
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
}

export function signHODToken(departmentId: string, festivalId: string, hodName?: string): string {
  return jwt.sign(
    {
      role: "hod",
      departmentId,
      festivalId,
      name: hodName || "Department HOD",
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
  } catch {
    return null;
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Admin authentication token required" });
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyToken(token);

  if (!payload || payload.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Admin privileges required" });
  }

  req.user = payload;
  next();
}

export function requireHOD(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Authentication token required" });
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyToken(token);

  if (!payload || (payload.role !== "hod" && payload.role !== "admin")) {
    return res.status(403).json({ error: "Forbidden: HOD access required" });
  }

  req.user = payload;
  next();
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}
