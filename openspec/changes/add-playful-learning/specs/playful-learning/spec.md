# Playful Learning Specification

## ADDED Requirements

### Requirement: Age-appropriate child profiles

系统 SHALL 允许为小朋友选择年龄段，并据此限制题型、数字范围、提示复杂度和交互方式；未选择年龄段时 SHALL 保持现有加法体验。

#### Scenario: Restore an older child profile

- **GIVEN** 旧存档中的玩家只有“小朋友”标记而没有年龄段
- **WHEN** 系统载入该对局
- **THEN** 玩家继续使用现有双球加法规则，且对局不会失效或要求重新配置

#### Scenario: Select content for a younger child

- **GIVEN** 当前玩家年龄段为 4～6 岁
- **WHEN** 系统生成一次旅行挑战
- **THEN** 系统只选择数数、比较、颜色、图形或看图类内容，并提供触控选择

### Requirement: Contextual city knowledge cards

系统 SHALL 在城市旅行语境中提供简短知识卡，并 SHALL 避免在同一局中因重复到达持续打断游戏。

#### Scenario: Discover a city for the first time

- **GIVEN** 当前玩家本局第一次到达一座城市
- **WHEN** 必要的购买、升级或租金流程到达安全展示节点
- **THEN** 系统展示国家、大洲、地标和一条短知识，并提供继续按钮

#### Scenario: Revisit a known city

- **GIVEN** 该城市知识卡本局已经展示
- **WHEN** 玩家再次到达该城市
- **THEN** 系统不再次强制展示完整知识卡，只保留简短收藏反馈

### Requirement: Optional low-frequency travel challenges

系统 SHALL 以低频方式提供可选择类别的旅行挑战，并允许提示、查看答案和跳过。

#### Scenario: Offer a challenge choice

- **GIVEN** 当前回合满足挑战触发条件
- **WHEN** 落点结算允许插入短互动
- **THEN** 系统提供适合当前玩家的 2–3 个类别，而不是直接强制一道固定题

#### Scenario: Answer incorrectly

- **GIVEN** 玩家提交了错误答案
- **WHEN** 系统判断答案
- **THEN** 系统提供鼓励和提示入口，不扣现金、不取消回合、不公开回答速度

#### Scenario: Skip a challenge

- **GIVEN** 家庭希望保持游戏节奏
- **WHEN** 玩家点击跳过
- **THEN** 系统立即返回原有对局流程，不产生经济惩罚

### Requirement: Learning rewards remain economically neutral

系统 SHALL 使用印章、称号候选或家庭能量记录学习参与，且 SHALL NOT 以大量现金奖励改变核心经营公平。

#### Scenario: Complete a geography challenge

- **GIVEN** 玩家完成一次地理挑战
- **WHEN** 系统记录结果
- **THEN** 系统增加非现金学习记录，玩家的现金和资产估值保持不变

### Requirement: Multi-dimensional family achievements

系统 SHALL 在资产结算之后展示不改变胜负的多维度奖项，并允许多人并列。

#### Scenario: Show the final results

- **GIVEN** 家庭结束本局
- **WHEN** 系统完成现有总资产排名
- **THEN** 系统先明确资产冠军，再展示符合条件的探索、建设、勇气、合作或表达奖项

#### Scenario: Two players share an achievement

- **GIVEN** 两名玩家在某一奖项指标上并列最高且均达到展示条件
- **WHEN** 系统生成该奖项
- **THEN** 两名玩家共同获得该奖项，不使用隐藏的次级条件强行拆分
