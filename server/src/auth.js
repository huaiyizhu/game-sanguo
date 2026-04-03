import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || "dev-only-change-in-production";

export function signToken(userId, username) {
  return jwt.sign({ sub: String(userId), username }, secret, { expiresIn: "30d" });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}
