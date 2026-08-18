/**
 * Auth Service
 *
 * 职责：用户注册、登录、Token 签发。
 * 不直接处理 HTTP 请求，由 Controller 调用。
 */

import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword, computeJwtExpiry } from "../config/auth.config.js";

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  token: string;
  tenantId: string;
  role: string;
}

export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private signToken: (
      payload: Record<string, unknown>,
      expiresIn?: string | number,
    ) => Promise<string>,
  ) {}
  /**
   * 注册新用户。
   * - 自动创建默认 Tenant
   * - 自动关联为 OWNER
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new Error("该邮箱已被注册");
    }

    const passwordHash = await hashPassword(input.password);

    // 事务：创建 User + Tenant + TenantMember
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName ?? null,
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: `${input.displayName ?? input.email} 的工作区`,
          slug: `tenant-${user.id.slice(0, 8)}`,
        },
      });

      const member = await tx.tenantMember.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: "OWNER",
        },
      });

      return { user, tenant, member };
    });

    const token = await this.signToken(
      {
        sub: result.user.id,
        email: result.user.email,
        tenantId: result.tenant.id,
        role: result.member.role,
        jti: crypto.randomUUID(),
      },
      computeJwtExpiry(result.member.role),
    );

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
      },
      token,
      tenantId: result.tenant.id,
      role: result.member.role,
    };
  }

  /**
   * 登录：验证凭证 → 签发 JWT
   */
  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new Error("邮箱或密码错误");
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw new Error("邮箱或密码错误");
    }

    // 获取用户所属的第一个 Tenant（Phase 1: 单租户）
    const membership = await this.prisma.tenantMember.findFirst({
      where: { userId: user.id },
      include: { tenant: true },
    });

    if (!membership) {
      throw new Error("用户未关联任何工作区");
    }

    const token = await this.signToken(
      {
        sub: user.id,
        email: user.email,
        tenantId: membership.tenantId,
        role: membership.role,
        jti: crypto.randomUUID(),
      },
      computeJwtExpiry(membership.role),
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      token,
      tenantId: membership.tenantId,
      role: membership.role,
    };
  }
}
