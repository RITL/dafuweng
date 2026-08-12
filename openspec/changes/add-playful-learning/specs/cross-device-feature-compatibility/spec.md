# Cross-device Feature Compatibility Specification

## ADDED Requirements

### Requirement: New features remain operable on every supported display

系统 SHALL 为每个新增知识卡、挑战、设置和奖项流程提供在手机横屏、平板、桌面、电视和 iPhone 遥控器上的完整操作路径。

#### Scenario: Complete a challenge on iPhone landscape

- **GIVEN** 游戏运行在 844×390、896×414 或 932×430 的手机横屏
- **WHEN** 系统展示旅行挑战
- **THEN** 题目、主要选项、提示和跳过均可见或可在弹层内部滚动到达，页面本身不会把棋盘布局挤坏

#### Scenario: Control a television game from iPhone

- **GIVEN** 电视端由已配对的 iPhone 遥控
- **WHEN** 电视触发知识卡或旅行挑战
- **THEN** 手机端同步显示足够的题目摘要与全部主操作，玩家无需走到电视前点击

### Requirement: Responsive controls preserve visual affordance

系统 SHALL 保证选项具有清晰边界、间距、选中态和焦点态，不得在窄屏退化为连续文字。

#### Scenario: Render rent difficulty on a narrow setup screen

- **GIVEN** 开始页在窄屏或字体放大环境显示四档地产收费强度
- **WHEN** 可用宽度不足以舒适横排四项
- **THEN** 控件采用 2×2 或其他清晰布局，每项至少 44×44 CSS 像素，名称和倍率不相互粘连

### Requirement: Overlays stay within the visual safe area

系统 SHALL 将新增浮层限制在可用视口和安全区内，并保持关闭入口与主要操作始终可达。

#### Scenario: Open a knowledge card on a short landscape screen

- **GIVEN** 手机横屏可用高度不超过 430 像素
- **WHEN** 城市知识卡打开
- **THEN** 浮层避让顶部玩家条与功能入口，关闭和继续按钮不会被裁切，额外内容仅在浮层内部滚动

#### Scenario: Close an overlay and resume play

- **GIVEN** 玩家从棋盘中的某一回合阶段打开学习浮层
- **WHEN** 玩家关闭或完成浮层
- **THEN** 系统恢复原回合阶段、焦点和必要的滚动位置，不重复移动或结算

### Requirement: Television navigation and readability

系统 SHALL 让新增流程可由电视实体遥控器完成，并在 1920×1080 与 3840×2160 保持远距离可读。

#### Scenario: Navigate a challenge with a television remote

- **GIVEN** 旅行挑战显示在电视端
- **WHEN** 用户使用方向键、确认键和返回键
- **THEN** 焦点依次到达所有主操作，确认键执行一次动作，返回键关闭可跳过说明且不会清除对局

### Requirement: Functional fallback without voice

系统 SHALL 在语音输入关闭、权限拒绝、浏览器不支持或遥控断开时保留所有新增功能的按钮操作。

#### Scenario: Microphone input is disabled

- **GIVEN** 语音回复已经关闭但主持播报仍可开启
- **WHEN** 玩家进入知识卡或旅行挑战
- **THEN** 文案改为触控提示，所有回答、继续、提示和跳过动作均可点击完成

### Requirement: Fixed viewport acceptance matrix

系统 SHALL 在 844×390、896×414、932×430、768×1024、1024×768、1280×800、1366×768、1920×1080 和 3840×2160 完成新增功能验收。

#### Scenario: Mark a feature complete

- **GIVEN** 一项新增功能已经通过业务测试
- **WHEN** 团队准备在任务清单中标记完成
- **THEN** 该功能还必须通过固定视口矩阵、85%/100%/125% 缩放抽查和关键操作可达检查

### Requirement: Existing physical roulette remains stable

系统 SHALL 在增加学习功能后保持实体俄罗斯轮盘的 0–24 输入、语音报点、0 点、防重复提交、模式记忆和远程控制行为。

#### Scenario: Use physical roulette after the learning upgrade

- **GIVEN** 家庭选择实体俄罗斯轮盘模式
- **WHEN** 玩家提交一个 0–24 的合法结果
- **THEN** 系统只移动一次并继续原有落点结算，新增学习流程不得改变随机模式或重复移动
