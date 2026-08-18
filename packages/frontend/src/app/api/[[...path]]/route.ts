/**
 * API 代理路由 — 将所有 /api/* 请求转发到后端（localhost:4000）
 *
 * Next.js 16 App Router 不再保证 rewrites 对 /api/* 路径生效，
 * 因此用 catch-all route handler 显式代理，确保前后端 API 通路稳定。
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const pathStr = path ? path.join("/") : "";
  const url = `${BACKEND}/api/${pathStr}${req.nextUrl.search}`;

  // 构建转发请求头：排除 hop-by-hop 头，其余原样转发（含 Authorization、Cookie 等）
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (["host", "connection", "transfer-encoding", "keep-alive"].includes(lower)) return;
    headers[key] = value;
  });

  const method = req.method;
  const isBodyless = method === "GET" || method === "HEAD";

  // 将 body 读为文本再转发，避免 ReadableStream 在转发时出现 duplex/Content-Length 问题
  let bodyText: string | undefined;
  if (!isBodyless) {
    try {
      bodyText = await req.text();
    } catch {
      bodyText = "";
    }
  }

  const fetchInit: RequestInit = {
    method,
    headers,
    ...(bodyText !== undefined && { body: bodyText }),
  };

  try {
    const res = await fetch(url, fetchInit);

    // 构建转发响应头
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (["transfer-encoding", "content-encoding"].includes(lower)) return;
      responseHeaders[key] = value;
    });

    return new NextResponse(res.body as ReadableStream<Uint8Array> | null, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy error";
    return NextResponse.json({ error: `后端不可达: ${message}` }, { status: 503 });
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await context.params).path);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await context.params).path);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await context.params).path);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await context.params).path);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await context.params).path);
}

export async function OPTIONS(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await context.params).path);
}
