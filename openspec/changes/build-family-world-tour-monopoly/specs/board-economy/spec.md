# Board and Economy Specification

## ADDED Requirements

### Requirement: World city board

系统 SHALL 提供参照用户实体棋盘比例的 17×17 外圈、共 64 格的环形世界路线，并在当前/临近城市格上清晰展示城市名称、价格、归属玩家和建筑等级；当前位置与临近路线通过右上角信息型导航仪呈现。

#### Scenario: Read the current route

- **WHEN** 玩家查看右上角路线导航仪
- **THEN** 系统展示五大洲分段进度、当前地点详情、价格或功能说明、归属信息与接下来三站

#### Scenario: Display purchased city

- **GIVEN** 某玩家已购买一座城市
- **WHEN** 棋盘重新渲染
- **THEN** 该城市显示玩家颜色与归属标识，玩家资产区同步显示该城市

### Requirement: Roulette movement

系统 SHALL 使用带动画和音效的双球轮盘，让两颗球独立生成 0–12 的均匀随机落点，将两数之和作为 0–24 的移动点数，并逐格移动当前玩家棋子；总点数为 0 时保持原位并解析当前格。

#### Scenario: Pass the starting tile

- **GIVEN** 玩家距离起点还有 3 格
- **WHEN** 轮盘结果为 5
- **THEN** 棋子移动 5 格，经过起点时系统自动发放奖励并展示资金增加动画

### Requirement: Child counting answer gate

系统 SHALL 对标记为小朋友的当前玩家展示与参考图片一致的可数点数轮盘，并在轮盘停稳后要求其正确说出或选择 1–6 的点数，答对前不得移动棋子。

#### Scenario: Child answers correctly

- **GIVEN** 当前玩家是小朋友且轮盘结果为 4
- **WHEN** 玩家说“四”或点击数字 4
- **THEN** 系统播放正向鼓励并让棋子前进 4 格

#### Scenario: Child answers incorrectly

- **GIVEN** 当前玩家是小朋友且轮盘结果为 4
- **WHEN** 玩家回答“3”
- **THEN** 系统温和鼓励玩家继续观察并保持同一道题，棋子不移动且不产生惩罚

### Requirement: City purchase decision

系统 SHALL 在当前玩家落到无主城市时展示购买信息，并允许玩家购买或放弃。

#### Scenario: Purchase an affordable city

- **GIVEN** 城市无主且玩家现金足够
- **WHEN** 玩家确认购买
- **THEN** 系统仅扣款一次、设置城市归属并更新棋盘与资产区

### Requirement: City building upgrade

系统 SHALL 在玩家落到自己的城市时提供房屋或旅馆升级，并在操作前展示费用与租金变化。

#### Scenario: Upgrade to a hotel

- **GIVEN** 玩家拥有该城市且已达到旅馆前置建筑等级
- **WHEN** 玩家确认并有足够现金
- **THEN** 系统扣除升级费用、显示旅馆标识并更新租金

### Requirement: Automatic rent transfer

系统 SHALL 在玩家落到他人城市时自动计算租金，并同时更新双方现金和展示现金迁移动画。

#### Scenario: Pay rent to another player

- **GIVEN** 当前玩家落到另一位玩家拥有的城市
- **WHEN** 落点结算开始
- **THEN** 系统从付款方扣除租金、向所有者增加等额现金、播放趣味音效并显示金币迁移动画

### Requirement: Asset rescue and recommendations

系统 SHALL 在玩家现金不足以完成强制支出时展示完整的个人资产清单，并允许玩家选择卖房、卖地、抵押或赎回；每项操作必须显示可获得/需支付金额及失去租金或建筑的影响。

#### Scenario: Recommend a low-loss rescue plan

- **GIVEN** 玩家还差 900 金币支付租金，拥有多座不同价值和租金的城市
- **WHEN** 资产自救界面打开
- **THEN** 系统给出至少一种可解释的推荐方案，优先以足够覆盖缺口且损失较小的组合解决，并明确标注“推荐”而不自动执行

### Requirement: Non-repeating family card decks

系统 SHALL 为机会与命运各提供至少 24 张家庭友好卡牌，并在牌堆用尽前避免重复抽取同一张牌。

#### Scenario: Draw a negative cash card

- **GIVEN** 玩家抽到现金损失卡
- **WHEN** 系统计算损失
- **THEN** 损失不超过该玩家当前现金的 12% 且不超过配置的绝对上限
