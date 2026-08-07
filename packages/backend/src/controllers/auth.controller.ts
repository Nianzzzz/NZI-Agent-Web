/**
 * Auth Controller
 *
 * 职责：处理注册、登录、获取当前用户信息的 HTTP 请求。
 * 不包含业务逻辑，全部委托给 AuthService。
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/auth.service.js";

const RegisterSchema = z.object({
  email: z.string().email("邮箱格式不正确").max(254, "邮箱过长"),
  password: z.string().min(12, "密码至少需要 12 个字符").max(128, "密码过长"),
  displayName: z.string().max(64, "昵称过长").optional(),
});

const LoginSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(1, "密码不能为空"),
});

export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /api/auth/register
   * 注册新用户（自动创建 Tenant 并关联为 OWNER）
   */
  async register(req: FastifyRequest, reply: FastifyReply) {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "请求参数校验失败",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    }

    try {
      const result = await this.authService.register(parsed.data);
      return reply.status(201).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "注册失败";
      if (message.includes("已被注册")) {
        return reply.status(409).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  }

  /**
   * POST /api/auth/login
   * 登录并获取 JWT Token
   */
  async login(req: FastifyRequest, reply: FastifyReply) {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "请求参数校验失败",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    }

    try {
      const result = await this.authService.login(parsed.data);
      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "登录失败";
      return reply.status(401).send({ error: message });
    }
  }

  /**
   * GET /api/auth/me
   * 获取当前登录用户信息
   * （需通过 authHook 验证 JWT）
   */
  async me(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as { sub: string; email: string; tenantId: string; role: string } | undefined;
    if (!user) {
      return reply.status(401).send({ error: "未登录或登录已过期" });
    }

    return reply.send({
      sub: user.sub,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    });
  }
}
