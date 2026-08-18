/**
 * Phase 3 — Web Search Controller
 *
 * 路由：
 * - GET  /api/web-search/config    获取搜索配置
 * - PUT  /api/web-search/config    更新搜索配置
 * - POST /api/web-search/search    手动触发搜索（测试用）
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { TokenPayload } from "../config/auth.config.js";
import { WebSearchService } from "../services/web-search.service.js";

export class WebSearchController {
  constructor(private webSearchService: WebSearchService) {}

  /** GET /api/web-search/config */
  async getConfig(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });
    const configs = await this.webSearchService.getConfig(user.tenantId);
    return reply.send({ configs });
  }

  /** PUT /api/web-search/config */
  async upsertConfig(
    req: FastifyRequest<{
      Body: {
        provider: "duckduckgo" | "serpapi";
        apiKey?: string;
        maxResults?: number;
        isEnabled?: boolean;
      };
    }>,
    reply: FastifyReply,
  ) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const { provider, apiKey, maxResults, isEnabled } = req.body;
    if (!["duckduckgo", "serpapi"].includes(provider)) {
      return reply.status(400).send({ error: "provider 必须是 duckduckgo 或 serpapi" });
    }

    const config = await this.webSearchService.upsertConfig({
      tenantId: user.tenantId,
      provider,
      apiKey,
      maxResults,
      isEnabled,
    });
    return reply.send({ config });
  }

  /** POST /api/web-search/search */
  async search(
    req: FastifyRequest<{ Body: { query: string; maxResults?: number } }>,
    reply: FastifyReply,
  ) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const { query, maxResults } = req.body;
    if (!query?.trim()) return reply.status(400).send({ error: "query 不能为空" });

    const results = await this.webSearchService.search(user.tenantId, query.trim(), maxResults);
    return reply.send({ results });
  }
}