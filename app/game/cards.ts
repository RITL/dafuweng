import { BOARD_TILES, CHANCE_CARDS, DESTINY_CARDS, GAME_RULES } from "./config";
import { moveActivePlayer } from "./session";
import type { CardDeckState, FamilyCard, GameEvent, GameSession, PlayerCardStatus } from "./types";

export interface CardResolution {
  card: FamilyCard;
  session: GameSession;
  lines: string[];
  deckRemaining: number;
  deckCycle: number;
  wasShielded: boolean;
}

const decks = { chance: CHANCE_CARDS, destiny: DESTINY_CARDS } as const;

export const emptyCardStatus = (): PlayerCardStatus => ({
  shieldTurns: 0,
  shieldUses: 0,
  rentBoostTurns: 0,
  rentMultiplier: 1,
});

export const createCardDeckState = (): Record<"chance" | "destiny", CardDeckState> => ({
  chance: { remainingIds: [], lastDrawnId: null, cycle: 0 },
  destiny: { remainingIds: [], lastDrawnId: null, cycle: 0 },
});

const randomIndex = (length: number) => {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor((value / 4294967296) * length);
  }
  return Math.floor(Math.random() * length);
};

const shuffledIds = (cards: readonly FamilyCard[], lastDrawnId: string | null) => {
  const ids = cards.map((card) => card.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  if (ids.length > 1 && ids[0] === lastDrawnId) [ids[0], ids[1]] = [ids[1], ids[0]];
  return ids;
};

const makeEvent = (session: GameSession, kind: GameEvent["kind"], message: string): GameEvent => ({
  id: `event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  kind,
  message,
  round: session.round,
  playerId: session.players[session.currentPlayerIndex].id,
  createdAt: Date.now(),
});

const withCardEvent = (session: GameSession, kind: GameEvent["kind"], message: string): GameSession => ({
  ...session,
  updatedAt: Date.now(),
  events: [makeEvent(session, kind, message), ...session.events].slice(0, 50),
});

const statusOf = (session: GameSession) => session.players[session.currentPlayerIndex].cardStatus ?? emptyCardStatus();

const isNegative = (card: FamilyCard) => {
  const effect = card.effect;
  return (effect.kind === "cash" && effect.amount < 0)
    || (effect.kind === "cash-percent" && effect.percent < 0)
    || effect.kind === "pay-each"
    || (effect.kind === "move" && effect.steps < 0);
};

const cappedLoss = (cash: number, requested: number) => Math.min(
  Math.max(0, requested),
  cash,
  GAME_RULES.cardLossAbsoluteCap,
  Math.max(0, Math.floor(cash * GAME_RULES.cardLossPercentCap)),
);

const replaceActivePlayer = (session: GameSession, mutate: (cash: number, status: PlayerCardStatus) => { cash: number; status?: PlayerCardStatus }) => ({
  ...session,
  players: session.players.map((player, index) => {
    if (index !== session.currentPlayerIndex) return player;
    const changed = mutate(player.cash, player.cardStatus ?? emptyCardStatus());
    return { ...player, cash: changed.cash, cardStatus: changed.status ?? player.cardStatus ?? emptyCardStatus() };
  }),
});

export function drawAndResolveCard(session: GameSession, deck: "chance" | "destiny"): CardResolution {
  const cards = decks[deck];
  const savedDeck = session.cardDecks?.[deck] ?? createCardDeckState()[deck];
  const validIds = new Set(cards.map((card) => card.id));
  let remainingIds = savedDeck.remainingIds.filter((id) => validIds.has(id));
  let cycle = savedDeck.cycle;
  if (remainingIds.length === 0) {
    remainingIds = shuffledIds(cards, savedDeck.lastDrawnId);
    cycle += 1;
  }
  const cardId = remainingIds[0];
  const card = cards.find((candidate) => candidate.id === cardId) ?? cards[0];
  const nextDeck: CardDeckState = { remainingIds: remainingIds.slice(1), lastDrawnId: card.id, cycle };
  let next: GameSession = {
    ...session,
    cardDecks: { ...(session.cardDecks ?? createCardDeckState()), [deck]: nextDeck },
  };
  const player = next.players[next.currentPlayerIndex];
  const lines: string[] = [];
  let wasShielded = false;

  if (isNegative(card)) {
    const status = statusOf(next);
    if (status.shieldUses > 0 && status.shieldTurns > 0) {
      next = replaceActivePlayer(next, (cash, currentStatus) => ({
        cash,
        status: { ...currentStatus, shieldUses: Math.max(0, currentStatus.shieldUses - 1) },
      }));
      lines.push(`幸运护盾替 ${player.name} 挡住了这次负面效果`);
      wasShielded = true;
    }
  }

  if (!wasShielded) {
    const effect = card.effect;
    if (effect.kind === "cash") {
      const delta = effect.amount >= 0 ? effect.amount : -cappedLoss(player.cash, Math.abs(effect.amount));
      next = replaceActivePlayer(next, (cash) => ({ cash: cash + delta }));
      lines.push(delta >= 0 ? `获得 ¥${delta.toLocaleString("zh-CN")}` : `支付 ¥${Math.abs(delta).toLocaleString("zh-CN")}`);
    } else if (effect.kind === "cash-percent") {
      const requested = Math.round(player.cash * Math.abs(effect.percent));
      const amount = effect.percent < 0 ? cappedLoss(player.cash, Math.min(requested, effect.cap)) : Math.min(requested, effect.cap);
      const delta = effect.percent < 0 ? -amount : amount;
      next = replaceActivePlayer(next, (cash) => ({ cash: cash + delta }));
      lines.push(delta >= 0 ? `获得 ¥${delta.toLocaleString("zh-CN")}` : `按家庭上限支付 ¥${amount.toLocaleString("zh-CN")}`);
    } else if (effect.kind === "move") {
      const steps = Math.max(-6, Math.min(6, effect.steps));
      next = moveActivePlayer(next, steps);
      const tile = BOARD_TILES[next.players[next.currentPlayerIndex].position];
      lines.push(`${steps >= 0 ? "前进" : "后退"} ${Math.abs(steps)} 格，到达「${tile.name}」`);
    } else if (effect.kind === "move-to") {
      const currentPosition = player.position;
      const target = Math.max(0, Math.min(BOARD_TILES.length - 1, effect.tileIndex));
      const requestedSteps = effect.collectStart && target < currentPosition ? BOARD_TILES.length - currentPosition + target : target - currentPosition;
      const steps = Math.max(-6, Math.min(6, requestedSteps));
      next = moveActivePlayer(next, steps);
      const tile = BOARD_TILES[next.players[next.currentPlayerIndex].position];
      lines.push(`按家庭上限移动 ${Math.abs(steps)} 格，到达「${tile.name}」`);
    } else if (effect.kind === "collect-each") {
      let collected = 0;
      const players = next.players.map((candidate, index) => {
        if (index === next.currentPlayerIndex) return candidate;
        const totalRoom = Math.max(0, GAME_RULES.cardLossAbsoluteCap - collected);
        const amount = Math.min(totalRoom, cappedLoss(candidate.cash, effect.amount));
        collected += amount;
        return { ...candidate, cash: candidate.cash - amount };
      });
      players[next.currentPlayerIndex] = { ...players[next.currentPlayerIndex], cash: players[next.currentPlayerIndex].cash + collected };
      next = { ...next, players };
      lines.push(`从其他旅行家共收到 ¥${collected.toLocaleString("zh-CN")}`);
    } else if (effect.kind === "pay-each") {
      const opponentCount = Math.max(1, next.players.length - 1);
      const total = cappedLoss(player.cash, effect.amount * opponentCount);
      const baseShare = Math.floor(total / opponentCount);
      let remainder = total - baseShare * opponentCount;
      next = {
        ...next,
        players: next.players.map((candidate, index) => {
          if (index === next.currentPlayerIndex) return { ...candidate, cash: candidate.cash - total };
          const received = baseShare + (remainder-- > 0 ? 1 : 0);
          return { ...candidate, cash: candidate.cash + received };
        }),
      };
      lines.push(`与大家分享 ¥${total.toLocaleString("zh-CN")}，已按人数分配`);
    } else if (effect.kind === "shield") {
      const turns = Math.max(1, Math.min(3, effect.turns));
      next = replaceActivePlayer(next, (cash, status) => ({ cash, status: { ...status, shieldTurns: turns, shieldUses: 1 } }));
      lines.push(`获得 1 次幸运护盾，最多保留 ${turns} 回合`);
    } else if (effect.kind === "rent-boost") {
      const turns = Math.max(1, Math.min(3, effect.turns));
      const multiplier = Math.max(1, Math.min(1.25, effect.multiplier));
      next = replaceActivePlayer(next, (cash, status) => ({ cash, status: { ...status, rentBoostTurns: turns, rentMultiplier: multiplier } }));
      lines.push(`未来 ${turns} 回合城市租金提升 ${Math.round((multiplier - 1) * 100)}%`);
    }
  }

  const summary = `${player.name}抽到${deck === "chance" ? "机会" : "命运"}牌「${card.title}」：${lines.join("；")}。`;
  next = withCardEvent(next, card.effect.kind === "move" || card.effect.kind === "move-to" ? "move" : "money", summary);
  return { card, session: next, lines, deckRemaining: nextDeck.remainingIds.length, deckCycle: cycle, wasShielded };
}
