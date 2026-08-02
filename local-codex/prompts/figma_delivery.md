---
description: Figma/UI 交付，只给一句目标
argument-hint: [目标]
---

# Figma

目标：
$ARGUMENTS

## 链路

```text
对齐 -> 执行 -> 验证
```

## 子 agent（按需）

- 对齐：`product_aligner`（`gpt-5.6-sol` + Figma/grill skill）
- 执行：`implementer`（`grok-4.5` + css/UI skill）
- 验证：`verifier`（`gpt-5.6-terra` + fidelity skill）

## 要求

1. 自己提取 Figma/页面/状态/代码位置。
2. 先对齐设计与需求/API，再实现。
3. 简单任务主会话或单 agent 做完；复杂再拆阶段。
4. 验证对照设计边界；critical/major 必须处理。
5. 缺权限或业务冲突时停下说明。

## 输出

边界理解、改动、验证、偏差、待决策。
