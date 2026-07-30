---
description: 执行实施计划
---

# /execute - 执行实施计划

读取 `docs/specs/` 中的最新规范，自动执行实施计划。

## 执行步骤
1. 读取规范文档
2. 使用 plan 技能生成实施计划
3. 分配子代理并行执行
4. 监控执行进度
5. 运行验证
6. 输出执行报告

## 子代理分配
- 前端任务 → frontend-dev
- 后端任务 → backend-dev
- 测试任务 → test-engineer
- 审查任务 → code-reviewer

## 人类确认点
每个 Phase 完成后，暂停等待人类确认。
