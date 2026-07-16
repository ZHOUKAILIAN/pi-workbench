# Codex Agent Team

沉淀可复用的 Codex 子 agent、提示词、team recipe 和脱敏执行样例。

这个仓库不再实现一套新的 agent runtime。Codex 负责原生子 agent 的创建、并行协作、消息传递和结果汇总；本仓库负责保存可复用的协作资产，让一次有效的协作方式可以被审查、复用和持续改进。

## 为什么单独建这个仓库

截至 2026-07-16，Codex 已经原生提供 subagent / multi-agent delegation，并允许客户端按 thread 或 turn 控制 multi-agent 模式。对于多数“拆任务 -> 并行调查 -> 汇总结论”的工作，不再需要先搭一层自定义执行 runtime。

`agent-team-runtime` 仍有独立价值，但边界应更窄：

| 能力 | Codex Agent Team | agent-team-runtime |
| --- | --- | --- |
| 子 agent 创建、消息和并行执行 | 使用 Codex 原生能力 | 不重复实现 |
| 角色说明、提示词和 team recipe | 主要职责 | 可以作为消费方 |
| 仓库级约定和 skills | 使用 `AGENTS.md` / Codex skills | 可以注入或引用 |
| 固定状态机、人工 gate、失败恢复 | 不负责 | 适合继续由 runtime 负责 |
| 跨阶段 artifact / evidence 审计 | 保存轻量、脱敏样例 | 适合做强约束和完整追踪 |

官方依据：[Codex changelog](https://learn.chatgpt.com/docs/changelog)。

## 目录

```text
agents/       可复用的子 agent 角色定义
prompts/      面向具体任务的提示词
teams/        多个 agent 如何组合的声明式 recipe
templates/    新增资产时复制的模板
schemas/      team recipe 等机器可读文件的 schema
examples/     脱敏后的真实使用记录和复盘
```

## 使用方式

1. 先判断任务是否真的能拆成相互独立的子任务。
2. 从 `agents/` 选择角色，从 `prompts/` 选择任务提示词。
3. 复杂协作优先复用 `teams/` 的 recipe；简单任务直接给单个子 agent 明确、封闭的任务。
4. 父 agent 对最终结论负责，不能把子 agent 输出原样当成已验证事实。
5. 有复用价值的成功或失败案例，经脱敏后写入 `examples/`。

首批资产：

- [`repo-scout`](agents/repo-scout.md)：只读定位代码、约定和风险。
- [`independent-verifier`](agents/independent-verifier.md)：基于验收标准独立验证结果。
- [`investigate-and-verify`](teams/investigate-and-verify.yaml)：调查与验证分工 recipe。
- [`bounded-subtask`](prompts/bounded-subtask.md)：给子 agent 的通用封闭任务提示词。

## 资产质量规则

每个子 agent 定义至少说明：

- 什么时候使用、什么时候不要使用；
- 明确输入、允许使用的工具和写权限；
- 必须返回的证据与结构；
- 完成条件和升级条件；
- 与父 agent 的责任边界。

提示词应表达目标、范围、事实来源、约束和完成条件，不依赖“请认真”“尽量做好”这类不可验证的要求。

## 安全

- 不提交 token、cookie、账号、客户数据、内部 URL 或未脱敏日志。
- 不直接复制 Codex session 原文；先提取可复用结构并脱敏。
- `examples/` 只保存最小必要证据。
- 发布为 public 前，必须单独做一次 secrets 和隐私检查。

