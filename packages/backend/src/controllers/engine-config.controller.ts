/**
 * Engine Config Controller
 *
 * 职责：处理租户级引擎配置（API Key 加密存储）的 HTTP 请求。
 *
 * 路由：
 * - GET    /api/engine-config        列出当前租户所有引擎配置（脱敏）
 * - PUT    /api/engine-config/:provider  设置/更新引擎配置（含加密 API Key）
 * - DELETE /api/engine-config/:provider  删除引擎配置
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { TokenPayload } from "../config/auth.config.js";
import { EngineConfigService } from "../services/engine-config.service.js";

export class EngineConfigController {
  constructor(private engineConfigService: EngineConfigService) {}

  async list(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });
    const configs = await this.engineConfigService.getAllConfigs(user.tenantId);
    return reply.send({ configs });
  }

  async upsert(
    req: FastifyRequest<{ Params: { provider: "PI" | "GROK" }; Body: { apiKey?: string; model?: string; thinkingLevel?: "off" | "low" | "medium" | "high"; isEnabled?: boolean } }>,
    reply: FastifyReply,
  ) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const { provider } = req.params;
    if (!["PI", "GROK"].includes(provider)) {
      return reply.status(400).send({ error: "provider 必须是 PI 或 GROK" });
    }

    const { apiKey, model, thinkingLevel, isEnabled } = req.body;
    const config = await this.engineConfigService.upsert({
      tenantId: user.tenantId,
      provider,
      apiKey,
      model,
      thinkingLevel,
      isEnabled,
    });
    return reply.send({ config });
  }

  async remove(
    req: FastifyRequest<{ Params: { provider: "PI" | "GROK" } }>,
    reply: FastifyReply,
  ) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const { provider } = req.params;
    if (!["PI", "GROK"].includes(provider)) {
      return reply.status(400).send({ error: "provider 必须是 PI 或 GROK" });
    }

    await this.engineConfigService.deleteConfig(user.tenantId, provider);
    return reply.send({ ok: true });
  }
}
