import type { AssetBreakdown, PlayerState, SettlementEntry } from "./types";

export function calculateAssetBreakdown(player: PlayerState): AssetBreakdown {
  const cityOriginalValue = player.properties.reduce(
    (total, property) => total + property.purchasePrice,
    0,
  );
  const buildingOriginalValue = player.properties.reduce(
    (total, property) => total + property.buildingInvestment,
    0,
  );

  return {
    cash: player.cash,
    cityOriginalValue,
    buildingOriginalValue,
    total: player.cash + cityOriginalValue + buildingOriginalValue,
  };
}
export function createSettlementRanking(players: PlayerState[]): SettlementEntry[] {
  const sorted = players
    .map((player) => ({ player, assets: calculateAssetBreakdown(player) }))
    .sort((a, b) => b.assets.total - a.assets.total || b.assets.cash - a.assets.cash);

  let lastRank = 0;
  let lastTotal: number | null = null;
  let lastCash: number | null = null;

  return sorted.map((entry, index) => {
    if (entry.assets.total !== lastTotal || entry.assets.cash !== lastCash) {
      lastRank = index + 1;
      lastTotal = entry.assets.total;
      lastCash = entry.assets.cash;
    }

    return {
      ...entry,
      rank: lastRank,
      isWinner: lastRank === 1,
    };
  });
}
