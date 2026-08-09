import { BOARD_TILES, ECONOMY_PRESETS } from "./config";
import type { BoardTile, CityTile, GameEvent, GameSession, OwnedProperty } from "./types";

const makeEvent = (session: GameSession, kind: GameEvent["kind"], message: string, playerId?: string): GameEvent => ({
  id: `event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  kind,
  message,
  round: session.round,
  playerId,
  createdAt: Date.now(),
});

export const getCity = (tileId: string): CityTile | null => {
  const tile = BOARD_TILES.find((candidate) => candidate.id === tileId);
  return tile?.type === "city" ? tile : null;
};

export const getPropertyOwner = (session: GameSession, tileId: string) => {
  for (let playerIndex = 0; playerIndex < session.players.length; playerIndex += 1) {
    const property = session.players[playerIndex].properties.find((candidate) => candidate.tileId === tileId);
    if (property) return { playerIndex, player: session.players[playerIndex], property };
  }
  return null;
};

export const calculateRent = (session: GameSession, city: CityTile, property: OwnedProperty): number => {
  if (property.mortgaged) return 0;
  const economy = ECONOMY_PRESETS.find((candidate) => candidate.id === session.economyId) ?? ECONOMY_PRESETS[1];
  const levelMultiplier = [1, 2, 3.25, 5, 7.5, 10][property.buildingLevel];
  const owner = session.players.find((player) => player.properties.some((candidate) => candidate.tileId === property.tileId));
  const cardMultiplier = owner?.cardStatus?.rentBoostTurns ? owner.cardStatus.rentMultiplier : 1;
  return Math.round(city.baseRent * levelMultiplier * economy.rentMultiplier * cardMultiplier / 10) * 10;
};

const withEvent = (session: GameSession, event: GameEvent): GameSession => ({
  ...session,
  updatedAt: Date.now(),
  events: [event, ...session.events].slice(0, 50),
});

export function purchaseCity(session: GameSession, city: CityTile): GameSession | null {
  const activeIndex = session.currentPlayerIndex;
  const player = session.players[activeIndex];
  if (player.cash < city.price || getPropertyOwner(session, city.id)) return null;
  const next = {
    ...session,
    players: session.players.map((candidate, index) => index === activeIndex ? {
      ...candidate,
      cash: candidate.cash - city.price,
      properties: [...candidate.properties, {
        tileId: city.id,
        purchasePrice: city.price,
        buildingLevel: 0 as const,
        buildingInvestment: 0,
        mortgaged: false,
        mortgageValue: 0,
      }],
    } : candidate),
  };
  return withEvent(next, makeEvent(session, "property", `${player.name} 支付 ¥${city.price.toLocaleString("zh-CN")}，买下了「${city.name}」！`, player.id));
}

export function upgradeCity(session: GameSession, city: CityTile): GameSession | null {
  const activeIndex = session.currentPlayerIndex;
  const player = session.players[activeIndex];
  const property = player.properties.find((candidate) => candidate.tileId === city.id);
  if (!property || property.mortgaged || property.buildingLevel >= 5 || player.cash < city.buildCost) return null;
  const nextLevel = (property.buildingLevel + 1) as 1 | 2 | 3 | 4 | 5;
  const next = {
    ...session,
    players: session.players.map((candidate, index) => index === activeIndex ? {
      ...candidate,
      cash: candidate.cash - city.buildCost,
      properties: candidate.properties.map((owned) => owned.tileId === city.id ? {
        ...owned,
        buildingLevel: nextLevel,
        buildingInvestment: owned.buildingInvestment + city.buildCost,
      } : owned),
    } : candidate),
  };
  return withEvent(next, makeEvent(session, "property", `${player.name} 为「${city.name}」升级到${nextLevel === 5 ? "旅馆" : `${nextLevel} 座房屋`}，投入 ¥${city.buildCost.toLocaleString("zh-CN")}。`, player.id));
}

export function transferRent(session: GameSession, city: CityTile): { session: GameSession; rent: number } | null {
  const ownership = getPropertyOwner(session, city.id);
  if (!ownership || ownership.playerIndex === session.currentPlayerIndex) return null;
  const rent = calculateRent(session, city, ownership.property);
  const payer = session.players[session.currentPlayerIndex];
  if (rent <= 0 || payer.cash < rent) return null;
  const next = {
    ...session,
    players: session.players.map((player, index) => {
      if (index === session.currentPlayerIndex) return { ...player, cash: player.cash - rent };
      if (index === ownership.playerIndex) return { ...player, cash: player.cash + rent };
      return player;
    }),
  };
  return { session: withEvent(next, makeEvent(session, "money", `${payer.name} 向 ${ownership.player.name} 支付「${city.name}」租金 ¥${rent.toLocaleString("zh-CN")}。`, payer.id)), rent };
}

export interface BankSettlement {
  session: GameSession;
  amount: number;
  kind: "income" | "fee" | "relief" | "none";
  message: string;
}

const BONUS_AMOUNTS: Record<string, number> = {
  postcard: 600,
  "world-fair": 800,
  "family-fund": 500,
};

export function settleBankTile(session: GameSession, tile: BoardTile): BankSettlement {
  const playerIndex = session.currentPlayerIndex;
  const player = session.players[playerIndex];
  const economy = ECONOMY_PRESETS.find((candidate) => candidate.id === session.economyId) ?? ECONOMY_PRESETS[1];
  let delta = 0;
  let kind: BankSettlement["kind"] = "none";
  let message = `${player.name} 在「${tile.name}」稍作停留。`;

  if (tile.type === "bonus") {
    delta = BONUS_AMOUNTS[tile.id] ?? 500;
    kind = "income";
    message = `${player.name} 在「${tile.name}」获得银行奖励 ¥${delta.toLocaleString("zh-CN")}！`;
  } else if (tile.type === "airport") {
    const fee = Math.min(player.cash, 350);
    delta = -fee;
    kind = "fee";
    message = fee > 0
      ? `${player.name} 支付机场服务税费 ¥${fee.toLocaleString("zh-CN")}。`
      : `${player.name} 暂无现金，本次机场服务税费由家庭银行免除。`;
  }

  const cashAfterSettlement = player.cash + delta;
  const relief = kind === "fee" && cashAfterSettlement < economy.reliefFloor
    ? economy.reliefFloor - cashAfterSettlement
    : 0;
  if (relief > 0) {
    delta += relief;
    kind = "relief";
    message += ` 家庭银行再援助 ¥${relief.toLocaleString("zh-CN")}，保留基本旅行金。`;
  }
  if (delta === 0 && kind === "none") return { session, amount: 0, kind, message };

  const next = {
    ...session,
    players: session.players.map((candidate, index) => index === playerIndex ? { ...candidate, cash: candidate.cash + delta } : candidate),
  };
  return {
    session: withEvent(next, makeEvent(session, "money", message, player.id)),
    amount: Math.abs(delta),
    kind,
    message,
  };
}

export function applyFamilyAid(session: GameSession, requiredPayment: number): { session: GameSession; amount: number } | null {
  const economy = ECONOMY_PRESETS.find((candidate) => candidate.id === session.economyId) ?? ECONOMY_PRESETS[1];
  const playerIndex = session.currentPlayerIndex;
  const player = session.players[playerIndex];
  const targetCash = requiredPayment + economy.reliefFloor;
  const amount = Math.max(0, targetCash - player.cash);
  if (amount <= 0) return null;
  const next = {
    ...session,
    players: session.players.map((candidate, index) => index === playerIndex ? { ...candidate, cash: candidate.cash + amount } : candidate),
  };
  return {
    session: withEvent(next, makeEvent(session, "money", `家庭银行向 ${player.name} 提供 ¥${amount.toLocaleString("zh-CN")} 援助金，支付后仍保留 ¥${economy.reliefFloor.toLocaleString("zh-CN")} 基本旅行金。`, player.id)),
    amount,
  };
}

export type AssetAction = "sell-building" | "sell-city" | "mortgage" | "redeem";

export interface AssetActionQuote {
  action: AssetAction;
  amount: number;
  label: string;
  consequence: string;
}

export function quoteAssetAction(property: OwnedProperty, city: CityTile, action: AssetAction): AssetActionQuote | null {
  if (action === "sell-building") {
    if (property.buildingLevel <= 0 || property.mortgaged) return null;
    return { action, amount: Math.round(city.buildCost * 0.5), label: `卖出「${city.name}」的一座${property.buildingLevel === 5 ? "旅馆" : "房屋"}`, consequence: "建筑等级下降 1 级，返还原始建造费的 50%" };
  }
  if (action === "sell-city") {
    if (property.buildingLevel > 0 || property.mortgaged) return null;
    return { action, amount: Math.round(property.purchasePrice * 0.7), label: `把「${city.name}」卖回银行`, consequence: "失去城市所有权，返还购买价的 70%" };
  }
  if (action === "mortgage") {
    if (property.buildingLevel > 0 || property.mortgaged) return null;
    return { action, amount: Math.round(property.purchasePrice * 0.5), label: `抵押「${city.name}」`, consequence: "立即获得购买价的 50%，赎回前不再收取租金" };
  }
  if (!property.mortgaged) return null;
  const mortgageValue = property.mortgageValue || Math.round(property.purchasePrice * 0.5);
  return { action, amount: Math.round(mortgageValue * 1.1), label: `赎回「${city.name}」`, consequence: "支付抵押款的 110%，恢复租金和升级能力" };
}

export function applyAssetAction(session: GameSession, tileId: string, action: AssetAction): GameSession | null {
  const playerIndex = session.currentPlayerIndex;
  const player = session.players[playerIndex];
  const property = player.properties.find((candidate) => candidate.tileId === tileId);
  const city = property ? getCity(tileId) : null;
  if (!property || !city) return null;
  const quote = quoteAssetAction(property, city, action);
  if (!quote || (action === "redeem" && player.cash < quote.amount)) return null;
  const isDebit = action === "redeem";
  const nextProperties = action === "sell-city"
    ? player.properties.filter((candidate) => candidate.tileId !== tileId)
    : player.properties.map((candidate) => {
      if (candidate.tileId !== tileId) return candidate;
      if (action === "sell-building") return {
        ...candidate,
        buildingLevel: (candidate.buildingLevel - 1) as 0 | 1 | 2 | 3 | 4,
        buildingInvestment: Math.max(0, candidate.buildingInvestment - city.buildCost),
      };
      if (action === "mortgage") return { ...candidate, mortgaged: true, mortgageValue: quote.amount };
      return { ...candidate, mortgaged: false, mortgageValue: 0 };
    });
  const next = {
    ...session,
    players: session.players.map((candidate, index) => index === playerIndex ? {
      ...candidate,
      cash: candidate.cash + (isDebit ? -quote.amount : quote.amount),
      properties: nextProperties,
    } : candidate),
  };
  const verb = isDebit ? "支付" : "获得";
  return withEvent(next, makeEvent(session, "property", `${player.name}${quote.label}，${verb} ¥${quote.amount.toLocaleString("zh-CN")}。`, player.id));
}

export interface RescuePlanStep {
  tileId: string;
  cityName: string;
  action: Exclude<AssetAction, "redeem">;
  amount: number;
  label: string;
  rentProtected: number;
  lossScore: number;
}

export interface RescuePlan {
  id: "least-loss" | "fewest-actions" | "keep-high-rent";
  title: string;
  icon: string;
  recovery: number;
  steps: RescuePlanStep[];
  reason: string;
}

const buildRescueSteps = (propertyList: Array<{ property: OwnedProperty; city: CityTile }>): RescuePlanStep[] => propertyList.flatMap(({ property, city }) => {
  if (property.mortgaged) return [];
  const steps: RescuePlanStep[] = [];
  for (let level = property.buildingLevel; level > 0; level -= 1) {
    const amount = Math.round(city.buildCost * 0.5);
    steps.push({
      tileId: city.id,
      cityName: city.name,
      action: "sell-building",
      amount,
      label: `卖出${city.name}的${level === 5 ? "旅馆" : "一座房屋"}`,
      rentProtected: city.baseRent * level,
      lossScore: amount + city.baseRent * level,
    });
  }
  if (property.buildingLevel === 0) {
    const mortgageAmount = Math.round(property.purchasePrice * 0.5);
    steps.push({
      tileId: city.id,
      cityName: city.name,
      action: "mortgage",
      amount: mortgageAmount,
      label: `抵押${city.name}`,
      rentProtected: city.baseRent,
      lossScore: Math.round(mortgageAmount * 0.1) + city.baseRent * 2,
    });
    const sellAmount = Math.round(property.purchasePrice * 0.7);
    steps.push({
      tileId: city.id,
      cityName: city.name,
      action: "sell-city",
      amount: sellAmount,
      label: `卖回${city.name}`,
      rentProtected: city.baseRent,
      lossScore: property.purchasePrice - sellAmount + city.baseRent * 4,
    });
  }
  return steps;
});

const takeUntilEnough = (steps: RescuePlanStep[], shortage: number) => {
  const selected: RescuePlanStep[] = [];
  const usedFinalActions = new Set<string>();
  let recovery = 0;
  for (const step of steps) {
    if (recovery >= shortage) break;
    const finalKey = `${step.tileId}:final`;
    if ((step.action === "mortgage" || step.action === "sell-city") && usedFinalActions.has(finalKey)) continue;
    if (step.action === "mortgage" || step.action === "sell-city") usedFinalActions.add(finalKey);
    selected.push(step);
    recovery += step.amount;
  }
  return { steps: selected, recovery };
};

export function recommendRescuePlans(propertyList: Array<{ property: OwnedProperty; city: CityTile }>, shortage: number): RescuePlan[] {
  const options = buildRescueSteps(propertyList);
  if (options.length === 0) return [];
  const target = Math.max(1, shortage);
  const leastLoss = takeUntilEnough([...options].sort((a, b) => (a.lossScore / a.amount) - (b.lossScore / b.amount) || a.amount - b.amount), target);
  const fewest = takeUntilEnough([...options].sort((a, b) => b.amount - a.amount || a.lossScore - b.lossScore), target);
  const preserveRent = takeUntilEnough([...options].sort((a, b) => a.rentProtected - b.rentProtected || a.lossScore - b.lossScore), target);
  return [
    {
      id: "least-loss",
      title: "最少损失",
      icon: "🛡️",
      ...leastLoss,
      reason: `优先选择折损较小的操作，预计 ${leastLoss.steps.length} 步筹得 ¥${leastLoss.recovery.toLocaleString("zh-CN")}。`,
    },
    {
      id: "fewest-actions",
      title: "最少操作",
      icon: "⚡",
      ...fewest,
      reason: `优先单次回款较多的资产，预计 ${fewest.steps.length} 步完成筹款。`,
    },
    {
      id: "keep-high-rent",
      title: "保留高租金城市",
      icon: "🏙️",
      ...preserveRent,
      reason: `先处理租金潜力较低的资产，尽量守住未来收入较高的城市。`,
    },
  ];
}
