---
name: plan
description: 制定实施计划技能。当规范文档确认后，需要制定详细的实施计划时触发。
argument-hint: <spec-file>
user-invocable: true
model: sonnet
---

# 计划制定技能

## 触发场景
- 规范文档已确认
- 需要拆解为可执行的任务
- 需要分配子代理并行工作

## 执行流程

### 阶段1: 读取规范
读取 `docs/specs/` 中的相关规范文档。

### 阶段2: 任务拆解
将规范拆解为原子任务：
- 每个任务有明确的输入、输出、验收标准
- 任务之间有依赖关系
- 可以并行的任务标记为 `parallel: true`

### 阶段3: 资源分配
- 分配子代理（前端/后端/测试/审查）
- 预估 Token 消耗
- 制定时间线

### 阶段4: 输出制品
- `Implementation Plan` — 实施计划
- `Task List` — 任务清单

## 输出格式
```markdown
# 实施计划

## 任务列表
### Phase 1: 基础设施
- [ ] T1.1: [任务描述] — 负责人: backend-dev — 依赖: 无
- [ ] T1.2: [任务描述] — 负责人: backend-dev — 依赖: T1.1

### Phase 2: 核心功能
- [ ] T2.1: [任务描述] — 负责人: frontend-dev — 依赖: T1.2
- [ ] T2.2: [任务描述] — 负责人: backend-dev — 依赖: T1.2
- [ ] T2.3: [任务描述] — 负责人: test-engineer — 依赖: parallel

## 资源分配
| 任务 | 代理 | 预估 Token |
|------|------|-----------|
| T1.1 | backend-dev | ~5k |
| T2.1 | frontend-dev | ~8k |

## 验收标准
- [ ] 所有测试通过
- [ ] 代码审查通过
- [ ] 安全审计通过
- [ ] 文档已更新
```
