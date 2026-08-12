export type PlayerColor =
  | "coral"
  | "ocean"
  | "sunny"
  | "grape"
  | "mint"
  | "rose";

export type EconomyPresetId = "relaxed" | "classic" | "adventure";
export type RentDifficultyId = "gentle" | "standard" | "competitive" | "tycoon";
export type ChildAgeBand = "4-6" | "6-8" | "8-10" | "10+";
export type LearningCategory = "math" | "geography" | "language" | "finance" | "observation";
export type GameLengthId = "quick" | "family" | "unlimited";
export type TileType =
  | "start"
  | "city"
  | "chance"
  | "destiny"
  | "airport"
  | "rest"
  | "bonus";

export type RegionId =
  | "asia"
  | "oceania"
  | "africa"
  | "europe"
  | "america";

export interface EconomyPreset {
  id: EconomyPresetId;
  name: string;
  description: string;
  startingCash: number;
  startReward: number;
  rentMultiplier: number;
  reliefFloor: number;
}

export interface RentDifficulty {
  id: RentDifficultyId;
  name: string;
  description: string;
  multiplier: number;
}

export interface GameLength {
  id: GameLengthId;
  name: string;
  description: string;
  rounds: number | null;
}

export interface BaseTile {
  id: string;
  index: number;
  type: TileType;
  name: string;
  icon: string;
  shortLabel?: string;
}

export interface CityTile extends BaseTile {
  type: "city";
  englishName: string;
  country: string;
  region: RegionId;
  price: number;
  baseRent: number;
  buildCost: number;
  landmark: string;
  continentName: string;
  knowledge: string;
  greeting?: string;
}

export interface SpecialTile extends BaseTile {
  type: Exclude<TileType, "city">;
  description: string;
}

export type BoardTile = CityTile | SpecialTile;

export type CardEffect =
  | { kind: "cash"; amount: number }
  | { kind: "cash-percent"; percent: number; cap: number }
  | { kind: "move"; steps: number }
  | { kind: "move-to"; tileIndex: number; collectStart: boolean }
  | { kind: "collect-each"; amount: number }
  | { kind: "pay-each"; amount: number }
  | { kind: "shield"; turns: number }
  | { kind: "rent-boost"; turns: number; multiplier: number };

export interface FamilyCard {
  id: string;
  deck: "chance" | "destiny";
  title: string;
  text: string;
  icon: string;
  tone: "good" | "gentle" | "surprise";
  effect: CardEffect;
}

export interface OwnedProperty {
  tileId: string;
  purchasePrice: number;
  buildingLevel: 0 | 1 | 2 | 3 | 4 | 5;
  buildingInvestment: number;
  mortgaged: boolean;
  mortgageValue: number;
}

export interface PlayerState {
  id: string;
  name: string;
  avatar: string;
  color: PlayerColor;
  isChild: boolean;
  ageBand?: ChildAgeBand;
  cash: number;
  position: number;
  lapsCompleted: number;
  properties: OwnedProperty[];
  cardStatus: PlayerCardStatus;
}

export interface PlayerLearningStats {
  visitedCityIds: string[];
  viewedKnowledgeCityIds: string[];
  challengeAttempts: number;
  challengeCorrect: number;
  challengeCategories: Partial<Record<LearningCategory, number>>;
  builds: number;
  collaborations: number;
  stamps: number;
}

export interface GameLearningState {
  knowledgeHintsEnabled: boolean;
  lastChallengeRound: number;
  lastChallengeCategory?: LearningCategory;
  familyEnergy: number;
  players: Record<string, PlayerLearningStats>;
}

export interface PlayerCardStatus {
  shieldTurns: number;
  shieldUses: number;
  rentBoostTurns: number;
  rentMultiplier: number;
}

export interface CardDeckState {
  remainingIds: string[];
  lastDrawnId: string | null;
  cycle: number;
}

export interface AssetBreakdown {
  cash: number;
  cityOriginalValue: number;
  buildingOriginalValue: number;
  total: number;
}

export interface SettlementEntry {
  player: PlayerState;
  assets: AssetBreakdown;
  rank: number;
  isWinner: boolean;
}

export interface GameEvent {
  id: string;
  kind: "start" | "turn" | "move" | "system" | "money" | "property";
  message: string;
  round: number;
  playerId?: string;
  createdAt: number;
}

export interface GameSession {
  version: 1;
  id: string;
  economyId: EconomyPresetId;
  rentDifficultyId?: RentDifficultyId;
  gameLengthId: GameLengthId;
  voiceNarrationEnabled?: boolean;
  voiceEnabled: boolean;
  players: PlayerState[];
  currentPlayerIndex: number;
  startingPlayerId: string;
  round: number;
  createdAt: number;
  updatedAt: number;
  events: GameEvent[];
  cardDecks: Record<"chance" | "destiny", CardDeckState>;
  learning?: GameLearningState;
}
