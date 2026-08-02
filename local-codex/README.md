# Local Codex Agents & Prompts Snapshot

本目录是本机 `~/.codex` 自定义 subagent / prompt 的版本化快照，不是 `feature-delivery` skill 的角色真相源。

## 目录对应

```text
local-codex/agents/*.toml  ->  ~/.codex/agents/
local-codex/prompts/*.md   ->  ~/.codex/prompts/
```

## 当前资产

### Agents

- `product_aligner`：对齐方案 / Figma 边界，默认 `gpt-5.6-sol`
- `evidence_investigator`：排查取证与根因下钻，默认 `grok-4.5`
- `implementer`：最小实现，默认 `grok-4.5`
- `verifier`：独立验证，默认 `gpt-5.6-terra`

### Prompts

- `work`：现象 -> 根因 -> 修复 -> 验证
- `build`：对齐方案 -> 执行 -> 验证
- `figma_delivery`：Figma/UI 对齐 -> 执行 -> 验证

## 同步方式

从本机生效配置拉回仓库：

```bash
cp ~/.codex/agents/*.toml local-codex/agents/
cp ~/.codex/prompts/*.md local-codex/prompts/
```

从仓库恢复到本机：

```bash
cp local-codex/agents/*.toml ~/.codex/agents/
cp local-codex/prompts/*.md ~/.codex/prompts/
```

## 注意

- agent 里的 `skills.config.path` 当前是本机绝对路径，恢复到其他机器时需要按实际 skill 位置改写。
- 这里只做个人 runtime 配置快照；仓库里的 `feature-delivery` role prompt 仍是公开 workflow 资产。
