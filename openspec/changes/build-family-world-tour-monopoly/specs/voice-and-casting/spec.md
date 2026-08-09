# Voice and Casting Specification

## ADDED Requirements

### Requirement: Named turn announcement

启用语音主持后，系统 SHALL 在每回合开始时用中文点名当前玩家，并询问是否继续。

#### Scenario: Announce a player turn

- **GIVEN** 当前玩家名称为“小宝”且语音主持已开启
- **WHEN** 小宝的回合开始
- **THEN** 系统播报“已经轮到小宝啦，是否继续？”并在播报结束后进入监听状态

### Requirement: Child math voice prompt

系统 SHALL 在小朋友玩家的轮盘停稳后播报“这是多少点？”，识别一至六的中文或阿拉伯数字答案，并仅在回答正确后触发移动。

#### Scenario: Encourage another try

- **GIVEN** 小宝的轮盘结果为 5，系统正在等待点数答案
- **WHEN** 系统识别到小宝回答“三”
- **THEN** 系统播报温和鼓励语并继续等待答案 5，不揭晓正确答案也不移动棋子

### Requirement: Voice command to move

系统 SHALL 在当前回合监听窗口识别“继续”“前进”“开始”“走吧”“出发”等同义指令，并只触发一次轮盘。

#### Scenario: Player says move

- **GIVEN** 系统正在等待当前玩家指令
- **WHEN** 玩家说“前进”且识别置信度满足阈值
- **THEN** 系统停止监听、启动轮盘，并忽略本次移动完成前的后续语音指令

### Requirement: Voice wait command

系统 SHALL 识别“等”“等等”“等一下”“稍等”等等待指令，保持当前玩家而不跳过回合。

#### Scenario: Player asks to wait

- **GIVEN** 系统正在等待当前玩家指令
- **WHEN** 玩家说“等一下”
- **THEN** 系统进入等待状态，并在 15 秒后最多重播一次提醒，同时保留屏幕上的开始按钮

### Requirement: Safe voice fallback

系统 SHALL 在麦克风未授权、浏览器不支持、识别超时或无法确认指令时提供功能等价的屏幕按钮，且不得自动跳过玩家或自动执行资金决策。

#### Scenario: Microphone permission denied

- **GIVEN** 用户拒绝麦克风权限
- **WHEN** 当前玩家回合开始
- **THEN** 系统仍可播报（若合成可用），显示“开始前进”和“稍等一下”按钮，并允许完整继续游戏

### Requirement: Prevent self-triggering speech

系统 SHALL 在语音播报期间关闭语音识别，并在播报结束后才开启监听。

#### Scenario: Host says the word start

- **GIVEN** 语音主持正在播报询问句
- **WHEN** 播报内容中包含“开始”
- **THEN** 语音识别不应被该播报触发，轮盘保持未启动

### Requirement: Safe financial voice confirmation

系统 SHALL 允许当前玩家用语音选择购买、放弃、升级、卖房、卖地、抵押和赎回，但任何资金或资产变更必须经过独立的二次确认提示，且播报确认内容期间关闭识别。

#### Scenario: Confirm a city purchase by voice

- **GIVEN** 当前玩家落到无主城市巴黎并说“购买”
- **WHEN** 系统复述“支付 3000 金币购买巴黎，请说确认或取消”后，玩家说“确认”
- **THEN** 系统仅执行一次购买；其他对话、重复识别或播报自身都不得触发交易

#### Scenario: Cancel an asset sale

- **GIVEN** 玩家选择卖出一处资产，系统正在等待最终确认
- **WHEN** 玩家说“取消”
- **THEN** 系统不改变现金和资产，并返回资产自救清单

### Requirement: Television casting layout

系统 SHALL 提供适配 1920×1080 和 1366×768 横屏的投屏模式，让棋盘、当前玩家、余额和主要操作无需页面滚动即可看到。

#### Scenario: Enter fullscreen casting mode

- **GIVEN** 用户在支持全屏的浏览器中打开游戏
- **WHEN** 用户点击“投屏模式”
- **THEN** 页面进入全屏布局并放大远距离需要阅读的当前玩家、轮盘结果和操作按钮
