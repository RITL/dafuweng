import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { drawAndResolveCard } from "../app/game/cards";
import { BOARD_TILES, CHANCE_CARDS, DESTINY_CARDS, ECONOMY_PRESETS } from "../app/game/config";
import {
  calculateRent,
  purchaseCity,
  transferRent,
  upgradeCity,
} from "../app/game/economy";
import {
  advanceGameTurn,
  createGameSession,
  loadGameSession,
  moveActivePlayer,
  rollRoulette,
  saveGameSession,
} from "../app/game/session";
import { calculateAssetBreakdown, createSettlementRanking } from "../app/game/settlement";
import { createTelevisionViewportContent, shouldUseVirtualTelevisionViewport } from "../app/game/display";
import type { FamilyCard, GameSession, PlayerState } from "../app/game/types";

const colors = ["coral", "ocean", "sunny", "grape", "mint", "rose"] as const;

function makeSession(playerCount = 2): GameSession {
  const session = createGameSession(
    Array.from({ length: playerCount }, (_, index) => ({
      id: `p${index + 1}`,
      name: `玩家${index + 1}`,
      avatar: ["🐼", "🦊", "🐯", "🐰", "🐨", "🦁"][index],
      color: colors[index],
      isChild: index === playerCount - 1,
    })),
    "classic",
    "family",
    true,
  );
  return {
    ...session,
    currentPlayerIndex: 0,
    startingPlayerId: session.players[0].id,
    round: 1,
  };
}

function activePlayer(session: GameSession) {
  return session.players[session.currentPlayerIndex];
}

function withOnlyNextCard(session: GameSession, card: FamilyCard): GameSession {
  return {
    ...session,
    cardDecks: {
      ...session.cardDecks,
      [card.deck]: {
        remainingIds: [card.id],
        lastDrawnId: null,
        cycle: 1,
      },
    },
  };
}

describe("双球轮盘与移动", () => {
  test("两球始终是 0–12，和始终是 0–24，并覆盖全部球面", () => {
    const counts = Array.from({ length: 13 }, () => 0);
    for (let index = 0; index < 20_000; index += 1) {
      const roll = rollRoulette();
      assert.ok(roll.first >= 0 && roll.first <= 12);
      assert.ok(roll.second >= 0 && roll.second <= 12);
      assert.equal(roll.total, roll.first + roll.second);
      counts[roll.first] += 1;
      counts[roll.second] += 1;
    }
    const expected = 40_000 / 13;
    counts.forEach((count) => assert.ok(count > expected * 0.8 && count < expected * 1.2));
  });

  test("经过起点只奖励一次，并正确累计圈数和落点", () => {
    const session = makeSession();
    const beforeCash = activePlayer(session).cash;
    session.players[0] = { ...session.players[0], position: 62, lapsCompleted: 2 };
    const moved = moveActivePlayer(session, 5);
    assert.equal(activePlayer(moved).position, 3);
    assert.equal(activePlayer(moved).lapsCompleted, 3);
    assert.equal(activePlayer(moved).cash, beforeCash + ECONOMY_PRESETS[1].startReward);
    assert.match(moved.events[0].message, /前进 5 格/);
    assert.equal(moved.events.filter((event) => /经过环球起点/.test(event.message)).length, 1);
  });
});

describe("城市购买、升级与租金", () => {
  const city = BOARD_TILES.find((tile) => tile.type === "city" && tile.id === "beijing");
  assert.ok(city && city.type === "city");

  test("城市只能购买一次，房屋逐级升级到旅馆且资金逐笔扣除", () => {
    let session = makeSession();
    const startingCash = activePlayer(session).cash;
    session = purchaseCity(session, city) as GameSession;
    assert.ok(session);
    assert.equal(activePlayer(session).cash, startingCash - city.price);
    assert.equal(activePlayer(session).properties[0].buildingLevel, 0);
    assert.equal(purchaseCity(session, city), null);

    for (let level = 1; level <= 5; level += 1) {
      session = upgradeCity(session, city) as GameSession;
      assert.ok(session);
      assert.equal(activePlayer(session).properties[0].buildingLevel, level);
    }
    assert.equal(upgradeCity(session, city), null);
    assert.equal(activePlayer(session).properties[0].buildingInvestment, city.buildCost * 5);
    assert.equal(activePlayer(session).cash, startingCash - city.price - city.buildCost * 5);
  });

  test("租金按建筑等级、经济档位和增益计算并只转账一次", () => {
    let session = purchaseCity(makeSession(), city) as GameSession;
    for (let level = 0; level < 5; level += 1) session = upgradeCity(session, city) as GameSession;
    const ownerBefore = session.players[0].cash;
    session = { ...session, currentPlayerIndex: 1 };
    const payerBefore = session.players[1].cash;
    const property = session.players[0].properties[0];
    const expectedRent = Math.round(city.baseRent * 10 * ECONOMY_PRESETS[1].rentMultiplier / 10) * 10;
    assert.equal(calculateRent(session, city, property), expectedRent);
    const transfer = transferRent(session, city);
    assert.ok(transfer);
    assert.equal(transfer.rent, expectedRent);
    assert.equal(transfer.session.players[0].cash, ownerBefore + expectedRent);
    assert.equal(transfer.session.players[1].cash, payerBefore - expectedRent);
    assert.equal(transfer.session.events.filter((event) => /支付.*租金/.test(event.message)).length, 1);
  });
});

describe("机会、命运与家庭友好上限", () => {
  test("两副牌在完整牌袋抽完前不重复", () => {
    for (const deck of ["chance", "destiny"] as const) {
      let session = makeSession(4);
      const seen = new Set<string>();
      const cards = deck === "chance" ? CHANCE_CARDS : DESTINY_CARDS;
      for (let index = 0; index < cards.length; index += 1) {
        const result = drawAndResolveCard(session, deck);
        assert.equal(seen.has(result.card.id), false);
        seen.add(result.card.id);
        session = result.session;
      }
      assert.equal(seen.size, 24);
    }
  });

  test("48 张牌逐张结算后均保持人数、现金和位置数据有效", () => {
    for (const card of [...CHANCE_CARDS, ...DESTINY_CARDS]) {
      const source = withOnlyNextCard(makeSession(6), card);
      const result = drawAndResolveCard(source, card.deck);
      assert.equal(result.card.id, card.id);
      assert.equal(result.session.players.length, 6);
      result.session.players.forEach((player) => {
        assert.ok(Number.isFinite(player.cash) && player.cash >= 0);
        assert.ok(player.position >= 0 && player.position < BOARD_TILES.length);
      });
      assert.ok(result.lines.length > 0);
      const expectedAddedEvents = card.effect.kind === "move" || card.effect.kind === "move-to" ? 2 : 1;
      assert.equal(result.session.events.length, source.events.length + expectedAddedEvents);
    }
  });
});

describe("2/4/6 人长回合与本机恢复", () => {
  for (const playerCount of [2, 4, 6]) {
    test(`${playerCount} 人连续三圈后轮次、当前玩家与存档一致`, () => {
      let session = makeSession(playerCount);
      for (let turn = 0; turn < playerCount * 3; turn += 1) {
        session = moveActivePlayer(session, (turn * 7) % 25);
        session = advanceGameTurn(session);
      }
      assert.equal(session.currentPlayerIndex, 0);
      assert.equal(session.round, 4);
      assert.equal(session.players.length, playerCount);

      const memory = new Map<string, string>();
      globalThis.window = {
        localStorage: {
          getItem: (key: string) => memory.get(key) ?? null,
          setItem: (key: string, value: string) => memory.set(key, value),
          removeItem: (key: string) => memory.delete(key),
        },
      } as unknown as Window & typeof globalThis;
      saveGameSession(session);
      const restored = loadGameSession();
      assert.deepEqual(restored, session);
    });
  }
});

describe("随时结算、同分与共同冠军", () => {
  const owned = (player: PlayerState, cash: number, price: number, investment: number): PlayerState => ({
    ...player,
    cash,
    properties: [{
      tileId: "beijing",
      purchasePrice: price,
      buildingLevel: investment > 0 ? 2 : 0,
      buildingInvestment: investment,
      mortgaged: false,
      mortgageValue: 0,
    }],
  });

  test("资产始终按现金、城市原价和建筑原始投入相加", () => {
    const player = owned(makeSession().players[0], 3_000, 1_600, 1_200);
    assert.deepEqual(calculateAssetBreakdown(player), {
      cash: 3_000,
      cityOriginalValue: 1_600,
      buildingOriginalValue: 1_200,
      total: 5_800,
    });
  });

  test("任意回合可排行，总资产与现金都相同才产生共同冠军", () => {
    const players = makeSession(4).players;
    const ranking = createSettlementRanking([
      owned(players[0], 4_000, 1_000, 0),
      owned(players[1], 4_000, 1_000, 0),
      owned(players[2], 3_000, 2_000, 0),
      owned(players[3], 2_000, 1_000, 0),
    ]);
    assert.deepEqual(ranking.map((entry) => entry.rank), [1, 1, 3, 4]);
    assert.equal(ranking.filter((entry) => entry.isWinner).length, 2);
    assert.deepEqual(ranking.filter((entry) => entry.isWinner).map((entry) => entry.player.id), ["p1", "p2"]);
  });
});

describe("iPhone 电视虚拟画布", () => {
  test("触屏窄视口启用电视画布，桌面浏览器保持原布局", () => {
    assert.equal(shouldUseVirtualTelevisionViewport(844, 5), true);
    assert.equal(shouldUseVirtualTelevisionViewport(1366, 5), false);
    assert.equal(shouldUseVirtualTelevisionViewport(844, 0), false);
  });

  test("iPhone 横屏宽度会映射到固定 1366 桌面视口", () => {
    const content = createTelevisionViewportContent(844);
    assert.match(content, /width=1366/);
    assert.match(content, /initial-scale=0\.6179/);
    assert.match(content, /minimum-scale=0\.6179/);
    assert.match(content, /user-scalable=no/);
  });
});

afterEach(() => {
  delete (globalThis as { window?: Window }).window;
});
