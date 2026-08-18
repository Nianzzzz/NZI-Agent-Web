/**
 * Phase 3 — MCP Controller
 *
 * 路由：
 * - GET    /api/mcp/servers         列出 MCP 服务器
 * - POST   /api/mcp/servers         添加 MCP 服务器
 * - GET    /api/mcp/servers/:id     获取单个服务器详情
 * - PUT    /api/mcp/servers/:id     编辑 MCP 服务器
 * - DELETE /api/mcp/servers/:id     删除 MCP 服务器
 * - POST   /api/mcp/servers/:id/connect   连接/重连
 * - POST   /api/mcp/servers/:id/disconnect 断开
 * - GET    /api/mcp/servers/:id/tools    查看可用工具
 * - GET    /api/mcp/presets         获取预设模板
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { TokenPayload } from "../config/auth.config.js";
import { McpService } from "../services/mcp.service.js";

const PRESET_SERVERS = [
  // ─── 官方 Anthropic MCP 服务器 ──────────────────────────────
  {
    name: "Filesystem",
    description: "安全的文件系统访问，读取/写入/列出文件，支持路径白名单",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-filesystem /path/to/allowed/dir",
    icon: "folder-open",
    category: "官方",
  },
  {
    name: "GitHub",
    description: "GitHub API 集成：搜索仓库、读取文件、管理 Issues 和 PR",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-github",
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "<your-token>" },
    icon: "github",
    category: "官方",
  },
  {
    name: "PostgreSQL",
    description: "PostgreSQL 数据库查询、表结构管理、SQL 执行",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-postgres",
    env: { DATABASE_URL: "postgresql://user:pass@host:5432/db" },
    icon: "database",
    category: "官方",
  },
  {
    name: "Slack",
    description: "Slack 工作空间集成：发送消息、管理频道、搜索历史",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-slack",
    env: { SLACK_BOT_TOKEN: "<your-token>" },
    icon: "message-square",
    category: "官方",
  },
  {
    name: "Brave Search",
    description: "Brave Search API 网页搜索，支持本地和全球结果",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-brave-search",
    env: { BRAVE_API_KEY: "<your-key>" },
    icon: "search",
    category: "官方",
  },
  {
    name: "Puppeteer",
    description: "浏览器自动化：截图、PDF 生成、网页交互",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-puppeteer",
    icon: "globe",
    category: "官方",
  },
  {
    name: "Google Maps",
    description: "Google Maps API：地理编码、路线规划、地点搜索",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-google-maps",
    env: { GOOGLE_MAPS_API_KEY: "<your-key>" },
    icon: "map-pin",
    category: "官方",
  },
  {
    name: "Memory",
    description: "持久化知识图谱存储，Agent 长期记忆管理",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-memory",
    icon: "brain",
    category: "官方",
  },
  {
    name: "EverArt",
    description: "AI 图像生成：通过提示词创建和编辑图片",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-everart",
    env: { EVERART_API_KEY: "<your-key>" },
    icon: "image",
    category: "官方",
  },
  {
    name: "Sequential Thinking",
    description: "结构化思维链推理，复杂问题逐步分解",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-sequential-thinking",
    icon: "git-branch",
    category: "官方",
  },
  {
    name: "Fetch",
    description: "HTTP 请求工具：GET/POST 网页内容抓取和 API 调用",
    transport: "stdio" as const,
    command: "npx -y @anthropic/mcp-server-fetch",
    icon: "download",
    category: "官方",
  },
  // ─── 社区热门 MCP 服务器 ──────────────────────────────────
  {
    name: "Notion",
    description: "Notion 工作空间集成：读写页面、数据库、Blocks",
    transport: "stdio" as const,
    command: "npx -y @notionhq/mcp-server-notion",
    env: { NOTION_API_KEY: "<your-key>" },
    icon: "file-text",
    category: "社区",
  },
  {
    name: "Jira",
    description: "Atlassian Jira 集成：Issue 管理、Sprint 追踪、看板",
    transport: "stdio" as const,
    command: "npx -y @sooperset/mcp-atlassian-jira",
    env: { JIRA_API_TOKEN: "<your-token>", JIRA_HOST: "https://your-domain.atlassian.net" },
    icon: "list-checks",
    category: "社区",
  },
  {
    name: "Linear",
    description: "Linear 项目管理集成：Issue 创建、查询、更新",
    transport: "stdio" as const,
    command: "npx -y @linear/mcp-server-linear",
    env: { LINEAR_API_KEY: "<your-key>" },
    icon: "list-checks",
    category: "社区",
  },
  {
    name: "Figma",
    description: "Figma 设计文件读取：组件、样式、设计 Token 提取",
    transport: "stdio" as const,
    command: "npx -y @figma/mcp-server-figma",
    env: { FIGMA_PERSONAL_ACCESS_TOKEN: "<your-token>" },
    icon: "pen-tool",
    category: "社区",
  },
  {
    name: "Docker",
    description: "Docker 容器管理：拉取镜像、启动/停止容器、查看日志",
    transport: "stdio" as const,
    command: "npx -y @docker/mcp-server-docker",
    icon: "container",
    category: "社区",
  },
  {
    name: "Kubernetes",
    description: "K8s 集群管理：Pod 操作、部署、配置查看",
    transport: "stdio" as const,
    command: "npx -y @flux/mcp-server-kubernetes",
    env: { KUBECONFIG: "~/.kube/config" },
    icon: "server",
    category: "社区",
  },
  {
    name: "AWS",
    description: "AWS 服务集成：S3、Lambda、EC2、CloudWatch 操作",
    transport: "stdio" as const,
    command: "npx -y @awslabs/mcp-server-aws",
    env: { AWS_ACCESS_KEY_ID: "<key>", AWS_SECRET_ACCESS_KEY: "<secret>", AWS_REGION: "us-east-1" },
    icon: "cloud",
    category: "社区",
  },
  {
    name: "Redis",
    description: "Redis 数据库操作：键值读写、缓存管理、发布订阅",
    transport: "stdio" as const,
    command: "npx -y @redis/mcp-server-redis",
    env: { REDIS_URL: "redis://localhost:6379" },
    icon: "database",
    category: "社区",
  },
  {
    name: "Elasticsearch",
    description: "Elasticsearch 搜索引擎：全文搜索、聚合查询、索引管理",
    transport: "stdio" as const,
    command: "npx -y @elastic/mcp-server-elasticsearch",
    env: { ELASTICSEARCH_URL: "http://localhost:9200" },
    icon: "search",
    category: "社区",
  },
  {
    name: "Stripe",
    description: "Stripe 支付集成：客户管理、订阅、发票查询",
    transport: "stdio" as const,
    command: "npx -y @stripe/mcp-server-stripe",
    env: { STRIPE_SECRET_KEY: "<your-key>" },
    icon: "credit-card",
    category: "社区",
  },
  {
    name: "SendGrid",
    description: "SendGrid 邮件服务：发送邮件、模板管理、统计",
    transport: "stdio" as const,
    command: "npx -y @sendgrid/mcp-server-sendgrid",
    env: { SENDGRID_API_KEY: "<your-key>" },
    icon: "mail",
    category: "社区",
  },
  {
    name: "Exa",
    description: "Exa AI 搜索：语义搜索、网页内容提取",
    transport: "stdio" as const,
    command: "npx -y @exa/mcp-server-exa",
    env: { EXA_API_KEY: "<your-key>" },
    icon: "search",
    category: "社区",
  },
  {
    name: "Tavily",
    description: "Tavily Search API：AI 优化的网页搜索和内容提取",
    transport: "stdio" as const,
    command: "npx -y @tavily/mcp-server-tavily",
    env: { TAVILY_API_KEY: "<your-key>" },
    icon: "search",
    category: "社区",
  },
  {
    name: "SerpAPI",
    description: "Google 搜索结果：实时搜索、知识图谱、图片搜索",
    transport: "stdio" as const,
    command: "npx -y @serpapi/mcp-server-serpapi",
    env: { SERPAPI_API_KEY: "<your-key>" },
    icon: "search",
    category: "社区",
  },
  {
    name: "Supabase",
    description: "Supabase 后端集成：数据库、认证、存储、Edge Functions",
    transport: "stdio" as const,
    command: "npx -y @supabase/mcp-server-supabase",
    env: { SUPABASE_URL: "https://xxx.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "<key>" },
    icon: "database",
    category: "社区",
  },
  {
    name: "Firecrawl",
    description: "网页抓取和爬虫：整站抓取、Markdown 转换、搜索",
    transport: "stdio" as const,
    command: "npx -y @firecrawl/mcp-server-firecrawl",
    env: { FIRECRAWL_API_KEY: "<your-key>" },
    icon: "globe",
    category: "社区",
  },
  {
    name: "Obsidian",
    description: "Obsidian 笔记集成：读写笔记、搜索、知识图谱",
    transport: "stdio" as const,
    command: "npx -y @obsidian/mcp-server-obsidian",
    env: { OBSIDIAN_VAULT_PATH: "/path/to/vault" },
    icon: "book-open",
    category: "社区",
  },
  {
    name: "Playwright",
    description: "Playwright 浏览器自动化：e2e 测试、表单填充、截图",
    transport: "stdio" as const,
    command: "npx -y @playwright/mcp-server-playwright",
    icon: "monitor",
    category: "社区",
  },
  {
    name: "Airtable",
    description: "Airtable 数据库集成：读写 Base、表和记录",
    transport: "stdio" as const,
    command: "npx -y @airtable/mcp-server-airtable",
    env: { AIRTABLE_API_KEY: "<your-key>" },
    icon: "table",
    category: "社区",
  },
  {
    name: "Todoist",
    description: "Todoist 任务管理：创建/查询/完成任务、项目管理",
    transport: "stdio" as const,
    command: "npx -y @todoist/mcp-server-todoist",
    env: { TODOIST_API_TOKEN: "<your-token>" },
    icon: "check-square",
    category: "社区",
  },
];

export class McpController {
  constructor(private mcpService: McpService) {}

  /** GET /api/mcp/servers */
  async list(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });
    const servers = await this.mcpService.list(user.tenantId);
    return reply.send({ servers });
  }

  /** POST /api/mcp/servers */
  async create(
    req: FastifyRequest<{
      Body: {
        name: string;
        description?: string;
        transport: "stdio" | "sse" | "streamable";
        command?: string;
        url?: string;
        env?: Record<string, string>;
        isEnabled?: boolean;
      };
    }>,
    reply: FastifyReply,
  ) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const { name, transport } = req.body;
    if (!name?.trim()) return reply.status(400).send({ error: "name 不能为空" });
    if (!["stdio", "sse", "streamable"].includes(transport)) {
      return reply.status(400).send({ error: "transport 必须是 stdio, sse 或 streamable" });
    }

    const server = await this.mcpService.create({
      tenantId: user.tenantId,
      name: name.trim(),
      description: req.body.description,
      transport,
      command: req.body.command,
      url: req.body.url,
      env: req.body.env,
      isEnabled: req.body.isEnabled,
    });
    return reply.status(201).send({ server });
  }

  /** GET /api/mcp/servers/:id */
  async get(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const server = await this.mcpService.getById(req.params.id, user.tenantId);
    if (!server) return reply.status(404).send({ error: "MCP 服务器不存在" });
    return reply.send({ server });
  }

  /** PUT /api/mcp/servers/:id */
  async update(
    req: FastifyRequest<{
      Params: { id: string };
      Body: {
        name?: string;
        description?: string;
        transport?: "stdio" | "sse" | "streamable";
        command?: string;
        url?: string;
        env?: Record<string, string>;
        isEnabled?: boolean;
      };
    }>,
    reply: FastifyReply,
  ) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const server = await this.mcpService.update(req.params.id, req.body, user.tenantId);
    if (!server) return reply.status(404).send({ error: "MCP 服务器不存在或无权限" });
    return reply.send({ server });
  }

  /** DELETE /api/mcp/servers/:id */
  async delete(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const ok = await this.mcpService.delete(req.params.id, user.tenantId);
    if (!ok) return reply.status(404).send({ error: "MCP 服务器不存在或无权限" });
    return reply.send({ ok: true });
  }

  /** POST /api/mcp/servers/:id/connect */
  async connect(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    try {
      const tools = await this.mcpService.connect(req.params.id, user.tenantId);
      return reply.send({ tools });
    } catch {
      return reply.status(500).send({ error: "连接失败" });
    }
  }

  /** POST /api/mcp/servers/:id/disconnect */
  async disconnect(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    await this.mcpService.disconnect(req.params.id, user.tenantId);
    return reply.send({ ok: true });
  }

  /** GET /api/mcp/servers/:id/tools */
  async getTools(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const server = await this.mcpService.getById(req.params.id, user.tenantId);
    if (!server) return reply.status(404).send({ error: "MCP 服务器不存在" });
    return reply.send({ tools: server.tools });
  }

  /** GET /api/mcp/presets */
  async getPresets(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send({ presets: PRESET_SERVERS });
  }
}