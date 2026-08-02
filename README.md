# Codex Agent Team

一套直接建立在 Codex 原生 multi-agent 能力上的角色与 workflow 资产。

Codex 负责创建子 agent、并发执行、消息传递和结果汇总；本仓库只维护可复用角色、workflow skill、质量 gate 和脱敏案例，不实现另一套 agent runtime。

## 当前能力

- 5 个可复用 agent role prompt：Product Manager、Technical Designer、Developer、QA、Reviewer。
- 1 个原生 workflow skill：`feature-delivery`。
- 1 份本机 Codex subagent / prompt 快照：`local-codex/`（对应 `~/.codex/agents` 与 `~/.codex/prompts`）。
- 项目级并发与嵌套限制。
- 无第三方依赖的结构验证脚本。

## 原生目录

```text
.codex/
  config.toml                    Codex 项目级并发与嵌套配置
.agents/
  skills/
    feature-delivery/            Codex 自动发现的项目 skill
      SKILL.md
      skill.json
      agents/openai.yaml         Codex UI 展示与默认调用 prompt
      references/agents/         workflow 实际注入的角色 prompt
local-codex/
  agents/                        本机 ~/.codex/agents 快照
  prompts/                       本机 ~/.codex/prompts 快照
examples/                        脱敏使用记录
scripts/validate.mjs             仓库结构与元数据验证
```

`codex-rs/protocol/src/prompts/` 这类目录是 Codex 产品内部提示词，不是用户扩展入口。本仓库也不保留一个脱离 workflow 的通用 `prompts/` 目录：角色 prompt 作为 owning skill 的 reference，workflow 规则只归 `SKILL.md`，避免两份提示词逐渐漂移。

## 使用

在仓库根目录启动 Codex：

```bash
codex
```

Codex 会从 `.agents/skills/*/SKILL.md` 发现项目 skill。首次使用时必须把仓库标记为 trusted，否则 skill 仍可加载，但 `.codex/config.toml` 的并发和深度设置不会生效。

可以直接说：

```text
使用 feature-delivery，把这个需求按多 agent 流程推进到本地可验证完成。
```

也可以要求 workflow 只执行一个角色阶段：

```text
使用 feature-delivery 的 Product Manager role prompt，只整理需求边界和验收标准，不修改代码。
```

## Workflow 边界

`feature-delivery` 是由父 agent 执行的协作协议：

```text
Product contract
  -> Technical plan
  -> Implementation
  -> QA + Review
  -> Parent synthesis
```

父 agent 对范围、gate、冲突处理和最终结论负责。workflow 读取对应 role prompt，把它连同实际任务边界一起交给 Codex 原生 generic subagent。子 agent 的摘要不是事实来源，关键结论必须回到仓库代码、diff 和实际验证命令。

截至 2026-07-16，本机 `codex-cli 0.144.4` 的当前 callable subagent schema 没有暴露自定义 `agent_type` 参数；真实 smoke 也没有返回可选 custom roles。因此首版不依赖 `.codex/agents` 命名角色，而使用当前已经验证可用的 generic subagent + role prompt。未来某个 Codex surface 明确暴露 custom agent types 后，可以增加适配层，但 role prompt 仍保持单一真相源。

Codex 原生 workflow 是模型驱动的协作，不是持久化状态机。需要跨会话恢复、强制人工 gate、结构化事件账本或自动失败重试时，继续使用 `agent-team-runtime` 这类交付协议层更合适。

## 验证

```bash
npm test
codex -C . debug prompt-input "检查 agent role 与 workflow skill 是否可见"
```

第一条检查 role prompt、skill 元数据、目录边界和本地 Markdown 链接。第二条让当前 Codex 真实加载项目上下文；输出中应出现 `feature-delivery` skill。

## 扩展规则

新增 agent role prompt 时：

1. 在 owning skill 的 `references/agents/` 新增一个 Markdown 文件；
2. 定义 responsibility、boundaries、required input、output contract 和 completion；
3. 在 `SKILL.md` 的资产表和对应 gate 中引用它；
4. 不在其他文件复制同一角色 prompt；
5. 运行 `npm test` 和 Codex 加载验证。

新增 workflow 时，创建独立的 `.agents/skills/<workflow>/SKILL.md` 与 `skill.json`。不同触发条件、风险边界或完成信号的流程应拆成不同 skill。

## 安全

- 不提交 token、cookie、账号、客户数据、内部 URL 或原始 Codex session。
- 案例必须脱敏，只保留复现协作决策所需的最小证据。
- 写入型 agent 不得自行扩大文件范围，也不得擅自 commit、push、发布或触发外部写操作。
- 这是公开仓库；每次提交和 push 前都必须执行 secrets、隐私与机器路径检查。

官方能力变化参考：[Codex changelog](https://learn.chatgpt.com/docs/changelog)。
