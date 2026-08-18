/**
 * Phase 3 — Web Search Service
 *
 * 职责：联网搜索调度，支持 DuckDuckGo（免费）和 SerpAPI（付费）
 *
 * 设计：
 * - 每个租户可配置搜索提供商和 API Key
 * - API Key 经 AES-256-GCM 加密存储
 * - 搜索结果通过 WS 事件实时推送到前端
 */

import type { PrismaClient } from "@prisma/client";
import { encrypt, decrypt, deriveEncryptionKey } from "../utils/crypto.js";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchConfigInput {
  tenantId: string;
  provider: "duckduckgo" | "serpapi";
  apiKey?: string;
  maxResults?: number;
  isEnabled?: boolean;
}

export class WebSearchService {
  constructor(private prisma: PrismaClient) {}

  /** 获取租户的搜索配置 */
  async getConfig(tenantId: string) {
    const configs = await this.prisma.webSearchConfig.findMany({
      where: { tenantId },
      select: {
        id: true,
        provider: true,
        maxResults: true,
        isEnabled: true,
        createdAt: true,
      },
    });
    return configs;
  }

  /** 更新搜索配置 */
  async upsertConfig(input: WebSearchConfigInput) {
    const { tenantId, provider, apiKey, maxResults, isEnabled } = input;

    let encryptedData: { apiKey?: string; apiKeyIv?: string; apiKeyTag?: string } = {};
    if (apiKey) {
      const key = deriveEncryptionKey();
      const { encrypted, iv, tag } = encrypt(apiKey, key);
      encryptedData = { apiKey: encrypted, apiKeyIv: iv, apiKeyTag: tag };
    }

    return this.prisma.webSearchConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: {
        tenantId,
        provider,
        apiKey: encryptedData.apiKey ?? null,
        apiKeyIv: encryptedData.apiKeyIv ?? null,
        apiKeyTag: encryptedData.apiKeyTag ?? null,
        maxResults: maxResults ?? 5,
        isEnabled: isEnabled ?? true,
      },
      update: {
        ...(encryptedData.apiKey !== undefined && {
          apiKey: encryptedData.apiKey,
          apiKeyIv: encryptedData.apiKeyIv,
          apiKeyTag: encryptedData.apiKeyTag,
        }),
        ...(maxResults !== undefined && { maxResults }),
        ...(isEnabled !== undefined && { isEnabled }),
      },
      select: {
        id: true,
        provider: true,
        maxResults: true,
        isEnabled: true,
        createdAt: true,
      },
    });
  }

  /**
   * 执行搜索。
   * 优先使用 DuckDuckGo（免费无 API Key），若配置了 SerpAPI 则使用 SerpAPI。
   */
  async search(tenantId: string, query: string, maxResults?: number): Promise<WebSearchResult[]> {
    const configs = await this.prisma.webSearchConfig.findMany({
      where: { tenantId, isEnabled: true },
    });

    // 优先 SerpAPI（如果配置了且密钥有效）
    const serpConfig = configs.find((c) => c.provider === "serpapi");
    if (serpConfig) {
      const apiKey = await this._decryptApiKey(serpConfig);
      if (apiKey) {
        return this._searchSerpAPI(query, apiKey, maxResults ?? serpConfig.maxResults);
      }
    }

    // 降级到 DuckDuckGo
    const ddgConfig = configs.find((c) => c.provider === "duckduckgo");
    const limit = maxResults ?? ddgConfig?.maxResults ?? 5;
    return this._searchDuckDuckGo(query, limit);
  }

  /** DuckDuckGo 搜索（免费，无需 API Key） */
  private async _searchDuckDuckGo(query: string, maxResults: number): Promise<WebSearchResult[]> {
    try {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        no_html: "1",
        skip_disambig: "1",
      });
      const res = await fetch(`https://api.duckduckgo.com/?${params.toString()}`, {
        headers: { "User-Agent": "NZi-Agent-Web/1.0" },
      });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        AbstractSource?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };

      const results: WebSearchResult[] = [];

      // 摘要结果
      if (data.AbstractText) {
        results.push({
          title: data.AbstractSource ?? "DuckDuckGo",
          url: data.AbstractURL ?? "",
          snippet: data.AbstractText,
        });
      }

      // 相关主题
      for (const topic of data.RelatedTopics ?? []) {
        if (results.length >= maxResults) break;
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(" - ")[0] ?? topic.Text.slice(0, 60),
            url: topic.FirstURL,
            snippet: topic.Text,
          });
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  /** SerpAPI 搜索（需要 API Key） */
  private async _searchSerpAPI(
    query: string,
    apiKey: string,
    maxResults: number,
  ): Promise<WebSearchResult[]> {
    try {
      const params = new URLSearchParams({
        q: query,
        api_key: apiKey,
        engine: "google",
        num: String(maxResults),
      });
      const res = await fetch(`https://serpapi.com/search?${params.toString()}`);
      if (!res.ok) return [];

      const data = (await res.json()) as {
        organic_results?: Array<{ title: string; link: string; snippet: string }>;
      };

      return (data.organic_results ?? []).slice(0, maxResults).map((r) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      }));
    } catch {
      return [];
    }
  }

  /** 解密 API Key */
  private async _decryptApiKey(
    config: { apiKey?: string | null; apiKeyIv?: string | null; apiKeyTag?: string | null },
  ): Promise<string | null> {
    if (!config.apiKey || !config.apiKeyIv || !config.apiKeyTag) return null;
    try {
      const key = deriveEncryptionKey();
      return decrypt(config.apiKey, config.apiKeyIv, config.apiKeyTag, key);
    } catch {
      return null;
    }
  }
}