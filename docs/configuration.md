# 配置指南

Pi Workbench 将通用工作方式与本机环境分开管理：仓库保存角色、提示词、协作规则和依赖来源，本机保存模型选择、资源路径及账号配置。

## 安装目录

目标目录按以下优先级选择：

1. 命令行 `--target`。
2. 环境变量 `PI_CODING_AGENT_DIR`。
3. 默认 `~/.pi/agent`。

可以在独立目录中使用整套配置：

```bash
node scripts/workbench.mjs plan --target "$HOME/pi-sandbox/agent"
node scripts/workbench.mjs apply --target "$HOME/pi-sandbox/agent"
node scripts/workbench.mjs doctor --target "$HOME/pi-sandbox/agent"
PI_CODING_AGENT_DIR="$HOME/pi-sandbox/agent" pi
```

目标不能位于本仓库内，也不能经过符号链接。macOS 临时目录应使用真实路径，而不是 `/tmp` 别名。

## 本机配置

首次创建仓库外的私有配置文件：

```bash
mkdir -p "$HOME/.config/pi-workbench"
cp -n config/local.example.json "$HOME/.config/pi-workbench/local.json"
chmod 600 "$HOME/.config/pi-workbench/local.json"
```

`local.json` 支持四个顶层字段：

| 字段 | 用途 |
| --- | --- |
| `settings` | 安全偏好，如 defaultProvider、defaultModel、theme、defaultThinkingLevel、transport、enabledModels |
| `agentModels` | 角色名到 `provider/model` 的绑定，安装时写入角色 frontmatter |
| `skills` | 已存在的本机绝对 Skill 目录列表 |
| `packages` | 已存在的本机绝对 Pi package 目录列表 |

```json
{
  "settings": {
    "theme": "light",
    "defaultThinkingLevel": "high"
  },
  "agentModels": {},
  "skills": [],
  "packages": []
}
```

JSON 不做 shell 插值，路径必须填写展开后的实际绝对路径。模型先通过 Pi `/model` 确认可用，再填写绑定；安装器只校验格式，不请求模型服务。未绑定的角色使用子进程的 Pi 默认模型设置，不保证继承主会话临时选择的型号。

编辑完成后，用同一份配置预览、安装和检查：

```bash
node scripts/workbench.mjs plan --local "$HOME/.config/pi-workbench/local.json"
node scripts/workbench.mjs apply --local "$HOME/.config/pi-workbench/local.json"
node scripts/workbench.mjs doctor --local "$HOME/.config/pi-workbench/local.json"
```

`settings` 按“仓库默认 < 现有偏好 < local.settings”合并；Skills 和 packages 数组追加并按相同条目去重。已有无关设置和文件保留。每次更新仍需传入同一份 local 配置。

不要在 local.json 中填写 apiKey、headers、baseUrl 或命令配置。模型服务、Tavily 密钥、MCP 服务及认证由对应工具在本机配置；auth.json、models.json、mcp.json、session 和缓存不由本仓库采集或导出。

## 可选能力与依赖

[依赖清单](../manifests/dependencies.json) 记录 npm 固定版本、独立仓库修订及需手动配置的来源。安装基础环境不代表这些可选能力已安装、登录或完成端到端验证。

### 搜索与 MCP

在 plan / apply / doctor 命令中增加 `--with-tools`，将清单中的 Tavily 和 MCP adapter 固定版本加入 settings：

```bash
node scripts/workbench.mjs plan --local "$HOME/.config/pi-workbench/local.json" --with-tools
node scripts/workbench.mjs apply --local "$HOME/.config/pi-workbench/local.json" --with-tools
node scripts/workbench.mjs doctor --local "$HOME/.config/pi-workbench/local.json" --with-tools
```

安装脚本不执行 npm 安装；Pi 下次启动时会处理缺失包，可能联网并执行包安装。Tavily 需要私有 `TAVILY_API_KEY`；MCP adapter 的服务与登录按其对应版本文档配置。

`--with-tools` 不自动替换已配置的不同版本。已有工具时，先用 `pi list` 检查，再通过 `pi remove <当前来源>` 和 `pi install <清单来源>` 做受控替换，避免同名包的多个版本并存。

### 私有工作流扩展

[my-pi-extension](https://github.com/ZHOUKAILIAN/my-pi-extension) 提供 `/fix` 原型，以及独立的额度状态栏和 `/fast` 接线。`/feature` 尚未实现；私有工作流的真实 provider E2E 不属于本仓库验证范围。

使用具备权限的 GitHub 身份，在本仓库外克隆指定版本；不要把访问 token 写进 URL：

```bash
mkdir -p "$HOME/dev"
git clone git@github.com:ZHOUKAILIAN/my-pi-extension.git "$HOME/dev/my-pi-extension"
git -C "$HOME/dev/my-pi-extension" checkout --detach e88085b312a7293b609cab81a480015e4297efd0
(cd "$HOME/dev/my-pi-extension" && npm ci --ignore-scripts)
```

将以下目录的实际绝对路径加入 local.json 的 `packages` 数组：

```text
$HOME/dev/my-pi-extension/packages/fix
$HOME/dev/my-pi-extension/packages/codex-usage-status
```

Pi manifest 位于子 package，不能用根仓库路径代替。无私有仓库权限时，基础角色、提示词与 subagent 仍可独立使用。克隆、依赖安装和服务验证由用户显式执行，不由工作台安装脚本隐式触发。

### Skills

```bash
mkdir -p "$HOME/dev"
git clone https://github.com/ZHOUKAILIAN/skills.git "$HOME/dev/skills"
git -C "$HOME/dev/skills" checkout --detach 1b56c916054891d8fd309ddc5a8563f2acc71ac6
```

按依赖清单中的 `recommendedSkills` 选择具体目录，审阅内容后加入 local.json 的 `skills` 数组。推荐逐个接入，避免整仓加载不适用的工作场景技能。

Pi 自动扫描 `~/.agents/skills`。已在该目录安装的同名技能，不应再从另一目录重复接入。外部 Skill 的 CLI、授权和依赖以其自身说明为准。

清单不是全部 Skills 的 lockfile：部分第三方来源尚未绑定精确版本，部分个人技能尚未发布，工作环境专用能力需要额外授权。这些项目列在 `manualRecovery` 中，不是默认安装内容，也不保证与任何电脑上的安装副本一致。

### Provider 显示偏好

`optional-extensions/hide-builtin-providers.ts` 可以隐藏部分默认 provider 目录，默认不部署。可用 `pi -e <文件绝对路径>` 临时试用；永久启用前确认不会隐藏自己需要的模型。

## 更新与回滚

通用角色、提示词和默认配置在本仓库维护；扩展代码和 Skills 在各自来源维护。本机部署文件若有自定义修改，先比较差异，决定写回通用来源还是保留为本机配置。

1. 退出会写配置的 Pi 进程。
2. 使用与安装相同的 `--target`、`--local` 和 `--with-tools` 运行 `plan`。
3. 托管文件冲突时，确认差异后再加 `--replace` 执行 `apply`。
4. 保留安装输出的 backup ID，运行 `doctor`，再启动 Pi 检查能力和登录状态。

```bash
node scripts/workbench.mjs apply --local "$HOME/.config/pi-workbench/local.json" --replace
node scripts/workbench.mjs restore --backup BACKUP_ID
```

若安装时使用自定义 `--target`，回滚时也必须指定同一目标；restore 不需要 local 配置。

### 保护规则

- 每次有改动，先在目标 `.workbench-backups/<ID>/` 创建私有备份；无改动时不写文件、不新增备份。
- 默认不覆盖冲突的托管文件；`--replace` 只授权替换这些文件，不删除整个 agent 目录。
- 保留现有目录和文件权限，无关设置与资源不自动清理。失效目录、重复扩展来源或不同版本 package 需要自行检查和移除。
- 回滚恢复原文件及权限，删除新文件和本次创建且仍为空的资源目录；原有目录、后续用户内容和备份保留。
- 相关托管文件安装后又被修改时，回滚整体拒绝覆盖。先自行保存并对齐差异。
- 备份可能含原 settings 中的私有配置，不得上传。

安装器面向单次串行操作，失败时尽力回退；不提供并发写入或进程崩溃的事务保证。回滚 hash 检查用于保护后续修改，不是备份签名。

## 检查范围

- `npm test` 验证仓库结构、JSON、链接、角色工具名、路径、明显 secrets 模式，以及安装/回滚行为；不能代替人工隐私检查。
- `npm run smoke` 使用真实 Pi 检查隔离环境的资源发现与注册，不联网、不登录、不调用模型。
- `doctor` 检查托管文件与声明的本机路径/配置，不验证第三方包下载、远端权限或服务可用性。

真实模型调用、私有工作流 E2E、长任务取消和外部服务授权，需要在对应能力的环境中单独验证。
