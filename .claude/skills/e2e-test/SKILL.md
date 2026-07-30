---
name: e2e-test
description: E2E测试技能。当需要编写端到端测试、集成测试时触发。
argument-hint: <feature-name>
user-invocable: true
model: sonnet
---

# E2E测试技能

## 触发场景
- 新功能需要端到端测试
- 核心用户流程需要测试覆盖
- 回归测试

## 执行流程

### 阶段1: 分析用户流程
1. 确定核心用户流程
2. 识别关键交互点
3. 设计测试场景

### 阶段2: 编写测试（Playwright）
1. 编写测试脚本
2. 添加断言
3. 添加截图/录屏

### 阶段3: 运行测试
1. 运行测试套件
2. 分析失败原因
3. 修复测试

## 约束
- 测试必须独立、可重复
- 使用 TestContainers 隔离外部依赖
- 测试数据必须清理
