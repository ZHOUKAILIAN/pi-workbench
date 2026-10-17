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

## 协作流程与入口

`config/AGENTS.md` 安装为全局协作规则；`/build`、`/work`、`/figma_delivery` 共享这些边界，不需要为了采用默认分工增加命令或修改扩展。

- 默认由主会话连续实现、自检与修复，保留需求讨论上下文。implementer 仅承接具备独立契约、互不重叠写入、可独立验证输出和实际并行收益的子任务，或用户明确指定的执行任务。
- 独立 code_reviewer 审完整约定功能及关联调用链。记录原始固定功能基准和已有改动归属，明确比较模式及已提交/未提交/新增文件的范围；中途 commit 不重置基准。明确的单次窄范围评审只批准该范围，不冒充整项功能通过。
- 保存 reviewer 返回的逻辑句柄，复审在 subagent 调用中传入 `session`（批量用 `tasks[].session`），并核对返回元数据。`persistent: true` 只保留会话，不自动恢复。仍需补交最新修改、测试、用户决定和原始范围；失去句柄时说明并提供完整交接。
- 首审充分查证，完成约定范围和同根影响检查后集中反馈；允许单次投入更充分，不以快速返回、问题数量或报告长度衡量质量。执行者成批修复相关问题、同类遗漏及自检问题后再交回。目标是降低可靠交付的总成本，不是机械减少轮数。
- `CHANGES_REQUESTED` 启动集中修复，`APPROVED` 进入适用验证、不调用多余修复。普通风格建议不自动开启修复/复审循环。额外发现说明首审遗漏、修复引入或范围变化；同范围同根问题连续遗漏时检查前轮覆盖和交接质量，不隐瞒真实缺陷。
- 任何阶段 `BLOCKED` 都写清未完成事项、原因、证据、受影响验收项和解除条件，暂停受影响工作，不再派 reviewer 只确认同一阻塞。有解除条件、新证据或明确决定才恢复必要工作；已知缺基准/范围或核心缺陷未解决时不启动正式评审，也不制造提交。普通可修复缺陷不能包装成阻塞。
- 代码批准不等于真实服务或视觉交互验收。缺 reviewer、验收环境或权限时准确报告未评审/blocked，不能用自检替代独立结论。缺运行环境只阻塞对应验收，不自动否定可独立完成的静态评审。工具失败先查明原因，通用 subagent 的正常返回不替主会话判断业务完成。

角色默认仍不绑定模型，型号由私有 local 配置管理；主会话实现使用当前主会话模型，不为了执行实现额外启动指定型号的子进程。更新后 `/reload` 或启动新会话；过去已展开的提示词和调用不会被改写。这些是提示词层面的约定，不是扩展强制执行的调度状态机；可选 `/fix` 的节点和门禁仍由外部扩展维护，不因角色文件更新改变。静态检查和资源发现不能验证交接质量，部署后按以下场景观察：

| 场景 | 应观察到的行为 |
| --- | --- |
| reviewer 找到第一个普通缺陷 | 继续检查约定范围，汇总同类影响后集中反馈 |
| 一批 findings 中只修好部分 | 留在执行上下文内继续修复与自检，不逐条请求复审 |
| 缺权限或关键决定已有明确阻塞报告 | 保留结果并暂停；没有新增输入就不再评审同一阻塞 |
| 完整修复后复审 | 恢复原 reviewer，会话继承有效证据，检查修复及间接影响 |
| 只有非阻断风格建议 | 不自动启动修复/复审循环 |

观察首审遗漏、同根问题重复出现、每轮问题关闭情况及最终交付结果；调用次数下降本身不能证明质量提高。

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

### 外部扩展与 Subagent

[my-pi-extension](https://github.com/ZHOUKAILIAN/my-pi-extension) 是公开的扩展源码源头，`packages/subagent` 提供唯一的 `@pi/subagent` 实现。工作台不再保存、安装或维护另一个 dispatcher；只维护角色、提示词、来源声明和安装检查。

在本仓库外显式克隆指定版本，不把 token 写进 URL，也不覆盖已有工作树：

```bash
mkdir -p "$HOME/dev"
git clone https://github.com/ZHOUKAILIAN/my-pi-extension.git "$HOME/dev/my-pi-extension"
git -C "$HOME/dev/my-pi-extension" checkout --detach f6f847ca350d5819c128a8e874c40c8407b0bfa7
(cd "$HOME/dev/my-pi-extension" && npm ci --ignore-scripts)
```

该 ref 是公开 Pi 1.1 兼容分支的固定快照，不是当前 main；本仓库检查的是 Pi 1.1.0 下 subagent 的注册和 session 参数，不承诺其他 package、未来 patch、真实子会话恢复或 provider E2E。已在其他目录安装该包时可复用原目录，先核对版本/兼容性，不再添加第二份来源。

把 `packages/subagent` 的实际绝对路径加入私有 local.json 的 `packages` 数组。不是根 monorepo 路径，也不是源码软链接；JSON 不会展开 `$HOME`，请填本机实际路径：

```text
$HOME/dev/my-pi-extension/packages/subagent
```

然后用同一 local 配置 plan/apply/doctor，启动 Pi 后检查 subagent 工具；更改源码或配置后 `/reload` 或开启新会话。工作台不会 clone、npm install 或调用模型，也不会把包源码复制进 agent 目录。未接入该包时基础配置仍可安装，但会警告缺少 subagent，doctor 返回未就绪，不能声称独立评审可用。

当前 doctor 只识别 settings/local.packages 中绝对路径所指 manifest 的 `@pi/subagent` 身份与入口文件。使用不带资源过滤的目录字符串或 `{ "source": "绝对目录" }` 声明；`extensions: []` 视为禁用，但仍参与声明冲突检查，不能用后追加的字符串假定覆盖首条禁用声明。`autoload:false` 或其他资源过滤声明暂不支持，会拒绝 apply；显式 `autoload:true` 可以使用。重复身份（含禁用声明）或无效/缺失/符号链接入口同样阻止 apply。不同声明不会被静默合并或删除；先明确保留哪个来源。远端 package、任意其他路径中的同名工具注册仍需 Pi 的实际加载检查，不在 doctor 的静态保证内。

可选 `/fix`、额度状态栏和 `/fast` 同样在这个仓库中维护，路径为 `packages/fix`、`packages/codex-usage-status`；它们的 Pi 1.1.0 兼容性与真实 provider E2E 未在本工作台验证，不默认启用。`/feature` 尚未实现。克隆、依赖安装和服务验证始终是显式操作。

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

### 旧内置 Subagent 的迁移

plan/doctor 检查目标目录中的 `extensions/subagent`、`extensions/subagent.ts`、`extensions/subagent.js`，报告已知旧来源；apply 即使 --replace 也整体拒绝写入，避免新增重复注册，不擅自删除或替换这些文件。其他 settings.extensions、项目扩展或 CLI 加载源需自行用 Pi 配置检查；检测清单不代表能发现任意同名工具。

退出相关 Pi 进程后，先对照旧版本和备份检查文件/hash及自定义内容，明确只保留外部包。由用户显式把确认属于旧工作台且不再需要的副本移到 agent 自动发现目录之外并保存，再移除其明确加载声明；不要批量清空 extensions。再次 plan/apply/doctor，核对真实 Pi 只加载一个 subagent。删除仓库源码不会清除已部署文件，本 PR 不执行本机迁移。

旧 v1 安装备份的扩展路径和目录记录仍支持显式 restore，保留内容/hash、权限、路径与后续编辑保护。恢复旧扩展可能重新产生双来源，需要重新检查外部 package 声明，不能把 restore 当作自动去重。

## 检查范围

- `npm test` 验证结构、JSON、链接、角色工具名、路径、明显 secrets 模式，以及外部包检查、旧来源拒绝、安装与新旧备份回滚行为；不能代替人工隐私检查。
- `npm run smoke` 使用隔离 HOME/agent 目录和真实 Pi，检查基础提示词/全局规则/测试资源发现及五个角色文件部署，禁止模型调用；不验证外部 subagent。
- `npm run smoke -- --subagent-package <绝对package目录>` 额外加载指定外部包，确认唯一 subagent 注册和 session/persistent/并行任务 session 参数。只有已显式提供、准备好依赖的包才加载，不下载源码；不执行子任务，不声称恢复或 provider E2E 通过。
- `doctor` 检查托管文件、声明的本机包 manifest/入口及已知旧来源，不验证动态工具行为、任意其他来源的重复注册、第三方下载、远端权限或服务可用性。

真实模型调用、私有工作流 E2E、长任务取消和外部服务授权，需要在对应能力的环境中单独验证。
