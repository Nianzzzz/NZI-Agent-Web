/**
 * Phase 3 — Skill Service
 *
 * 职责：Skill 市场的 CRUD 管理 + 用户安装/卸载 + 聊天注入
 *
 * 设计：
 * - 系统内置 Skill 由 seed 脚本初始化
 * - 用户可创建自定义 Skill（私有或公开）
 * - 安装后的 Skill 在聊天时自动注入到 system prompt
 */

import type { PrismaClient } from "@prisma/client";

export interface SkillInput {
  tenantId?: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  icon?: string;
  tags?: string[];
  prompt: string;
  tools?: string[];
  isPublic?: boolean;
}

export interface SkillOutput {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  version: string;
  author: string;
  authorType: string;
  icon: string;
  tags: string[];
  prompt: string;
  tools: string[];
  downloads: number;
  rating: number;
  isPublic: boolean;
  isInstalled?: boolean;
  isEnabled?: boolean;
  createdAt: string;
}

/** 系统内置 Skill 定义（首次启动时自动写入 DB） */
const SYSTEM_SKILLS: Array<Omit<SkillInput, "tenantId">> = [
  {
    name: "code-reviewer",
    displayName: "Code Reviewer",
    description: "代码审查专家，检查 bug、安全漏洞、性能问题和代码风格",
    category: "coding",
    icon: "code",
    tags: ["code", "review", "security", "bug"],
    prompt: "你是一个专业的代码审查专家。当用户发送代码时，请从以下维度进行审查：1) 潜在 bug 和边界条件 2) 安全漏洞（注入、XSS、敏感数据泄露）3) 性能问题（N+1 查询、不必要的重计算）4) 代码可读性和最佳实践。给出具体问题和改进建议，优先列出严重问题。",
    tools: [],
    isPublic: true,
  },
  {
    name: "api-designer",
    displayName: "API Designer",
    description: "RESTful API 设计规范指导，帮助设计优雅的接口",
    category: "coding",
    icon: "server",
    tags: ["api", "rest", "design"],
    prompt: "你是一个 RESTful API 设计专家。帮助用户设计清晰、一致、可扩展的 API。遵循以下原则：使用名词复数作为资源名、正确使用 HTTP 方法（GET/POST/PUT/PATCH/DELETE）、合理的状态码、版本控制（/api/v1/）、分页和过滤、统一的错误响应格式。",
    tools: [],
    isPublic: true,
  },
  {
    name: "tech-writer",
    displayName: "Tech Writer",
    description: "技术文档撰写与优化专家",
    category: "writing",
    icon: "file-text",
    tags: ["writing", "docs", "readme"],
    prompt: "你是一个专业的技术文档写作者。帮助用户撰写清晰的 README、API 文档、架构设计文档。遵循原则：简洁明了、结构清晰、示例丰富、面向目标读者。善用标题层级、代码块、表格和列表。",
    tools: [],
    isPublic: true,
  },
  {
    name: "data-analyst",
    displayName: "Data Analyst",
    description: "数据分析和可视化建议专家",
    category: "analysis",
    icon: "bar-chart-3",
    tags: ["data", "analysis", "sql", "visualization"],
    prompt: "你是一个数据分析师。帮助用户理解数据、设计分析方案、编写 SQL 查询、选择合适的可视化方式。解释数据趋势、异常值、相关性。给出可执行的洞察建议。",
    tools: [],
    isPublic: true,
  },
  {
    name: "devops-helper",
    displayName: "DevOps Helper",
    description: "CI/CD 流水线、Docker、K8s 配置专家",
    category: "devops",
    icon: "terminal",
    tags: ["devops", "docker", "k8s", "ci-cd"],
    prompt: "你是一个 DevOps 专家。帮助用户编写 Dockerfile、docker-compose、Kubernetes manifests、CI/CD 流水线（GitHub Actions、GitLab CI）。关注安全性、可维护性和最佳实践。",
    tools: [],
    isPublic: true,
  },
  {
    name: "security-auditor",
    displayName: "Security Auditor",
    description: "安全漏洞扫描与修复建议",
    category: "coding",
    icon: "shield",
    tags: ["security", "audit", "owasp"],
    prompt: "你是一个安全审计专家。基于 OWASP Top 10 检查代码和架构中的安全漏洞：注入攻击、认证授权问题、敏感数据泄露、XXE、SSRF、不安全的反序列化等。给出具体的修复方案和代码示例。",
    tools: [],
    isPublic: true,
  },
  {
    name: "sql-optimizer",
    displayName: "SQL Optimizer",
    description: "SQL 查询性能优化专家",
    category: "coding",
    icon: "database",
    tags: ["sql", "performance", "database"],
    prompt: "你是一个 SQL 优化专家。分析 SQL 查询的执行计划，识别性能瓶颈：缺失索引、全表扫描、不合理的 JOIN 顺序、N+1 查询等。给出优化后的查询和索引建议，解释优化原理。",
    tools: [],
    isPublic: true,
  },
  {
    name: "prd-writer",
    displayName: "PRD Writer",
    description: "产品需求文档撰写专家",
    category: "writing",
    icon: "book-open",
    tags: ["prd", "product", "requirements"],
    prompt: "你是一个产品需求文档（PRD）撰写专家。帮助用户编写结构化的 PRD，包含：背景与目标、用户故事、功能需求、非功能需求（性能、安全、可用性）、验收标准、里程碑计划。语言简洁专业。",
    tools: [],
    isPublic: true,
  },
  {
    name: "unit-test-gen",
    displayName: "Unit Test Generator",
    description: "自动生成单元测试，覆盖边界条件",
    category: "coding",
    icon: "check-square",
    tags: ["testing", "unit-test", "jest", "vitest"],
    prompt: "你是一个测试专家。为给定代码生成全面的单元测试。遵循 AAA 模式（Arrange-Act-Assert），覆盖正常路径、边界条件、异常场景。使用用户项目中的测试框架（Jest/Vitest/Pytest 等），保持与现有测试风格一致。",
    tools: [],
    isPublic: true,
  },
  {
    name: "regex-expert",
    displayName: "Regex Expert",
    description: "正则表达式编写与调试专家",
    category: "coding",
    icon: "terminal",
    tags: ["regex", "pattern", "validation"],
    prompt: "你是一个正则表达式专家。帮助用户编写、调试、优化正则表达式。解释每个部分的含义，提供测试用例，指出潜在的贪婪匹配、回溯等问题。支持多种正则方言（PCRE、JavaScript、Python）。",
    tools: [],
    isPublic: true,
  },
  {
    name: "git-helper",
    displayName: "Git Helper",
    description: "Git 工作流、分支策略、冲突解决专家",
    category: "devops",
    icon: "git-branch",
    tags: ["git", "branch", "merge", "rebase"],
    prompt: "你是一个 Git 专家。帮助用户解决分支管理、合并冲突、rebase、cherry-pick、reset、stash 等问题。解释命令原理，给出安全操作建议，避免数据丢失。",
    tools: [],
    isPublic: true,
  },
  {
    name: "interview-coach",
    displayName: "Interview Coach",
    description: "技术面试模拟教练，算法与系统设计",
    category: "custom",
    icon: "brain",
    tags: ["interview", "algorithm", "system-design"],
    prompt: "你是一个技术面试教练。模拟 FAANG 级别的技术面试：算法题（引导式提问而非直接给答案）、系统设计（从需求澄清到架构设计）、行为面试。给出评估反馈和改进建议。",
    tools: [],
    isPublic: true,
  },
];

export class SkillService {
  constructor(private prisma: PrismaClient) {}

  /** 启动时自动注入系统内置 Skill（幂等） */
  async seedSystemSkills(): Promise<void> {
    try {
      const existing = await this.prisma.skill.count({
        where: { authorType: "system" },
      });
      if (existing > 0) return; // 已存在，跳过

      for (const skill of SYSTEM_SKILLS) {
        await this.prisma.skill.upsert({
          where: { name: skill.name },
          update: {
            displayName: skill.displayName,
            description: skill.description,
            category: skill.category,
            icon: skill.icon ?? "sparkles",
            tags: (skill.tags ?? []) as never,
            prompt: skill.prompt,
            tools: (skill.tools ?? []) as never,
            isPublic: skill.isPublic ?? true,
          },
          create: {
            name: skill.name,
            displayName: skill.displayName,
            description: skill.description,
            category: skill.category,
            icon: skill.icon ?? "sparkles",
            tags: (skill.tags ?? []) as never,
            prompt: skill.prompt,
            tools: (skill.tools ?? []) as never,
            author: "system",
            authorType: "system",
            isPublic: skill.isPublic ?? true,
            version: "1.0.0",
            downloads: 0,
            rating: 0,
          },
        });
      }
      console.log(`[skill] Seeded ${SYSTEM_SKILLS.length} system skills`);
    } catch (err) {
      console.error("[skill] Failed to seed system skills:", err);
    }
  }

  /** 浏览 Skill 市场（公开 + 用户自建） */
  async list(params: {
    category?: string;
    search?: string;
    sort?: "popular" | "newest" | "rating";
    userId?: string;
  }): Promise<SkillOutput[]> {
    const where: Record<string, unknown> = { isPublic: true };
    if (params.category) where.category = params.category;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { displayName: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
      ];
    }

    let orderBy: Record<string, string> = {};
    switch (params.sort) {
      case "popular": orderBy = { downloads: "desc" }; break;
      case "rating": orderBy = { rating: "desc" }; break;
      default: orderBy = { createdAt: "desc" };
    }

    const skills = await this.prisma.skill.findMany({
      where: where as never,
      orderBy: orderBy as never,
      take: 100,
    });

    // 查询用户安装状态
    let installedMap = new Map<string, { enabled: boolean }>();
    if (params.userId) {
      const installed = await this.prisma.userSkill.findMany({
        where: { userId: params.userId },
        select: { skillId: true, enabled: true },
      });
      for (const i of installed) {
        installedMap.set(i.skillId, { enabled: i.enabled });
      }
    }

    return skills.map((s) => ({
      id: s.id,
      name: s.name,
      displayName: s.displayName,
      description: s.description,
      category: s.category,
      version: s.version,
      author: s.author,
      authorType: s.authorType,
      icon: s.icon,
      tags: (s.tags as string[]) ?? [],
      prompt: s.prompt,
      tools: (s.tools as string[]) ?? [],
      downloads: s.downloads,
      rating: s.rating,
      isPublic: s.isPublic,
      isInstalled: installedMap.has(s.id),
      isEnabled: installedMap.get(s.id)?.enabled,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  /** 获取单个 Skill 详情 */
  async getById(id: string): Promise<SkillOutput | null> {
    const s = await this.prisma.skill.findUnique({ where: { id } });
    if (!s) return null;
    return {
      id: s.id,
      name: s.name,
      displayName: s.displayName,
      description: s.description,
      category: s.category,
      version: s.version,
      author: s.author,
      authorType: s.authorType,
      icon: s.icon,
      tags: (s.tags as string[]) ?? [],
      prompt: s.prompt,
      tools: (s.tools as string[]) ?? [],
      downloads: s.downloads,
      rating: s.rating,
      isPublic: s.isPublic,
      createdAt: s.createdAt.toISOString(),
    };
  }

  /** 创建自定义 Skill */
  async create(input: SkillInput, userId: string, tenantId: string): Promise<SkillOutput> {
    const s = await this.prisma.skill.create({
      data: {
        name: input.name,
        displayName: input.displayName,
        description: input.description,
        category: input.category,
        icon: input.icon ?? "sparkles",
        tags: (input.tags ?? []) as never,
        prompt: input.prompt,
        tools: (input.tools ?? []) as never,
        author: userId,
        authorType: "user",
        isPublic: input.isPublic ?? false,
        tenantId: input.tenantId ?? tenantId,
      },
    });
    return {
      id: s.id,
      name: s.name,
      displayName: s.displayName,
      description: s.description,
      category: s.category,
      version: s.version,
      author: s.author,
      authorType: s.authorType,
      icon: s.icon,
      tags: (s.tags as string[]) ?? [],
      prompt: s.prompt,
      tools: (s.tools as string[]) ?? [],
      downloads: s.downloads,
      rating: s.rating,
      isPublic: s.isPublic,
      createdAt: s.createdAt.toISOString(),
    };
  }

  /** 编辑 Skill（仅作者） */
  async update(
    id: string,
    input: Partial<SkillInput>,
    userId: string,
  ): Promise<SkillOutput | null> {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill || skill.author !== userId) return null;

    const s = await this.prisma.skill.update({
      where: { id },
      data: {
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.icon !== undefined && { icon: input.icon }),
        ...(input.tags !== undefined && { tags: input.tags as never }),
        ...(input.prompt !== undefined && { prompt: input.prompt }),
        ...(input.tools !== undefined && { tools: input.tools as never }),
        ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
      },
    });
    return {
      id: s.id,
      name: s.name,
      displayName: s.displayName,
      description: s.description,
      category: s.category,
      version: s.version,
      author: s.author,
      authorType: s.authorType,
      icon: s.icon,
      tags: (s.tags as string[]) ?? [],
      prompt: s.prompt,
      tools: (s.tools as string[]) ?? [],
      downloads: s.downloads,
      rating: s.rating,
      isPublic: s.isPublic,
      createdAt: s.createdAt.toISOString(),
    };
  }

  /** 删除 Skill（仅作者） */
  async delete(id: string, userId: string): Promise<boolean> {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill || skill.author !== userId) return false;
    await this.prisma.skill.delete({ where: { id } });
    return true;
  }

  /** 安装 Skill */
  async install(skillId: string, userId: string): Promise<void> {
    await this.prisma.userSkill.upsert({
      where: { userId_skillId: { userId, skillId } },
      create: { userId, skillId },
      update: { enabled: true },
    });
    await this.prisma.skill.update({
      where: { id: skillId },
      data: { downloads: { increment: 1 } },
    });
  }

  /** 卸载 Skill */
  async uninstall(skillId: string, userId: string): Promise<void> {
    await this.prisma.userSkill.deleteMany({
      where: { userId, skillId },
    });
  }

  /** 切换启用/禁用 */
  async toggleEnabled(skillId: string, userId: string, enabled: boolean): Promise<void> {
    await this.prisma.userSkill.updateMany({
      where: { userId, skillId },
      data: { enabled },
    });
  }

  /** 获取用户已安装的 Skill 列表 */
  async getInstalled(userId: string): Promise<SkillOutput[]> {
    const installed = await this.prisma.userSkill.findMany({
      where: { userId },
      include: { skill: true },
      orderBy: { createdAt: "desc" },
    });
    return installed.map((i) => ({
      id: i.skill.id,
      name: i.skill.name,
      displayName: i.skill.displayName,
      description: i.skill.description,
      category: i.skill.category,
      version: i.skill.version,
      author: i.skill.author,
      authorType: i.skill.authorType,
      icon: i.skill.icon,
      tags: (i.skill.tags as string[]) ?? [],
      prompt: i.skill.prompt,
      tools: (i.skill.tools as string[]) ?? [],
      downloads: i.skill.downloads,
      rating: i.skill.rating,
      isPublic: i.skill.isPublic,
      isInstalled: true,
      isEnabled: i.enabled,
      createdAt: i.skill.createdAt.toISOString(),
    }));
  }
}