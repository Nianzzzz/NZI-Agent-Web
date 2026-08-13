/**
 * NZi Agent Web — Tool Registry
 *
 * 定义 Agent 可调用的工具集合。每个工具包含：
 * - name: 工具名称（模型调用时使用）
 * - description: 工具描述（供模型理解何时调用）
 * - parameters: JSON Schema（供模型理解参数结构）
 * - execute: 实际执行函数
 *
 * 当前工具：
 * - read_file: 读取文件内容
 * - run_shell: 执行 shell 命令
 * - edit_file: 编辑文件（替换文本）
 * - grep: 在文件中搜索文本
 * - find: 查找文件
 */

import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  workingDirectory: string;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

/** 将 ToolDefinition 转换为 OpenAI function calling 格式 */
export function toOpenAITool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

// ─── 工具实现 ─────────────────────────────────────────────────────

const tools: ToolDefinition[] = [
  {
    name: "read_file",
    description: "读取文件的完整内容。适用于查看代码、配置文件、日志等。",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "要读取的文件路径（相对于工作目录或绝对路径）",
        },
      },
      required: ["file_path"],
    },
    execute: async (args, ctx) => {
      const filePath = resolvePath(args.file_path as string, ctx.workingDirectory);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        // 限制输出长度，避免超出上下文窗口
        const MAX_OUTPUT = 8000;
        const truncated = content.length > MAX_OUTPUT
          ? content.slice(0, MAX_OUTPUT) + `\n\n[... 已截断，共 ${content.length} 字符，仅显示前 ${MAX_OUTPUT} 字符]`
          : content;
        return { success: true, output: truncated };
      } catch (err) {
        return {
          success: false,
          output: "",
          error: err instanceof Error ? err.message : "读取文件失败",
        };
      }
    },
  },

  {
    name: "run_shell",
    description: "执行一条 shell 命令并返回输出。适用于运行脚本、安装依赖、git 操作等。",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "要执行的 shell 命令",
        },
        timeout_ms: {
          type: "number",
          description: "超时时间（毫秒），默认 30000",
        },
      },
      required: ["command"],
    },
    execute: async (args, ctx) => {
      const command = args.command as string;
      const timeout = (args.timeout_ms as number) ?? 30000;
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: ctx.workingDirectory,
          timeout,
          maxBuffer: 1024 * 1024, // 1 MiB
        });
        const MAX_OUTPUT = 8000;
        const output = stdout || stderr;
        const truncated = output.length > MAX_OUTPUT
          ? output.slice(0, MAX_OUTPUT) + `\n\n[... 输出已截断]`
          : output;
        return { success: true, output: truncated || "(命令无输出)" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "执行命令失败";
        // exec 错误通常带有 stdout/stderr
        const execErr = err as Error & { stdout?: string; stderr?: string };
        const output = execErr.stdout || execErr.stderr || "";
        return {
          success: false,
          output: output.slice(0, 4000),
          error: msg,
        };
      }
    },
  },

  {
    name: "edit_file",
    description: "编辑文件中的文本。将文件中的 old_string 替换为 new_string。old_string 必须精确匹配文件中的内容（包括缩进和换行）。",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "要编辑的文件路径",
        },
        old_string: {
          type: "string",
          description: "要替换的原始文本（必须精确匹配）",
        },
        new_string: {
          type: "string",
          description: "替换后的新文本",
        },
      },
      required: ["file_path", "old_string", "new_string"],
    },
    execute: async (args, ctx) => {
      const filePath = resolvePath(args.file_path as string, ctx.workingDirectory);
      const oldStr = args.old_string as string;
      const newStr = args.new_string as string;
      try {
        const content = await fs.readFile(filePath, "utf-8");
        if (!content.includes(oldStr)) {
          return {
            success: false,
            output: "",
            error: "未找到匹配的原始文本。请检查缩进、空格和换行是否与文件内容完全一致。",
          };
        }
        const updated = content.replace(oldStr, newStr);
        await fs.writeFile(filePath, updated, "utf-8");
        return { success: true, output: "文件已成功更新。" };
      } catch (err) {
        return {
          success: false,
          output: "",
          error: err instanceof Error ? err.message : "编辑文件失败",
        };
      }
    },
  },

  {
    name: "grep",
    description: "在当前目录下的文件中搜索包含指定文本的行。适用于查找代码引用、函数定义、配置项等。",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "要搜索的文本或正则表达式",
        },
        file_pattern: {
          type: "string",
          description: "文件匹配模式（如 *.ts, **/*.tsx），可选",
        },
        max_results: {
          type: "number",
          description: "最大返回结果数，默认 50",
        },
      },
      required: ["pattern"],
    },
    execute: async (args, ctx) => {
      const pattern = args.pattern as string;
      const filePattern = (args.file_pattern as string) ?? "*";
      const maxResults = (args.max_results as number) ?? 50;
      try {
        const glob = filePattern.includes("**") ? filePattern : `**/${filePattern}`;
        const { stdout } = await execAsync(
          `grep -rn --include='${filePattern}' '${pattern}' .`,
          { cwd: ctx.workingDirectory, timeout: 15000, maxBuffer: 1024 * 1024 },
        );
        const lines = stdout.split("\n").filter(Boolean).slice(0, maxResults);
        const output = lines.join("\n");
        return {
          success: true,
          output: output || "(未找到匹配结果)",
        };
      } catch (err) {
        const execErr = err as Error & { stdout?: string };
        if (execErr.stdout) {
          // grep 返回非零退出码时 stdout 仍有内容（找到匹配但退出码为 1）
          const lines = execErr.stdout.split("\n").filter(Boolean).slice(0, maxResults);
          return { success: true, output: lines.join("\n") || "(未找到匹配结果)" };
        }
        return {
          success: false,
          output: "",
          error: err instanceof Error ? err.message : "搜索失败",
        };
      }
    },
  },

  {
    name: "find",
    description: "按文件名模式查找文件。适用于定位项目中的文件。",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "文件名匹配模式（如 *.ts, **/utils/*.ts）",
        },
        max_results: {
          type: "number",
          description: "最大返回结果数，默认 50",
        },
      },
      required: ["pattern"],
    },
    execute: async (args, ctx) => {
      const pattern = args.pattern as string;
      const maxResults = (args.max_results as number) ?? 50;
      try {
        const { stdout } = await execAsync(
          `find . -name '${pattern}' -type f`,
          { cwd: ctx.workingDirectory, timeout: 15000 },
        );
        const lines = stdout.split("\n").filter(Boolean).slice(0, maxResults);
        return { success: true, output: lines.join("\n") || "(未找到匹配文件)" };
      } catch (err) {
        return {
          success: false,
          output: "",
          error: err instanceof Error ? err.message : "查找文件失败",
        };
      }
    },
  },
];

// ─── 导出 ─────────────────────────────────────────────────────────

/** 获取所有工具定义（OpenAI 格式） */
export function getToolDefinitions(): Record<string, unknown>[] {
  return tools.map(toOpenAITool);
}

/** 按名称查找并执行工具 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return {
      success: false,
      output: "",
      error: `未知工具: ${name}。可用工具: ${tools.map((t) => t.name).join(", ")}`,
    };
  }
  return tool.execute(args, ctx);
}

/** 获取工具名称列表 */
export function getToolNames(): string[] {
  return tools.map((t) => t.name);
}

// ─── 工具函数 ─────────────────────────────────────────────────────

function resolvePath(filePath: string, workingDirectory: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(workingDirectory, filePath);
}
