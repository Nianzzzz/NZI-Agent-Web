---
name: security-review
description: 安全审查技能。当涉及认证、授权、数据加密、用户输入时触发。
argument-hint: <file-paths>
user-invocable: true
model: sonnet
---

# 安全审查技能

## 触发场景
- 涉及认证授权代码
- 涉及用户输入处理
- 涉及数据加密存储
- 涉及 WebSocket 连接

## 执行流程

### 阶段1: 读取代码
读取待审查的文件和相关上下文。

### 阶段2: 安全审计
使用 security-auditor 代理进行审计：
1. **认证授权**: JWT、权限控制、会话管理
2. **数据加密**: AES-256-GCM、密钥管理
3. **输入校验**: Zod、SQL 注入、XSS
4. **WebSocket**: 鉴权、消息校验、速率限制

### 阶段3: 输出审计报告
- 安全评分 (A/B/C/D/F)
- 漏洞列表
- 修复建议

## 约束
- 必须使用 security-auditor 代理
- 所有安全问题必须记录到 `docs/knowledge/pitfalls.md`
- 安全评分低于 B 不能提交代码
