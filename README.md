# NZi Agent Web

**多 Agent 统一编排、会话管理、可视化平台。**

支持双引擎（Pi Agent + Grok Agent，均通过阿里云百炼 OpenAI 兼容 API 接入）、Arena 对战、会话树可视化、工具生态（联网搜索 / Skill 市场 / MCP 服务器），以及实时 WebSocket 协作。

![Tech Stack](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Fastify](https://img.shields.io/badge/Fastify-5-green?logo=fastify)
![Prisma](https://img.shields.io/badge/Prisma-6.19-gray?logo=prisma)

---

## 功能一览

### 🤖 双引擎对话

- **Pi Agent**：强推理引擎，默认使用 `qwen3.7-max`（可通过 `BAILIAN_MODEL` 覆盖）
- **Grok Agent**：快响应引擎，默认使用 `qwen3.7-max-preview`（可通过 `GROK_MODEL` 覆盖）
- 两个引擎共用百炼 API Key，在会话中自由切换
- 支持**推理链展示**（thinking 过程可折叠/展开）
- 支持**工具调用**（function call）的实时可视化
- 未配置 API Key 时自动降级为 Mock 引擎

### 💬 会话管理

- **会话树**：以树形结构可视化展示会话的分支历史（父会话 → 子会话），支持分支跳转
- **多轮对话**：自动携带历史上下文，支持消息压缩
- **断线重连**：WebSocket 断线自动重连 + 消息队列防丢
- 会话标题自动生成，支持手动重命名和删除

### ⚔️ Arena 对战

- 同一个 prompt 同时发给 Pi 和 Grok 两个引擎，**分阶段并行对比**输出
- 对战结果可视化：投票进度条（Pi 胜 / Grok 胜 / 平局）
- **对战历史**：统计卡片（总场数 / Pi 胜率 / Grok 胜率 / 平局率）、prompt 搜索、删除对战（级联删除关联会话/消息/投票）
- 对战会话独立存储，投票后可一键跳转到对战会话详情页

### 🔧 工具生态（Phase 3）

#### 联网搜索（Web Search）
- **DuckDuckGo**（免费，开箱即用）
- **SerpAPI**（需配置 API Key，支持更丰富的搜索结果）
- 按租户独立配置，支持最大结果数调节

#### Skill 市场
- **系统内置热门 Skill**：代码审查、技术写作、数据分析、DevOps 等
- **一键安装 / 卸载 / 启用 / 禁用**
- **自定义创建**：编写 System Prompt，配置分类、标签、可用工具列表
- **对话时自动注入**：已启用的 Skill 的 prompt 会合并到对话的 system prompt 中

#### MCP 服务器
- **30+ 预设模板**一键添加（GitHub、文件系统、PostgreSQL、Slack 等）
- 支持 **stdio / SSE / Streamable HTTP** 三种传输方式
- 工具发现与缓存，连接状态可视化（未连接 / 连接中 / 已连接 / 错误）
- **去重保护**：DB 唯一约束 + 后端幂等创建 + 前端 disabled/✓ 标记

### 🔐 多租户 & 安全

- 多租户隔离：每个用户属于一个 Tenant，数据按租户隔离
- JWT 认证（`@fastify/jwt`），密码 bcrypt 加密
- API Key 使用 AES-256-GCM 加密存储
- 速率限制（`@fastify/rate-limit`）：防暴力破解 + 防滥用

### 🏗️ 基础设施

- **CI/CD**：GitHub Actions（typecheck + prisma generate + build），PR 多次推送自动取消旧构建
- **Docker Compose**：PostgreSQL 16 + Redis 7 一键启动

---

## 技术栈

| 层 | 技术 |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS + Zustand (persist) + lucide-react |
| Backend | Node.js (Fastify 5) + @fastify/websocket + @fastify/jwt + @fastify/rate-limit + @fastify/cors |
| Database | PostgreSQL (Prisma ORM 6.19) + Redis (ioredis) |
| AI 引擎 | 阿里云百炼 OpenAI 兼容 API（qwen 系列）+ Mock 兜底 |
| 实时通信 | WebSocket（原生，通过 @fastify/websocket） |
| 部署 | Docker Compose / GitHub Actions |

---

## 开发环境启动

### 前置要求

- Node.js >= 22.19.0
- pnpm >= 9.0.0（via `corepack enable`）
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

# 4. 初始化管理员账号（密码通过 ADMIN_PASSWORD 环境变量传入，>=16 字符）
ADMIN_PASSWORD="YourStrong@Pass16" pnpm seed:admin

# 5. 启动开发服务
pnpm dev
```

服务地址：
- **Frontend**：http://localhost:3000
- **Backend API**：http://localhost:4000
- **登录**：http://localhost:3000/login（默认管理员邮箱 `admin@nzilab.com`）

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://nzi:nzi_password@localhost:5432/nzi_agent_web` |
| `REDIS_URL` | Redis 连接串 | `redis://localhost:6379` |
| `JWT_SECRET` | JWT 签名密钥 | （开发环境有默认值，生产必须覆盖） |
| `ADMIN_PASSWORD` | 管理员初始密码（>=16 字符） | 必填 |
| `BAILIAN_API_KEY` | 阿里云百炼 API Key | 未配置则降级为 Mock |
| `BAILIAN_BASE_URL` | 百炼端点 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `BAILIAN_MODEL` | Pi 引擎模型 | `qwen3.7-max-2026-05-20` |
| `GROK_MODEL` | Grok 引擎模型 | `qwen3.7-max-preview` |
| `PORT` | 后端端口 | `4000` |
| `CORS_ORIGIN` | 前端地址 | `http://localhost:3000` |

---

## 项目结构

```
packages/
├── shared-types/          # 前后端共享类型定义（EngineProvider、AgentEvent 等）
├── backend/
│   ├── src/
│   │   ├── config/        # 认证配置（JWT、bcrypt、AES 加密）
│   │   ├── controllers/   # 请求处理器（auth、session、arena、web-search、skill、mcp、ws-chat、ws-arena）
│   │   ├── services/      # 业务逻辑（SessionService、ArenaService、SkillService、McpService、WebSearchService 等）
│   │   ├── engine/
│   │   │   ├── adapters/  # 引擎适配器（BailianAdapter、GrokAdapter、MockEngineAdapter）
│   │   │   ├── normalizer/# 事件标准化（pi-event-normalizer）
│   │   │   └── engine-bridge.ts  # 引擎路由桥接
│   │   ├── routes/        # Fastify 路由注册
│   │   └── utils/         # 工具函数（crypto、logger）
│   ├── prisma.config.ts   # Prisma schema 路径配置（指向根目录 prisma/）
│   └── scripts/           # seed-admin.ts（管理员初始化）
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/[[...path]]/  # /api/* 代理路由（转发到后端）
│   │   │   ├── login/            # 登录页
│   │   │   ├── register/         # 注册页
│   │   │   └── dashboard/        # 主工作区
│   │   │       ├── arena/        # Arena 对战 + 对战历史
│   │   │       ├── session/[id]/ # 会话详情页
│   │   │       ├── tools/        # 工具中心（联网搜索 / Skill / MCP）
│   │   │       └── engines/      # 引擎配置
│   │   ├── components/
│   │   │   ├── chat/             # 对话组件（AgentTimeline、MessageBubble）
│   │   │   └── navigation/       # 侧边栏
│   │   ├── hooks/                # useChatSocket（WebSocket 管理 + 断线重连）
│   │   ├── lib/                  # API 客户端、auth-store、session-store、chat-store
│   │   └── stores/               # Zustand stores
│   └── next.config.ts            # Next.js 配置（API rewrite）
└── grok-agent/            # （预留）
```

---

## 开发工作流

```
Brainstorm → Spec → Plan → Execute → Verify → Review → Commit
```

- 每次修改后运行 `pnpm lint` + `pnpm typecheck` 确保代码质量
- 提交前由 `review-commit` 子代理自动代码审查
- 推送到 `feature/*` 分支后 GitHub Actions 自动运行 typecheck + build

---

## License

MIT
