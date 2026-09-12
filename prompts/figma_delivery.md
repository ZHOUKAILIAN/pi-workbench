---
description: Figma/UI 交付，只给一句目标
argument-hint: [目标]
---

# Figma

目标：
$ARGUMENTS

## 链路

```text
对齐 -> 执行 -> 评审 -> 验证
```

## 子 agent 分工

- 对齐：`product_aligner`，确认设计、页面状态、需求与 API 边界。
- 执行：`implementer`，按确认的设计和 CSS 规范实现。
- 评审：`code_reviewer`，检查 Standards 与 Spec/设计符合度。
- 验证：`verifier`，对照设计与实际渲染进行独立验证。

各环节按角色拆 subagent，主会话核查阶段证据而不是直接代劳。只读设计审计或单纯咨询不使用此交付入口。

## 要求

1. 自己提取 Figma/页面/状态/代码位置；缺设计权限或实际页面时明确 blocked。
2. 先对齐设计与需求/API，再实现。用户要求先确认时，输出边界后停住。
3. 优先使用已安装的 figma-design-audit、css-best-practices、figma-restoration-review 等对应技能；缺少必需能力时报告安装缺口，不假装已读设计或完成还原。
4. 评审后再验证对照设计边界；critical/major 必须处理并复评。
5. 模型配置由 Pi agent 目录的 `agents/*.md` 承载，默认不绑定具体型号。私有 local 配置的 `agentModels` 是安装输入；未绑定时子进程使用 Pi 默认模型设置。
6. 模型调用失败时报告失败阶段与原因；没有显式配置并授权的 fallback 就停止，不写死某个兜底模型、不承诺链路永不中断。需要改为单会话时先征得用户同意。
7. 缺权限或业务冲突时停下说明。Push/PR、部署仅在用户明确要求后执行。

## 输出

边界理解、改动、评审结论、验证证据、偏差、待决策。
