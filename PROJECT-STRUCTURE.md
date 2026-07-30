# NZi Agent Web — 项目结构说明

## 目录结构

```
nzi-agent-web/
├── .claude/                          # Claude Code 配置中心
│   ├── CLAUDE.md                     # 项目主配置（始终加载）
│   ├── CLAUDE.local.md               # 个人本地配置（gitignore）
│   ├── settings.json                 # 项目级设置
│   ├── agents/                       # 子代理定义（9个角色）
│   │   ├── architect.md             # 架构师
│   │   ├── fullstack-dev.md         # 全栈开发
│   │   ├── frontend-dev.md          # 前端开发
│   │   ├── backend-dev.md           # 后端开发
│   │   ├── code-reviewer.md         # 代码审查
│   │   ├── security-auditor.md      # 安全审计
│   │   ├── test-engineer.md         # 测试工程师
│   │   ├── doc-writer.md            # 文档编写
│   │   └── devops-engineer.md       # DevOps
│   ├── skills/                       # 技能包（9个）
│   │   ├── brainstorm/              # 头脑风暴
│   │   ├── plan/                    # 计划制定
│   │   ├── tdd/                     # 测试驱动开发
│   │   ├── code-review/             # 代码审查
│   │   ├── security-review/         # 安全审查
│   │   ├── refactor/                # 重构
│   │   ├── e2e-test/                # E2E测试
│   │   ├── deploy/                  # 部署
│   │   └── learn/                   # 学习
│   └── commands/                     # 斜杠命令（6个）
│       ├── spec.md                  # /spec
│       ├── plan.md                  # /plan
│       ├── execute.md               # /execute
│       ├── review.md                # /review
│       ├── verify.md                # /verify
│       └── checkpoint.md            # /checkpoint
├── docs/                             # 文档中心
│   ├── specs/                        # 规范文档
│   ├── knowledge/                   # 知识库
│   └── adr/                         # 架构决策记录
├── frontend/                         # Next.js 前端
├── backend/                          # Fastify 后端
├── prisma/                           # Prisma Schema
├── tests/                            # 测试文件
├── scripts/                          # 脚本
└── README.md
```

## 配置文件说明

### 1. CLAUDE.md — 项目主配置
- **加载时机**: 每次会话开始时自动加载
- **作用范围**: 当前项目所有会话
- **内容**: 项目概述、技术栈、编码规范、安全规则、开发工作流
- **约束**: 保持在 500 行以内，超出部分移到 `docs/knowledge/`

### 2. agents/ — 子代理定义
- **加载时机**: 需要时由主代理调用
- **作用范围**: 特定任务类型
- **内容**: 角色描述、职责、约束、输出格式
- **模型路由**: 不同角色可使用不同模型（Sonnet/Haiku）

### 3. skills/ — 技能包
- **加载时机**: 用户输入 `/skill-name` 或自动识别
- **作用范围**: 特定工作流
- **内容**: 触发场景、执行流程、输出格式
- **自动触发**: 根据 description 自动匹配

### 4. commands/ — 斜杠命令
- **加载时机**: 用户输入 `/command-name`
- **作用范围**: 特定命令
- **内容**: 命令描述、执行步骤、输出格式

## 开发工作流

```
用户提出需求
    ↓
/brainstorm → 苏格拉底式提问 → 输出设计方案 → 人类确认
    ↓
/spec → 生成规范文档 → 人类确认
    ↓
/plan → 任务拆解 → 资源分配 → 人类确认
    ↓
/execute → 子代理并行开发 → 每 Phase 人类确认
    ↓
/verify → 构建/类型/Lint/测试/安全 → 自动验证
    ↓
/commit → 提交代码 → 更新文档 → /learn 沉淀经验
```

## 子代理协作

### 并行执行示例

当需要实现一个完整功能时：

1. **Phase 1**: backend-dev 搭建数据库 Schema
2. **Phase 2**: frontend-dev + backend-dev 并行开发
3. **Phase 3**: test-engineer 编写测试
4. **Phase 4**: code-reviewer + security-auditor 并行审查

### 通信机制

- **Task List**: 共享任务列表，所有子代理可见
- **SendMessage**: 子代理间可直接通信
- **Artifact**: 制品文件共享（规范、计划、报告）

## 持续学习

### 会话结束时
- 执行 `/learn` 提取可复用模式
- 更新 `docs/knowledge/patterns.md`
- 更新 `docs/knowledge/pitfalls.md`

### 代码审查时
- 将审查发现记录到 `docs/knowledge/pitfalls.md`
- 将最佳实践记录到 `docs/knowledge/patterns.md`
- 更新 CLAUDE.md 中的规范

### 定期回顾
- 每周回顾 `docs/knowledge/` 内容
- 更新 CLAUDE.md 中的规范
- 清理过时的 ADR
