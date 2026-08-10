/**
 * AES-256-GCM 加密工具单元测试
 *
 * 验证：
 * 1. 往返加密/解密结果正确
 * 2. 篡改密文 → 抛出（GCM auth tag 校验失败）
 * 3. 篡改 auth tag → 抛出
 * 4. 错误密钥 → 抛出
 * 5. 空字符串 / Unicode 往返
 */

import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { encrypt, decrypt, deriveEncryptionKey } from "../crypto.js";

const KEY = deriveEncryptionKey();
const PLAINTEXT = "sk-test-abc123-this-is-a-secret-api-key";
const UNICODE = "你好世界 🌍 日本語 テスト";

describe("AES-256-GCM encrypt / decrypt", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const { encrypted, iv, tag } = encrypt(PLAINTEXT, KEY);
    expect(decrypt(encrypted, iv, tag, KEY)).toBe(PLAINTEXT);
  });

  it("每次加密产生不同的 iv/ciphertext（随机性）", () => {
    const a = encrypt(PLAINTEXT, KEY);
    const b = encrypt(PLAINTEXT, KEY);
    expect(a.iv).not.toBe(b.iv);
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(decrypt(a.encrypted, a.iv, a.tag, KEY)).toBe(PLAINTEXT);
    expect(decrypt(b.encrypted, b.iv, b.tag, KEY)).toBe(PLAINTEXT);
  });

  it("tamper ciphertext → throws (auth tag mismatch)", () => {
    const { encrypted, iv, tag } = encrypt(PLAINTEXT, KEY);
    const bytes = Buffer.from(encrypted, "base64");
    bytes[0] ^= 0xff;
    expect(() => decrypt(bytes.toString("base64"), iv, tag, KEY)).toThrow();
  });

  it("tamper auth tag → throws", () => {
    const { encrypted, iv, tag } = encrypt(PLAINTEXT, KEY);
    const tagBytes = Buffer.from(tag, "hex");
    tagBytes[0] ^= 0xff;
    expect(() => decrypt(encrypted, iv, tagBytes.toString("hex"), KEY)).toThrow();
  });

  it("wrong key → throws", () => {
    const { encrypted, iv, tag } = encrypt(PLAINTEXT, KEY);
    const wrongKey = crypto.createHash("sha256").update("completely-different-key").digest();
    expect(() => decrypt(encrypted, iv, tag, wrongKey)).toThrow();
  });

  it("empty plaintext round-trip", () => {
    const { encrypted, iv, tag } = encrypt("", KEY);
    expect(decrypt(encrypted, iv, tag, KEY)).toBe("");
  });

  it("unicode plaintext round-trip", () => {
    const { encrypted, iv, tag } = encrypt(UNICODE, KEY);
    expect(decrypt(encrypted, iv, tag, KEY)).toBe(UNICODE);
  });
});
