/**
 * Session Service
 *
 * 职责：Session 和 Message 的 CRUD 操作。
 * 所有数据库访问在此层集中处理，Controller 只做参数校验和响应格式化。
 */

import type { PrismaClient } from "@prisma/client";

export interface CreateSessionInput {
  tenantId: string;
  userId: string;
  title?: string;
  engine?: "PI" | "GROK";
}

export interface CreateMessageInput {
  id?: string;
  sessionId: string;
  role: "USER" | "ASSISTANT" | "TOOL_RESULT";
  content: string;
  reasoning?: string;
  toolCalls?: unknown;
  tokenUsage?: { prompt: number; completion: number; total: number };
  latencyMs?: number;
  rootEventId?: string;
  status?: "COMPLETED" | "INTERRUPTED";
  /** T010: Agent Loop Timeline 节点（thinking/tool/answer 的完整事件流），落库后用于历史回放 */
  timelineNodes?: unknown;
}

export class SessionService {
  constructor(private prisma: PrismaClient) {}

  // ─── Session CRUD ─────────────────────────────────────────────

  /**
   * 创建新会话
   */
  async createSession(input: CreateSessionInput) {
    return this.prisma.session.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        title: input.title ?? "新会话",
        engine: input.engine ?? "PI",
        status: "ACTIVE",
      },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });
  }

  /**
   * 获取租户下的会话列表
   */
  async listSessions(tenantId: string, userId?: string) {
    return this.prisma.session.findMany({
      where: {
        tenantId,
        ...(userId ? { userId } : {}),
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  }

  /**
   * 获取单个会话详情
   */
  async getSession(sessionId: string, tenantId: string) {
    return this.prisma.session.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });
  }

  /**
   * 删除单条消息（用户或 assistant 均可）
   * 用于移除中断后留下的空消息或用户误发的消息。
   */
  async deleteMessage(messageId: string, tenantId: string) {
    // 先确认消息属于该租户（通过 session 关联）
    const [msg] = await this.prisma.message.findMany({
      where: { id: messageId },
      select: { sessionId: true, session: { select: { tenantId: true } } },
      take: 1,
    });
    if (!msg || msg.session.tenantId !== tenantId) return null;
    return this.prisma.message.delete({ where: { id: messageId } });
  }

  /**
   * 重命名会话（租户隔离）
   */
  async renameSession(sessionId: string, tenantId: string, title: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) return null;
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { title },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });
  }

  /**
   * 根据用户提问自动生成会话标题（取前 N 个字符截断）
   */
  async autoTitle(sessionId: string, tenantId: string, prompt: string): Promise<void> {
    const title = prompt.trim().slice(0, 30) + (prompt.trim().length > 30 ? "…" : "");
    await this.prisma.session.updateMany({
      where: { id: sessionId, tenantId, title: "新会话" },
      data: { title },
    });
  }

  /**
   * 永久删除会话（硬删除 + 关联消息级联删除）
   */
  async archiveSession(sessionId: string, tenantId: string) {
    // 先删关联消息，再删会话（事务保证原子性）
    return this.prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({ where: { sessionId } });
      const session = await tx.session.delete({
        where: { id: sessionId },
        select: { id: true, status: true },
      });
      return session;
    });
  }

  // ─── Message CRUD ─────────────────────────────────────────────

  /**
   * 创建消息（写入 User/AI/Tool 的对话消息）
   */
  async createMessage(input: CreateMessageInput) {
    return this.prisma.message.create({
      data: {
        id: input.id, // 允许调用方指定 ID（如前端 requestId），否则 Prisma 自动生成
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        reasoning: input.reasoning,
        toolCalls: input.toolCalls as never,
        tokenUsage: input.tokenUsage as never,
        latencyMs: input.latencyMs,
        rootEventId: input.rootEventId ?? null,
        status: input.status ?? "COMPLETED",
        timelineNodes: input.timelineNodes as never,
      },
    });
  }

  /**
   * 批量创建消息（用于流式结束后批量落库）
   */
  async createMessages(inputs: CreateMessageInput[]) {
    return this.prisma.$transaction(
      inputs.map((input) =>
        this.prisma.message.create({
          data: {
            sessionId: input.sessionId,
            role: input.role,
            content: input.content,
            reasoning: input.reasoning,
            toolCalls: input.toolCalls as never,
            tokenUsage: input.tokenUsage as never,
            latencyMs: input.latencyMs,
            rootEventId: input.rootEventId ?? null,
            status: input.status ?? "COMPLETED",
            timelineNodes: input.timelineNodes as never,
          },
        }),
      ),
    );
  }

  /**
   * 获取会话的历史消息
   */
  async getMessages(sessionId: string, tenantId: string, limit = 100) {
    // 先验证会话属于该租户
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, tenantId },
      select: { id: true },
    });
    if (!session) return [];

    return this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }
}
