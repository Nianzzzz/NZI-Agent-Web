---
description: 代码审查
---

# /review - 代码审查

对指定文件或目录执行代码审查。

## 执行步骤
1. 读取待审查文件
2. 调用 code-reviewer 代理
3. 输出审查报告
4. 如发现问题，等待修复后重新审查

## 使用示例
```
/review src/auth/
/review src/lib/crypto.ts
```

## 人类确认点
审查不通过时，必须修复后重新审查。
