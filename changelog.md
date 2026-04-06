# 修改需求记录（Changelog）

本文件按时间顺序记录你提出的功能与体验类修改要求，便于日后查阅。实现细节以代码为准；若某条尚未完全落地，可在此标注。

---

## 2026-04-03

### 走格前属性浮窗渐隐

- 我军开始沿路走格时，若场上 **半透明属性浮窗** 仍打开：使用 **较短渐隐**（约 **260ms**，减弱动效下约 **120ms**），与 CSS 类 **`unit-attr-float--fade-move`** 一致；避免久等才开走，又比瞬间消失更自然。
- 自然超时关闭的浮窗仍为 **约 0.9s** 淡出（不变）。

### 敌军回合：不保留检视、不弹人物浮窗

- 进入 **敌军回合** 时清空 **`inspectUnitId`**，避免上一回合检视残留；敌军 **`pendingMove` 结束后** 也不会再因同一检视 id 把属性浮窗 **重新打开**。
- **敌军行动中**：场上点击格子/单位、侧栏点将 **不再设置检视**（与 `turnIntroLocked` 无关的独立门控）。
- **`GameBattle`**：仅 **`turn === "player"`** 时参与属性浮窗的展示逻辑与 DOM 渲染（防御性一致）。

### 战斗页手机横屏 / 竖屏布局

- **根因**：`.game-layout.game-layout--battle` 的 **双列 grid** 选择器比 `max-width: 900px` 更具体，窄屏仍两列 + `game-main` 的 `order: -1`，导致 **战场被挤进约 220px 宽一列**、侧栏反而更宽。
- **`max-width: 900px`**：对战斗页强制 **`grid-template-columns: 1fr`**，并 **`min-height: min(100dvh, 100vh)`**。
- **竖屏**（`orientation: portrait`）：主区 **`minmax(0, 1fr)`** 尽量把高度留给地图；侧栏 **`position: static`**、取消 sticky 限高；**武将信息** 展开区 **`max-height`** 约 **`30dvh`**。
- **横屏**（`orientation: landscape`）：**侧栏窄列 + 战场 `1fr`** 同行；**`game-main` `order: 0`** 与 DOM 一致（战局在左、地图在右）；略缩 **`武将信息` / 单位列表** 最大高度以免压扁地图。
- **`index.html`**：`viewport-fit=cover`；战斗页 **`padding`** 使用 **`env(safe-area-inset-*)`** 适配刘海与底部安全区。

### 回合计数、上限与界面展示

- **`BattleState`**：增加 **`battleRound`**（从 1 起，每进入新一轮 **我军回合** 递增；同一轮内敌方阶段仍属同一回合）、**`maxBattleRounds`**（可选，关卡 **`scenarios` meta** 可设；**`baseState`** 默认 **60**）。
- **`battle.ts`**：**`finishEnemyTurnAndStartPlayer`** 在进入下一我军回合前递增回合；若超过 **`maxBattleRounds`** 则 **判负** 并写入战报；**`ensureBattleFields`** 为旧存档补齐/规范化上述字段。
- **战局略图**（**`BattleOverviewMap`**）：标题下显示 **当前回合 / 回合上限**（`GamePage` 传入 `battleRound`、`maxBattleRounds`）。
- **回合开场横幅**（**`GameBattle`**）：显示「我方 / 敌方回合」时同时带上 **第 n / m 回合**（无有效上限时仅 **第 n 回合**）。

### 战斗页布局与战局略图视口

- **战斗主区域**贴近全屏/视口高度布局，主战场网格可滚动；**`GameBattle`** 在滚动时上报 **归一化视口**（**`BattleViewportNorm`**），**`GamePage`** 传入 **战局略图**，侧栏略图上 **黄框** 标示当前网页内可见的战场范围（与主战场 scroll 同步）。

### 将领图鉴（100+）、大地图、胜利条件与秘籍图鉴（白天 · 续）

- **`client/src/game/generals.ts`**：三国演义向 **将领图鉴**（名将列传 + 批量部将/文臣），合计 **超过 100 人**；`unitFromCatalog` 按关卡 tier 缩放等级与兵力，供 `scenarios` 摆将。
- **`BattleState`** 扩展 **`scenarioBrief` / `victoryBrief` / `winCondition`**（`eliminate_all` 或 `eliminate_marked_enemies`）；**`battle.ts`** 的 `checkOutcome` 与 **`ensureBattleFields`** 兼容旧存档。
- **`scenarios.ts`**：各关 **更大的网格**（16×10 … 24×14）、按剧情重写的 **开场 log / 背景提要 / 胜利说明**，敌军以 **曹操、诸葛亮、夏侯惇、周瑜** 等图鉴将领混合杂兵；序章击破 **张角**、小沛击破 **吕布**、剑阁击破 **刘璋**、汉中击破 **夏侯惇** 等为 **主将胜利** 关。
- **秘籍 Ctrl+Shift+J**：将领列表 + 筛选 + 点击看属性/列传；战场 **`--cell`** 随 **`gridW`** 缩小，大地图仍可一屏操作。
- **README** 已补充大地图、胜利条件与双秘籍说明。

### 刘备线多关卡、兵种立绘与秘籍选关（白天）

**战役与代码结构**

- 刘备主线扩展为 **9 关**（`SCENARIO_ORDER`）：序章黄巾、`ch1_pursuit` 起至汉中定军山麓等；敌军数量与数值随章递增，各关使用不同 **地形模板**（经典/密林/河道/水泽/山隘/沙地混合等）。
- 关卡数据集中到 **`client/src/game/scenarios.ts`**（`buildBattleStateForScenario`、`listScenarioEntries`、`createDefaultTerrain`）；**`battle.ts`** 通过 `createBattleForScenario` / `SCENARIO_IDS` 引用，胜负后的 **`createNextBattleAfterVictory`** 仍按顺序进关并 **合并存活我军**（`mergeCarriedPlayers`）。
- 保留既有 **`scenarioId`**（如 `prologue_zhangjiao`、`ch1_pursuit`），避免旧存档语义错乱。

**兵种精灵与战场表现**

- 骑兵 / 步兵 / 弓兵使用 **PNG 位图**（`client/public/sprites/units/`）；**`client/scripts/remove-sprite-bg.mjs`** 做背景剔除（各兵种参数可区分），**`npm run sprites:units`** 一键处理素材。
- 步兵、弓兵在 **CSS** 中适度放大（如 `transform: scale`），与骑兵在同一格内 **体量观感** 更一致；战场单位为立牌式展示（血条、姓名、兵种等在格子上方等，与既有 UI 统一）。

**秘籍选关**

- 游戏页 **Ctrl+Shift+K** 打开全关卡列表，点选 **直接进入** 对应关；**Esc** 关闭；打开时 **`GameBattle`** 通过 **`keyboardBlocked`** 屏蔽战场快捷键，避免误操作。
- **README** 中写明秘籍组合键，防止遗忘。

---

### 战斗节奏、受击反馈与 Azure CI/CD（晚间）

**移动与敌军 AI**

- 我军 / 敌军移动改为 **沿路逐格推进**（`pendingMove` + `GamePage` 定时调用 `advancePendingMove`），避免一帧瞬移到终点。
- 敌军移动与 **本回合移动力、地形消耗** 对齐：用 Dijkstra 建路径并逐格执行；移除错误的单步逼近逻辑，避免超距移动与表现异常。

**回合转场与可操作时机**

- 「我方回合」「敌方回合」字幕在 **上一方行动动画（位移、受击等）结束后再出现**（与 `POST_ACTION_TURN_BANNER_DELAY_MS` 等时长对齐）。
- 字幕流程未结束前 **锁定战场操作与敌军 AI**（`turnIntroLocked`、遮罩拦截点击与键盘、侧栏待机按钮等），避免抢操作。

**Bug：受击动画打在己方身上**

- 原因：用「前后帧 HP 差」推断受伤单位时，与攻击方升级等 **同一帧内多单位状态变化** 冲突，导致 `setDmgFx` 指向错误。
- 修复：在 `BattleState` 增加 **`damagePulse`（受害者 id + 伤害量）**，由 `applyPlayerMeleeDamage` / 计策伤害 / 敌军攻击等路径写入；`GameBattle` 消费后清空；不再用 HP 差推断飘字与 `unit-hit`。

**Azure 与 GitHub Actions**

- 新增 **`.github/workflows/azure-app-service.yml`**：PR 构建校验；推 `main`/`master` 打包 `server` + `client/dist` 并 **部署到 Azure App Service（Linux / Node 20）**。
- **`infra/azure/`**：`create-resources.sh` / `.ps1` 创建资源组、计划、Web 应用、启动命令、HTTPS、非免费档 Always On；**自动注册 `Microsoft.Web` 提供程序**；**自动开启 SCM / FTP 基本发布凭据**（`basicPublishingCredentialsPolicies`），便于发布配置文件部署；脚本内提示为英文。
- **README**（含故障排除：发布配置与 `app-name`、可选门户下载发布配置等）；工作流内对 **`AZURE_WEBAPP_NAME` trim**、对发布配置 Secret 做长度与 XML 关键字检查。

---

### 胜负与关卡流转

- 敌军全灭时：显示文案 **「敌军全灭，战斗胜利！」**，随后 **进入下一关**；若无下一关则从序章重新开始。
- 我军全灭时：显示文案 **「我方全部阵亡」**，随后 **重新开始游戏**（新开局）。
- 在界面上对终局状态做明显提示（如全屏/主区域遮罩），并在约数秒后自动执行上述跳转；需避免定时器在休眠等场景下重复注册或卡死。

### 合盖休眠后点击无响应

- 排查并修复：笔记本合盖再打开后，战场 **无法响应点击**、无法操作角色的问题。
- 方向包括：回合转场全屏层对点击的拦截与定时器丢失、胜负遮罩与页面可见性恢复后的状态补全等。

### 可走格子视觉

- 选中角色并显示移动范围时，**可走格与不可走格**的对比要更强，一眼能分清；含对非目标格的弱化与高亮样式优化。

### 取消移动选中

- 在已点选我军且 **显示可走格子** 时，支持 **Esc** 或 **鼠标右键** 取消当前「活动角色」选中（回到点选将领状态，不移动棋子、不撤销已走步）。

### 将领种类（骑 / 步 / 弓）

**需求要点**

- 引入 **骑兵、步兵、弓兵** 三类将领种类，与原有「兵种」（平军/山军/水军）并存。
- **移动力**：骑兵最强、步兵居中、弓兵最弱（实现为每回合移动力点数：6 / 4 / 3，地形消耗规则不变）。
- **普攻**：弓兵 **远程**（曼哈顿距离 ≤2），步骑仅 **相邻**。
- **攻击相克**：骑兵打步兵优势、步兵打弓兵优势、弓兵打骑兵优势。
- **防御相克**：步兵防弓兵优势、骑兵防步兵优势、弓兵防骑兵优势。

**实现摘要（便于对照代码）**

- `Unit.troopKind`，移动力由 `movePointsForTroop` 与将领种类对齐；旧存档缺字段时默认步兵并回填。
- 普攻射程 `inPhysicalAttackRange`；相克参与普攻伤害结算（攻方克制倍率、守方克制加防御）；计策伤害不参与兵种相克。
- 敌军 AI、选目标、战报文案与行动菜单（「近战攻击」/「远程射击」）已按兵种区分；检视面板展示将领种类、移动力及弓兵射程说明。
- 默认我军配置示例：刘备步兵、关羽骑兵、张飞弓兵；关卡敌军已混搭三类以便体验。

---

## 此前同项目迭代（日期未单独标注）

以下为较早会话中已梳理过的需求方向（与当前代码中的地形、计策、存档等能力对应；具体句式以当时对话为准）。

### 战场与系统扩展

- 扩展类型与存档：**地形**、单位属性、**计策**相关状态、**v2** 存档结构等。
- 战斗逻辑：**地形**与寻路/移耗、**计策**、费用与回合重置、旧存档迁移等。
- 客户端战场表现：格子 **地形** 表现、单位视觉、**计策菜单** 等。
- **GamePage**：查阅单位信息的 **检视面板**，以及与计策、取消等操作的接线。

---

## 使用说明

- 以后每次提出新修改要求时，可在 **顶部或按日期追加** 一节，简要写清「要什么、不要什么（如有）」即可。
- 若某次需求分多轮对话才定稿，可合并为一条，用括号补充「补充：……」。
