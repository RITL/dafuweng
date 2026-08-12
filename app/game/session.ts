import { BOARD_TILES, ECONOMY_PRESETS } from "./config";
import type {
  EconomyPresetId,
  GameEvent,
  GameLengthId,
  GameSession,
  PlayerColor,
  PlayerState,
} from "./types";

export const GAME_SESSION_STORAGE_KEY = "family-world-tour-session-v1";

export interface SessionPlayerDraft {
  id: string | number;
  name: string;
  avatar: string;
  color: PlayerColor;
  isChild?: boolean;
}

export interface RouletteResult {
  first: number;
  second: number;
  total: number;
}

const makeId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const randomIndex = (length: number) => {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor((value / 4294967296) * length);
  }
  return Math.floor(Math.random() * length);
};

const emptyCardStatus = () => ({ shieldTurns: 0, shieldUses: 0, rentBoostTurns: 0, rentMultiplier: 1 });
const createCardDeckState = () => ({
  chance: { remainingIds: [], lastDrawnId: null, cycle: 0 },
  destiny: { remainingIds: [], lastDrawnId: null, cycle: 0 },
});

const secureUniformInteger = (faceCount: number): number => {
  const randomRange = 4294967296;
  const unbiasedLimit = Math.floor(randomRange / faceCount) * faceCount;

  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const randomValue = new Uint32Array(1);
    do {
      crypto.getRandomValues(randomValue);
    } while (randomValue[0] >= unbiasedLimit);
    return randomValue[0] % faceCount;
  }

  return Math.floor(Math.random() * faceCount);
};

export function rollRoulette(): RouletteResult {
  const first = secureUniformInteger(13);
  const second = secureUniformInteger(13);
  return { first, second, total: first + second };
}

export function createGameSession(
  drafts: SessionPlayerDraft[],
  economyId: EconomyPresetId,
  gameLengthId: GameLengthId,
  voiceEnabled: boolean,
): GameSession {
  const economy = ECONOMY_PRESETS.find((item) => item.id === economyId) ?? ECONOMY_PRESETS[1];
  const players: PlayerState[] = drafts.map((draft, index) => ({
    id: String(draft.id),
    name: draft.name.trim() || `玩家 ${index + 1}`,
    avatar: draft.avatar,
    color: draft.color,
    isChild: draft.isChild ?? false,
    cash: economy.startingCash,
    position: 0,
    lapsCompleted: 0,
    properties: [],
    cardStatus: emptyCardStatus(),
  }));
  const currentPlayerIndex = randomIndex(players.length);
  const now = Date.now();
  const firstPlayer = players[currentPlayerIndex];
  const startEvent: GameEvent = {
    id: makeId("event"),
    kind: "start",
    message: `出发签选中了 ${firstPlayer.name}，由 TA 开启环球之旅！`,
    round: 1,
    playerId: firstPlayer.id,
    createdAt: now,
  };

  return {
    version: 1,
    id: makeId("game"),
    economyId,
    gameLengthId,
    voiceNarrationEnabled: voiceEnabled,
    voiceEnabled,
    players,
    currentPlayerIndex,
    startingPlayerId: firstPlayer.id,
    round: 1,
    createdAt: now,
    updatedAt: now,
    events: [startEvent],
    cardDecks: createCardDeckState(),
  };
}

export function advanceGameTurn(session: GameSession): GameSession {
  const nextPlayerIndex = (session.currentPlayerIndex + 1) % session.players.length;
  const nextPlayer = session.players[nextPlayerIndex];
  const nextRound = nextPlayer.id === session.startingPlayerId ? session.round + 1 : session.round;
  const now = Date.now();
  const event: GameEvent = {
    id: makeId("event"),
    kind: "turn",
    message: `旅行接力棒交给 ${nextPlayer.name}，准备出发！`,
    round: nextRound,
    playerId: nextPlayer.id,
    createdAt: now,
  };

  return {
    ...session,
    players: session.players.map((player, index) => {
      if (index !== nextPlayerIndex) return player;
      const status = player.cardStatus ?? emptyCardStatus();
      const shieldTurns = Math.max(0, status.shieldTurns - 1);
      const rentBoostTurns = Math.max(0, status.rentBoostTurns - 1);
      return {
        ...player,
        cardStatus: {
          shieldTurns,
          shieldUses: shieldTurns > 0 ? status.shieldUses : 0,
          rentBoostTurns,
          rentMultiplier: rentBoostTurns > 0 ? status.rentMultiplier : 1,
        },
      };
    }),
    currentPlayerIndex: nextPlayerIndex,
    round: nextRound,
    updatedAt: now,
    events: [event, ...session.events].slice(0, 50),
  };
}

export function moveActivePlayer(session: GameSession, steps: number): GameSession {
  const activePlayer = session.players[session.currentPlayerIndex];
  const boardSize = BOARD_TILES.length;
  const rawPosition = activePlayer.position + steps;
  const passedStartCount = steps > 0 ? Math.floor(rawPosition / boardSize) : 0;
  const crossedStartBackwards = steps < 0 && rawPosition < 0 ? Math.ceil(Math.abs(rawPosition) / boardSize) : 0;
  const nextPosition = ((rawPosition % boardSize) + boardSize) % boardSize;
  const landingTile = BOARD_TILES[nextPosition];
  const economy = ECONOMY_PRESETS.find((item) => item.id === session.economyId) ?? ECONOMY_PRESETS[1];
  const startReward = passedStartCount * economy.startReward;
  const now = Date.now();
  const moveEvent: GameEvent = {
    id: makeId("event"),
    kind: "move",
    message: `${activePlayer.name} 前进 ${steps} 格，抵达「${landingTile.name}」！`,
    round: session.round,
    playerId: activePlayer.id,
    createdAt: now,
  };
  const rewardEvent: GameEvent | null = startReward > 0 ? {
    id: makeId("event"),
    kind: "money",
    message: `${activePlayer.name} 经过环球起点，领取 ¥${startReward.toLocaleString("zh-CN")} 环游奖励！`,
    round: session.round,
    playerId: activePlayer.id,
    createdAt: now - 1,
  } : null;

  return {
    ...session,
    players: session.players.map((player, index) => index === session.currentPlayerIndex ? {
      ...player,
      position: nextPosition,
      lapsCompleted: Math.max(0, (player.lapsCompleted ?? 0) + passedStartCount - crossedStartBackwards),
      cash: player.cash + startReward,
    } : player),
    updatedAt: now,
    events: [moveEvent, ...(rewardEvent ? [rewardEvent] : []), ...session.events].slice(0, 50),
  };
}

export function saveGameSession(session: GameSession) {
  window.localStorage.setItem(GAME_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearGameSession() {
  window.localStorage.removeItem(GAME_SESSION_STORAGE_KEY);
}

export function loadGameSession(): GameSession | null {
  try {
    const raw = window.localStorage.getItem(GAME_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSession;
    if (
      parsed.version !== 1
      || !Array.isArray(parsed.players)
      || parsed.players.length < 2
      || parsed.players.length > 6
      || parsed.currentPlayerIndex < 0
      || parsed.currentPlayerIndex >= parsed.players.length
      || !Array.isArray(parsed.events)
    ) {
      return null;
    }
    return {
      ...parsed,
      voiceNarrationEnabled: parsed.voiceNarrationEnabled ?? parsed.voiceEnabled,
      players: parsed.players.map((player) => ({
        ...player,
        isChild: player.isChild ?? false,
        lapsCompleted: Number.isFinite(player.lapsCompleted) ? Math.max(0, player.lapsCompleted) : 0,
        cardStatus: player.cardStatus ?? emptyCardStatus(),
        properties: player.properties.map((property) => ({
          ...property,
          mortgaged: property.mortgaged ?? false,
          mortgageValue: property.mortgageValue ?? 0,
        })),
      })),
      cardDecks: parsed.cardDecks ?? createCardDeckState(),
    };
  } catch {
    return null;
  }
}
