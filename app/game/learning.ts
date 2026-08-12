import type { ChildAgeBand, GameLearningState, GameSession, LearningCategory, PlayerLearningStats } from "./types";

export interface TravelChallenge {
  id: string;
  category: LearningCategory;
  prompt: string;
  options: string[];
  answer: string;
  hint: string;
  explanation: string;
}

export interface LearningAward {
  id: "explorer" | "builder" | "courage" | "expression";
  icon: string;
  title: string;
  playerIds: string[];
  value: number;
  detail: string;
}

export const LEARNING_CATEGORY_LABELS: Record<LearningCategory, { icon: string; name: string }> = {
  math: { icon: "🔢", name: "数字侦探" },
  geography: { icon: "🗺️", name: "地球探索" },
  language: { icon: "🗣️", name: "语言小站" },
  finance: { icon: "🪙", name: "理财练习" },
  observation: { icon: "🔎", name: "观察挑战" },
};

const challengeBank: Record<ChildAgeBand, TravelChallenge[]> = {
  "4-6": [
    { id: "m46", category: "math", prompt: "3 枚金币再加 2 枚，一共有几枚？", options: ["4", "5", "6"], answer: "5", hint: "从 3 后面继续数两下。", explanation: "3 + 2 = 5。" },
    { id: "o46", category: "observation", prompt: "哪一个图案是用来坐飞机旅行的？", options: ["✈️", "🏠", "🌷"], answer: "✈️", hint: "它有两只翅膀。", explanation: "飞机可以带我们飞去很远的城市。" },
    { id: "l46", category: "language", prompt: "英语 Hello 是什么意思？", options: ["你好", "再见", "谢谢"], answer: "你好", hint: "见面时会说它。", explanation: "Hello 就是“你好”。" },
  ],
  "6-8": [
    { id: "m68", category: "math", prompt: "你有 12 枚金币，又得到 7 枚，现在有多少？", options: ["18", "19", "20"], answer: "19", hint: "先算 12 + 5，再加 2。", explanation: "12 + 7 = 19。" },
    { id: "g68", category: "geography", prompt: "东京位于哪个国家？", options: ["日本", "法国", "巴西"], answer: "日本", hint: "这个国家也以樱花闻名。", explanation: "东京是日本的首都。" },
    { id: "f68", category: "finance", prompt: "玩具 8 元，付 10 元，应找回多少？", options: ["1 元", "2 元", "3 元"], answer: "2 元", hint: "用 10 减去 8。", explanation: "10 - 8 = 2 元。" },
  ],
  "8-10": [
    { id: "m810", category: "math", prompt: "4 家旅馆，每家有 6 个房间，共有多少个？", options: ["20", "24", "28"], answer: "24", hint: "这是 4 × 6。", explanation: "4 × 6 = 24。" },
    { id: "g810", category: "geography", prompt: "悉尼位于哪个大洲？", options: ["大洋洲", "欧洲", "非洲"], answer: "大洋洲", hint: "澳大利亚所在的大洲。", explanation: "悉尼位于澳大利亚，属于大洋洲。" },
    { id: "f810", category: "finance", prompt: "预算 100 元，车票 65 元，最多还可花多少？", options: ["25 元", "35 元", "45 元"], answer: "35 元", hint: "预算减去已经花掉的钱。", explanation: "100 - 65 = 35 元。" },
  ],
  "10+": [
    { id: "m10", category: "math", prompt: "200 元增加 10%，会变成多少？", options: ["210", "220", "240"], answer: "220", hint: "200 的 10% 是 20。", explanation: "200 + 20 = 220。" },
    { id: "f10", category: "finance", prompt: "方案 A 收益 80、成本 50；方案 B 收益 100、成本 80，哪个净收益更高？", options: ["方案 A", "方案 B", "一样高"], answer: "方案 A", hint: "分别用收益减去成本。", explanation: "A 净收益 30，B 净收益 20。" },
    { id: "g10", category: "geography", prompt: "跨越本初子午线的英国城市是？", options: ["伦敦", "东京", "开罗"], answer: "伦敦", hint: "格林尼治就在这座城市。", explanation: "本初子午线经过伦敦格林尼治。" },
  ],
};

export const emptyLearningStats = (): PlayerLearningStats => ({
  visitedCityIds: [], viewedKnowledgeCityIds: [], challengeAttempts: 0, challengeCorrect: 0,
  challengeCategories: {}, builds: 0, collaborations: 0, stamps: 0,
});

export function createLearningState(playerIds: string[]): GameLearningState {
  return {
    knowledgeHintsEnabled: true,
    lastChallengeRound: 0,
    familyEnergy: 0,
    players: Object.fromEntries(playerIds.map((id) => [id, emptyLearningStats()])),
  };
}

export function migrateLearningState(session: GameSession): GameLearningState {
  const source = session.learning;
  const players = Object.fromEntries(session.players.map((player) => {
    const stats = source?.players?.[player.id];
    return [player.id, { ...emptyLearningStats(), ...stats, challengeCategories: { ...stats?.challengeCategories } }];
  }));
  return { knowledgeHintsEnabled: source?.knowledgeHintsEnabled ?? true, lastChallengeRound: source?.lastChallengeRound ?? 0, ...(source?.lastChallengeCategory ? { lastChallengeCategory: source.lastChallengeCategory } : {}), familyEnergy: source?.familyEnergy ?? 0, players };
}

export function ageBandForPlayer(isChild: boolean, ageBand?: ChildAgeBand): ChildAgeBand | null {
  return isChild ? ageBand ?? "6-8" : null;
}

export function challengesForAge(ageBand: ChildAgeBand, previous?: LearningCategory): TravelChallenge[] {
  const items = challengeBank[ageBand];
  const withoutRepeat = items.filter((item) => item.category !== previous);
  return (withoutRepeat.length >= 2 ? withoutRepeat : items).slice(0, 3);
}

export function shouldOfferChallenge(session: GameSession): boolean {
  const learning = migrateLearningState(session);
  const player = session.players[session.currentPlayerIndex];
  return Boolean(player.isChild && session.round - learning.lastChallengeRound >= 3);
}

export function recordChallenge(session: GameSession, challenge: TravelChallenge, correct: boolean): GameSession {
  const learning = migrateLearningState(session);
  const player = session.players[session.currentPlayerIndex];
  const stats = learning.players[player.id];
  return { ...session, learning: { ...learning, lastChallengeRound: session.round, lastChallengeCategory: challenge.category, familyEnergy: learning.familyEnergy + (correct ? 2 : 1), players: { ...learning.players, [player.id]: { ...stats, challengeAttempts: stats.challengeAttempts + 1, challengeCorrect: stats.challengeCorrect + (correct ? 1 : 0), stamps: stats.stamps + 1, challengeCategories: { ...stats.challengeCategories, [challenge.category]: (stats.challengeCategories[challenge.category] ?? 0) + 1 } } } } };
}

export function recordCityVisit(session: GameSession, cityId: string): GameSession {
  const learning = migrateLearningState(session);
  const player = session.players[session.currentPlayerIndex];
  const stats = learning.players[player.id];
  if (stats.visitedCityIds.includes(cityId)) return { ...session, learning };
  return { ...session, learning: { ...learning, players: { ...learning.players, [player.id]: { ...stats, visitedCityIds: [...stats.visitedCityIds, cityId] } } } };
}

export function recordKnowledgeViewed(session: GameSession, cityId: string): GameSession {
  const learning = migrateLearningState(session);
  const player = session.players[session.currentPlayerIndex];
  const stats = learning.players[player.id];
  if (stats.viewedKnowledgeCityIds.includes(cityId)) return { ...session, learning };
  return { ...session, learning: { ...learning, players: { ...learning.players, [player.id]: { ...stats, viewedKnowledgeCityIds: [...stats.viewedKnowledgeCityIds, cityId] } } } };
}

export function recordBuild(session: GameSession): GameSession {
  const learning = migrateLearningState(session);
  const player = session.players[session.currentPlayerIndex];
  const stats = learning.players[player.id];
  return { ...session, learning: { ...learning, players: { ...learning.players, [player.id]: { ...stats, builds: stats.builds + 1 } } } };
}

export function recordCollaboration(session: GameSession): GameSession {
  const learning = migrateLearningState(session);
  const player = session.players[session.currentPlayerIndex];
  const stats = learning.players[player.id];
  return { ...session, learning: { ...learning, familyEnergy: learning.familyEnergy + 1, players: { ...learning.players, [player.id]: { ...stats, collaborations: stats.collaborations + 1 } } } };
}

export function createLearningAwards(session: GameSession): LearningAward[] {
  const learning = migrateLearningState(session);
  const candidates: Array<Omit<LearningAward, "playerIds" | "value"> & { score: (stats: PlayerLearningStats) => number }> = [
    { id: "explorer", icon: "🧭", title: "环球探索家", detail: "到达不同城市最多", score: (stats) => stats.visitedCityIds.length },
    { id: "builder", icon: "🏗️", title: "城市规划师", detail: "完成城市建设最多", score: (stats) => stats.builds },
    { id: "courage", icon: "🌟", title: "勇气之星", detail: "主动尝试挑战最多", score: (stats) => stats.challengeAttempts },
    { id: "expression", icon: "🗣️", title: "表达达人", detail: "完成语言互动最多", score: (stats) => stats.challengeCategories.language ?? 0 },
  ];
  return candidates.flatMap(({ score, ...award }) => {
    const values = session.players.map((player) => ({ id: player.id, value: score(learning.players[player.id]) }));
    const best = Math.max(...values.map((entry) => entry.value));
    return best > 0 ? [{ ...award, value: best, playerIds: values.filter((entry) => entry.value === best).map((entry) => entry.id) }] : [];
  });
}
