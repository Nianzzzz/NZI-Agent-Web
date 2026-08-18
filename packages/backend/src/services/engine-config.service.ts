/**
 * T011 — Engine Configuration Service
 *
 * 职责：管理租户级引擎 API Key 配置（AES-256-GCM 加密存储）
 *
 * 设计：
 * - 每个租户每个 provider 一条 EngineConfig 记录
 * - API Key 经 encrypt() 加密后存入 EngineConfig.apiKeyEncrypted
 *   IV 和 Auth Tag 分别存入 apiKeyIv / apiKeyTag
 * - 运行时：优先使用租户配置的 key；未配置则降级到全局环境变量
 */

import type { PrismaClient } from "@prisma/client";
import { EngineProvider } from "@nzi/shared-types";
import { encrypt, decrypt, deriveEncryptionKey } from "../utils/crypto.js";

export interface EngineConfigInput {
  tenantId: string;
  provider: "PI" | "GROK";
  apiKey?: string;
  model?: string;
  thinkingLevel?: "off" | "low" | "medium" | "high";
  isEnabled?: boolean;
}

export class EngineConfigService {
  constructor(private prisma: PrismaClient) {}

  /** 设置（创建或更新）租户的引擎配置 */
  async upsert(input: EngineConfigInput): Promise<unknown> {
    const { tenantId, provider, apiKey, model, thinkingLevel, isEnabled } = input;
    const prismaProvider = EngineProvider[provider];

    let encryptedData: { apiKeyEncrypted?: string; apiKeyIv?: string; apiKeyTag?: string } = {};

    if (apiKey) {
      const key = deriveEncryptionKey();
      const { encrypted, iv, tag } = encrypt(apiKey, key);
      encryptedData = { apiKeyEncrypted: encrypted, apiKeyIv: iv, apiKeyTag: tag };
    }

    const config = await this.prisma.engineConfig.upsert({
      where: { tenantId_provider: { tenantId, provider: prismaProvider } },
      create: {
        tenantId,
        provider: prismaProvider,
        model: model ?? null,
        thinkingLevel: (thinkingLevel?.toUpperCase() as never) ?? null,
        isEnabled: isEnabled ?? true,
        ...encryptedData,
      },
      update: {
        ...(model !== undefined ? { model: model ?? null } : {}),
        ...(thinkingLevel !== undefined ? { thinkingLevel: (thinkingLevel?.toUpperCase() as never) ?? null } : {}),
        ...(isEnabled !== undefined ? { isEnabled } : {}),
        ...encryptedData,
      },
      select: {
        id: true,
        provider: true,
        model: true,
        thinkingLevel: true,
        isEnabled: true,
        createdAt: true,
      },
    });

    return config;
  }

  /** 获取租户的引擎配置（脱敏：不返回加密 key） */
  async getConfig(tenantId: string, provider: "PI" | "GROK"): Promise<unknown> {
    const prismaProvider = EngineProvider[provider];
    const config = await this.prisma.engineConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider: prismaProvider } },
      select: {
        id: true,
        provider: true,
        model: true,
        thinkingLevel: true,
        isEnabled: true,
        createdAt: true,
      },
    });
    return config;
  }

  /** 获取租户所有引擎配置（脱敏） */
  async getAllConfigs(tenantId: string): Promise<unknown[]> {
    const configs = await this.prisma.engineConfig.findMany({
      where: { tenantId },
      select: {
        id: true,
        provider: true,
        model: true,
        thinkingLevel: true,
        isEnabled: true,
        createdAt: true,
      },
    });
    return configs;
  }

  /** 解密获取租户的 API Key（仅内部调用，不暴露给 API 响应） */
  async getDecryptedApiKey(tenantId: string, provider: "PI" | "GROK"): Promise<string | null> {
    const prismaProvider = EngineProvider[provider];
    const config = await this.prisma.engineConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider: prismaProvider } },
      select: { apiKeyEncrypted: true, apiKeyIv: true, apiKeyTag: true, isEnabled: true },
    });
    if (!config?.apiKeyEncrypted || !config.isEnabled) return null;

    try {
      const key = deriveEncryptionKey();
      return decrypt(config.apiKeyEncrypted, config.apiKeyIv!, config.apiKeyTag!, key);
    } catch {
      return null;
    }
  }

  /** 删除租户的引擎配置 */
  async deleteConfig(tenantId: string, provider: "PI" | "GROK"): Promise<void> {
    const prismaProvider = EngineProvider[provider];
    await this.prisma.engineConfig.delete({
      where: { tenantId_provider: { tenantId, provider: prismaProvider } },
    }).catch(() => { /* 不存在则忽略 */ });
  }
}
