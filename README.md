# NZi Agent Web

Agent Runtime Orchestration Platform — 多 Agent 统一编排、会话管理、可视化平台。

## 技术栈

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS + Socket.io-client
- **Backend**: Node.js (Fastify) + Socket.io + Prisma + PostgreSQL + Redis
- **Agent Runtime**: Pi Agent SDK (进程内桥接，走百炼 OpenAI 兼容 API) + Mock 兜底
- **Infrastructure**: Docker Compose (PostgreSQL + Redis)

## 开发环境启动

### 前置要求

- Node.js >= 22.19.0
- pnpm >= 9.0.0 (via `corepack enable`)
- Docker & Docker Compose

### 快速启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动基础设施 (PostgreSQL + Redis)
docker compose up -d

# 3. 生成 Prisma Client + 执行 migration
pnpm db:generate
pnpm db:migrate

# 4. 启动开发服务
pnpm dev
```

服务地址：
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- API Docs: http://localhost:4000/docs (Phase 2)

## 项目结构

```
packages/
├── shared-types/    # 前后端共享类型定义
├── backend/         # Fastify 后端服务
├── frontend/        # Next.js 16 前端
├── pi-agent/        # Pi Agent (只读，不修改)
└── grok-agent/      # Grok Agent (Phase 2)
```

## 开发工作流

1. **Brainstorm** → 需求澄清
2. **Spec** → 规范文档
3. **Plan** → 任务拆解
4. **Execute** → 分 Phase 实现
5. **Verify** → 测试验证
6. **Review** → 代码审查

## License

MIT
