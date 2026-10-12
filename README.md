# Pi Workbench

个人 Pi 工作台，把角色分工、交付流程、工具和工程方法组织成一套可复用的工作环境。

在不同项目和电脑上，使用同一套协作方式；模型、账号和工作环境配置由本机独立管理。

## 能力

| 入口 / 组件 | 用途 | 来源 |
| --- | --- | --- |
| `/build` | 需求对齐、实现、评审、验证 | 内置提示词 |
| `/work` | 解释、检查、调查、修复、交付 | 内置提示词 |
| `/figma_delivery` | 设计对齐、UI 实现、评审、还原验证 | 内置提示词；需配置 Figma 和相关 Skills |
| `subagent` | 单角色、并行任务、顺序链及持久子会话；独立 Pi 进程隔离上下文 | 外部 `@pi/subagent`，由 my-pi-extension 唯一维护 |
| `/fix` | 可恢复的修复工作流原型 | 可选外部扩展 |
| 额度状态栏 / `/fast` | 订阅额度展示与优先处理接线 | 可选外部扩展 |
| 搜索 / MCP | Tavily 搜索与 MCP 服务接入 | 可选第三方扩展 |
| Skills | 文档驱动、服务验证、设计审计、工程偏好等 | 独立 Skills 来源 |

五个角色各司其职：

- **product_aligner**：对齐目标、范围和验收标准。
- **evidence_investigator**：调查取证，建立可复核的根因链路。
- **implementer**：按需承接独立并行实现，或用户明确指定的执行任务；不是默认代码执行者。
- **code_reviewer**：独立审查完整约定功能及关联调用链，集中反馈并连续复审。
- **verifier**：对照验收标准验证结果。

主会话默认负责需求理解、连续实现、自检、集成和集中修复，独立 reviewer 保留质量门槛。默认流程是：

```text
主会话实现与自检 → 独立整体功能评审 → 主会话集中修复 → 同一 reviewer 复审 → 适用验证与交付
```

只有契约明确、写入互不重叠、结果可独立验证且主会话能同时推进独立工作的任务，才委派 implementer 并行实现；任务大或文件多不是理由。用户明确指定执行者时遵循其选择。评审范围是原始固定基准至最终状态的完整功能与受影响的既有链路，不是最后一个补丁，也不是无关全仓审计；中途 commit 不重置功能基准。复审显式传回 reviewer 的 `session` 句柄，`persistent: true` 本身不复用会话。目标完整首审加集中修复复审，不以轮数上限放过真实缺陷；独立运行/视觉验收仍需相应环境与权限。

主会话负责范围、阶段决策和最终结论。提示词定义协作流程，不等同于持久化工作流引擎。

## 快速开始

支持 macOS/Linux，需要 Node.js 22+、Git；当前验证基线为 Pi 1.1.0。扩展拥有当前用户的系统权限，安装前应审阅源码。

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.1.0
git clone https://github.com/ZHOUKAILIAN/pi-workbench.git
cd pi-workbench
npm test

# 先预览，再安装
npm run plan
npm run apply
# 基础安装只部署规则和角色；按配置指南接入外部 @pi/subagent
# 接入后使用同一 local 配置运行 doctor，再启动 Pi
pi
```

首次启动使用 `/login` 登录模型服务，再通过 `/model` 选择实际可用的模型，按 Ctrl+S 保存默认值。

```text
/build 为这个项目增加一个导出功能
/work 排查这个接口为什么返回错误
/figma_delivery 按设计稿实现这个页面
```

安装脚本只部署配置和资源，不下载扩展、不调用模型，也不复制 subagent。要使用独立评审/委派，先按 [配置指南](docs/configuration.md#外部扩展与-subagent) 将外部 `@pi/subagent` package 的本机绝对路径加入 `local.packages`，再用同一 local 配置 plan/apply/doctor；仅基础安装时 doctor 会报告缺少 subagent，不能视作完整工作环境就绪。搜索、MCP、其他扩展和 Skills 同样显式接入。

## 配置与安装

- 默认安装到 `~/.pi/agent`；支持 `PI_CODING_AGENT_DIR` 或 `--target` 指定目录。
- 仓库维护通用角色、提示词和安全默认值；本机 `local.json` 维护模型绑定和资源路径。
- 角色默认不绑定型号。子 Pi 进程使用 Pi 默认模型设置，不保证跟随主会话临时切换的型号。
- subagent 及其他扩展源码由 [my-pi-extension](https://github.com/ZHOUKAILIAN/my-pi-extension) 维护，方法论由 [skills](https://github.com/ZHOUKAILIAN/skills) 等独立来源维护，本仓库不复制它们的源码，也不通过软链接部署。
- 账号、密钥、模型服务配置和运行记录只在本机管理，不提交到仓库。

本仓库使用安装脚本统一部署全局规则和角色目录，不是单靠 `pi install git:...` 就能完整安装的 Pi package。

### 更新与回滚

`plan` 默认只读。托管文件与本机内容冲突时，安装会整体拒绝写入；确认差异后，才使用 `--replace`。

```bash
node scripts/workbench.mjs apply --replace
# 使用安装输出的实际 backup ID
node scripts/workbench.mjs restore --backup BACKUP_ID
```

每次有改动，安装器先创建私有备份；重复安装无变化时不写文件。回滚恢复原文件及权限，删除新文件和本次创建且仍为空的资源目录，保留原有目录、后续用户内容及备份。相关托管文件被再次修改时，回滚会拒绝覆盖。

安装和回滚前请退出会写配置的 Pi 进程。旧工作台安装若留下内置 subagent，plan/doctor 会报告，apply 即使加 --replace 也拒绝继续；先显式检查和迁移，不自动删除用户扩展。旧备份仍可显式 restore。参数、迁移与备份位置见 [配置指南](docs/configuration.md#更新与回滚)。

## 目录

```text
config/                 全局协作规则、安全默认值、local 配置示例
agents/                 五个通用角色
prompts/                三个交付入口
optional-extensions/    按需启用的 provider 显示偏好
manifests/              外部扩展、Skills 来源与版本信息
docs/configuration.md   本机配置、依赖接入、更新与回滚
scripts/                安装、检查、回滚和验证工具
test/                   隔离目录中的确定性测试
```

通用内容在所属仓库修改、验证后再安装；安装目录是部署副本，不是第二个维护源。扩展和 Skills 更新后，按需更新 [依赖清单](manifests/dependencies.json)。

## 验证

```bash
npm test
npm run smoke
git diff --check
```

- `npm test`：结构、配置、路径安全、安装幂等、冲突保护、备份与回滚。
- `npm run smoke`：使用临时 HOME 和 agent 目录，验证五个角色文件部署、三个提示词、全局规则及测试用 Skill/扩展包的发现，不发送模型请求；不提供/验证 subagent。
- `npm run smoke -- --subagent-package <本机绝对package目录>`：额外加载真实外部包，检查唯一 subagent 注册及 session/persistent/并行任务 session 参数；不执行子任务，不代表会话恢复或 provider E2E 通过。
- `doctor`：检查托管文件、外部本机包的 manifest/入口及已知旧 subagent 来源，不验证加载后的工具语义、任意其他扩展中的同名注册、远端权限、第三方下载或模型可用性。

外部能力需要各自的依赖和授权；当前固定修订只验证 subagent 的 Pi 1.1.0 注册/参数，未验证同仓 `/fix`、额度状态栏的 Pi 1.1.0 兼容性或 provider E2E。`/fix` 当前为原型，`/feature` 尚未实现。详细状态见 [可选能力与依赖](docs/configuration.md#可选能力与依赖)。
