/**
 * Auth 配置模块
 *
 * 职责：封装 JWT 配置、密码哈希策略、Token 签发与验证参数。
 * 所有 Auth 相关的魔术数字在此集中管理。
 */

// ─── JWT 配置 ─────────────────────────────────────────────────────

export const JWT_SECRET = (): string => {
  const s = process.env.JWT_SECRET;
  if (!s || s === "change-me-in-development") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is required in production");
    }
    console.warn("[auth] JWT_SECRET not set — using insecure dev fallback");
  }
  return s ?? "change-me-in-development";
};
export const JWT_EXPIRY = () => process.env.JWT_EXPIRY ?? "7d";

/**
 * 根据 role 决定 JWT exp 秒数
 *
 * - ADMIN: 30d — 不再使用永不过期的 token，统一通过 jti 撤销机制控制
 * - 其他: undefined (沿用 fastify.jwt 默认 7d)
 */
export function computeJwtExpiry(role: string): string {
  if (role.toUpperCase() === "ADMIN") {
    return "30d";
  }
  return JWT_EXPIRY();
}

// ─── 密码哈希 ─────────────────────────────────────────────────────

/** bcrypt rounds（开发 10，生产考虑 12+） */
export const BCRYPT_ROUNDS = () =>
  process.env.NODE_ENV === "production" ? 12 : 10;

// ─── Token Payload 类型 ───────────────────────────────────────────

export interface TokenPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  jti: string;
  iat: number;
  exp: number;
}

// ─── 密码工具 ─────────────────────────────────────────────────────

/**
 * 对明文密码进行 bcrypt 哈希
 */
export async function hashPassword(plain: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(plain, BCRYPT_ROUNDS());
}

/**
 * 对比明文密码与 bcrypt 哈希
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(plain, hash);
}