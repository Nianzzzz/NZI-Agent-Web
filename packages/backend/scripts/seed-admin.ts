/**
 * Seed Admin Script (T009)
 *
 * 用途：创建/更新一个永不过期的管理员账号，用于开发 / 演示 / 内部脚本。
 *
 * 行为：
 * - 邮箱: admin@nzilab.com (可用 ADMIN_EMAIL 覆盖)
 * - 密码: 必须通过 ADMIN_PASSWORD 环境变量传入（>=16 字符）
 * - 角色: ADMIN (TenantMember.role = "ADMIN")
 * - JWT exp: 9999-12-31 (computeJwtExpiry 自动签发)
 *
 * 运行：
 *   ADMIN_PASSWORD="YourStrong@Pass16" pnpm tsx scripts/seed-admin.ts
 *
 * 幂等：重复运行只更新密码 + displayName，不会重复创建
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/config/auth.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(__dirname, "../../../.env") });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@nzilab.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME ?? "System Admin";

const DEFAULT_ADMIN_PASSWORD = "Admin@2026!";
const MIN_PASSWORD_LENGTH = 16;

function validateAdminPassword(): string {
  if (!ADMIN_PASSWORD) {
    throw new Error(
      `ADMIN_PASSWORD env var is required (>=${MIN_PASSWORD_LENGTH} chars). ` +
        "Refusing to run with missing password.",
    );
  }
  if (ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters. ` +
        `Current length: ${ADMIN_PASSWORD.length}.`,
    );
  }
  if (process.env.NODE_ENV === "production" && ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
    throw new Error(
      "Refusing to seed with default admin password in production. " +
        "Set a strong ADMIN_PASSWORD via environment variable.",
    );
  }
  if (ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
    console.warn(
      "[seed-admin] Using default password in non-production. " +
        "Set ADMIN_PASSWORD for better security hygiene.",
    );
  }
  return ADMIN_PASSWORD;
}

async function main() {
  const prisma = new PrismaClient();
  const password = validateAdminPassword();
  console.log(`🔧 Seeding admin user: ${ADMIN_EMAIL}`);

  try {
    const passwordHash = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      // 1. 找到或创建用户
      const user = await tx.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: {
          passwordHash,
          displayName: ADMIN_DISPLAY_NAME,
        },
        create: {
          email: ADMIN_EMAIL,
          passwordHash,
          displayName: ADMIN_DISPLAY_NAME,
        },
      });

      // 2. 找到或创建默认 tenant
      let tenant = await tx.tenant.findFirst({
        where: { members: { some: { userId: user.id } } },
      });

      if (!tenant) {
        tenant = await tx.tenant.create({
          data: {
            name: "System Workspace",
            slug: `system-${user.id.slice(0, 8)}`,
          },
        });
      }

      // 3. 确保该用户在 tenant 里是 ADMIN
      const member = await tx.tenantMember.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        update: { role: "ADMIN" },
        create: {
          userId: user.id,
          tenantId: tenant.id,
          role: "ADMIN",
        },
      });

      return { user, tenant, member };
    });

    console.log("✅ Admin user ready:");
    console.log(` - User ID: ${result.user.id}`);
    console.log(` - Email: ${result.user.email}`);
    console.log(` - Display: ${result.user.displayName}`);
    console.log(` - Tenant ID: ${result.tenant.id}`);
    console.log(` - Role: ${result.member.role}`);
    console.log(" - Password: ******** (set via ADMIN_PASSWORD env)");
    console.log("");
    console.log("📝 Next steps:");
    console.log(" - 登录: POST /api/auth/login { email, password }");
    console.log(" - JWT exp: 9999-12-31T23:59:59Z (~270 years)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
