/**
 * Phase 3 — MCP (Model Context Protocol) Service
 *
 * 职责：管理 MCP 服务器的生命周期（CRUD + 连接管理 + 工具发现）
 *
 * 设计：
 * - 支持 stdio 和 SSE 两种传输方式
 * - 工具列表缓存在内存中，按需更新
 * - 首次连接失败时优雅降级，不影响 Agent 正常对话
 */

import type { PrismaClient } from "@prisma/client";

export interface McpServerInput {
  tenantId: string;
  name: string;
  description?: string;
  transport: "stdio" | "sse" | "streamable";
  command?: string; // stdio 传输的命令
  url?: string; // SSE/streamable 传输的 URL
  env?: Record<string, string>;
  isEnabled?: boolean;
}

export interface McpServerOutput {
  id: string;
  name: string;
  description: string | null;
  transport: string;
  command: string | null;
  url: string | null;
  env: Record<string, string> | null;
  isEnabled: boolean;
  status: "disconnected" | "connecting" | "connected" | "error";
  tools: McpToolInfo[];
  createdAt: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class McpService {
  /** 工具缓存：serverId → tools */
  private toolCache = new Map<string, McpToolInfo[]>();
  /** 连接状态：serverId → status */
  private connections = new Map<string, "disconnected" | "connecting" | "connected" | "error">();

  constructor(private prisma: PrismaClient) {}

  /** 列出租户的所有 MCP 服务器 */
  async list(tenantId: string): Promise<McpServerOutput[]> {
    const servers = await this.prisma.mcpServer.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return servers.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      transport: s.transport,
      command: s.command,
      url: s.url,
      env: s.env as Record<string, string> | null,
      isEnabled: s.isEnabled,
      status: this.connections.get(s.id) ?? "disconnected",
      tools: this.toolCache.get(s.id) ?? [],
      createdAt: s.createdAt.toISOString(),
    }));
  }

  /** 添加 MCP 服务器 */
  async create(input: McpServerInput): Promise<McpServerOutput> {
    // 去重：同一租户下不允许同名服务器重复添加
    const existing = await this.prisma.mcpServer.findFirst({
      where: { tenantId: input.tenantId, name: input.name },
    });
    if (existing) {
      // 返回已有服务器（幂等），而不是抛出错误，让前端可以感知"已存在"
      return {
        id: existing.id,
        name: existing.name,
        description: existing.description,
        transport: existing.transport,
        command: existing.command,
        url: existing.url,
        env: existing.env as Record<string, string> | null,
        isEnabled: existing.isEnabled,
        status: this.connections.get(existing.id) ?? "disconnected",
        tools: this.toolCache.get(existing.id) ?? [],
        createdAt: existing.createdAt.toISOString(),
      };
    }

    const s = await this.prisma.mcpServer.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        description: input.description ?? null,
        transport: input.transport,
        command: input.command ?? null,
        url: input.url ?? null,
        env: (input.env ?? null) as unknown as Parameters<typeof this.prisma.mcpServer.create>[0]["data"]["env"],
        isEnabled: input.isEnabled ?? true,
      },
    });
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      transport: s.transport,
      command: s.command,
      url: s.url,
      env: s.env as Record<string, string> | null,
      isEnabled: s.isEnabled,
      status: "disconnected",
      tools: [],
      createdAt: s.createdAt.toISOString(),
    };
  }

  /** 更新 MCP 服务器 */
  async update(
    id: string,
    input: Partial<McpServerInput>,
    tenantId: string,
  ): Promise<McpServerOutput | null> {
    const existing = await this.prisma.mcpServer.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return null;

    const s = await this.prisma.mcpServer.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.transport !== undefined && { transport: input.transport }),
        ...(input.command !== undefined && { command: input.command }),
        ...(input.url !== undefined && { url: input.url }),
        ...(input.env !== undefined && { env: input.env as unknown as Parameters<typeof this.prisma.mcpServer.update>[0]["data"]["env"] }),
        ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
      },
    });
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      transport: s.transport,
      command: s.command,
      url: s.url,
      env: s.env as Record<string, string> | null,
      isEnabled: s.isEnabled,
      status: this.connections.get(s.id) ?? "disconnected",
      tools: this.toolCache.get(s.id) ?? [],
      createdAt: s.createdAt.toISOString(),
    };
  }

  /** 删除 MCP 服务器 */
  async delete(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.prisma.mcpServer.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return false;
    await this.prisma.mcpServer.delete({ where: { id } });
    this.toolCache.delete(id);
    this.connections.delete(id);
    return true;
  }

  /** 获取单个 MCP 服务器 */
  async getById(id: string, tenantId: string): Promise<McpServerOutput | null> {
    const s = await this.prisma.mcpServer.findFirst({
      where: { id, tenantId },
    });
    if (!s) return null;
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      transport: s.transport,
      command: s.command,
      url: s.url,
      env: s.env as Record<string, string> | null,
      isEnabled: s.isEnabled,
      status: this.connections.get(s.id) ?? "disconnected",
      tools: this.toolCache.get(s.id) ?? [],
      createdAt: s.createdAt.toISOString(),
    };
  }

  /**
   * 尝试连接 MCP 服务器。
   *
   * 当前实现：对 stdio 传输返回模拟的工具列表（因为 MCP SDK 需要额外依赖）。
   * 生产环境应使用 @modelcontextprotocol/sdk 进行真正的连接和工具发现。
   */
  async connect(id: string, tenantId: string): Promise<McpToolInfo[]> {
    const s = await this.prisma.mcpServer.findFirst({
      where: { id, tenantId },
    });
    if (!s) throw new Error("MCP 服务器不存在");

    this.connections.set(id, "connecting");

    try {
      // 模拟工具发现：根据服务器名称推断可用工具
      // 生产环境替换为 @modelcontextprotocol/sdk 的实际连接逻辑
      const tools = this._simulateToolDiscovery(s.name, s.transport, s.command ?? "");
      this.toolCache.set(id, tools);
      this.connections.set(id, "connected");
      return tools;
    } catch {
      this.connections.set(id, "error");
      this.toolCache.set(id, []);
      throw new Error("连接失败");
    }
  }

  /** 获取所有启用的 MCP 服务器的工具列表（用于注入到 Agent system prompt） */
  async getAggregatedTools(tenantId: string): Promise<
    Array<{ serverName: string; serverId: string; tools: McpToolInfo[] }>
  > {
    const servers = await this.prisma.mcpServer.findMany({
      where: { tenantId, isEnabled: true },
    });
    return servers.map((s) => ({
      serverName: s.name,
      serverId: s.id,
      tools: this.toolCache.get(s.id) ?? [],
    }));
  }

  /** 断开 MCP 服务器 */
  async disconnect(id: string, tenantId: string): Promise<void> {
    const s = await this.prisma.mcpServer.findFirst({
      where: { id, tenantId },
    });
    if (!s) return;
    this.connections.set(id, "disconnected");
    this.toolCache.delete(id);
  }

  /** 模拟工具发现（生产环境替换为真实 MCP 连接） */
  private _simulateToolDiscovery(
    name: string,
    _transport: string,
    command: string,
  ): McpToolInfo[] {
    const nameLower = name.toLowerCase();

    // 根据命令或名称推断工具
    if (command.includes("filesystem") || nameLower.includes("filesystem")) {
      return [
        { name: "read_file", description: "读取文件内容", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
        { name: "write_file", description: "写入文件", inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } } } },
        { name: "list_directory", description: "列出目录内容", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
      ];
    }

    if (command.includes("github") || nameLower.includes("github")) {
      return [
        { name: "search_repositories", description: "搜索 GitHub 仓库", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
        { name: "get_file_contents", description: "获取仓库文件内容", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" } } } },
        { name: "create_issue", description: "创建 Issue", inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, title: { type: "string" }, body: { type: "string" } } } },
      ];
    }

    if (command.includes("postgres") || nameLower.includes("postgres") || nameLower.includes("database")) {
      return [
        { name: "query", description: "执行 SQL 查询", inputSchema: { type: "object", properties: { sql: { type: "string" } } } },
        { name: "list_tables", description: "列出所有表", inputSchema: { type: "object", properties: {} } },
        { name: "describe_table", description: "查看表结构", inputSchema: { type: "object", properties: { table: { type: "string" } } } },
      ];
    }

    if (command.includes("slack") || nameLower.includes("slack")) {
      return [
        { name: "send_message", description: "发送 Slack 消息", inputSchema: { type: "object", properties: { channel: { type: "string" }, text: { type: "string" } } } },
        { name: "list_channels", description: "列出频道", inputSchema: { type: "object", properties: {} } },
      ];
    }

    // 默认通用工具
    return [
      { name: "echo", description: "回显输入内容", inputSchema: { type: "object", properties: { text: { type: "string" } } } },
      { name: "get_time", description: "获取当前时间", inputSchema: { type: "object", properties: {} } },
    ];
  }
}