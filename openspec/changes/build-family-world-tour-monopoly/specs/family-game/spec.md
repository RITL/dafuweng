# Family Game Specification

## ADDED Requirements

### Requirement: Custom family game setup

系统 SHALL 允许家庭创建包含 2–6 名玩家的本地对局，并为每位玩家配置唯一名称、颜色、头像和可选的“小朋友”标记。

#### Scenario: Start a four-player game

- **GIVEN** 用户选择 4 名玩家并填写名称
- **WHEN** 用户确认开始游戏
- **THEN** 系统创建四名玩家、分配初始现金并随机确定第一位玩家

#### Scenario: Mark a child player

- **GIVEN** 家庭正在为“小宝”配置玩家资料
- **WHEN** 用户开启“我是小朋友”标记
- **THEN** 系统将该标记保存进本机对局，并在小宝每次轮盘结束后进入点数回答环节

### Requirement: Deterministic turn ownership

系统 SHALL 在任何时刻只允许当前玩家触发前进和结算操作，并在结算完成后切换到下一位有效玩家。

#### Scenario: Prevent duplicate movement

- **GIVEN** 当前玩家的轮盘正在旋转
- **WHEN** 玩家重复点击或再次说“前进”
- **THEN** 系统忽略重复输入且只生成一次移动结果

### Requirement: Local persistence

系统 SHALL 在每个已完成的结算点把版本化对局状态保存到本机，并在重新打开页面时提供恢复选项。

#### Scenario: Restore after refresh

- **GIVEN** 一局游戏已进行多个回合并自动保存
- **WHEN** 页面被刷新
- **THEN** 用户可恢复到最近一次完整结算后的状态，且不会重复扣款

### Requirement: Family-friendly solvency protection

系统 SHALL 限制单张随机卡牌造成的现金损失，并在强制支出导致玩家资不抵债时提供家庭援助流程而非立即淘汰。

#### Scenario: Rent exceeds available cash

- **GIVEN** 玩家现金不足以支付完整租金
- **WHEN** 系统结算租金
- **THEN** 系统执行配置的资产处置或银行援助，并记录完整结算，不让玩家因单次事件突然退出游戏

### Requirement: Settle the game at any time

系统 SHALL 允许家庭在任意回合发起结算，并在完成当前已经确认的交易后停止产生新的游戏效果。

#### Scenario: Settle because the family needs to leave

- **GIVEN** 对局正在进行且当前没有未确认的资金决策
- **WHEN** 用户点击“结算本局”并再次确认
- **THEN** 系统停止后续回合并展示最终资产排行榜

### Requirement: Value every asset at original price

系统 SHALL 以当前现金、城市购买原价和已支付的房屋/旅馆升级原价之和作为玩家最终总资产。

#### Scenario: Calculate a player's final assets

- **GIVEN** 玩家有 8,000 现金、原价 3,000 的城市和累计投入 2,000 的建筑
- **WHEN** 系统结算本局
- **THEN** 该玩家的总资产显示为 13,000，并分别展示三项明细

### Requirement: Rank and celebrate winners

系统 SHALL 按总资产降序生成排名，以现金作为同资产时的次级排序，并为最终冠军展示醒目的庆祝效果。

#### Scenario: Celebrate a sole winner

- **GIVEN** 一名玩家的总资产高于其他所有玩家
- **WHEN** 排行榜出现
- **THEN** 系统放大冠军卡、显示恭喜文案并播放可跳过的彩带庆祝效果

#### Scenario: Handle a complete tie

- **GIVEN** 两名玩家的总资产与现金均相同且并列第一
- **WHEN** 系统生成排行榜
- **THEN** 两名玩家都显示为第一名和共同冠军
