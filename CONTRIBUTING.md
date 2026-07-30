# Development Workflow

## Branch Naming

- `feature/*` — 新功能开发
- `fix/*` — Bug 修复
- `docs/*` — 文档更新
- `refactor/*` — 代码重构
- `test/*` — 测试相关

## Commit Convention

采用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat:` | 新功能 | `feat: add Pi Adapter for agent streaming` |
| `fix:` | Bug 修复 | `fix: resolve WebSocket reconnection issue` |
| `docs:` | 文档更新 | `docs: add architecture overview` |
| `refactor:` | 代码重构 | `refactor: simplify event normalizer` |
| `test:` | 测试相关 | `test: add pi-sdk validation test` |
| `chore:` | 构建/工具变更 | `chore: update pnpm workspace config` |

## Pull Request Process

1. 创建 feature branch（从 `main` 或当前开发分支切出）
2. 提交代码（遵循 commit convention）
3. Push branch 到 remote
4. 创建 Pull Request（使用 PR 模板）
5. CI 自动运行（类型检查 + 构建）
6. 人工 Review
7. Merge 到目标分支

## Code Review 要求

- 至少 1 人批准
- CI 检查全部通过
- 无合并冲突

## 禁止提交的内容

- `.env` 及 `.env.*`（包含敏感配置）
- `node_modules/`
- `dist/`, `.next/`, `build/`
- `*.log`
- `dev.db`（SQLite 开发数据库）
- `.pi/`（Pi Agent 本地配置目录）
