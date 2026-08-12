import type {
  BoardTile,
  EconomyPreset,
  FamilyCard,
  GameLength,
  PlayerColor,
  RentDifficulty,
} from "./types";

export const PLAYER_COLORS: Array<{
  id: PlayerColor;
  label: string;
  hex: string;
}> = [
  { id: "coral", label: "珊瑚红", hex: "#f25f5c" },
  { id: "ocean", label: "海洋蓝", hex: "#247ba0" },
  { id: "sunny", label: "阳光黄", hex: "#f6bd60" },
  { id: "grape", label: "葡萄紫", hex: "#8b5cf6" },
  { id: "mint", label: "薄荷绿", hex: "#34b987" },
  { id: "rose", label: "樱花粉", hex: "#ec6f91" },
];

export const PLAYER_AVATARS = ["🐼", "🦊", "🐯", "🐰", "🐨", "🦁"];
export const BOARD_SIDE_LENGTH = 17;

export const ECONOMY_PRESETS: EconomyPreset[] = [
  {
    id: "relaxed",
    name: "轻松之旅",
    description: "钱更多、租金更温和，适合带小朋友慢慢玩",
    startingCash: 24000,
    startReward: 2500,
    rentMultiplier: 0.82,
    reliefFloor: 1200,
  },
  {
    id: "classic",
    name: "经典之旅",
    description: "收支平衡，买城和建设都需要一点小策略",
    startingCash: 20000,
    startReward: 2000,
    rentMultiplier: 1,
    reliefFloor: 800,
  },
  {
    id: "adventure",
    name: "冒险之旅",
    description: "资金更紧张、租金更刺激，适合熟练玩家",
    startingCash: 17000,
    startReward: 1800,
    rentMultiplier: 1.15,
    reliefFloor: 500,
  },
];

export const RENT_DIFFICULTIES: RentDifficulty[] = [
  { id: "gentle", name: "温和", description: "适合小朋友，收费 ×0.8", multiplier: 0.8 },
  { id: "standard", name: "标准", description: "保持当前规则，收费 ×1.0", multiplier: 1 },
  { id: "competitive", name: "激烈", description: "房屋与旅馆更有威慑力，收费 ×1.5", multiplier: 1.5 },
  { id: "tycoon", name: "大亨", description: "接近传统大富翁的高压经营，收费 ×2.0", multiplier: 2 },
];

export const GAME_LENGTHS: GameLength[] = [
  { id: "quick", name: "欢乐快局", description: "12 轮 · 约 35 分钟", rounds: 12 },
  { id: "family", name: "家庭标准局", description: "18 轮 · 约 60 分钟", rounds: 18 },
  { id: "unlimited", name: "玩到尽兴", description: "不限轮数 · 随时结算", rounds: null },
];

const CITY_ENGLISH_NAME_OVERRIDES: Record<string, string> = {
  "ho-chi-minh": "Ho Chi Minh City",
  washington: "Washington D.C.",
  rio: "Rio de Janeiro",
};

const englishCityName = (id: string) => CITY_ENGLISH_NAME_OVERRIDES[id]
  ?? id.split("-").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");

const REGION_NAMES = { asia: "亚洲", oceania: "大洋洲", africa: "非洲", europe: "欧洲", america: "美洲" } as const;
const CITY_KNOWLEDGE_OVERRIDES: Record<string, string> = {
  beijing: "北京的故宫是世界上规模最大的古代宫殿建筑群之一。",
  tokyo: "东京拥有世界上非常繁忙的铁路交通网络。",
  sydney: "悉尼歌剧院的屋顶看起来像扬起的白色船帆。",
  cairo: "开罗附近的吉萨金字塔已有四千多年历史。",
  paris: "埃菲尔铁塔最初是为 1889 年世界博览会建造的。",
  london: "伦敦格林尼治是世界时区计算的重要起点。",
  "new-york": "纽约自由女神像是法国送给美国的礼物。",
  rio: "里约热内卢以嘉年华和科帕卡巴纳海滩闻名。",
};

const city = (
  index: number,
  id: string,
  name: string,
  country: string,
  region: "asia" | "oceania" | "africa" | "europe" | "america",
  price: number,
  landmark: string,
): BoardTile => ({
  id,
  index,
  type: "city",
  name,
  englishName: englishCityName(id),
  shortLabel: name,
  country,
  region,
  price,
  baseRent: Math.round(price * 0.085 / 10) * 10,
  buildCost: Math.round(price * 0.42 / 100) * 100,
  landmark,
  continentName: REGION_NAMES[region],
  knowledge: CITY_KNOWLEDGE_OVERRIDES[id] ?? `${name}位于${country}，是${REGION_NAMES[region]}旅途中值得认识的一座城市。`,
  greeting: country === "中国" ? "你好，Hello" : undefined,
  icon: landmark,
});

const special = (
  index: number,
  id: string,
  type: "start" | "chance" | "destiny" | "airport" | "rest" | "bonus",
  name: string,
  icon: string,
  description: string,
): BoardTile => ({ id, index, type, name, icon, description });

export const BOARD_TILES: BoardTile[] = [
  special(0, "start", "start", "环球起点", "🚩", "经过这里领取环游奖励"),
  city(1, "beijing", "北京", "中国", "asia", 1600, "🏮"),
  city(2, "tokyo", "东京", "日本", "asia", 2800, "🗻"),
  special(3, "chance-a", "chance", "机会", "🎈", "翻开一张惊喜机会牌"),
  city(4, "seoul", "首尔", "韩国", "asia", 1200, "🏯"),
  city(5, "hong-kong", "香港", "中国", "asia", 1750, "🌃"),
  city(6, "manila", "马尼拉", "菲律宾", "asia", 1100, "🌊"),
  city(7, "kuala-lumpur", "吉隆坡", "马来西亚", "asia", 1500, "🏙️"),
  city(8, "singapore", "新加坡", "新加坡", "asia", 1800, "🌴"),
  city(9, "bangkok", "曼谷", "泰国", "asia", 1400, "🛕"),
  city(10, "ho-chi-minh", "胡志明市", "越南", "asia", 1350, "🛵"),
  special(11, "destiny-a", "destiny", "命运", "🔮", "看看今天命运如何安排"),
  city(12, "sydney", "悉尼", "澳大利亚", "oceania", 2100, "⛵"),
  city(13, "melbourne", "墨尔本", "澳大利亚", "oceania", 1950, "🎭"),
  city(14, "auckland", "奥克兰", "新西兰", "oceania", 1700, "🌋"),
  special(15, "postcard", "bonus", "旅行明信片", "💌", "分享旅途，领取 600 金币"),
  special(16, "airport-east", "airport", "太平洋机场", "✈️", "支付 350 金币机场服务税费"),
  city(17, "nairobi", "内罗毕", "肯尼亚", "africa", 1650, "🦒"),
  city(18, "cairo", "开罗", "埃及", "africa", 1500, "🔺"),
  special(19, "chance-b", "chance", "机会", "🎈", "翻开一张惊喜机会牌"),
  city(20, "cape-town", "开普敦", "南非", "africa", 1900, "⛰️"),
  city(21, "marrakech", "马拉喀什", "摩洛哥", "africa", 1850, "🕌"),
  city(22, "dubai", "迪拜", "阿联酋", "africa", 2500, "🏙️"),
  special(23, "destiny-b", "destiny", "命运", "🔮", "看看今天命运如何安排"),
  city(24, "istanbul", "伊斯坦布尔", "土耳其", "europe", 2200, "🕌"),
  city(25, "athens", "雅典", "希腊", "europe", 2050, "🏛️"),
  city(26, "rome", "罗马", "意大利", "europe", 2400, "🏛️"),
  city(27, "vienna", "维也纳", "奥地利", "europe", 2350, "🎻"),
  city(28, "prague", "布拉格", "捷克", "europe", 2150, "🏰"),
  city(29, "berlin", "柏林", "德国", "europe", 2450, "🐻"),
  city(30, "amsterdam", "阿姆斯特丹", "荷兰", "europe", 2300, "🌷"),
  special(31, "world-fair", "bonus", "世界嘉年华", "🎡", "参加嘉年华，领取 800 金币"),
  special(32, "holiday", "rest", "悠闲假日", "🏖️", "喝杯果汁，安心休息一回合"),
  city(33, "copenhagen", "哥本哈根", "丹麦", "europe", 2250, "🧜"),
  city(34, "stockholm", "斯德哥尔摩", "瑞典", "europe", 2350, "⛵"),
  city(35, "helsinki", "赫尔辛基", "芬兰", "europe", 2200, "❄️"),
  special(36, "chance-c", "chance", "机会", "🎈", "翻开一张惊喜机会牌"),
  city(37, "warsaw", "华沙", "波兰", "europe", 1950, "🏘️"),
  city(38, "brussels", "布鲁塞尔", "比利时", "europe", 2250, "🧇"),
  city(39, "paris", "巴黎", "法国", "europe", 3000, "🗼"),
  city(40, "barcelona", "巴塞罗那", "西班牙", "europe", 2550, "⛪"),
  city(41, "lisbon", "里斯本", "葡萄牙", "europe", 2100, "🚋"),
  special(42, "destiny-c", "destiny", "命运", "🔮", "看看今天命运如何安排"),
  city(43, "london", "伦敦", "英国", "europe", 2900, "🎡"),
  city(44, "dublin", "都柏林", "爱尔兰", "europe", 2050, "☘️"),
  city(45, "zurich", "苏黎世", "瑞士", "europe", 2650, "🏔️"),
  special(46, "family-fund", "bonus", "家庭基金", "🎁", "全家鼓励，领取 500 金币"),
  city(47, "toronto", "多伦多", "加拿大", "america", 2300, "🍁"),
  special(48, "airport-west", "airport", "大西洋机场", "✈️", "支付 350 金币机场服务税费"),
  city(49, "new-york", "纽约", "美国", "america", 3200, "🗽"),
  city(50, "washington", "华盛顿", "美国", "america", 2750, "🏛️"),
  city(51, "montreal", "蒙特利尔", "加拿大", "america", 2150, "🍁"),
  special(52, "chance-d", "chance", "机会", "🎈", "翻开一张惊喜机会牌"),
  city(53, "mexico-city", "墨西哥城", "墨西哥", "america", 1800, "🌵"),
  city(54, "havana", "哈瓦那", "古巴", "america", 1750, "🚗"),
  city(55, "panama-city", "巴拿马城", "巴拿马", "america", 1600, "🚢"),
  city(56, "bogota", "波哥大", "哥伦比亚", "america", 1800, "⛰️"),
  special(57, "destiny-d", "destiny", "命运", "🔮", "看看今天命运如何安排"),
  city(58, "lima", "利马", "秘鲁", "america", 1900, "🦙"),
  city(59, "buenos-aires", "布宜诺斯艾利斯", "阿根廷", "america", 2050, "💃"),
  city(60, "santiago", "圣地亚哥", "智利", "america", 1950, "🏔️"),
  city(61, "rio", "里约", "巴西", "america", 2100, "🎉"),
  special(62, "chance-e", "chance", "机会", "🎈", "翻开一张惊喜机会牌"),
  city(63, "san-francisco", "旧金山", "美国", "america", 2700, "🌉"),
];

export const CHANCE_CARDS: FamilyCard[] = [
  { id: "c01", deck: "chance", title: "街头魔术", text: "你的掌声最响亮，获得 500 金币！", icon: "🎩", tone: "good", effect: { kind: "cash", amount: 500 } },
  { id: "c02", deck: "chance", title: "航班升舱", text: "幸运升舱，向前移动 3 格。", icon: "✈️", tone: "good", effect: { kind: "move", steps: 3 } },
  { id: "c03", deck: "chance", title: "行李超重", text: "纪念品太多啦，支付 300 金币。", icon: "🧳", tone: "gentle", effect: { kind: "cash", amount: -300 } },
  { id: "c04", deck: "chance", title: "旅行摄影奖", text: "照片登上旅行杂志，获得 800 金币！", icon: "📷", tone: "good", effect: { kind: "cash", amount: 800 } },
  { id: "c05", deck: "chance", title: "迷路也浪漫", text: "发现小巷惊喜，向前移动 2 格。", icon: "🗺️", tone: "surprise", effect: { kind: "move", steps: 2 } },
  { id: "c06", deck: "chance", title: "分享零食", text: "请每位玩家吃点心，每人 100 金币。", icon: "🍪", tone: "gentle", effect: { kind: "pay-each", amount: 100 } },
  { id: "c07", deck: "chance", title: "限定纪念章", text: "抽中隐藏款，获得 600 金币。", icon: "🏅", tone: "good", effect: { kind: "cash", amount: 600 } },
  { id: "c08", deck: "chance", title: "错过末班车", text: "搭乘出租车，支付 260 金币。", icon: "🚕", tone: "gentle", effect: { kind: "cash", amount: -260 } },
  { id: "c09", deck: "chance", title: "环球直播", text: "大家送来礼物，向每位玩家收取 120 金币。", icon: "📺", tone: "good", effect: { kind: "collect-each", amount: 120 } },
  { id: "c10", deck: "chance", title: "幸运护照", text: "未来两回合免受一次负面卡牌影响。", icon: "🛂", tone: "good", effect: { kind: "shield", turns: 2 } },
  { id: "c11", deck: "chance", title: "热气球顺风", text: "向前移动 4 格。", icon: "🎈", tone: "good", effect: { kind: "move", steps: 4 } },
  { id: "c12", deck: "chance", title: "冰淇淋派对", text: "请全家吃冰淇淋，支付 220 金币。", icon: "🍦", tone: "gentle", effect: { kind: "cash", amount: -220 } },
  { id: "c13", deck: "chance", title: "城市代言人", text: "未来两回合租金提升 20%。", icon: "🎤", tone: "good", effect: { kind: "rent-boost", turns: 2, multiplier: 1.2 } },
  { id: "c14", deck: "chance", title: "找到零钱", text: "在旧外套里发现 350 金币。", icon: "🪙", tone: "good", effect: { kind: "cash", amount: 350 } },
  { id: "c15", deck: "chance", title: "临时修路", text: "绕一点路，后退 2 格。", icon: "🚧", tone: "surprise", effect: { kind: "move", steps: -2 } },
  { id: "c16", deck: "chance", title: "亲子问答冠军", text: "全家知识王，获得 700 金币！", icon: "🧠", tone: "good", effect: { kind: "cash", amount: 700 } },
  { id: "c17", deck: "chance", title: "明信片邮资", text: "寄出一叠明信片，支付 180 金币。", icon: "💌", tone: "gentle", effect: { kind: "cash", amount: -180 } },
  { id: "c18", deck: "chance", title: "海风加速", text: "乘船向前移动 5 格。", icon: "⛵", tone: "good", effect: { kind: "move", steps: 5 } },
  { id: "c19", deck: "chance", title: "特色市集", text: "卖出手工作品，获得 450 金币。", icon: "🧺", tone: "good", effect: { kind: "cash", amount: 450 } },
  { id: "c20", deck: "chance", title: "天气突变", text: "购买雨具，支付不超过现金 5% 的费用。", icon: "🌦️", tone: "gentle", effect: { kind: "cash-percent", percent: -0.05, cap: 600 } },
  { id: "c21", deck: "chance", title: "朋友来接站", text: "省下交通费，获得 280 金币。", icon: "🚙", tone: "good", effect: { kind: "cash", amount: 280 } },
  { id: "c22", deck: "chance", title: "错拿地图", text: "回头确认路线，后退 1 格。", icon: "🧭", tone: "surprise", effect: { kind: "move", steps: -1 } },
  { id: "c23", deck: "chance", title: "节日红包", text: "收到当地祝福，获得 900 金币！", icon: "🧧", tone: "good", effect: { kind: "cash", amount: 900 } },
  { id: "c24", deck: "chance", title: "家庭合影", text: "每位玩家送你 80 金币作为照片留念。", icon: "👨‍👩‍👧‍👦", tone: "good", effect: { kind: "collect-each", amount: 80 } },
];

export const DESTINY_CARDS: FamilyCard[] = [
  { id: "d01", deck: "destiny", title: "彩虹出现", text: "好运降临，获得 520 金币。", icon: "🌈", tone: "good", effect: { kind: "cash", amount: 520 } },
  { id: "d02", deck: "destiny", title: "暖心帮助", text: "帮助迷路游客，获得 360 金币感谢金。", icon: "🤝", tone: "good", effect: { kind: "cash", amount: 360 } },
  { id: "d03", deck: "destiny", title: "鞋底开胶", text: "买双舒服的新鞋，支付 240 金币。", icon: "👟", tone: "gentle", effect: { kind: "cash", amount: -240 } },
  { id: "d04", deck: "destiny", title: "星空露营", text: "休息得很好，向前移动 2 格。", icon: "⛺", tone: "good", effect: { kind: "move", steps: 2 } },
  { id: "d05", deck: "destiny", title: "餐厅免单", text: "成为今日幸运桌，获得 420 金币。", icon: "🍽️", tone: "good", effect: { kind: "cash", amount: 420 } },
  { id: "d06", deck: "destiny", title: "语言小课堂", text: "报名体验课，支付 200 金币。", icon: "🗣️", tone: "gentle", effect: { kind: "cash", amount: -200 } },
  { id: "d07", deck: "destiny", title: "萤火虫引路", text: "发现近路，向前移动 3 格。", icon: "✨", tone: "good", effect: { kind: "move", steps: 3 } },
  { id: "d08", deck: "destiny", title: "好运护身符", text: "未来三回合免受一次负面卡牌影响。", icon: "🍀", tone: "good", effect: { kind: "shield", turns: 3 } },
  { id: "d09", deck: "destiny", title: "生日惊喜", text: "每位玩家送你 100 金币祝福。", icon: "🎂", tone: "good", effect: { kind: "collect-each", amount: 100 } },
  { id: "d10", deck: "destiny", title: "文化节捐助", text: "支持当地活动，支付不超过现金 6% 的费用。", icon: "🎭", tone: "gentle", effect: { kind: "cash-percent", percent: -0.06, cap: 700 } },
  { id: "d11", deck: "destiny", title: "流星许愿", text: "愿望成真，获得 760 金币。", icon: "🌠", tone: "good", effect: { kind: "cash", amount: 760 } },
  { id: "d12", deck: "destiny", title: "旅馆升级", text: "获得旅行平台补贴 480 金币。", icon: "🏨", tone: "good", effect: { kind: "cash", amount: 480 } },
  { id: "d13", deck: "destiny", title: "弄丢水壶", text: "补充旅行装备，支付 160 金币。", icon: "🧴", tone: "gentle", effect: { kind: "cash", amount: -160 } },
  { id: "d14", deck: "destiny", title: "友谊列车", text: "与大家分享车票，每人支付 80 金币。", icon: "🚂", tone: "gentle", effect: { kind: "pay-each", amount: 80 } },
  { id: "d15", deck: "destiny", title: "幸运喷泉", text: "投下一枚硬币，收获 600 金币好运。", icon: "⛲", tone: "good", effect: { kind: "cash", amount: 600 } },
  { id: "d16", deck: "destiny", title: "海鸥抢走午餐", text: "重新买一份，支付 190 金币。", icon: "🐦", tone: "surprise", effect: { kind: "cash", amount: -190 } },
  { id: "d17", deck: "destiny", title: "秘密花园", text: "发现一条捷径，向前移动 4 格。", icon: "🌻", tone: "good", effect: { kind: "move", steps: 4 } },
  { id: "d18", deck: "destiny", title: "旅行书出版", text: "获得稿费 1,000 金币！", icon: "📚", tone: "good", effect: { kind: "cash", amount: 1000 } },
  { id: "d19", deck: "destiny", title: "时差小迷糊", text: "坐反一站，后退 2 格。", icon: "🕰️", tone: "surprise", effect: { kind: "move", steps: -2 } },
  { id: "d20", deck: "destiny", title: "环保奖励", text: "坚持绿色出行，获得 390 金币。", icon: "🚲", tone: "good", effect: { kind: "cash", amount: 390 } },
  { id: "d21", deck: "destiny", title: "家人来信", text: "获得满满能量，未来两回合租金提升 15%。", icon: "💌", tone: "good", effect: { kind: "rent-boost", turns: 2, multiplier: 1.15 } },
  { id: "d22", deck: "destiny", title: "博物馆奇遇", text: "答对隐藏问题，获得 680 金币。", icon: "🏺", tone: "good", effect: { kind: "cash", amount: 680 } },
  { id: "d23", deck: "destiny", title: "窗外好风景", text: "临时下车拍照，后退 1 格。", icon: "🏞️", tone: "surprise", effect: { kind: "move", steps: -1 } },
  { id: "d24", deck: "destiny", title: "全家干杯", text: "请大家喝果汁，每人支付 60 金币。", icon: "🥤", tone: "gentle", effect: { kind: "pay-each", amount: 60 } },
];

export const GAME_RULES = {
  minPlayers: 2,
  maxPlayers: 6,
  rouletteBallMin: 0,
  rouletteBallMax: 12,
  rouletteTotalMin: 0,
  rouletteTotalMax: 24,
  hotelLevel: 5,
  cardLossPercentCap: 0.12,
  cardLossAbsoluteCap: 1500,
  voiceWaitReminderMs: 15000,
  settlementFormula: "现金 + 城市购买原价 + 房屋/旅馆原始投入",
} as const;
