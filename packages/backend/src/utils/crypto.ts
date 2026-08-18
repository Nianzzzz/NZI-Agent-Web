import crypto from "node:crypto";

/**
 * 加密工具模块 — AES-256-GCM
 *
 * Phase 1: 加密引擎 API Key（EngineConfig.apiKeyEncrypted）
 * Phase 2+ 可扩展为租户级密钥派生
 *
 * 格式：[iv_hex][auth_tag_hex][ciphertext_base64]
 * 总长度固定：32 + 32 + 任意
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 推荐 12 字节
const TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // AES-256

export interface EncryptedPayload {
  /** 加密后的内容（base64 编码的 iv + tag + ciphertext） */
  encrypted: string;
  /** IV（hex，供 Prisma 单独存储） */
  iv: string;
  /** Auth Tag（hex，供 Prisma 单独存储） */
  tag: string;
}

/**
 * 使用 AES-256-GCM 加密字符串。
 *
 * @param plaintext — 待加密的明文
 * @param key — 32 字节加密密钥（从环境变量派生）
 * @returns EncryptedPayload
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    encrypted: ciphertext.toString("base64"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

/**
 * 解密 AES-256-GCM 内容。
 *
 * @param encrypted — base64 编码的密文
 * @param ivHex — IV 的 hex 字符串
 * @param tagHex — Auth Tag 的 hex 字符串
 * @param key — 32 字节解密密钥
 * @returns 解密后的明文
 * @throws 如果密钥不正确或数据被篡改
 */
export function decrypt(
  encrypted: string,
  ivHex: string,
  tagHex: string,
  key: Buffer,
): string {
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(encrypted, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error(`Invalid tag length: expected ${TAG_LENGTH}, got ${tag.length}`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}

/**
 * 从环境变量派生出加密密钥。
 *
 * 使用 HKDF 或简单的 SHA-256 从 ENCRYPTION_KEY 环境变量派生 32 字节密钥。
 *
 * @returns 32 字节 Buffer
 */
export function deriveEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    // 开发环境：使用固定回退密钥（生产环境必须设置 ENCRYPTION_KEY）
    if (process.env.NODE_ENV !== "production") {
      return crypto.createHash("sha256").update("nzi-dev-encryption-key").digest();
    }
    throw new Error("ENCRYPTION_KEY is required in production");
  }

  return crypto.createHash("sha256").update(raw).digest();
}
