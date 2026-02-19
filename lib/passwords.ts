import crypto from "crypto";

/**
 * scrypt format:
 *   scrypt$<saltHex>$<keyHex>
 */
export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password: string, stored: string) {
  try {
    const [alg, salt, key] = stored.split("$");
    if (alg !== "scrypt" || !salt || !key) return false;

    const derived = crypto.scryptSync(password, salt, 64).toString("hex");

    // timing-safe compare
    const a = Buffer.from(derived, "hex");
    const b = Buffer.from(key, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}