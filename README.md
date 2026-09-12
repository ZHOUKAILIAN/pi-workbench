# Pi Workbench

可迁移的个人 Pi 工作环境：换电脑、换工作，仍能恢复自己的角色分工、交付流程、工具与方法论。

本仓库已转为 **Pi-only**。旧 Codex CLI 配置、快照和 feature-delivery skill 不再维护，历史保留在 Git 中。仓库已由 `codex-agent-team` 更名为 [pi-workbench](https://github.com/ZHOUKAILIAN/pi-workbench)。

## 我的能力入口

| 入口 / 组件 | 能力 | 恢复方式 |
| --- | --- | --- |
| `/build` | 需求对齐、实现、评审、验证 | 本仓库 prompts |
| `/work` | 解释、检查、调查、修复、交付 | 本仓库 prompts |
| `/figma_delivery` | 设计对齐、UI 实现、评审、还原验证 | 本仓库 prompts；需另外配置 Figma/相关 skills |
| 5 个角色 | product_aligner、evidence_investigator、implementer、code_reviewer、verifier | 本仓库 agents |
| `subagent` | 单角色、并行、顺序链；子 Pi 进程隔离上下文 | 本仓库 extensions |
| `/fix` | 可恢复的修复工作流原型 | 私有 my-pi-extension，按需接入 |
| 额度状态栏 / `/fast` | Pi 内的订阅额度与优先处理接线 | 私有 my-pi-extension 的 codex-usage-status；不依赖 Codex CLI |
| 搜索 / MCP | Tavily 与 MCP adapter | `--with-tools` 写入固定 npm 版本；账号另配 |
| Skills | 文档驱动、验证、设计审计、工程偏好等 | 独立 skills 仓库与外部来源；不复制出第二份源码 |

`/feature` 在私有扩展中尚未实现，不作为已交付能力。基础恢复也不代表 Figma、飞书、模型服务已经登录或完成真实 E2E。

## 新电脑恢复

支持 macOS/Linux，需要 Node.js 22+、Git；当前验证基线是 Pi 0.84.4。先检查扩展源码再安装，它们拥有当前用户的系统权限。

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.84.4
git clone https://github.com/ZHOUKAILIAN/pi-workbench.git
cd pi-workbench
npm test

# 默认只读：预览将创建/更新/冲突的文件
npm run plan
# 确认后执行；不会运行 git、npm 安装或调用模型
npm run apply
npm run doctor
pi
```

首次启动用 `/login` 登录，再用 `/model` 选择实际可用的模型并 Ctrl+S 保存默认值。角色模板不绑死模型；当前 subagent 未指定模型时启动新 Pi 进程，使用 Pi 默认模型设置，**不保证继承主会话临时选中的型号**。

安装目标默认是 `PI_CODING_AGENT_DIR`，未设置时为 `~/.pi/agent`。也可用绝对路径指定隔离目录：

```bash
node scripts/workbench.mjs plan --target "$HOME/pi-sandbox/agent"
node scripts/workbench.mjs apply --target "$HOME/pi-sandbox/agent"
node scripts/workbench.mjs doctor --target "$HOME/pi-sandbox/agent"
PI_CODING_AGENT_DIR="$HOME/pi-sandbox/agent" pi
```

目标不能位于本仓库内，不能经过符号链接；在 macOS 的临时目录测试时使用真实路径而不是 `/tmp` 别名。

### 加回个人扩展、Skills 和模型分工

1. 按 [迁移与依赖恢复](docs/migration.md) 克隆独立来源并安装依赖。
2. 把 `config/local.example.json` 复制到仓库外的私有位置，填写本机 paths / model bindings。
3. 使用同一份 local 配置安装和检查：

```bash
mkdir -p "$HOME/.config/pi-workbench"
cp config/local.example.json "$HOME/.config/pi-workbench/local.json"
chmod 600 "$HOME/.config/pi-workbench/local.json"
# 编辑 local.json 后执行：
node scripts/workbench.mjs plan --local "$HOME/.config/pi-workbench/local.json" --with-tools
node scripts/workbench.mjs apply --local "$HOME/.config/pi-workbench/local.json" --with-tools
node scripts/workbench.mjs doctor --local "$HOME/.config/pi-workbench/local.json" --with-tools
```

`--with-tools` 仅把 [固定 npm 来源](manifests/dependencies.json) 追加到 settings；下次 Pi 启动会处理缺失包，可能联网及执行包安装。Tavily 密钥、MCP 服务/认证、私有 provider 配置在本机单独配置，不放进 local.json 或本仓库。

### 已有电脑：冲突与回滚

- 已有托管角色、prompt、全局规则或 subagent 代码不一致时，默认整个安装拒绝写入；看清 `plan` 后才加 `--replace`。
- settings 按“仓库默认 < 现有偏好 < local.settings”合并；资源数组追加去重。已有无关设置、文件和目录权限保留。
- 每次发生改动，先在目标 `.workbench-backups/<ID>/` 创建私有备份；没有改动则不写文件、不新增备份。
- `--replace` 表示认可替换托管文件，不是删除整个 agent 目录。脚本不删除额外旧文件、旧资源路径或旧 npm 版本；见迁移文档的清理步骤。

```bash
node scripts/workbench.mjs apply --replace
# 用实际输出的 backup ID；同样支持 --target
node scripts/workbench.mjs restore --backup BACKUP_ID
```

回滚只恢复本次改动：新文件删除，旧文件及原权限恢复；本次创建且仍为空的资源目录删除，原有目录、后续用户内容和备份保留。如果安装后又手改了相关托管文件，拒绝覆盖；先自行保存并对齐差异。备份可能含原 settings 中的私有配置，**不要上传**。安装/回滚时请退出 Pi，不支持与其他写配置进程并发操作或崩溃事务恢复。

## 日常维护

```text
通用角色/提示词/默认配置 -> 修改本仓库 -> 测试/评审 -> 本地安装
扩展代码                 -> 修改 my-pi-extension -> 更新本仓库依赖基线
方法论 skill             -> 修改 skills 的 owning source -> 更新恢复清单
机器目录/模型绑定         -> 修改仓库外 local.json -> 预览并安装
账号/密钥/会话            -> 仅本机私有管理
```

不要反向打包整个 `~/.pi`。通用内容在仓库修改，安装目录是部署副本；本机直接改过的文件先手工比较并脱敏，再决定回写哪一个来源。

## 仓库结构

```text
config/                 全局协作规则、安全默认值、local 示例
agents/                 五个通用角色
prompts/                三个交付入口
extensions/subagent/    原本只在本机的子 agent 扩展
optional-extensions/    默认不启用的个人 provider 显示偏好
manifests/              外部扩展和 Skills 的恢复来源及缺口
docs/migration.md       资产边界、私有依赖恢复与迁移注意事项
scripts/                plan / apply / doctor / restore、校验与 Pi smoke
test/                   隔离目录中的确定性测试
```

本仓库不是一个可单靠 `pi install git:...` 完整安装的 Pi package：Pi package 不负责部署全局 AGENTS 和自定义角色目录。因此统一使用上述安装脚本。

## 验证与验收

```bash
npm test
npm run smoke
git diff --check
```

验收：干净目录能恢复 5 个角色、3 个 prompt 和 subagent；真实 Pi 能发现这些资源；重复安装幂等；冲突不覆盖；安装前有备份，回滚保护后续改动；不复制登录态、模型私密目录、session 或缓存。

`doctor` 检查托管文件和声明的本机路径/配置，不验证第三方包下载、远端权限或真实模型可用性。`smoke` 使用临时 HOME 和 agent 目录，运行真实 Pi 资源加载、测试夹具 skill/package，不发送模型请求。来源未确认、未发布或工作相关能力见 [恢复缺口](docs/migration.md#尚不能完全自动恢复的能力)。
