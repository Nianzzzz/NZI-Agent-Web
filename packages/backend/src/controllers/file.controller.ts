/**
 * NZi Agent Web — 文件上传 Controller
 *
 * 用途：接收前端上传的文件，保存到服务端临时目录（按 sessionId 隔离），
 * 返回文件路径，供 Agent 的 read_file / edit_file 等工具使用。
 *
 * 安全：
 * - 单文件最大 10 MiB（由 @fastify/multipart 插件层限制）
 * - 文件名做安全清洗（去除路径分隔符、.. 等），防止路径穿越
 * - 按 sessionId 隔离存储目录，避免跨会话访问
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";

const UPLOAD_BASE_DIR = path.join(
  process.env.RUNTIME_TMPDIR ?? process.env.TMPDIR ?? "/tmp",
  "nzi-uploads",
);

/** 清洗文件名：去除路径分隔符和危险字符，防止路径穿越 */
function sanitizeFilename(name: string): string {
  const base = path.basename(name.replace(/[/\\:*?"<>|]/g, "_"));
  return `${randomUUID()}_${base}`;
}

export class FileController {
  /**
   * POST /api/files/upload?sessionId=xxx
   *
   * multipart/form-data: file (binary)
   * 返回: { filePath, filename, size, mimeType }
   */
  async upload(request: FastifyRequest, reply: FastifyReply) {
    const sessionId = (request.query as { sessionId?: string }).sessionId;
    if (!sessionId) {
      return reply.status(400).send({ error: "缺少 sessionId 参数" });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "未收到文件" });
    }

    // 安全清洗文件名
    const safeName = sanitizeFilename(data.filename);
    const sessionDir = path.join(UPLOAD_BASE_DIR, sessionId);
    const filePath = path.join(sessionDir, safeName);

    // 确保目录存在
    await fs.mkdir(sessionDir, { recursive: true });

    // 流式写入文件
    const fileStream = await fs.open(filePath, "w");
    const writeStream = fileStream.createWriteStream();
    let bytesWritten = 0;

    try {
      await new Promise<void>((resolve, reject) => {
        data.file.on("data", (chunk: Buffer) => {
          bytesWritten += chunk.length;
        });
        data.file.pipe(writeStream);
        writeStream.on("finish", () => resolve());
        writeStream.on("error", (err) => reject(err));
        data.file.on("error", (err) => reject(err));
      });
    } catch (err) {
      await fs.unlink(filePath).catch(() => {});
      const msg = err instanceof Error ? err.message : "文件写入失败";
      return reply.status(500).send({ error: msg });
    } finally {
      await fileStream.close();
    }

    return {
      filePath,
      filename: data.filename,
      size: bytesWritten,
      mimeType: data.mimetype,
    };
  }
}
