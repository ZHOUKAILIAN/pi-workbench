# Pi 迁移与依赖恢复

## 资产归属

本次是按文件组划分的迁移，不是整个 HOME 的内容审计。依据：旧仓库 README/AGENTS、本机 Pi 的角色/提示词/扩展与 settings、Pi 0.84.4 文档，以及独立仓库的 manifest/远端跟踪基线。

| 文件组 | 主层级 | 正式来源 / 承载边界 | 公开历史 | 动作与理由 |
| --- | --- | --- | --- | --- |
| README、安装默认值、依赖清单 | L3 项目落地 | 本仓库正式区 | 可 | 采用为工作环境入口；源仓库 ref 不等于本机全部未提交修改 |
| 全局规则、角色、工作流 prompts | L4 协作治理 | 本仓库正式区 | 脱敏后 | 保留方法论；删除工作单位规则、机器路径和硬编码模型 |
| subagent 扩展、迁移脚本与测试 | L2 当前实现 | 本仓库正式区 | 可，保留上游许可 | 原来只在本机的代码需要可恢复来源；不复制已有私有扩展 |
| my-pi-extension | L2 当前实现 | 独立私有仓库 | 否 | 本仓库只记录来源、ref 和可接入 package |
| Skills | L4 复用流程；具体 skill 以其自身职责为准 | 各 owning source | 依来源策略 | 通过路径接入，不在这里批量复制；缺失来源不猜测 |
| 本机路径、provider 目录、模型绑定、工作服务配置 | L3 本机落地配置（混有私密值） | 本机私有，不是本仓库正式默认 | 否 | 与通用配置拆开；不是要公开的机器快照 |
| auth、sessions、cache、trust、workflow-runs、安装备份 | L5 本机场景（认证有额外保密要求） | 本机私有恢复区，不作为正式真理源 | 否 | 排除提交，不删除现有本机内容 |
| 旧 Codex 配置、feature-delivery controller skill 及其角色/案例 | 退役的 L3/L4 和历史证据 | 仅 Git 历史 | 已有历史不重写 | 从当前树移除，避免双执行入口和重复流程真理源 |

高风险边界：公开仓库不能顺带公开私有扩展；不能因“迁移”上传 auth/models；不能把现场 session 当方法论；不能把 `/feature` 目标当已实现；不能声称已恢复尚未发布的 skill 改动。

正式阅读入口是本仓库 README / AGENTS / config；私有扩展的产品语义和实现仍以它自己的 docs 和源码为准。安装目录不是第二个维护源，回写时回到所属仓库。

## 私有扩展

[依赖清单](../manifests/dependencies.json) 记录选定恢复 ref。当前根仓库是 npm workspace，Pi manifest 在子 package 而非根目录；不能假定 `pi install git:<根仓库>` 会自动找到 `/fix`。

先用有权限的 GitHub 身份认证，在仓库外创建独立 clone。不要把访问 token 写进 URL：

```bash
mkdir -p "$HOME/dev"
git clone git@github.com:ZHOUKAILIAN/my-pi-extension.git "$HOME/dev/my-pi-extension"
git -C "$HOME/dev/my-pi-extension" checkout --detach e88085b312a7293b609cab81a480015e4297efd0
(cd "$HOME/dev/my-pi-extension" && npm ci --ignore-scripts)
```

然后把这两个**真实绝对目录**加入私有 local.json 的 `packages` 数组：

```text
$HOME/dev/my-pi-extension/packages/fix
$HOME/dev/my-pi-extension/packages/codex-usage-status
```

这里的 `$HOME` 是说明用占位符；JSON 不做 shell 插值，填写展开后的路径。clone、npm 安装和真实 provider 测试是独立操作，不会由 workbench 安装脚本隐式执行。无私有仓库权限时基础环境仍可用，但不包含 `/fix` 和额度状态栏。

`codex-usage-status` 和 `openai-codex` 是 Pi 扩展/模型服务标识，不是 Codex CLI 配置，不能因名字包含 codex 就机械删除。

## Skills 来源

```bash
git clone https://github.com/ZHOUKAILIAN/skills.git "$HOME/dev/skills"
git -C "$HOME/dev/skills" checkout --detach 1b56c916054891d8fd309ddc5a8563f2acc71ac6
```

按清单中的 `recommendedSkills` 选择具体 skill 目录，审阅后加入 local.json 的 `skills` 数组。可传整仓目录，但它还含工作场景 skills 和旧流程，默认更建议逐个选择。Pi 自动扫描 `~/.agents/skills`，已经在那里安装的同名技能不应再次从另一个目录接入，否则会出现名称冲突。

恢复清单不是全部 Skills 的 lockfile：仅确认了部分来源与自己的仓库基线。外部 skill 的依赖、CLI、授权和内容的可迁移性仍需其 owning source 验证。

## 本机覆盖配置

`config/local.example.json` 是空的可用起点，只支持四个顶层字段：

- `settings`：安全偏好，例如 defaultProvider/defaultModel/theme/defaultThinkingLevel/transport/enabledModels。不接收 apiKey、headers、baseUrl、命令配置和资源路径。
- `agentModels`：以角色名为键，以 `provider/model` 为值；安装时写入角色 frontmatter。未填写则使用 Pi 子进程默认模型选择。重新安装仍需传入同一份 local 配置。
- `skills`：存在的本机绝对 skill 目录列表。
- `packages`：存在的本机绝对 Pi package 目录列表。

例如为 `implementer` 填写自己已验证可用的 provider/model。不要从旧机器复制虚构或已下线型号；先在 Pi `/model` 确认可用。安装器只做格式校验，不调用服务确认型号。

Tavily 使用私有 `TAVILY_API_KEY`；MCP adapter 按已安装版本文档配置服务和登录。models.json、mcp.json 和 auth.json 都不由本仓库采集/导出；避免把密钥放在 shell 历史里。

## 迁移已有 Pi 配置

1. 退出会写配置的 Pi 进程，运行 `plan`。
2. 比较本机改过的托管文件。若需保留，将通用部分脱敏后回写仓库，模型绑定放入 local.json。
3. 确认后用 `apply --replace`，保留输出的 backup ID。备份目录不应入 Git，即使是私有仓库也不建议混入。
4. 旧 settings 中的个人工作路径、已失效资源、其他 subagent 实现不会被自动删除。手工检查并移除失效或重复的来源，避免同一个工具被两份 extension 注册。
5. `--with-tools` 追加固定版本，不自动替换旧的未固定/不同版本 npm 来源。已有工具时，先用 `pi list` 确认，再通过 `pi remove <旧来源>` 和 `pi install <清单固定来源>` 做受控替换。不要把多个相同 package 的不同版本当多套能力一起启用。
6. 当前本机的隐藏 provider 偏好保存在 `optional-extensions/hide-builtin-providers.ts`，默认不部署。可用 `pi -e <文件绝对路径>` 临时试用；永久启用前自行检查，不要无意隐藏新电脑可用的模型。
7. `doctor` 使用与 apply 相同的 `--target`、`--local` 和 `--with-tools`，随后启动 Pi 检查真实资源和登录状态。

脚本不做反向 HOME 导出，不清除 Codex HOME，不更名远端仓库，不改变其他仓库的分支、可见性或未提交文件。

## 尚不能完全自动恢复的能力

- `code-review`、`domain-modeling`、`grill-me`、`grill-with-docs`、`grilling`、`tdd`：本机存在，尚未确认精确上游与版本。保留原安装，不凭名称猜仓库；新电脑需补来源或单独私有备份。
- `find-skills`：本机锁记录能确认 vercel-labs/skills 来源，尚未绑定修订。
- 飞书/Lark 四项已加载技能：本机锁记录指向官方来源；CLI、精确版本和认证需按官方安装方式恢复。
- `personal-change-management`：目前 owning skills 工作树中仍是未提交目录；不包含在选定远端 ref 中。
- 个人 preferences/repeated-workflows 等存在尚未发布的本机修改。恢复 ref 是公开基线，不是本机逐字镜像。
- `debug-skills`：工作单位/环境相关，必须在获得对应授权后作为私有可选目录接入，换工作不自动启用。
- 私有 `/fix` 是原型，其上游尚有 provider E2E / 产品合同差异；这里不替上游宣称完成。

本轮未修改这些 owning source，也未批量同步它们。补齐缺口时在对应仓库单独评审/发布，再更新本清单。

## 验证边界

结构验证覆盖本仓库资源、JSON、链接、角色工具名、路径与明显 secrets 模式；它不能代替人工隐私检查或全量 Git 历史审计。

单元测试覆盖计划零写、安装、私有覆盖、冲突、幂等、备份/恢复、目录清理与保留后续用户内容，以及非法路径。真实 Pi smoke 只检验隔离环境的发现与注册，不联网、不登录、不向 provider 发请求；不覆盖长任务取消、真实子进程模型调用或私有 `/fix` E2E。

安装器提供单次串行文件操作与失败时尽力回退；退出 Pi 后再运行。进程崩溃、并发写入和恶意修改备份不属于事务保证；restore 的 hash 检查用于保护后续手改，不是备份签名。
