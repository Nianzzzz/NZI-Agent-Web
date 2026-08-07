/**
 * Seed Admin Script (T009)
 *
 * 用途：创建/更新一个永不过期的管理员账号，用于开发 / 演示 / 内部脚本。
 *
 * 行为：
 * - 邮箱: admin@nzilab.com (可用 ADMIN_EMAIL 覆盖)
 * - 密码: Admin@2026!  (可用 ADMIN_PASSWORD 覆盖)
 * - 角色: ADMIN (TenantMember.role = "ADMIN" — 但 Prisma 当前只支持 OWNER/ADMIN/MEMBER，ADMIN 已存在)
 * - JWT exp: 9999-12-31 (computeJwtExpiry 自动签发)
 *
 * 运行：
 *   pnpm tsx scripts/seed-admin.ts
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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin@2026!";
const ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME ?? "System Admin";

async function main() {
  const prisma = new PrismaClient();
  console.log(`🔧 Seeding admin user: ${ADMIN_EMAIL}`);

  try {
    const passwordHash = await hashPassword(ADMIN_PASSWORD);

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
    console.log(`   - User ID:   ${result.user.id}`);
    console.log(`   - Email:     ${result.user.email}`);
    console.log(`   - Display:   ${result.user.displayName}`);
    console.log(`   - Tenant ID: ${result.tenant.id}`);
    console.log(`   - Role:      ${result.member.role}`);
    console.log(`   - Password:  ${ADMIN_PASSWORD}`);
    console.log("");
    console.log("📝 Next steps:");
    console.log("   - 登录: POST /api/auth/login { email, password }");
    console.log("   - JWT exp: 9999-12-31T23:59:59Z (≈ 270 年后)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
