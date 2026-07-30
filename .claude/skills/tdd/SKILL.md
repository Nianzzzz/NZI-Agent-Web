---
name: tdd
description: 测试驱动开发技能。当需要编写新功能、修复 Bug、重构代码时触发。强制执行红-绿-重构循环。
argument-hint: <task-description>
user-invocable: true
model: sonnet
---

# TDD 技能

## 触发场景
- 实现新功能
- 修复 Bug
- 重构代码

## 执行流程（红-绿-重构）

### 🔴 Red: 写失败的测试
1. 理解需求，明确输入输出
2. 编写测试用例，覆盖正常路径和边界情况
3. 运行测试，确认测试失败
4. 确认失败原因符合预期

### 🟢 Green: 写最少的代码让测试通过
1. 编写最简单的实现代码
2. 运行测试，确认测试通过
3. 不添加额外功能，只满足测试

### 🔵 Refactor: 重构优化
1. 检查代码质量
2. 消除重复
3. 优化命名
4. 运行测试，确认重构没有破坏功能

## 约束
- 必须先写测试，再写实现
- 测试必须失败，才能写实现
- 每次只添加一个测试
- 实现代码必须是最小化的

## 输出格式
```markdown
# TDD 执行记录

## 🔴 Red
- 测试文件: `tests/unit/crypto.test.ts`
- 测试用例: `should encrypt and decrypt correctly`
- 运行结果: ❌ FAIL (Expected: encrypted, Got: undefined)

## 🟢 Green
- 实现文件: `src/lib/crypto.ts`
- 实现代码: [代码片段]
- 运行结果: ✅ PASS

## 🔵 Refactor
- 重构内容: [描述]
- 运行结果: ✅ PASS
```
