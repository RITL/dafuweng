"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOARD_TILES, ECONOMY_PRESETS, GAME_LENGTHS, PLAYER_COLORS, RENT_DIFFICULTIES } from "./config";
import { drawAndResolveCard } from "./cards";
import type { CardResolution } from "./cards";
import {
  applyFamilyAid,
  applyAssetAction,
  calculateRent,
  getCity,
  getPropertyOwner,
  purchaseCity,
  quoteAssetAction,
  recommendRescuePlans,
  settleBankTile,
  transferRent,
  upgradeCity,
} from "./economy";
import type { AssetAction } from "./economy";
import { advanceGameTurn, moveActivePlayer, rollRoulette } from "./session";
import type { RouletteResult } from "./session";
import { calculateAssetBreakdown, createSettlementRanking } from "./settlement";
import { parseSpokenNumber } from "./voice";
import type { UiSound } from "./use-game-audio";
import type { BoardTile, CityTile, GameSession, OwnedProperty, PlayerState } from "./types";
import { getClassicBoardGridArea, shouldUseNativeMirrorLayout } from "./display";
import { ageBandForPlayer, challengesForAge, createLearningAwards, LEARNING_CATEGORY_LABELS, migrateLearningState, recordBuild, recordChallenge, recordCityVisit, recordCollaboration, recordKnowledgeViewed, shouldOfferChallenge } from "./learning";
import type { TravelChallenge } from "./learning";

type TurnPhase = "ready" | "spinning" | "answering" | "moving" | "resolving" | "card" | "deciding" | "rescue" | "handoff";

type LandingDecision =
  | { kind: "purchase"; cityId: string }
  | { kind: "upgrade"; cityId: string }
  | { kind: "rent-paid"; cityId: string; rent: number; ownerName: string }
  | { kind: "rent-due"; cityId: string; rent: number; ownerName: string; shortage: number };

type FinancialAction =
  | { kind: "purchase"; cityId: string; amount: number; label: string }
  | { kind: "upgrade"; cityId: string; amount: number; label: string }
  | { kind: "asset"; cityId: string; assetAction: AssetAction; amount: number; label: string };

interface UndoSnapshot {
  label: string;
  players: PlayerState[];
  transactionEventIds: string[];
}

interface RentFlight {
  id: number;
  payerName: string;
  payerAvatar: string;
  ownerName: string;
  ownerAvatar: string;
  amount: number;
}

interface PropertyCelebration {
  kind: "purchase" | "upgrade" | "hotel";
  icon: string;
  title: string;
  detail: string;
}

interface GameSessionScreenProps {
  session: GameSession;
  isFresh: boolean;
  musicEnabled: boolean;
  effectsEnabled: boolean;
  audioStarted: boolean;
  televisionMode: boolean;
  remoteControlled: boolean;
  onOpenRemoteController: () => void;
  onMusicChange: (enabled: boolean) => void;
  onEffectsChange: (enabled: boolean) => void;
  playUiSound: (sound?: UiSound) => void;
  onSessionChange: (session: GameSession) => void;
  onEndGame: () => void;
}

const numberFormatter = new Intl.NumberFormat("zh-CN");
const timeFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" });
const REDUCED_MOTION_KEY = "family-world-tour-reduced-motion";
const VOICE_WAIT_REMINDER_MS = 15000;
const VOICE_GUIDE_KEY = "family-world-tour-voice-guide-v1";
const ONBOARDING_KEY = "family-world-tour-onboarding-v1";
const ROLL_INPUT_MODE_KEY = "family-world-tour-roll-input-mode-v1";
const REMOTE_ANSWER_EVENT = "family-world-tour-remote-answer";
const REMOTE_CLOSE_OVERLAY_EVENT = "family-world-tour-remote-close-overlay";
const MATH_ENCOURAGEMENTS = [
  "没关系，可以动动小手指数一数。",
  "已经很接近啦，看看两个小球，慢慢加起来。",
  "别着急，再试一次就好。",
  "你一定可以的，把第一个数放在心里，再接着数。",
  "小脑袋正在变聪明，再认真看一眼。",
  "先找到大一点的数，再往后数几步。",
  "可以把两个数字分成两小堆，再合在一起。",
  "伸出手指帮帮忙，答案很快就出来啦。",
  "看看左边的小球，再加上右边的小球。",
  "慢一点没关系，认真算比算得快更厉害。",
  "勇敢回答就已经很棒了，我们再算一次。",
  "每试一次都离答案更近一点。",
  "先深呼吸一下，你肯定能找到答案。",
  "可以轻轻念出两个数字，再把它们加起来。",
  "想想从第一个数字出发，还要向前走几步。",
  "小手准备好了吗？一个一个接着数。",
  "这次换一种方法，答案也许马上就出现了。",
  "不用担心答错，数学就是这样慢慢学会的。",
  "观察得再仔细一点，两个小球都在帮你。",
  "你刚才已经完成了一大半，再试一下。",
  "先算容易的部分，再把剩下的加上去。",
  "相信自己的小脑袋，这道题难不住你。",
  "好答案值得多想一会儿，我们继续。",
  "数一数轮盘上的点数，再把两边合起来。",
];

type VoiceVisualState = "idle" | "requesting" | "speaking" | "listening" | "heard" | "error" | "unsupported" | "off";
type RollInputMode = "electronic" | "physical";

interface SpeechRecognitionResultLike extends ArrayLike<{ transcript: string }> {
  isFinal?: boolean;
}

interface SpeechRecognitionResultEvent extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEvent extends Event {
  error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const phaseCopy: Record<TurnPhase, { eyebrow: string; title: string }> = {
  ready: { eyebrow: "等待旅行家确认", title: "转动轮盘，决定前进步数" },
  spinning: { eyebrow: "幸运数字正在揭晓", title: "轮盘转动中…" },
  answering: { eyebrow: "小小数学家时间", title: "两个小球一共是多少点？" },
  moving: { eyebrow: "镜头正在跟随棋子", title: "向下一站出发" },
  resolving: { eyebrow: "已抵达目的地", title: "正在确认落点事件" },
  card: { eyebrow: "环球奇遇正在发生", title: "机会与命运已揭晓" },
  deciding: { eyebrow: "城市经济时间", title: "请完成本回合的城市决策" },
  rescue: { eyebrow: "资产自救中心", title: "先筹足现金，再完成付款" },
  handoff: { eyebrow: "本回合完成", title: "旅行接力棒交接中" },
};

const onboardingPages = [
  {
    icon: "🎙️",
    eyebrow: "第 1 步 · 轮到谁",
    title: "听到名字，再开始前进",
    description: "主持人会说“已经轮到谁谁谁啦”。玩家可以说“前进”，也可以点击大按钮；说“等等”会留在当前回合继续等待。",
    points: ["每回合只产生一次随机结果", "轮盘动画可跳过，不会改变点数", "语音听不清时，屏幕按钮永远可用"],
  },
  {
    icon: "🎱",
    eyebrow: "第 2 步 · 双球轮盘",
    title: "两个小球相加，就是步数",
    description: "两个小球分别落在 0–12，总和是本回合前进的格数。小朋友需要先回答加法，答对后棋子才会出发。",
    points: ["范围是 0–24 步", "小朋友答错会温和鼓励并继续听", "到站会播报走了几步、到了哪里"],
  },
  {
    icon: "🏙️",
    eyebrow: "第 3 步 · 城市经营",
    title: "买城市、建四座房，再升级旅馆",
    description: "无主城市可以买；回到自己的城市可以建设；到别人城市会自动支付租金。现金不足时，资产中心会推荐卖房、卖地、抵押或家庭援助。",
    points: ["空地 → 1/2/3/4 座房屋 → 旅馆", "抵押城市暂时不收租也不能建设", "任何时候都能按原价资产结算排行"],
  },
  {
    icon: "📺",
    eyebrow: "第 4 步 · 全家一起玩",
    title: "电视负责展示，手机或电脑负责听你说",
    description: "投到客厅电视后，控制设备要放在家人附近。音乐、音效、语音和动效都能独立调整，关闭任何一项都不会挡住游戏流程。",
    points: ["右上角“投到电视”进入 75 寸模式", "按 ? 随时打开规则手册", "所有关键结果同时使用文字、图标和声音表达"],
  },
] as const;

const eventIcon = (kind: string) => {
  if (kind === "start") return "🎉";
  if (kind === "move") return "👣";
  if (kind === "money") return "🪙";
  if (kind === "property") return "🏠";
  return "🎒";
};

function ImmersiveWorldBoard({
  session,
  displayPosition,
  phase,
  movementProgress,
  rouletteFace,
  rouletteResult,
  rouletteRotations,
  mathFeedback,
  voiceStatus,
  voiceVisualState,
  arrivalNotice,
  reducedMotion,
  rollInputMode,
  onStartTurn,
  onManualRoll,
  onRollInputModeChange,
  onAnswer,
  onRetryAnswer,
  onSkipAnimation,
  onReducedMotionChange,
}: {
  session: GameSession;
  displayPosition: number;
  phase: TurnPhase;
  movementProgress: { current: number; total: number } | null;
  rouletteFace: [number, number];
  rouletteResult: RouletteResult | null;
  rouletteRotations: [number, number];
  mathFeedback: string;
  voiceStatus: string;
  voiceVisualState: VoiceVisualState;
  arrivalNotice: string;
  reducedMotion: boolean;
  rollInputMode: RollInputMode;
  onStartTurn: () => void;
  onManualRoll: (steps: number) => void;
  onRollInputModeChange: (mode: RollInputMode) => void;
  onAnswer: (answer: number) => void;
  onRetryAnswer: () => void;
  onSkipAnimation: () => void;
  onReducedMotionChange: (enabled: boolean) => void;
}) {
  const isMoving = phase === "moving";
  const isBusy = phase !== "ready";
  const currentPlayer = session.players[session.currentPlayerIndex];
  const currentColor = PLAYER_COLORS.find((item) => item.id === currentPlayer.color)?.hex ?? "#167f7b";
  const propertyOwners = useMemo(() => {
    const owners = new Map<string, { player: PlayerState; property: OwnedProperty }>();
    session.players.forEach((player) => player.properties.forEach((property) => {
      owners.set(property.tileId, { player, property });
    }));
    return owners;
  }, [session.players]);
  const visiblePlayers = session.players.map((player, index) => index === session.currentPlayerIndex
    ? { ...player, position: displayPosition }
    : player);
  const currentTile = BOARD_TILES[displayPosition] ?? BOARD_TILES[0];
  const nextTile = BOARD_TILES[(displayPosition + 1) % BOARD_TILES.length];
  const routeTiles = Array.from({ length: 6 }, (_, depth) => BOARD_TILES[(displayPosition + depth) % BOARD_TILES.length]);
  const currentOwner = propertyOwners.get(currentTile.id);
  const positionRanking = visiblePlayers
    .map((player) => ({
      player,
      progress: (player.lapsCompleted ?? 0) * BOARD_TILES.length + player.position,
      tile: BOARD_TILES[player.position] ?? BOARD_TILES[0],
    }))
    .sort((left, right) => right.progress - left.progress || left.player.id.localeCompare(right.player.id));
  const leaderProgress = positionRanking[0]?.progress ?? 0;
  const tileTypeLabels = {
    start: "环球起点",
    city: "可投资城市",
    chance: "机会卡",
    destiny: "命运卡",
    airport: "航空枢纽",
    rest: "休息地点",
    bonus: "公共奖励",
  } as const;
  const tileDescription = (tile: BoardTile) => tile.type === "city"
    ? `${tile.country} · 城市价 ¥${numberFormatter.format(tile.price)} · 基础租金 ¥${numberFormatter.format(tile.baseRent)}`
    : tile.description;
  const sceneRegion = currentTile.type === "city" ? currentTile.region : "world";
  const regionLandmarks: Record<string, [string, string, string]> = {
    asia: ["🏯", "🗻", "🏮"],
    oceania: ["⛵", "🌴", "🌋"],
    africa: ["🔺", "🌅", "🐘"],
    europe: ["🗼", "🏛️", "🌷"],
    america: ["🗽", "🌉", "🌵"],
    world: ["🌍", "✈️", "🧳"],
  };
  const landmarks = regionLandmarks[sceneRegion];

  return (
    <div className="game-camera-shell">
      <div className={`travel-scene scene-${sceneRegion}${isMoving ? " is-travelling" : ""}`} aria-label="3D 跟随视角环球路线">
        <div className="scene-sky" aria-hidden="true"><i /><i /><i /></div>
        <div className="scene-horizon" aria-hidden="true">
          <span>{landmarks[0]}</span><span>{landmarks[1]}</span><span>{landmarks[2]}</span>
        </div>
        <div className="scene-ground" aria-hidden="true" />
        <div className="perspective-road" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="speed-lines" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>

        <section className="camera-status" aria-live="polite">
          <span className="camera-mode"><i /> 跟随视角</span>
          <small>{isMoving ? `前进中 · ${movementProgress?.current ?? 0}/${movementProgress?.total ?? rouletteResult?.total ?? 0} 格` : "当前位置"}</small>
          <h2>{currentTile.icon} {currentTile.name}</h2>
          <p>下一站：<b>{nextTile.name}</b><i>→</i></p>
        </section>

        <aside className="route-navigator" aria-label="全体玩家相对位置导航">
          <header><span><small>FAMILY RACE</small><b>全员相对位置</b></span><i>🧭</i></header>

          <article className={`navigator-current nav-${currentTile.type}`}>
            <div className="navigator-current-head"><span>{currentTile.icon}</span><p><small>{tileTypeLabels[currentTile.type]} · 第 {displayPosition + 1} 站</small><b>{currentTile.name}</b></p></div>
            <p className="navigator-description">{tileDescription(currentTile)}</p>
            <div className="navigator-current-foot">
              <span><i style={{ background: currentColor }} />{currentPlayer.name} 在这里</span>
              {currentOwner ? <b style={{ "--owner-color": PLAYER_COLORS.find((color) => color.id === currentOwner.player.color)?.hex } as React.CSSProperties}>{currentOwner.player.avatar} {currentOwner.player.name} 的城市</b> : <b>{currentTile.type === "city" ? "目前无主" : "系统地点"}</b>}
            </div>
          </article>

          <section className="navigator-players" aria-label="玩家领先与落后关系">
            <header><b>当前位置排行</b><small>按累计行进站数</small></header>
            {positionRanking.map(({ player, progress, tile }, index) => {
              const color = PLAYER_COLORS.find((item) => item.id === player.color)?.hex ?? "#167f7b";
              const behind = leaderProgress - progress;
              const sameTileCount = visiblePlayers.filter((candidate) => candidate.position === player.position).length;
              return (
                <article className={player.id === currentPlayer.id ? "active" : ""} key={player.id} style={{ "--navigator-player-color": color } as React.CSSProperties}>
                  <i>{index + 1}</i><span>{player.avatar}</span>
                  <p><b>{player.name}{player.id === currentPlayer.id ? " · 行动中" : ""}</b><small>{tile.icon} {tile.name} · 第 {(player.lapsCompleted ?? 0) + 1} 圈第 {player.position + 1} 站</small></p>
                  <em>{behind === 0 ? (index === 0 ? "全场领先" : "并列领先") : `落后 ${behind} 站`}{sameTileCount > 1 ? ` · ${sameTileCount} 人同格` : ""}</em>
                </article>
              );
            })}
          </section>
          <footer><span>当前旅行家 · 第 {(currentPlayer.lapsCompleted ?? 0) + 1} 圈</span><b>{displayPosition + 1} / {BOARD_TILES.length} 站</b><small>领先关系按“完成圈数 × 64 ＋ 当前站位”实时计算，跨过起点也不会看反。</small></footer>
        </aside>

        <div className="depth-route" aria-label="当前及前方六个地点">
          {routeTiles.map((tile: BoardTile, depth) => {
          const owner = propertyOwners.get(tile.id);
          const playersHere = visiblePlayers.filter((player) => player.position === tile.index);
          const ownerColor = owner
            ? PLAYER_COLORS.find((item) => item.id === owner.player.color)?.hex ?? "#167f7b"
            : undefined;
          const tileClasses = ["travel-tile", `depth-${depth}`, `travel-${tile.type}`, tile.type === "city" ? `region-${tile.region}` : "", depth === 0 ? "current" : ""].filter(Boolean).join(" ");
          return (
            <article
              key={`${tile.id}-${depth}`}
              className={tileClasses}
              style={{ "--owner-color": ownerColor } as React.CSSProperties}
              title={tile.type === "city" ? `${tile.country} · 城市价格 ¥${numberFormatter.format(tile.price)}` : tile.description}
              aria-label={`${tile.name}${tile.type === "city" ? `，价格 ${tile.price}` : ""}`}
            >
              <span className="travel-index">{String(tile.index).padStart(2, "0")}</span>
              <span className="travel-icon">{tile.icon}</span>
              <span className="travel-copy"><small>{depth === 0 ? "YOU ARE HERE" : depth === 1 ? "NEXT STOP" : `前方 ${depth} 格`}</small><b>{tile.shortLabel ?? tile.name}</b><em>{tile.type === "city" ? `${tile.country} · ¥${numberFormatter.format(tile.price)}` : tile.type === "start" ? `经过奖励 +¥${numberFormatter.format(ECONOMY_PRESETS.find((item) => item.id === session.economyId)?.startReward ?? 2000)}` : tile.name}</em></span>
              {owner && (
                <span className="travel-owner" style={{ "--owner-color": ownerColor } as React.CSSProperties}>
                  <i>{owner.player.avatar}</i>
                  <b>{owner.player.name}</b>
                  <em>{owner.property.buildingLevel === 5 ? "🏨 旅馆" : owner.property.buildingLevel > 0 ? `🏠×${owner.property.buildingLevel}` : "◆ 已购"}</em>
                </span>
              )}
              {playersHere.length > 0 && (
                <span className="travel-token-stack" aria-label={`${playersHere.map((player) => player.name).join("、")} 在这里`}>
                  {playersHere.map((player) => {
                    const color = PLAYER_COLORS.find((item) => item.id === player.color)?.hex ?? "#167f7b";
                    const moving = isMoving && player.id === currentPlayer.id;
                    return <i key={player.id} className={moving ? "moving-token" : ""} style={{ "--token-color": color } as React.CSSProperties} title={player.name}>{player.avatar}</i>;
                  })}
                </span>
              )}
            </article>
          );
          })}
        </div>

        <section className={`scene-action-panel phase-${phase}${reducedMotion ? " reduced-motion" : ""}`}>
          <div className="turn-phase-copy">
            <small>{phaseCopy[phase].eyebrow}</small>
            <b>{phase === "ready" && rollInputMode === "physical" ? "转动实体俄罗斯轮盘，录入最终点数" : phase === "moving" ? `还剩 ${Math.max(0, (movementProgress?.total ?? rouletteResult?.total ?? 0) - (movementProgress?.current ?? 0))} 格` : phaseCopy[phase].title}</b>
            <span>{arrivalNotice && ["resolving", "deciding", "rescue", "handoff"].includes(phase) ? `📍 ${arrivalNotice}` : `${currentPlayer.avatar} ${currentPlayer.name}${phase === "ready" ? "，到你啦！" : ""}`}</span>
            {phase === "ready" && session.voiceEnabled && <em className="voice-turn-state">🎙️ {voiceStatus}</em>}
          </div>

          {rollInputMode === "electronic" ? <div className="roulette-console twin-ball" aria-live="assertive" aria-label={phase === "spinning" ? "双球轮盘正在转动" : rouletteResult ? `两球点数 ${rouletteResult.first} 加 ${rouletteResult.second}` : "双球零到十二轮盘"}>
            <div className="number-roulette physical-ring" aria-hidden="true">
              {Array.from({ length: 26 }, (_, index) => index % 13).map((number, index) => <span key={`${number}-${index}`} style={{ "--roulette-index": index } as React.CSSProperties}>{number}</span>)}
              <i className="gold-spinner"><b /><b /><b /><b /></i>
            </div>
            <i className="roulette-ball ball-one" style={{ "--ball-rotation": `${rouletteRotations[0]}deg` } as React.CSSProperties} aria-hidden="true" />
            <i className="roulette-ball ball-two" style={{ "--ball-rotation": `${rouletteRotations[1]}deg` } as React.CSSProperties} aria-hidden="true" />
            <strong className={phase === "spinning" ? "roulette-equation changing" : "roulette-equation"}>
              {phase === "spinning" ? "转动中…" : rouletteResult ? `${rouletteResult.first} + ${rouletteResult.second}${currentPlayer.isChild && phase === "answering" ? " = ?" : ` = ${rouletteResult.total}`}` : "? + ?"}
            </strong>
          </div> : <div className="physical-roll-badge" aria-live="polite"><span>🎡</span><b>实体俄罗斯轮盘</b><small>{session.voiceEnabled ? "停在 0–24，报出或点击最终点数" : "停稳后点击最终点数 0–24"}</small></div>}

          <div className="roll-mode-switch" aria-label="选择点数产生方式">
            <button type="button" disabled={isBusy} className={rollInputMode === "electronic" ? "active" : ""} onClick={() => onRollInputModeChange("electronic")}>电子轮盘</button>
            <button type="button" disabled={isBusy} className={rollInputMode === "physical" ? "active" : ""} onClick={() => onRollInputModeChange("physical")}>🎡 实体轮盘</button>
          </div>

          {rollInputMode === "electronic" && <div className="turn-actions">
            <button className="start-turn-button" type="button" onClick={() => onStartTurn()} disabled={isBusy}>
              <span>{phase === "ready" ? "开始前进" : phase === "spinning" ? "双球滚动中" : phase === "answering" ? "等待回答" : phase === "moving" ? "旅行中" : phase === "resolving" ? "落点确认中" : "交接中"}</span>
              <b>{phase === "ready" ? "转动双球轮盘  →" : rouletteResult ? `${rouletteResult.first} + ${rouletteResult.second}${phase === "answering" ? " = ?" : ` = ${rouletteResult.total}`}` : "请稍候"}</b>
            </button>
            {isBusy && phase !== "answering" && <button className="skip-turn-animation" type="button" onClick={onSkipAnimation}>{phase === "spinning" ? "跳过轮盘动画" : phase === "moving" ? "跳过移动动画" : phase === "resolving" ? "立即显示结果" : phase === "handoff" ? "立即下一位" : "跳过动画"}</button>}
          </div>}

          {rollInputMode === "physical" && phase === "ready" && <div className="physical-roll-panel">
            <p><b>{session.voiceEnabled ? "实体轮盘停稳后，说“走 8 步”" : "实体轮盘停稳后，选择最终点数"}</b><small>{session.voiceEnabled ? "也可以直接点击最终点数 0–24" : "点击下方数字 0–24"}</small></p>
            <div>{Array.from({ length: 25 }, (_, steps) => <button type="button" key={steps} onClick={() => onManualRoll(steps)}>{steps}</button>)}</div>
          </div>}
          {rollInputMode === "physical" && isBusy && phase !== "answering" && <button className="skip-turn-animation physical-skip-animation" type="button" onClick={onSkipAnimation}>{phase === "moving" ? "跳过移动动画" : phase === "resolving" ? "立即显示结果" : phase === "handoff" ? "立即下一位" : "跳过动画"}</button>}

          {phase === "answering" && (
            <div className="math-answer-panel">
              <p><b>{mathFeedback || `请让 ${currentPlayer.name} 回答`}</b>{session.voiceEnabled && <small><i className={`mini-voice-wave state-${voiceVisualState}`} aria-hidden="true"><em /><em /><em /><em /></i>🎙️ {voiceStatus} · 会持续等待，不用点击</small>}</p>
              {session.voiceEnabled && <button className="retry-listen-button" type="button" onClick={onRetryAnswer}>备用：重新开启麦克风</button>}
              <div>{Array.from({ length: 25 }, (_, answer) => <button type="button" key={answer} onClick={() => onAnswer(answer)}>{answer}</button>)}</div>
            </div>
          )}

          <button
            className={reducedMotion ? "motion-mode-toggle active" : "motion-mode-toggle"}
            type="button"
            onClick={() => onReducedMotionChange(!reducedMotion)}
            aria-pressed={reducedMotion}
          >
            {reducedMotion ? "✓ 已简化动效" : "简化动效"}
          </button>
          <small className="turn-safety-note">{rollInputMode === "physical" ? "线下结果由家庭确认，提交后每回合只移动一次" : "每回合只生成一次公平随机点数，动画不会改变结果"}</small>
        </section>
      </div>
    </div>
  );
}

function ClassicWorldBoard(props: Parameters<typeof ImmersiveWorldBoard>[0]) {
  const {
    session,
    displayPosition,
    phase,
    movementProgress,
    rouletteFace,
    rouletteResult,
    rouletteRotations,
    mathFeedback,
    voiceStatus,
    voiceVisualState,
    arrivalNotice,
    reducedMotion,
    rollInputMode,
    onStartTurn,
    onManualRoll,
    onRollInputModeChange,
    onAnswer,
    onRetryAnswer,
    onSkipAnimation,
    onReducedMotionChange,
  } = props;
  const currentPlayer = session.players[session.currentPlayerIndex];
  const isBusy = phase !== "ready";
  const propertyOwners = useMemo(() => {
    const owners = new Map<string, { player: PlayerState; property: OwnedProperty }>();
    session.players.forEach((player) => player.properties.forEach((property) => {
      owners.set(property.tileId, { player, property });
    }));
    return owners;
  }, [session.players]);
  const visiblePlayers = session.players.map((player, index) => index === session.currentPlayerIndex
    ? { ...player, position: displayPosition }
    : player);
  return (
    <div className="game-camera-shell classic-camera-shell">
      <section className="classic-live-board" aria-label="环球大富翁二维环形棋盘">
        {BOARD_TILES.map((tile) => {
          const owner = propertyOwners.get(tile.id);
          const playersHere = visiblePlayers.filter((player) => player.position === tile.index);
          const ownerColor = owner
            ? PLAYER_COLORS.find((item) => item.id === owner.player.color)?.hex ?? "#167f7b"
            : undefined;
          return (
            <article
              key={tile.id}
              className={`classic-live-tile live-${tile.type}${tile.index === displayPosition ? " current" : ""}${tile.type === "city" ? ` region-${tile.region}` : ""}`}
              style={{
                gridArea: getClassicBoardGridArea(tile.index, 20, 14),
                "--mobile-grid-area": getClassicBoardGridArea(tile.index, 24, 10),
                "--owner-color": ownerColor,
              } as React.CSSProperties}
              title={tile.type === "city" ? `${tile.country} · ¥${numberFormatter.format(tile.price)}` : tile.description}
            >
              <i className="classic-tile-icon">{tile.icon}</i>
              <b>{tile.shortLabel ?? tile.name}</b>
              {owner && <em className="classic-owner-mark" title={`${owner.player.name}的城市`}>{owner.player.avatar}</em>}
              {playersHere.length > 0 && (
                <span className="classic-token-stack" aria-label={`${playersHere.map((player) => player.name).join("、")}在这里`}>
                  {playersHere.map((player) => <i key={player.id} title={player.name}>{player.avatar}</i>)}
                </span>
              )}
            </article>
          );
        })}

        <section className={`classic-board-center phase-${phase}${reducedMotion ? " reduced-motion" : ""}`}>
          <div className="classic-turn-copy">
            <small>{phaseCopy[phase].eyebrow}</small>
            <h2>{phase === "ready" && rollInputMode === "physical" ? "实体轮盘：录入最终点数" : phase === "moving" ? `还剩 ${Math.max(0, (movementProgress?.total ?? rouletteResult?.total ?? 0) - (movementProgress?.current ?? 0))} 格` : phaseCopy[phase].title}</h2>
            <p>{arrivalNotice && ["resolving", "deciding", "rescue", "handoff"].includes(phase) ? `📍 ${arrivalNotice}` : `${currentPlayer.avatar} ${currentPlayer.name}${phase === "ready" ? "，到你啦！" : ""}`}</p>
          </div>

          {rollInputMode === "electronic" ? <div className="roulette-console twin-ball" aria-live="assertive" aria-label={phase === "spinning" ? "双球轮盘正在转动" : rouletteResult ? `两球点数 ${rouletteResult.first} 加 ${rouletteResult.second}` : "双球零到十二轮盘"}>
            <div className="number-roulette physical-ring" aria-hidden="true">
              {Array.from({ length: 26 }, (_, index) => index % 13).map((number, index) => <span key={`${number}-${index}`} style={{ "--roulette-index": index } as React.CSSProperties}>{number}</span>)}
              <i className="gold-spinner"><b /><b /><b /><b /></i>
            </div>
            <i className="roulette-ball ball-one" style={{ "--ball-rotation": `${rouletteRotations[0]}deg` } as React.CSSProperties} aria-hidden="true" />
            <i className="roulette-ball ball-two" style={{ "--ball-rotation": `${rouletteRotations[1]}deg` } as React.CSSProperties} aria-hidden="true" />
            <strong className={phase === "spinning" ? "roulette-equation changing" : "roulette-equation"}>
              {phase === "spinning" ? "转动中…" : rouletteResult ? `${rouletteResult.first} + ${rouletteResult.second}${currentPlayer.isChild && phase === "answering" ? " = ?" : ` = ${rouletteResult.total}`}` : "? + ?"}
            </strong>
          </div> : <div className="physical-roll-badge" aria-live="polite"><span>🎡</span><b>实体俄罗斯轮盘</b><small>{session.voiceEnabled ? "停在 0–24，报出或点击最终点数" : "停稳后点击最终点数 0–24"}</small></div>}

          <div className="roll-mode-switch" aria-label="选择点数产生方式">
            <button type="button" disabled={isBusy} className={rollInputMode === "electronic" ? "active" : ""} onClick={() => onRollInputModeChange("electronic")}>电子轮盘</button>
            <button type="button" disabled={isBusy} className={rollInputMode === "physical" ? "active" : ""} onClick={() => onRollInputModeChange("physical")}>🎡 实体轮盘</button>
          </div>

          {rollInputMode === "electronic" && <div className="classic-turn-actions">
            <button className="start-turn-button" type="button" onClick={onStartTurn} disabled={isBusy}>
              <span>{phase === "ready" ? "开始前进" : phase === "spinning" ? "双球滚动中" : phase === "answering" ? "等待回答" : phase === "moving" ? "旅行中" : phase === "resolving" ? "落点确认中" : "交接中"}</span>
              <b>{phase === "ready" ? "转动双球轮盘 →" : rouletteResult ? `${rouletteResult.first} + ${rouletteResult.second}${phase === "answering" ? " = ?" : ` = ${rouletteResult.total}`}` : "请稍候"}</b>
            </button>
            {isBusy && phase !== "answering" && <button className="skip-turn-animation" type="button" onClick={onSkipAnimation}>{phase === "spinning" ? "跳过轮盘动画" : phase === "moving" ? "跳过移动动画" : phase === "resolving" ? "立即显示结果" : phase === "handoff" ? "立即下一位" : "跳过动画"}</button>}
          </div>}

          {rollInputMode === "physical" && phase === "ready" && <div className="physical-roll-panel classic-physical-roll-panel">
            <p><b>{session.voiceEnabled ? "轮盘停稳后，说“走 8 步”" : "轮盘停稳后，选择最终点数"}</b><small>{session.voiceEnabled ? "或点击最终点数 0–24" : "点击下方数字 0–24"}</small></p>
            <div>{Array.from({ length: 25 }, (_, steps) => <button type="button" key={steps} onClick={() => onManualRoll(steps)}>{steps}</button>)}</div>
          </div>}
          {rollInputMode === "physical" && isBusy && phase !== "answering" && <button className="skip-turn-animation physical-skip-animation" type="button" onClick={onSkipAnimation}>{phase === "moving" ? "跳过移动动画" : phase === "resolving" ? "立即显示结果" : phase === "handoff" ? "立即下一位" : "跳过动画"}</button>}

          {phase === "answering" && (
            <div className="math-answer-panel classic-math-panel">
              <p><b>{mathFeedback || `请让 ${currentPlayer.name} 回答`}</b>{session.voiceEnabled && <small>🎙️ {voiceStatus}</small>}</p>
              {session.voiceEnabled && <button className="retry-listen-button" type="button" onClick={onRetryAnswer}>重新开启麦克风</button>}
              <div>{Array.from({ length: 25 }, (_, answer) => <button type="button" key={answer} onClick={() => onAnswer(answer)}>{answer}</button>)}</div>
            </div>
          )}

          <button className={reducedMotion ? "motion-mode-toggle active" : "motion-mode-toggle"} type="button" onClick={() => onReducedMotionChange(!reducedMotion)} aria-pressed={reducedMotion}>{reducedMotion ? "✓ 已简化动效" : "简化动效"}</button>
          <small className="classic-safety-note">{rollInputMode === "physical" ? "兼容家庭实体俄罗斯轮盘 · 提交后只移动一次" : "每回合只生成一次公平随机点数"}</small>
          {phase === "ready" && session.voiceEnabled && <em className="classic-voice-state">🎙️ {voiceStatus}</em>}
        </section>
      </section>
    </div>
  );
}

export function GameSessionScreen({
  session,
  isFresh,
  musicEnabled,
  effectsEnabled,
  audioStarted,
  televisionMode,
  remoteControlled,
  onOpenRemoteController,
  onMusicChange,
  onEffectsChange,
  playUiSound,
  onSessionChange,
  onEndGame,
}: GameSessionScreenProps) {
  const [turnPhase, setTurnPhase] = useState<TurnPhase>("ready");
  const [showFirstPlayer, setShowFirstPlayer] = useState(isFresh);
  const [dialog, setDialog] = useState<"settle-confirm" | "settlement" | "new-game" | null>(null);
  const [settlementIsFinal, setSettlementIsFinal] = useState(false);
  const [movementPosition, setMovementPosition] = useState<number | null>(null);
  const [movementProgress, setMovementProgress] = useState<{ current: number; total: number } | null>(null);
  const [rouletteFace, setRouletteFace] = useState<[number, number]>([0, 0]);
  const [rouletteResult, setRouletteResult] = useState<RouletteResult | null>(null);
  const [rouletteRotations, setRouletteRotations] = useState<[number, number]>([0, 0]);
  const [mathFeedback, setMathFeedback] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("准备点名");
  const [voiceVisualState, setVoiceVisualState] = useState<VoiceVisualState>(session.voiceEnabled ? "idle" : "off");
  const [recognizedTranscript, setRecognizedTranscript] = useState("");
  const [voiceGuideOpen, setVoiceGuideOpen] = useState(false);
  const [tvMode, setTvMode] = useState(televisionMode);
  const effectiveTvMode = televisionMode || tvMode;
  const [nativeTouchLayout, setNativeTouchLayout] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const [largeScreenScale, setLargeScreenScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesTab, setRulesTab] = useState<"quick" | "cities" | "accessibility">("quick");
  const [rulesRegion, setRulesRegion] = useState<"all" | "asia" | "oceania" | "africa" | "europe" | "america">("all");
  const [arrivalNotice, setArrivalNotice] = useState("");
  const [landingDecision, setLandingDecision] = useState<LandingDecision | null>(null);
  const [financialAction, setFinancialAction] = useState<FinancialAction | null>(null);
  const [assetManagerOpen, setAssetManagerOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [settlementCelebrationSkipped, setSettlementCelebrationSkipped] = useState(false);
  const [selectedRescuePlanId, setSelectedRescuePlanId] = useState<"least-loss" | "fewest-actions" | "keep-high-rent">("least-loss");
  const [rentFlight, setRentFlight] = useState<RentFlight | null>(null);
  const [propertyCelebration, setPropertyCelebration] = useState<PropertyCelebration | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [activeCard, setActiveCard] = useState<CardResolution | null>(null);
  const [knowledgeCity, setKnowledgeCity] = useState<CityTile | null>(null);
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false);
  const [challengeChoices, setChallengeChoices] = useState<TravelChallenge[]>([]);
  const [activeChallenge, setActiveChallenge] = useState<TravelChallenge | null>(null);
  const [challengeHint, setChallengeHint] = useState(false);
  const [challengeFeedback, setChallengeFeedback] = useState("");
  const [rollInputMode, setRollInputMode] = useState<RollInputMode>("electronic");
  const transitionTimerRef = useRef<number | null>(null);
  const spinTickerRef = useRef<number | null>(null);
  const voiceReminderRef = useRef<number | null>(null);
  const rentFlightTimerRef = useRef<number | null>(null);
  const propertyCelebrationTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const turnPhaseRef = useRef<TurnPhase>("ready");
  const turnOriginRef = useRef<GameSession | null>(null);
  const pendingRollRef = useRef<RouletteResult | null>(null);
  const movedSessionRef = useRef<GameSession | null>(null);
  const handoffSessionRef = useRef<GameSession | null>(null);
  const answerLockedRef = useRef(false);
  const lastEncouragementRef = useRef(-1);
  const submitMathAnswerRef = useRef<(answer: number) => void>(() => undefined);
  const submitManualRollRef = useRef<(steps: number) => void>(() => undefined);
  const rollInputModeRef = useRef<RollInputMode>("electronic");
  const sessionRef = useRef(session);
  const landingDecisionRef = useRef<LandingDecision | null>(null);
  const financialActionRef = useRef<FinancialAction | null>(null);
  const assetManagerOpenRef = useRef(false);
  const transactionGuardRef = useRef(false);
  const settledLandingKeyRef = useRef<string | null>(null);
  const activeCardRef = useRef<CardResolution | null>(null);
  const learningHandoffRef = useRef<GameSession | null>(null);
  const pendingKnowledgeCityRef = useRef<CityTile | null>(null);
  const learningReturnFocusRef = useRef<HTMLElement | null>(null);
  const skipAnimationGuardRef = useRef(false);
  sessionRef.current = session;
  assetManagerOpenRef.current = assetManagerOpen;
  const currentPlayer = session.players[session.currentPlayerIndex];
  const currentColor = PLAYER_COLORS.find((item) => item.id === currentPlayer.color)?.hex ?? "#167f7b";
  const gameLength = GAME_LENGTHS.find((item) => item.id === session.gameLengthId) ?? GAME_LENGTHS[1];
  const economy = ECONOMY_PRESETS.find((item) => item.id === session.economyId) ?? ECONOMY_PRESETS[1];
  const rentDifficulty = RENT_DIFFICULTIES.find((item) => item.id === session.rentDifficultyId) ?? RENT_DIFFICULTIES[1];
  const ranking = useMemo(() => createSettlementRanking(session.players), [session.players]);
  const learningAwards = useMemo(() => createLearningAwards(session), [session]);
  const liveRank = new Map(ranking.map((entry) => [entry.player.id, entry.rank]));
  const currentAssets = calculateAssetBreakdown(currentPlayer);
  const narrationEnabled = session.voiceNarrationEnabled !== false;
  const inspectedPlayer = inspectedPlayerId ? session.players.find((player) => player.id === inspectedPlayerId) ?? null : null;
  const inspectedAssets = inspectedPlayer ? calculateAssetBreakdown(inspectedPlayer) : null;

  useEffect(() => {
    const savedMode = window.localStorage.getItem(ROLL_INPUT_MODE_KEY);
    if (savedMode === "physical" || savedMode === "electronic") {
      rollInputModeRef.current = savedMode;
      setRollInputMode(savedMode);
    }
  }, []);

  const changeRollInputMode = (mode: RollInputMode) => {
    if (turnPhaseRef.current !== "ready") return;
    rollInputModeRef.current = mode;
    setRollInputMode(mode);
    window.localStorage.setItem(ROLL_INPUT_MODE_KEY, mode);
    setRouletteResult(null);
    setVoiceStatus(mode === "physical" ? "请转动实体俄罗斯轮盘，停稳后报出 0 到 24" : "电子双球轮盘已就绪");
    playUiSound("tap");
    if (mode === "physical") {
      speak("已切换实体俄罗斯轮盘。停稳后，请直接说走几步。", () => startVoiceListening("start", sessionRef.current));
    }
  };

  useEffect(() => {
    const updateNativeLayout = () => {
      const useNativeLayout = shouldUseNativeMirrorLayout(window.innerWidth, navigator.maxTouchPoints);
      setNativeTouchLayout(useNativeLayout);
      document.documentElement.classList.toggle("tv-native-mirror", useNativeLayout);
    };
    updateNativeLayout();
    window.addEventListener("resize", updateNativeLayout, { passive: true });
    window.addEventListener("orientationchange", updateNativeLayout, { passive: true });
    return () => {
      window.removeEventListener("resize", updateNativeLayout);
      window.removeEventListener("orientationchange", updateNativeLayout);
      document.documentElement.classList.remove("tv-native-mirror");
    };
  }, []);

  useEffect(() => {
    const updateLargeScreenScale = () => {
      const layoutWidth = Math.max(window.innerWidth, document.documentElement.clientWidth);
      const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
      const emulatedDevice = window.screen.width / layoutWidth >= 3 && window.screen.height / layoutHeight >= 3;
      const width = emulatedDevice ? window.screen.width : layoutWidth;
      const height = emulatedDevice ? window.screen.height : layoutHeight;
      setLargeScreenScale(width >= 1920 && height >= 1080 ? Math.min(width / 1600, height / 900) : 1);
    };
    updateLargeScreenScale();
    window.addEventListener("resize", updateLargeScreenScale, { passive: true });
    window.visualViewport?.addEventListener("resize", updateLargeScreenScale, { passive: true });
    return () => {
      window.removeEventListener("resize", updateLargeScreenScale);
      window.visualViewport?.removeEventListener("resize", updateLargeScreenScale);
    };
  }, []);

  const stopVoiceListening = () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.abort();
    } catch {
      // Some browsers throw when an inactive recognizer is aborted.
    }
  };

  useEffect(() => {
    const releaseVoice = () => {
      stopVoiceListening();
      window.speechSynthesis?.cancel();
      if (voiceReminderRef.current !== null) window.clearTimeout(voiceReminderRef.current);
      voiceReminderRef.current = null;
      setVoiceStatus("页面进入后台，麦克风已关闭");
      setVoiceVisualState(sessionRef.current.voiceEnabled ? "idle" : "off");
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") releaseVoice();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", releaseVoice);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", releaseVoice);
      releaseVoice();
    };
    // Voice resources are intentionally tied to the page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prepareMicrophone = async () => {
    if (remoteControlled) {
      setVoiceStatus("麦克风由已配对的 iPhone 遥控器提供");
      setVoiceVisualState("idle");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceStatus("此浏览器不能申请麦克风，请使用数字按钮");
      setVoiceVisualState("unsupported");
      return false;
    }
    try {
      setVoiceStatus("正在申请麦克风权限…");
      setVoiceVisualState("requesting");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.getTracks().forEach((track) => track.stop());
      setVoiceStatus("麦克风已开启");
      setVoiceVisualState("idle");
      return true;
    } catch {
      setVoiceStatus("麦克风权限未开启，请在浏览器设置中允许");
      setVoiceVisualState("error");
      return false;
    }
  };

  const speak = (text: string, onEnd?: () => void) => {
    stopVoiceListening();
    if (sessionRef.current.voiceNarrationEnabled === false) {
      setVoiceVisualState(sessionRef.current.voiceEnabled ? "idle" : "off");
      onEnd?.();
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setVoiceStatus("此设备不支持语音，可使用按钮");
      setVoiceVisualState("unsupported");
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const rawSegments = text.split(/\[\[en:(.*?)\]\]/g);
    const segments = rawSegments.map((copy, index) => ({ copy: copy.trim(), lang: index % 2 === 1 ? "en-US" : "zh-CN" })).filter((segment) => segment.copy);
    let segmentIndex = 0;
    let finished = false;
    const finishSpeaking = (failed = false) => {
      if (finished) return;
      finished = true;
      setVoiceVisualState(failed ? "error" : "idle");
      if (failed) setVoiceStatus("语音播报失败，可使用按钮");
      onEnd?.();
    };
    const speakNextSegment = () => {
      const segment = segments[segmentIndex++];
      if (!segment) {
        finishSpeaking();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(segment.copy);
      utterance.lang = segment.lang;
      utterance.rate = segment.lang === "en-US" ? 0.82 : 0.92;
      utterance.pitch = segment.lang === "en-US" ? 1 : 1.08;
      utterance.volume = 1;
      utterance.onstart = () => {
        setVoiceStatus(segment.lang === "en-US" ? "正在练习城市英文名" : "主持人正在说话");
        setVoiceVisualState("speaking");
      };
      utterance.onend = speakNextSegment;
      utterance.onerror = () => finishSpeaking(true);
      window.speechSynthesis.speak(utterance);
    };
    speakNextSegment();
  };

  const spokenCityName = (city: CityTile) => `${city.name}，[[en:${city.englishName}]]`;

  const mathQuestionCopy = (roll: RouletteResult, targetSession: GameSession, lead = "") => targetSession.voiceEnabled
    ? `${lead}${roll.first}加${roll.second}等于多少？请说出答案。没反应时，可以在答案后面说完毕。`
    : `${lead}${roll.first}加${roll.second}等于多少？请选择你计算出的数字。`;

  const startVoiceListening = (mode: "start" | "answer", targetSession: GameSession, withCue = true) => {
    if (document.visibilityState !== "visible") {
      stopVoiceListening();
      setVoiceStatus("页面在后台，麦克风保持关闭");
      setVoiceVisualState("idle");
      return;
    }
    if (!targetSession.voiceEnabled) {
      setVoiceStatus("语音已关闭，可点击按钮");
      setVoiceVisualState("off");
      return;
    }
    if (remoteControlled) {
      setVoiceStatus(mode === "answer" ? "请在 iPhone 遥控器回答" : "等待 iPhone 遥控器操作");
      setVoiceVisualState("idle");
      return;
    }
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus("此浏览器不支持听取，可点击按钮");
      setVoiceVisualState("unsupported");
      return;
    }
    stopVoiceListening();
    const recognition = new Recognition();
    let handled = false;
    let retryScheduled = false;
    const scheduleVoiceRetry = (delay = 450) => {
      if (retryScheduled) return;
      retryScheduled = true;
      window.setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        if (mode === "answer" && turnPhaseRef.current === "answering" && !answerLockedRef.current && pendingRollRef.current) {
          startVoiceListening("answer", targetSession, false);
        } else if (mode === "start" && turnPhaseRef.current === "ready" && dialog === null) {
          startVoiceListening("start", targetSession, false);
        }
      }, delay);
    };
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = mode === "answer";
    recognition.maxAlternatives = 5;
    let listeningWatchdog: number | null = null;
    const clearListeningWatchdog = () => {
      if (listeningWatchdog !== null) window.clearTimeout(listeningWatchdog);
      listeningWatchdog = null;
    };
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const latestAlternatives = Array.from(result ?? []).map((item) => item.transcript?.trim() ?? "").filter(Boolean);
      const combinedTranscript = Array.from(event.results ?? [])
        .map((speechResult) => speechResult[0]?.transcript?.trim() ?? "")
        .filter(Boolean)
        .join("，");
      const alternatives = Array.from(new Set([combinedTranscript, ...latestAlternatives].filter(Boolean)));
      const transcript = combinedTranscript || latestAlternatives[0] || "";
      if (mode === "start") {
        handled = true;
        setVoiceStatus(`听到：“${transcript}”`);
        setRecognizedTranscript(transcript);
        setVoiceVisualState("heard");
        if (rollInputModeRef.current === "physical") {
          const reportedSteps = alternatives.map(parseSpokenNumber).find((value): value is number => value !== null && value >= 0 && value <= 24);
          if (reportedSteps !== undefined) {
            stopVoiceListening();
            submitManualRollRef.current(reportedSteps);
            return;
          }
          if (alternatives.some((item) => /等|等等|等一下|稍等|等会/.test(item))) {
            stopVoiceListening();
            speak("好的，慢慢转，停稳后告诉我点数。", () => startVoiceListening("start", targetSession));
            return;
          }
          speak("请告诉我轮盘最终点数，例如说，走八步。", () => startVoiceListening("start", targetSession));
          return;
        }
        if (alternatives.some((item) => /继续|前进|开始|走吧|出发|可以|好/.test(item))) {
          stopVoiceListening();
          beginTurn(targetSession);
          return;
        }
        if (alternatives.some((item) => /等|等等|等一下|稍等|等会/.test(item))) {
          stopVoiceListening();
          speak("好的，慢慢来，我等你。", () => {
            setVoiceStatus("正在等待，十五秒后再提醒");
            voiceReminderRef.current = window.setTimeout(() => announceTurn(targetSession), VOICE_WAIT_REMINDER_MS);
          });
          return;
        }
        speak("我没有听清，我会继续等你。请说继续，或者等一下。", () => startVoiceListening("start", targetSession));
        return;
      }
      const completionRequested = alternatives.some((item) => /完毕|回答完毕/.test(item));
      const isFinal = completionRequested || result?.isFinal !== false;
      const answers = alternatives.map(parseSpokenNumber).filter((value): value is number => value !== null);
      const expectedAnswer = pendingRollRef.current?.total;
      const correctAnswer = expectedAnswer === undefined ? undefined : answers.find((answer) => answer === expectedAnswer);
      if (correctAnswer !== undefined) {
        handled = true;
        setVoiceStatus(`听到：“${transcript}” · 回答正确`);
        setRecognizedTranscript(transcript);
        setVoiceVisualState("heard");
        submitMathAnswer(correctAnswer);
        return;
      }
      if (!isFinal) {
        setVoiceStatus(transcript ? `正在听：“${transcript}…”` : "正在认真听答案…");
        if (transcript) setRecognizedTranscript(transcript);
        setVoiceVisualState("listening");
        return;
      }
      handled = true;
      setVoiceStatus(`听到：“${transcript}”`);
      setRecognizedTranscript(transcript);
      setVoiceVisualState("heard");
      const answer = answers[0] ?? null;
      if (answer === null) {
        speak(completionRequested ? "我听到完毕了，但是没有听到数字。请先说答案，再说完毕。" : "我没有听清数字，请再说一次。", () => startVoiceListening("answer", targetSession));
      } else {
        submitMathAnswer(answer);
      }
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      clearListeningWatchdog();
      const permissionDenied = event.error === "not-allowed" || event.error === "service-not-allowed";
      handled = permissionDenied;
      setVoiceStatus(permissionDenied
        ? "麦克风权限未开启，请在浏览器中允许麦克风"
        : event.error === "no-speech"
          ? "我还在听，请慢慢说出答案"
          : event.error === "network"
            ? "识别短暂中断，正在重新听"
            : "没有听清，正在继续听");
      setVoiceVisualState(permissionDenied ? "error" : "listening");
      if (!permissionDenied) scheduleVoiceRetry(event.error === "network" ? 1200 : 550);
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      clearListeningWatchdog();
      if (!handled) {
        setVoiceStatus(mode === "answer" ? "我还在听，请说出答案" : "没有听清，可点击屏幕按钮");
        setVoiceVisualState(mode === "answer" ? "listening" : "idle");
      }
      recognitionRef.current = null;
      if (!handled) scheduleVoiceRetry();
    };
    recognitionRef.current = recognition;
    const activateRecognition = () => {
      if (recognitionRef.current !== recognition) return;
      try {
        recognition.start();
        setVoiceStatus(mode === "start" ? "正在听：继续 / 等一下" : "麦克风已开启；没反应可说“答案，完毕”");
        setVoiceVisualState("listening");
        if (mode === "answer") {
          listeningWatchdog = window.setTimeout(() => {
            if (recognitionRef.current !== recognition || turnPhaseRef.current !== "answering" || answerLockedRef.current) return;
            recognitionRef.current = null;
            try {
              recognition.abort();
            } catch {
              // The recognizer may already have ended between the check and abort.
            }
            setVoiceStatus("没有收到答案，正在重新开启麦克风");
            setVoiceVisualState("listening");
            window.setTimeout(() => startVoiceListening("answer", targetSession, false), 180);
          }, 6500);
        }
      } catch {
        recognitionRef.current = null;
        setVoiceStatus(mode === "answer" ? "麦克风暂时忙碌，正在重新听" : "麦克风暂不可用，可点击按钮");
        setVoiceVisualState("error");
        scheduleVoiceRetry(900);
      }
    };
    if (mode === "answer" && withCue) {
      playUiSound("add");
      setVoiceStatus("提示音后开始回答…");
      setRecognizedTranscript("");
      setVoiceVisualState("requesting");
      window.setTimeout(activateRecognition, effectiveTvMode ? 900 : 360);
    } else activateRecognition();
  };

  const announceTurn = (targetSession: GameSession) => {
    if (turnPhaseRef.current !== "ready") {
      setVoiceStatus("准备就绪");
      setVoiceVisualState(targetSession.voiceEnabled ? "idle" : "off");
      return;
    }
    if (voiceReminderRef.current !== null) window.clearTimeout(voiceReminderRef.current);
    const player = targetSession.players[targetSession.currentPlayerIndex];
    setRecognizedTranscript("");
    playUiSound("turn");
    const announcement = rollInputMode === "physical"
      ? targetSession.voiceEnabled
        ? `已经轮到${player.name}啦。请转动实体俄罗斯轮盘，停稳后告诉我零到二十四的最终点数。`
        : `已经轮到${player.name}啦。请转动实体俄罗斯轮盘，再点击最终点数。`
      : targetSession.voiceEnabled
        ? `已经轮到${player.name}啦，是否继续？`
        : `已经轮到${player.name}啦，请点击开始前进。`;
    speak(announcement, () => startVoiceListening("start", targetSession));
  };

  const startFinancialListening = (mode: "landing" | "confirm" | "assets", targetSession: GameSession, withCue = true) => {
    if (document.visibilityState !== "visible") {
      stopVoiceListening();
      setVoiceStatus("页面在后台，麦克风保持关闭");
      setVoiceVisualState("idle");
      return;
    }
    if (!targetSession.voiceEnabled) return;
    if (remoteControlled) {
      setVoiceStatus("请在 iPhone 遥控器选择或说出操作");
      setVoiceVisualState("idle");
      return;
    }
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus("语音识别不可用，请点击选择");
      setVoiceVisualState("unsupported");
      return;
    }
    stopVoiceListening();
    const recognition = new Recognition();
    let retryScheduled = false;
    const scheduleFinancialRetry = (delay = 500) => {
      if (retryScheduled) return;
      retryScheduled = true;
      window.setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        const canContinue = mode === "confirm"
          ? financialActionRef.current !== null
          : mode === "landing"
            ? landingDecisionRef.current !== null
            : assetManagerOpenRef.current;
        if (canContinue) startFinancialListening(mode, sessionRef.current, false);
      }, delay);
    };
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const alternatives = Array.from(result ?? []).map((item) => item.transcript?.trim() ?? "").filter(Boolean);
      const transcript = alternatives[0] ?? "";
      const heard = (pattern: RegExp) => alternatives.some((item) => pattern.test(item));
      const isFinal = result?.isFinal !== false;
      const acceptCommand = (action: () => void) => {
        stopVoiceListening();
        setVoiceStatus(`听到：“${transcript}”`);
        setRecognizedTranscript(transcript);
        setVoiceVisualState("heard");
        action();
      };
      const retryAfterUnclear = (copy: string, retryMode: "landing" | "confirm" | "assets") => {
        if (!isFinal) {
          setVoiceStatus(`正在听：“${transcript}…”`);
          setRecognizedTranscript(transcript);
          setVoiceVisualState("listening");
          return;
        }
        stopVoiceListening();
        setVoiceStatus(`听到：“${transcript}”`);
        setRecognizedTranscript(transcript);
        setVoiceVisualState("heard");
        speak(copy, () => startFinancialListening(retryMode, sessionRef.current));
      };
      if (mode === "confirm") {
        if (heard(/取消|不要|返回|算了|不确认/)) acceptCommand(cancelFinancialAction);
        else if (heard(/确认|确定|好的|可以|执行|没问题|对/)) acceptCommand(executeFinancialAction);
        else retryAfterUnclear("请明确说确认，或者取消。", "confirm");
        return;
      }
      if (mode === "landing") {
        const decision = landingDecisionRef.current;
        if (!decision) return;
        if (decision.kind === "purchase") {
          const heardBuy = alternatives.some((item) => /购买|买下|买吧|要买|我要|要这个|拿下|买一个|买了|^[买卖麦迈白百摆唛]$/.test(item.replace(/[，。！？!\s]/g, "")));
          if (heard(/放弃|不要|跳过|不买|算了/)) acceptCommand(() => finishCityDecision());
          else if (heardBuy) acceptCommand(() => requestPurchase(decision.cityId));
          else retryAfterUnclear("请说购买，或者放弃。", "landing");
        } else if (decision.kind === "upgrade") {
          if (heard(/放弃|不要|结束|跳过|不升级|算了/)) acceptCommand(() => finishCityDecision());
          else if (heard(/升级|建房|盖房|旅馆|升吧|生机|升级吧/)) acceptCommand(() => requestUpgrade(decision.cityId));
          else retryAfterUnclear("请说升级，或者结束。", "landing");
        } else if (decision.kind === "rent-paid") {
          if (heard(/继续|结束|好的|下一位|可以/)) acceptCommand(() => finishCityDecision());
          else retryAfterUnclear("请说继续。", "landing");
        } else if (decision.kind === "rent-due") {
          if (heard(/资产|筹钱|卖|抵押|打开/)) acceptCommand(openAssetManager);
          else retryAfterUnclear("请说打开资产。", "landing");
        }
        return;
      }
      if (heard(/家庭援助|申请援助|援助金|救济/)) {
        acceptCommand(requestFamilyRelief);
        return;
      }
      if (heard(/支付租金|交租|付租/) && landingDecisionRef.current?.kind === "rent-due") {
        acceptCommand(payPendingRent);
        return;
      }
      const activePlayer = sessionRef.current.players[sessionRef.current.currentPlayerIndex];
      const propertyMatch = activePlayer.properties
        .map((property) => ({ property, city: getCity(property.tileId) }))
        .find(({ city }) => city && alternatives.some((item) => item.includes(city.name)));
      if (!propertyMatch?.city) {
        retryAfterUnclear("我没有听清城市名称，我会继续听。请说例如抵押巴黎。", "assets");
        return;
      }
      const joinedAlternatives = alternatives.join("，");
      const action: AssetAction | null = /卖房|卖旅馆|卖建筑/.test(joinedAlternatives) ? "sell-building"
        : /卖地|卖城市|卖掉/.test(joinedAlternatives) ? "sell-city"
          : /赎回/.test(joinedAlternatives) ? "redeem"
            : /抵押/.test(joinedAlternatives) ? "mortgage" : null;
      if (action) acceptCommand(() => requestAssetAction(propertyMatch.city!.id, action));
      else retryAfterUnclear("我没有听清要做什么，我会继续听。请说卖房、卖地、抵押或赎回。", "assets");
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      const permissionDenied = event.error === "not-allowed" || event.error === "service-not-allowed";
      setVoiceStatus(permissionDenied ? "麦克风权限未开启，请在浏览器中允许" : "没有听清，正在继续听");
      setVoiceVisualState(permissionDenied ? "error" : "listening");
      if (!permissionDenied) scheduleFinancialRetry(event.error === "network" ? 1200 : 550);
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setVoiceStatus("我还在听，请说出选择");
      setVoiceVisualState("listening");
      scheduleFinancialRetry();
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      if (withCue) playUiSound("add");
      setVoiceStatus(mode === "confirm" ? "麦克风已开启：请说确认或取消" : mode === "assets" ? "麦克风已开启：请说资产操作" : "麦克风已开启：请现在说买或放弃");
      if (withCue) setRecognizedTranscript("");
      setVoiceVisualState("listening");
    } catch {
      recognitionRef.current = null;
      setVoiceStatus("麦克风暂时忙碌，正在重新听");
      setVoiceVisualState("error");
      scheduleFinancialRetry(900);
    }
  };

  useEffect(() => {
    if (!showFirstPlayer) return;
    const timer = window.setTimeout(() => setShowFirstPlayer(false), 2400);
    return () => window.clearTimeout(timer);
  }, [showFirstPlayer]);

  useEffect(() => {
    const needsOnboarding = window.localStorage.getItem(ONBOARDING_KEY) !== "done";
    if (needsOnboarding) {
      setOnboardingOpen(true);
      setVoiceStatus("先看完四步家庭玩法引导");
      setVoiceVisualState("idle");
      return;
    }
    const needsVoiceGuide = !remoteControlled && session.voiceEnabled && window.localStorage.getItem(VOICE_GUIDE_KEY) !== "done";
    if (needsVoiceGuide) {
      setVoiceGuideOpen(true);
      setVoiceStatus("首次使用，请先开启麦克风");
      setVoiceVisualState("requesting");
      return;
    }
    const timer = window.setTimeout(() => announceTurn(session), isFresh ? 2500 : 350);
    return () => window.clearTimeout(timer);
    // The next turns are announced from the handoff completion to avoid duplicate prompts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enableMicrophoneFromGuide = async () => {
    const ready = await prepareMicrophone();
    if (!ready) return;
    window.localStorage.setItem(VOICE_GUIDE_KEY, "done");
    const voiceSession = sessionRef.current.voiceEnabled ? sessionRef.current : { ...sessionRef.current, voiceEnabled: true, updatedAt: Date.now() };
    sessionRef.current = voiceSession;
    if (voiceSession !== session) onSessionChange(voiceSession);
    setVoiceGuideOpen(false);
    setRecognizedTranscript("");
    window.setTimeout(() => announceTurn(voiceSession), 220);
  };

  const closeVoiceGuide = () => {
    window.localStorage.setItem(VOICE_GUIDE_KEY, "done");
    const silentSession = { ...sessionRef.current, voiceEnabled: false, updatedAt: Date.now() };
    sessionRef.current = silentSession;
    onSessionChange(silentSession);
    setVoiceGuideOpen(false);
    setVoiceStatus("语音回复已关闭，可随时从功能区重新开启");
    setVoiceVisualState("off");
  };

  useEffect(() => {
    const storedPreference = window.localStorage.getItem(REDUCED_MOTION_KEY);
    const systemPrefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(storedPreference === null ? systemPrefersReducedMotion : storedPreference === "on");
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    if (spinTickerRef.current !== null) window.clearInterval(spinTickerRef.current);
    if (voiceReminderRef.current !== null) window.clearTimeout(voiceReminderRef.current);
    if (rentFlightTimerRef.current !== null) window.clearTimeout(rentFlightTimerRef.current);
    if (propertyCelebrationTimerRef.current !== null) window.clearTimeout(propertyCelebrationTimerRef.current);
    stopVoiceListening();
    window.speechSynthesis?.cancel();
  }, []);

  const changeTurnPhase = (phase: TurnPhase) => {
    turnPhaseRef.current = phase;
    setTurnPhase(phase);
  };

  const clearTurnTimers = () => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (spinTickerRef.current !== null) {
      window.clearInterval(spinTickerRef.current);
      spinTickerRef.current = null;
    }
  };

  const commitTransaction = (before: GameSession, next: GameSession, label: string) => {
    const beforeEventIds = new Set(before.events.map((event) => event.id));
    setUndoSnapshot({
      label,
      players: before.players.map((player) => ({ ...player, properties: player.properties.map((property) => ({ ...property })) })),
      transactionEventIds: next.events.filter((event) => !beforeEventIds.has(event.id)).map((event) => event.id),
    });
    sessionRef.current = next;
    onSessionChange(next);
  };

  const showRentFlight = (before: GameSession, ownerIndex: number, amount: number) => {
    if (rentFlightTimerRef.current !== null) window.clearTimeout(rentFlightTimerRef.current);
    const payer = before.players[before.currentPlayerIndex];
    const owner = before.players[ownerIndex];
    setRentFlight({ id: Date.now(), payerName: payer.name, payerAvatar: payer.avatar, ownerName: owner.name, ownerAvatar: owner.avatar, amount });
    rentFlightTimerRef.current = window.setTimeout(() => setRentFlight(null), reducedMotion ? 700 : 2100);
  };

  const finishHandoff = (nextSession: GameSession) => {
    clearTurnTimers();
    setMovementPosition(null);
    setMovementProgress(null);
    turnOriginRef.current = null;
    pendingRollRef.current = null;
    movedSessionRef.current = null;
    handoffSessionRef.current = null;
    answerLockedRef.current = false;
    setMathFeedback("");
    setArrivalNotice("");
    setRouletteResult(null);
    landingDecisionRef.current = null;
    financialActionRef.current = null;
    setLandingDecision(null);
    setFinancialAction(null);
    setAssetManagerOpen(false);
    activeCardRef.current = null;
    setActiveCard(null);
    changeTurnPhase("ready");
    if (gameLength.rounds && nextSession.round > gameLength.rounds) {
      setSettlementIsFinal(true);
      setDialog("settlement");
    } else {
      transitionTimerRef.current = window.setTimeout(() => announceTurn(nextSession), 220);
    }
  };

  const beginHandoff = (movedSession: GameSession, immediately = false) => {
    clearTurnTimers();
    changeTurnPhase("handoff");
    const nextSession = advanceGameTurn(movedSession);
    handoffSessionRef.current = nextSession;
    onSessionChange(nextSession);
    playUiSound("tap");
    transitionTimerRef.current = window.setTimeout(
      () => finishHandoff(nextSession),
      immediately || reducedMotion ? 120 : 650,
    );
  };

  const finishCardResult = (resolution: CardResolution | null = activeCardRef.current, immediately = false) => {
    if (!resolution || turnPhaseRef.current !== "card") return;
    stopVoiceListening();
    window.speechSynthesis?.cancel();
    activeCardRef.current = null;
    setActiveCard(null);
    movedSessionRef.current = resolution.session;
    beginHandoff(resolution.session, immediately);
  };

  const revealCard = (sourceSession: GameSession, deck: "chance" | "destiny", arrivalSentence: string, quickly: boolean) => {
    const resolution = drawAndResolveCard(sourceSession, deck);
    activeCardRef.current = resolution;
    setActiveCard(resolution);
    movedSessionRef.current = resolution.session;
    sessionRef.current = resolution.session;
    onSessionChange(resolution.session);
    changeTurnPhase("card");
    playUiSound("card");
    const resultCopy = resolution.lines.join("，");
    const spoken = `${arrivalSentence}。抽到了${deck === "chance" ? "机会" : "命运"}牌，${resolution.card.title}。${resolution.card.text}。结算结果：${resultCopy}。`;
    const scheduleClose = () => {
      transitionTimerRef.current = window.setTimeout(() => finishCardResult(resolution), quickly || reducedMotion ? 1800 : 6500);
    };
    speak(spoken, scheduleClose);
  };

  const resolveLanding = (originSession: GameSession, roll: number, quickly = false) => {
    clearTurnTimers();
    let movedSession = movedSessionRef.current ?? moveActivePlayer(originSession, roll);
    if (!movedSessionRef.current) {
      movedSessionRef.current = movedSession;
      onSessionChange(movedSession);
    }
    setMovementPosition(null);
    setMovementProgress({ current: roll, total: roll });
    changeTurnPhase("resolving");
    playUiSound("arrival");
    transitionTimerRef.current = window.setTimeout(() => {
      const activePlayer = movedSession.players[movedSession.currentPlayerIndex];
      const landingTile = BOARD_TILES[activePlayer.position];
      const settlementKey = `${movedSession.id}:${movedSession.round}:${activePlayer.id}:${activePlayer.position}:${roll}`;
      if (settledLandingKeyRef.current === settlementKey) return;
      settledLandingKeyRef.current = settlementKey;
      const arrivalSentence = roll === 0
        ? `${activePlayer.name}走了0步，仍然停留在${landingTile.name}`
        : `${activePlayer.name}走了${roll}步，来到了${landingTile.name}`;
      const spokenArrivalSentence = landingTile.type === "city"
        ? roll === 0
          ? `${activePlayer.name}走了0步，仍然停留在${spokenCityName(landingTile)}`
          : `${activePlayer.name}走了${roll}步，来到了${spokenCityName(landingTile)}`
        : arrivalSentence;
      setArrivalNotice(arrivalSentence);
      setVoiceStatus(arrivalSentence);
      if (landingTile.type === "chance" || landingTile.type === "destiny") {
        revealCard(movedSession, landingTile.type, arrivalSentence, quickly);
        return;
      }
      if (landingTile.type !== "city") {
        const bankResult = settleBankTile(movedSession, landingTile);
        const settledSession = bankResult.session;
        if (settledSession !== movedSession) {
          movedSessionRef.current = settledSession;
          commitTransaction(movedSession, settledSession, `${landingTile.name}银行收支`);
          playUiSound(bankResult.kind === "fee" ? "remove" : "reward");
        }
        const settlementCopy = bankResult.kind === "none" ? "" : `。${bankResult.message}`;
        speak(`${spokenArrivalSentence}${settlementCopy}。`, () => beginHandoff(settledSession, quickly));
        return;
      }
      movedSession = recordCityVisit(movedSession, landingTile.id);
      movedSessionRef.current = movedSession;
      sessionRef.current = movedSession;
      onSessionChange(movedSession);
      const learning = migrateLearningState(movedSession);
      const learnerStats = learning.players[activePlayer.id];
      pendingKnowledgeCityRef.current = learning.knowledgeHintsEnabled && !learnerStats.viewedKnowledgeCityIds.includes(landingTile.id) ? landingTile : null;
      const ownership = getPropertyOwner(movedSession, landingTile.id);
      let decision: LandingDecision;
      if (!ownership) {
        decision = { kind: "purchase", cityId: landingTile.id };
        landingDecisionRef.current = decision;
        setLandingDecision(decision);
        changeTurnPhase("deciding");
        speak(movedSession.voiceEnabled ? `${spokenCityName(landingTile)}，售价${landingTile.price}。购买还是放弃？` : `${spokenCityName(landingTile)}，售价${landingTile.price}。请在屏幕选择购买或放弃。`, () => startFinancialListening("landing", movedSession));
      } else if (ownership.playerIndex === movedSession.currentPlayerIndex) {
        decision = { kind: "upgrade", cityId: landingTile.id };
        landingDecisionRef.current = decision;
        setLandingDecision(decision);
        changeTurnPhase("deciding");
        speak(movedSession.voiceEnabled ? `${spokenCityName(landingTile)}，升级${landingTile.buildCost}。升级还是结束？` : `${spokenCityName(landingTile)}，升级需要${landingTile.buildCost}。请在屏幕选择升级或结束。`, () => startFinancialListening("landing", movedSession));
      } else {
        const rent = calculateRent(movedSession, landingTile, ownership.property);
        if (rent === 0) {
          decision = { kind: "rent-paid", cityId: landingTile.id, rent: 0, ownerName: ownership.player.name };
          landingDecisionRef.current = decision;
          setLandingDecision(decision);
          changeTurnPhase("deciding");
          speak(movedSession.voiceEnabled ? `${spokenCityName(landingTile)}已抵押，本次免租。说继续。` : `${spokenCityName(landingTile)}已抵押，本次免租。请点击继续。`, () => startFinancialListening("landing", movedSession));
        } else if (activePlayer.cash >= rent) {
          const transfer = transferRent(movedSession, landingTile);
          const paidSession = transfer?.session ?? movedSession;
          movedSessionRef.current = paidSession;
          if (transfer) {
            commitTransaction(movedSession, paidSession, `向${ownership.player.name}支付${landingTile.name}租金`);
            showRentFlight(movedSession, ownership.playerIndex, rent);
            playUiSound("rent");
          }
          decision = { kind: "rent-paid", cityId: landingTile.id, rent, ownerName: ownership.player.name };
          landingDecisionRef.current = decision;
          setLandingDecision(decision);
          changeTurnPhase("deciding");
          speak(paidSession.voiceEnabled ? `${spokenCityName(landingTile)}，已向${ownership.player.name}缴纳${rent}租金。说继续。` : `${spokenCityName(landingTile)}，已向${ownership.player.name}缴纳${rent}租金。请点击继续。`, () => startFinancialListening("landing", paidSession));
        } else {
          decision = { kind: "rent-due", cityId: landingTile.id, rent, ownerName: ownership.player.name, shortage: rent - activePlayer.cash };
          landingDecisionRef.current = decision;
          setLandingDecision(decision);
          changeTurnPhase("rescue");
          setAssetManagerOpen(true);
          speak(`${spokenCityName(landingTile)}需要向${ownership.player.name}缴纳${rent}租金，目前还差${rent - activePlayer.cash}。请处理资产。`, () => startFinancialListening("assets", movedSession));
        }
      }
    }, quickly || reducedMotion ? 260 : 850);
  };

  const beginMovement = (originSession: GameSession, roll: number) => {
    clearTurnTimers();
    stopVoiceListening();
    changeTurnPhase("moving");
    setMovementProgress({ current: 0, total: roll });

    if (roll === 0) {
      setMovementPosition(originSession.players[originSession.currentPlayerIndex].position);
      transitionTimerRef.current = window.setTimeout(() => resolveLanding(originSession, 0, reducedMotion), reducedMotion ? 100 : 420);
      return;
    }

    if (reducedMotion) {
      const startingPosition = originSession.players[originSession.currentPlayerIndex].position;
      const landingPosition = (originSession.players[originSession.currentPlayerIndex].position + roll) % BOARD_TILES.length;
      setMovementPosition(landingPosition);
      setMovementProgress({ current: roll, total: roll });
      if (startingPosition + roll >= BOARD_TILES.length) playUiSound("reward");
      transitionTimerRef.current = window.setTimeout(() => resolveLanding(originSession, roll, true), 150);
      return;
    }

    let completedSteps = 0;
    let animatedPosition = originSession.players[originSession.currentPlayerIndex].position;
    const advanceOneTile = () => {
      if (turnPhaseRef.current !== "moving") return;
      completedSteps += 1;
      animatedPosition = (animatedPosition + 1) % BOARD_TILES.length;
      setMovementPosition(animatedPosition);
      setMovementProgress({ current: completedSteps, total: roll });
      playUiSound(animatedPosition === 0 ? "reward" : "step");

      if (completedSteps < roll) {
        transitionTimerRef.current = window.setTimeout(advanceOneTile, 270);
      } else {
        transitionTimerRef.current = window.setTimeout(() => resolveLanding(originSession, roll), 220);
      }
    };
    transitionTimerRef.current = window.setTimeout(advanceOneTile, 180);
  };

  const submitManualRoll = (steps: number) => {
    if (rollInputMode !== "physical" || turnPhaseRef.current !== "ready" || dialog !== null) return;
    if (!Number.isInteger(steps) || steps < 0 || steps > 24) {
      setVoiceStatus("请输入实体轮盘停下后的 0 到 24");
      playUiSound("remove");
      return;
    }
    const originSession = sessionRef.current;
    clearTurnTimers();
    stopVoiceListening();
    window.speechSynthesis?.cancel();
    turnOriginRef.current = originSession;
    pendingRollRef.current = { first: steps, second: 0, total: steps };
    movedSessionRef.current = null;
    settledLandingKeyRef.current = null;
    answerLockedRef.current = true;
    setMathFeedback("");
    setArrivalNotice("");
    setRouletteResult({ first: steps, second: 0, total: steps });
    setMovementPosition(null);
    setMovementProgress(null);
    setVoiceStatus(`实体俄罗斯轮盘结果：${steps}，开始前进`);
    setRecognizedTranscript(String(steps));
    playUiSound("success");
    beginMovement(originSession, steps);
  };
  submitManualRollRef.current = submitManualRoll;

  const submitMathAnswer = (answer: number) => {
    const roll = pendingRollRef.current;
    const originSession = turnOriginRef.current;
    if (turnPhaseRef.current !== "answering" || !roll || !originSession || answerLockedRef.current) return;
    stopVoiceListening();
    if (answer !== roll.total) {
      let encouragementIndex = Math.floor(Math.random() * MATH_ENCOURAGEMENTS.length);
      if (encouragementIndex === lastEncouragementRef.current) encouragementIndex = (encouragementIndex + 1) % MATH_ENCOURAGEMENTS.length;
      lastEncouragementRef.current = encouragementIndex;
      const encouragement = MATH_ENCOURAGEMENTS[encouragementIndex];
      setMathFeedback(`${answer} 还不对。${encouragement}`);
      setVoiceStatus(`回答 ${answer}，${encouragement}`);
      playUiSound("remove");
      speak(mathQuestionCopy(roll, originSession, encouragement), () => startVoiceListening("answer", originSession));
      return;
    }
    answerLockedRef.current = true;
    setMathFeedback(`答对啦！${roll.first} + ${roll.second} = ${roll.total}`);
    setVoiceStatus("回答正确，准备前进");
    playUiSound("success");
    speak(`答对啦！${roll.first}加${roll.second}等于${roll.total}，出发！`, () => beginMovement(originSession, roll.total));
  };
  submitMathAnswerRef.current = submitMathAnswer;

  useEffect(() => {
    if (!remoteControlled) return;
    const receiveRemoteAnswer = (event: Event) => {
      const answer = (event as CustomEvent<unknown>).detail;
      if (typeof answer === "number" && Number.isInteger(answer) && answer >= 0 && answer <= 24) {
        if (rollInputMode === "physical" && turnPhaseRef.current === "ready") submitManualRollRef.current(answer);
        else submitMathAnswerRef.current(answer);
      }
    };
    window.addEventListener(REMOTE_ANSWER_EVENT, receiveRemoteAnswer);
    return () => window.removeEventListener(REMOTE_ANSWER_EVENT, receiveRemoteAnswer);
  }, [remoteControlled, rollInputMode]);

  const retryMathListening = async () => {
    const roll = pendingRollRef.current;
    const originSession = turnOriginRef.current;
    if (!roll || !originSession || turnPhaseRef.current !== "answering") return;
    stopVoiceListening();
    window.speechSynthesis?.cancel();
    const microphoneReady = await prepareMicrophone();
    if (!microphoneReady) return;
    speak(mathQuestionCopy(roll, originSession), () => startVoiceListening("answer", originSession));
  };

  const completeRouletteSpin = (requestedSession: GameSession | null, roll: RouletteResult) => {
    if (spinTickerRef.current !== null) window.clearInterval(spinTickerRef.current);
    spinTickerRef.current = null;
    setRouletteFace([roll.first, roll.second]);
    setRouletteResult(roll);
    const originSession = requestedSession && Array.isArray(requestedSession.players)
      ? requestedSession
      : sessionRef.current;
    const rollingPlayer = originSession.players[originSession.currentPlayerIndex];
    if (!rollingPlayer) {
      turnOriginRef.current = null;
      pendingRollRef.current = null;
      setVoiceStatus("回合数据已恢复，请重新开始前进");
      changeTurnPhase("ready");
      return;
    }
    if (rollingPlayer.isChild) {
      changeTurnPhase("answering");
      setMathFeedback(`请让 ${rollingPlayer.name} 算一算`);
      speak(mathQuestionCopy(roll, originSession), () => startVoiceListening("answer", originSession));
      return;
    }
    beginMovement(originSession, roll.total);
  };

  const beginTurn = (requestedSession?: GameSession) => {
    if (turnPhaseRef.current !== "ready" || dialog !== null) return;
    const originSession = requestedSession && Array.isArray(requestedSession.players)
      ? requestedSession
      : sessionRef.current;
    clearTurnTimers();
    stopVoiceListening();
    window.speechSynthesis?.cancel();
    if (voiceReminderRef.current !== null) {
      window.clearTimeout(voiceReminderRef.current);
      voiceReminderRef.current = null;
    }
    const roll = rollRoulette();
    const firstTarget = (360 - roll.first * (360 / 13)) % 360;
    const secondTarget = (180 + 360 - roll.second * (360 / 13)) % 360;
    const firstTurns = Math.ceil(rouletteRotations[0] / 360) * 360 + 5 * 360;
    const secondTurns = Math.ceil(rouletteRotations[1] / 360) * 360 + 6 * 360;
    turnOriginRef.current = originSession;
    pendingRollRef.current = roll;
    movedSessionRef.current = null;
    settledLandingKeyRef.current = null;
    answerLockedRef.current = false;
    setMathFeedback("");
    setArrivalNotice("");
    setRouletteResult(null);
    setRouletteRotations([firstTurns + firstTarget, secondTurns + secondTarget]);
    setMovementPosition(null);
    setMovementProgress(null);
    changeTurnPhase("spinning");
    playUiSound("spin");

    if (!reducedMotion) {
      spinTickerRef.current = window.setInterval(() => {
        setRouletteFace([Math.floor(Math.random() * 13), Math.floor(Math.random() * 13)]);
      }, 95);
    }
    transitionTimerRef.current = window.setTimeout(() => {
      completeRouletteSpin(originSession, roll);
    }, reducedMotion ? 220 : 1850);
  };

  const skipTurnAnimation = () => {
    if (skipAnimationGuardRef.current) return;
    const phase = turnPhaseRef.current;
    if (phase === "ready") return;
    skipAnimationGuardRef.current = true;
    window.setTimeout(() => { skipAnimationGuardRef.current = false; }, 260);
    const originSession = turnOriginRef.current;
    const roll = pendingRollRef.current;
    clearTurnTimers();
    if (phase === "answering" || phase === "deciding" || phase === "rescue") return;
    if (phase === "spinning") {
      if (originSession && roll) completeRouletteSpin(originSession, roll);
      return;
    }
    if (phase === "card") {
      finishCardResult(activeCardRef.current, true);
      return;
    }
    if (phase === "handoff") {
      finishHandoff(handoffSessionRef.current ?? session);
      return;
    }
    if (phase === "resolving" && movedSessionRef.current) {
      if (originSession && roll) resolveLanding(originSession, roll.total, true);
      return;
    }
    if (phase === "moving" && originSession && roll) {
      resolveLanding(originSession, roll.total, true);
    }
  };

  const requestFinancialConfirmation = (action: FinancialAction) => {
    financialActionRef.current = action;
    setFinancialAction(action);
    stopVoiceListening();
    speak(sessionRef.current.voiceEnabled ? `${action.label}。确认还是取消？` : `${action.label}。请在屏幕选择确认或取消。`, () => startFinancialListening("confirm", sessionRef.current));
  };

  const requestPurchase = (cityId: string) => {
    const city = getCity(cityId);
    const active = sessionRef.current.players[sessionRef.current.currentPlayerIndex];
    if (!city) return;
    if (active.cash < city.price) {
      changeTurnPhase("rescue");
      setAssetManagerOpen(true);
      speak(`现金还差${city.price - active.cash}金币。你可以先管理资产，或者返回放弃购买。`, () => startFinancialListening("assets", sessionRef.current));
      return;
    }
    requestFinancialConfirmation({ kind: "purchase", cityId, amount: city.price, label: `支付${city.price}金币购买${city.name}` });
  };

  const requestUpgrade = (cityId: string) => {
    const city = getCity(cityId);
    const active = sessionRef.current.players[sessionRef.current.currentPlayerIndex];
    const property = active.properties.find((candidate) => candidate.tileId === cityId);
    if (!city || !property || property.buildingLevel >= 5 || property.mortgaged) return;
    if (active.cash < city.buildCost) {
      changeTurnPhase("rescue");
      setAssetManagerOpen(true);
      speak(`升级还差${city.buildCost - active.cash}金币。你可以先管理资产，或者返回结束回合。`, () => startFinancialListening("assets", sessionRef.current));
      return;
    }
    const nextLabel = property.buildingLevel === 4 ? "旅馆" : `第${property.buildingLevel + 1}座房屋`;
    requestFinancialConfirmation({ kind: "upgrade", cityId, amount: city.buildCost, label: `支付${city.buildCost}金币，为${city.name}升级${nextLabel}` });
  };

  const requestAssetAction = (cityId: string, assetAction: AssetAction) => {
    const player = sessionRef.current.players[sessionRef.current.currentPlayerIndex];
    const property = player.properties.find((candidate) => candidate.tileId === cityId);
    const city = getCity(cityId);
    if (!property || !city) return;
    const quote = quoteAssetAction(property, city, assetAction);
    if (!quote || (assetAction === "redeem" && player.cash < quote.amount)) return;
    const moneyCopy = assetAction === "redeem" ? `需要支付${quote.amount}金币` : `可以获得${quote.amount}金币`;
    requestFinancialConfirmation({ kind: "asset", cityId, assetAction, amount: quote.amount, label: `${quote.label}，${moneyCopy}。${quote.consequence}` });
  };

  const finishCityDecision = (completedSession: GameSession = sessionRef.current) => {
    if (propertyCelebrationTimerRef.current !== null) window.clearTimeout(propertyCelebrationTimerRef.current);
    propertyCelebrationTimerRef.current = null;
    setPropertyCelebration(null);
    stopVoiceListening();
    window.speechSynthesis?.cancel();
    landingDecisionRef.current = null;
    financialActionRef.current = null;
    setLandingDecision(null);
    setFinancialAction(null);
    setAssetManagerOpen(false);
    movedSessionRef.current = completedSession;
    if (pendingKnowledgeCityRef.current) {
      learningHandoffRef.current = completedSession;
      setKnowledgeCity(pendingKnowledgeCityRef.current);
      speak(`${pendingKnowledgeCityRef.current.name}，[[en:${pendingKnowledgeCityRef.current.englishName}]]。${pendingKnowledgeCityRef.current.knowledge}`);
      pendingKnowledgeCityRef.current = null;
      setKnowledgeExpanded(false);
      changeTurnPhase("resolving");
      return;
    }
    beginOptionalChallenge(completedSession);
  };

  const beginOptionalChallenge = (completedSession: GameSession) => {
    const player = completedSession.players[completedSession.currentPlayerIndex];
    const ageBand = ageBandForPlayer(player.isChild, player.ageBand);
    if (!ageBand || !shouldOfferChallenge(completedSession)) {
      learningHandoffRef.current = null;
      beginHandoff(completedSession);
      return;
    }
    const learning = migrateLearningState(completedSession);
    setChallengeChoices(challengesForAge(ageBand, learning.lastChallengeCategory));
    setActiveChallenge(null);
    setChallengeHint(false);
    setChallengeFeedback("");
    setKnowledgeCity(null);
  };

  const closeKnowledgeCard = (disableForGame = false) => {
    const source = learningHandoffRef.current ?? sessionRef.current;
    if (!knowledgeCity) return;
    let nextSession = recordKnowledgeViewed(source, knowledgeCity.id);
    if (disableForGame && nextSession.learning) nextSession = { ...nextSession, learning: { ...nextSession.learning, knowledgeHintsEnabled: false } };
    sessionRef.current = nextSession;
    movedSessionRef.current = nextSession;
    onSessionChange(nextSession);
    window.speechSynthesis?.cancel();
    setKnowledgeCity(null);
    beginOptionalChallenge(nextSession);
  };

  const chooseChallenge = (challenge: TravelChallenge) => {
    setActiveChallenge(challenge);
    setChallengeHint(false);
    setChallengeFeedback("");
    playUiSound("tap");
  };

  const answerChallenge = (answer: string) => {
    if (!activeChallenge || challengeFeedback) return;
    const correct = answer === activeChallenge.answer;
    const source = learningHandoffRef.current ?? sessionRef.current;
    const nextSession = recordChallenge(source, activeChallenge, correct);
    learningHandoffRef.current = nextSession;
    sessionRef.current = nextSession;
    movedSessionRef.current = nextSession;
    onSessionChange(nextSession);
    setChallengeFeedback(correct ? `答对啦！${activeChallenge.explanation}` : `勇敢尝试就很棒！${activeChallenge.explanation}`);
    playUiSound(correct ? "success" : "tap");
  };

  const revealChallengeAnswer = () => {
    if (!activeChallenge || challengeFeedback) return;
    const source = learningHandoffRef.current ?? sessionRef.current;
    const nextSession = recordChallenge(source, activeChallenge, false);
    learningHandoffRef.current = nextSession;
    sessionRef.current = nextSession;
    movedSessionRef.current = nextSession;
    onSessionChange(nextSession);
    setChallengeFeedback(`答案是 ${activeChallenge.answer}。${activeChallenge.explanation}`);
  };

  const finishChallenge = () => {
    const source = learningHandoffRef.current ?? sessionRef.current;
    setChallengeChoices([]);
    setActiveChallenge(null);
    setChallengeHint(false);
    setChallengeFeedback("");
    learningHandoffRef.current = null;
    beginHandoff(source);
  };

  const learningDialogOpen = Boolean(knowledgeCity || challengeChoices.length > 0);
  useEffect(() => {
    if (learningDialogOpen) {
      if (!learningReturnFocusRef.current && document.activeElement instanceof HTMLElement) {
        learningReturnFocusRef.current = document.activeElement;
      }
      const timer = window.setTimeout(() => {
        const selector = activeChallenge
          ? ".travel-challenge-card .challenge-options button:not(:disabled)"
          : ".learning-backdrop [role='dialog'] button:not(:disabled)";
        document.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const returnTarget = learningReturnFocusRef.current;
    learningReturnFocusRef.current = null;
    if (returnTarget?.isConnected) window.setTimeout(() => returnTarget.focus({ preventScroll: true }), 0);
  }, [learningDialogOpen, activeChallenge]);

  const executeFinancialAction = () => {
    if (transactionGuardRef.current) return;
    const action = financialActionRef.current;
    if (!action) return;
    transactionGuardRef.current = true;
    stopVoiceListening();
    const activeSession = sessionRef.current;
    const city = getCity(action.cityId);
    const transactionSession = action.kind === "purchase" && city ? purchaseCity(activeSession, city)
      : action.kind === "upgrade" && city ? upgradeCity(activeSession, city)
        : action.kind === "asset" ? applyAssetAction(activeSession, action.cityId, action.assetAction) : null;
    const nextSession = transactionSession && action.kind === "upgrade" ? recordBuild(transactionSession) : transactionSession;
    if (!nextSession) {
      transactionGuardRef.current = false;
      financialActionRef.current = null;
      setFinancialAction(null);
      setVoiceStatus("操作条件已经变化，请重新选择");
      return;
    }
    commitTransaction(activeSession, nextSession, action.label);
    playUiSound(action.kind === "purchase" ? "purchase" : action.kind === "upgrade" ? "upgrade" : "success");
    financialActionRef.current = null;
    setFinancialAction(null);
    transactionGuardRef.current = false;
    if (action.kind === "asset") {
      speak("资产操作已完成。你可以继续选择，或者查看是否已经筹够。", () => startFinancialListening("assets", nextSession));
      return;
    }
    const activePlayer = nextSession.players[nextSession.currentPlayerIndex];
    const upgradedProperty = activePlayer.properties.find((property) => property.tileId === action.cityId);
    const celebration: PropertyCelebration = action.kind === "purchase"
      ? { kind: "purchase", icon: "🎉", title: `恭喜${activePlayer.name}拿下${city?.name ?? "新城市"}！`, detail: "新的环球地标加入你的版图，未来会带来租金收入。" }
      : upgradedProperty?.buildingLevel === 5
        ? { kind: "hotel", icon: "🏨", title: `${city?.name ?? "城市"}的旅馆盛大开业！`, detail: `${activePlayer.name}完成了最高等级建设，掌声和礼花都安排上！` }
        : { kind: "upgrade", icon: "🏠", title: `${city?.name ?? "城市"}又热闹了一点！`, detail: `恭喜${activePlayer.name}建成第 ${upgradedProperty?.buildingLevel ?? 1} 座房屋，租金也提升啦。` };
    landingDecisionRef.current = null;
    setLandingDecision(null);
    setPropertyCelebration(celebration);
    setVoiceStatus(celebration.title);
    const finishAfterCelebration = () => {
      if (propertyCelebrationTimerRef.current !== null) window.clearTimeout(propertyCelebrationTimerRef.current);
      propertyCelebrationTimerRef.current = window.setTimeout(
        () => finishCityDecision(nextSession),
        reducedMotion ? 120 : 420,
      );
    };
    speak(`${celebration.title}${celebration.detail}`, finishAfterCelebration);
  };

  const cancelFinancialAction = () => {
    stopVoiceListening();
    financialActionRef.current = null;
    setFinancialAction(null);
    playUiSound("tap");
    if (assetManagerOpen) speak("已取消。你可以重新选择资产。", () => startFinancialListening("assets", sessionRef.current));
  };

  const payPendingRent = () => {
    if (transactionGuardRef.current) return;
    const decision = landingDecisionRef.current;
    if (!decision || decision.kind !== "rent-due") return;
    const city = getCity(decision.cityId);
    if (!city || sessionRef.current.players[sessionRef.current.currentPlayerIndex].cash < decision.rent) return;
    const transfer = transferRent(sessionRef.current, city);
    if (!transfer) return;
    transactionGuardRef.current = true;
    const beforePayment = sessionRef.current;
    const owner = getPropertyOwner(beforePayment, city.id);
    commitTransaction(beforePayment, transfer.session, `向${decision.ownerName}支付${city.name}租金`);
    movedSessionRef.current = transfer.session;
    if (owner) showRentFlight(beforePayment, owner.playerIndex, decision.rent);
    playUiSound("rent");
    setAssetManagerOpen(false);
    const paidDecision: LandingDecision = { kind: "rent-paid", cityId: city.id, rent: decision.rent, ownerName: decision.ownerName };
    landingDecisionRef.current = paidDecision;
    setLandingDecision(paidDecision);
    changeTurnPhase("deciding");
    transactionGuardRef.current = false;
    speak(`已向${decision.ownerName}缴纳${decision.rent}金币租金，资产自救成功。`, () => finishCityDecision(transfer.session));
  };

  const requestFamilyRelief = () => {
    if (transactionGuardRef.current) return;
    const decision = landingDecisionRef.current;
    if (!decision || decision.kind !== "rent-due") return;
    const beforeAid = sessionRef.current;
    const aid = applyFamilyAid(beforeAid, decision.rent);
    if (!aid) return;
    transactionGuardRef.current = true;
    const collaborativeSession = recordCollaboration(aid.session);
    commitTransaction(beforeAid, collaborativeSession, "领取家庭援助金");
    movedSessionRef.current = collaborativeSession;
    playUiSound("reward");
    transactionGuardRef.current = false;
    speak(`家庭银行送来${aid.amount}金币援助金。现在可以安心支付租金，支付后还会保留基本旅行金。`, () => startFinancialListening("assets", collaborativeSession));
  };

  const undoLastTransaction = () => {
    if (transactionGuardRef.current) return;
    const snapshot = undoSnapshot;
    if (!snapshot) return;
    transactionGuardRef.current = true;
    stopVoiceListening();
    window.speechSynthesis?.cancel();
    const current = sessionRef.current;
    const restoredEconomy = new Map(snapshot.players.map((player) => [player.id, player]));
    const transactionEvents = new Set(snapshot.transactionEventIds);
    const restored: GameSession = {
      ...current,
      players: current.players.map((player) => {
        const previous = restoredEconomy.get(player.id);
        return previous ? {
          ...player,
          cash: previous.cash,
          properties: previous.properties.map((property) => ({ ...property })),
        } : player;
      }),
      events: current.events.filter((event) => !transactionEvents.has(event.id)),
      updatedAt: Date.now(),
    };
    sessionRef.current = restored;
    if (movedSessionRef.current) movedSessionRef.current = restored;
    onSessionChange(restored);
    setUndoSnapshot(null);
    setRentFlight(null);
    playUiSound("remove");
    transactionGuardRef.current = false;
    setVoiceStatus(`已撤销：${snapshot.label}`);
    speak(`已经撤销${snapshot.label}。`);
  };

  const openAssetManager = () => {
    stopVoiceListening();
    window.speechSynthesis?.cancel();
    setAssetManagerOpen(true);
    speak(sessionRef.current.voiceEnabled ? "这里是你的资产中心。可以说卖房、卖地、抵押或赎回，再加上城市名称。租金实在不够时，也可以说申请家庭援助。" : "这里是你的资产中心。请选择城市，再点击卖房、卖地、抵押或赎回。租金实在不够时，也可以点击申请家庭援助。", () => startFinancialListening("assets", sessionRef.current));
  };

  const closeAssetManager = () => {
    stopVoiceListening();
    window.speechSynthesis?.cancel();
    setAssetManagerOpen(false);
    if (landingDecisionRef.current?.kind === "rent-due") changeTurnPhase("rescue");
    else if (landingDecisionRef.current) changeTurnPhase("deciding");
    else {
      changeTurnPhase("ready");
      window.setTimeout(() => announceTurn(sessionRef.current), 180);
    }
  };

  const changeReducedMotion = (enabled: boolean) => {
    setReducedMotion(enabled);
    window.localStorage.setItem(REDUCED_MOTION_KEY, enabled ? "on" : "off");
    playUiSound(enabled ? "add" : "tap");
  };

  const updateVoiceEnabled = (enabled: boolean) => {
    if (enabled) {
      if (remoteControlled) {
        const voiceSession = { ...sessionRef.current, voiceEnabled: true, updatedAt: Date.now() };
        sessionRef.current = voiceSession;
        onSessionChange(voiceSession);
        setVoiceStatus("语音回复已开启，操作由 iPhone 遥控器接收");
        setVoiceVisualState("idle");
        return;
      }
      setVoiceGuideOpen(true);
      setVoiceStatus("请开启并测试麦克风");
      setVoiceVisualState("requesting");
      return;
    }
    stopVoiceListening();
    const silentSession = { ...sessionRef.current, voiceEnabled: false, updatedAt: Date.now() };
    sessionRef.current = silentSession;
    onSessionChange(silentSession);
    setRecognizedTranscript("");
    setVoiceStatus("语音回复已关闭，主持播报保持开启");
    setVoiceVisualState("off");
  };

  const updateVoiceNarrationEnabled = (enabled: boolean) => {
    if (!enabled) window.speechSynthesis?.cancel();
    const nextSession = { ...sessionRef.current, voiceNarrationEnabled: enabled, updatedAt: Date.now() };
    sessionRef.current = nextSession;
    onSessionChange(nextSession);
    setVoiceStatus(enabled ? (nextSession.voiceEnabled ? "语音播报已开启" : "语音播报已开启，回复仍关闭") : "语音播报已关闭");
    setVoiceVisualState(nextSession.voiceEnabled ? "idle" : "off");
  };

  const cycleRentDifficulty = () => {
    const currentIndex = Math.max(0, RENT_DIFFICULTIES.findIndex((item) => item.id === rentDifficulty.id));
    const nextDifficulty = RENT_DIFFICULTIES[(currentIndex + 1) % RENT_DIFFICULTIES.length];
    const nextSession = { ...sessionRef.current, rentDifficultyId: nextDifficulty.id, updatedAt: Date.now() };
    sessionRef.current = nextSession;
    onSessionChange(nextSession);
    playUiSound("tap");
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
        setTvMode(true);
      }
      playUiSound("tap");
    } catch {
      setTvMode(true);
    }
  };

  const resumeGameInteraction = () => {
    if (!sessionRef.current.voiceEnabled) return;
    if (turnPhaseRef.current === "answering" && pendingRollRef.current) {
      speak(mathQuestionCopy(pendingRollRef.current, sessionRef.current), () => startVoiceListening("answer", sessionRef.current));
    } else if (assetManagerOpenRef.current) {
      startFinancialListening("assets", sessionRef.current);
    } else if (landingDecisionRef.current) {
      startFinancialListening("landing", sessionRef.current);
    } else if (turnPhaseRef.current === "ready") {
      window.setTimeout(() => announceTurn(sessionRef.current), 180);
    }
  };

  const closeRules = () => {
    setRulesOpen(false);
    resumeGameInteraction();
  };

  const openRules = (tab: "quick" | "cities" | "accessibility" = "quick") => {
    stopVoiceListening();
    window.speechSynthesis?.cancel();
    setRulesTab(tab);
    setRulesOpen(true);
    playUiSound("tap");
  };

  const completeOnboarding = () => {
    window.localStorage.setItem(ONBOARDING_KEY, "done");
    setOnboardingOpen(false);
    setOnboardingStep(0);
    playUiSound("success");
    if (!remoteControlled && sessionRef.current.voiceEnabled && window.localStorage.getItem(VOICE_GUIDE_KEY) !== "done") {
      setVoiceGuideOpen(true);
      setVoiceStatus("玩法已了解，现在开启麦克风");
      setVoiceVisualState("requesting");
      return;
    }
    window.setTimeout(() => announceTurn(sessionRef.current), 200);
  };

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (knowledgeCity) {
          closeKnowledgeCard();
          return;
        }
        if (challengeChoices.length > 0) {
          finishChallenge();
          return;
        }
        if (inspectedPlayerId) {
          setInspectedPlayerId(null);
          return;
        }
        if (rulesOpen) closeRules();
        return;
      }
      if ((event.key === "?" || (event.key === "/" && event.shiftKey)) && !onboardingOpen) {
        event.preventDefault();
        openRules("quick");
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
    // Handlers intentionally track the currently open help overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesOpen, voiceGuideOpen, onboardingOpen, inspectedPlayerId, knowledgeCity, challengeChoices.length]);

  useEffect(() => {
    const closeRemoteOverlay = () => setInspectedPlayerId(null);
    window.addEventListener(REMOTE_CLOSE_OVERLAY_EVENT, closeRemoteOverlay);
    return () => window.removeEventListener(REMOTE_CLOSE_OVERLAY_EVENT, closeRemoteOverlay);
  }, []);

  const openSettlement = () => {
    if (turnPhaseRef.current !== "ready") skipTurnAnimation();
    stopVoiceListening();
    window.speechSynthesis?.cancel();
    playUiSound("tap");
    setSettlementIsFinal(false);
    setDialog("settle-confirm");
  };

  const confirmSettlement = () => {
    if (turnPhaseRef.current !== "ready") skipTurnAnimation();
    playUiSound("success");
    setSettlementCelebrationSkipped(false);
    setDialog("settlement");
  };

  const closeDialogAndResume = () => {
    setDialog(null);
    if (turnPhaseRef.current === "answering" && pendingRollRef.current) {
      speak(session.voiceEnabled ? "我们继续。两个小球加起来，一共是多少点？没反应时，可以在答案后说完毕。" : "我们继续。两个小球加起来，一共是多少点？请选择你计算出的数字。", () => startVoiceListening("answer", session));
    } else if (turnPhaseRef.current === "ready") {
      window.setTimeout(() => announceTurn(session), 180);
    }
  };

  const continueAfterSettlement = () => {
    if (settlementIsFinal) {
      onSessionChange({ ...session, gameLengthId: "unlimited", updatedAt: Date.now() });
      setSettlementIsFinal(false);
    }
    setDialog(null);
  };

  const decisionCity = landingDecision ? getCity(landingDecision.cityId) : null;
  const decisionRegionName = decisionCity ? ({ asia: "亚洲", oceania: "大洋洲", africa: "非洲", europe: "欧洲", america: "美洲" } as const)[decisionCity.region] : "环球城市";
  const cashAfterPurchase = decisionCity ? currentPlayer.cash - decisionCity.price : currentPlayer.cash;
  const baseRentVisits = decisionCity ? Math.max(1, Math.ceil(decisionCity.price / (decisionCity.baseRent * economy.rentMultiplier * rentDifficulty.multiplier))) : 0;
  const purchaseRentSchedule = decisionCity ? Array.from({ length: 6 }, (_, level) => ({
    level,
    label: level === 0 ? "空地" : level === 5 ? "旅馆" : `${level} 座房屋`,
    compactLabel: level === 0 ? "空地" : level === 5 ? "旅馆" : `${level} 房`,
    icon: level === 0 ? "🌱" : level === 5 ? "🏨" : level === 4 ? "🏠🏠🏠🏠" : "🏠".repeat(level),
    rent: calculateRent(session, decisionCity, {
      tileId: decisionCity.id,
      purchasePrice: decisionCity.price,
      buildingLevel: level as 0 | 1 | 2 | 3 | 4 | 5,
      buildingInvestment: level * decisionCity.buildCost,
      mortgaged: false,
      mortgageValue: 0,
    }),
  })) : [];
  const activePropertyDetails = currentPlayer.properties.flatMap((property) => {
    const city = getCity(property.tileId);
    return city ? [{ property, city }] : [];
  });
  const decisionProperty = decisionCity ? currentPlayer.properties.find((property) => property.tileId === decisionCity.id) : undefined;
  const rescueShortage = landingDecision?.kind === "rent-due"
    ? Math.max(0, landingDecision.rent - currentPlayer.cash)
    : landingDecision?.kind === "purchase" && decisionCity
      ? Math.max(0, decisionCity.price - currentPlayer.cash)
      : landingDecision?.kind === "upgrade" && decisionCity
        ? Math.max(0, decisionCity.buildCost - currentPlayer.cash) : 0;
  const rescuePlans = recommendRescuePlans(activePropertyDetails, rescueShortage);
  const selectedRescuePlan = rescuePlans.find((plan) => plan.id === selectedRescuePlanId) ?? rescuePlans[0] ?? null;
  const recommendedNextStep = selectedRescuePlan?.steps[0] ?? null;

  const champions = ranking.filter((entry) => entry.isWinner);
  const championNames = champions.map((entry) => entry.player.name).join("、");
  const completedProgress = gameLength.rounds
    ? Math.min(100, ((session.round - 1) / gameLength.rounds) * 100)
    : 0;
  const regionLabels = { asia: "亚洲", oceania: "大洋洲", africa: "非洲", europe: "欧洲", america: "美洲" } as const;
  const rulesCities = BOARD_TILES.filter((tile): tile is CityTile => tile.type === "city" && (rulesRegion === "all" || tile.region === rulesRegion));
  const handbookRent = (city: CityTile, level: number) => Math.round(city.baseRent * [1, 2, 3.25, 5, 7.5, 10][level] * economy.rentMultiplier * rentDifficulty.multiplier / 10) * 10;
  const remoteGameState = JSON.stringify({
    players: session.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      cash: player.cash,
      total: calculateAssetBreakdown(player).total,
      cities: player.properties.flatMap((property) => {
        const city = getCity(property.tileId);
        return city ? [{
          name: city.name,
          icon: city.icon,
          building: property.buildingLevel === 5 ? "旅馆" : property.buildingLevel > 0 ? `${property.buildingLevel} 房` : "空地",
          rent: calculateRent(session, city, property),
          mortgaged: property.mortgaged,
        }] : [];
      }),
    })),
    cityOffer: decisionCity ? {
      name: decisionCity.name,
      icon: decisionCity.icon,
      price: decisionCity.price,
      baseRent: decisionCity.baseRent,
      buildCost: decisionCity.buildCost,
      cashAfter: currentPlayer.cash - decisionCity.price,
      kind: landingDecision?.kind ?? "city",
    } : null,
  });

  return (
    <div
      className={largeScreenScale > 1 ? "live-game-stage proportional-large-stage" : "live-game-stage"}
      style={{ "--large-screen-scale": largeScreenScale } as React.CSSProperties}
      data-remote-game-state={remoteGameState}
    >
    {nativeTouchLayout && (
      <div className="tv-rotate-prompt" role="status">
        <span aria-hidden="true">📱</span>
        <b>请横屏继续游戏</b>
        <small>棋盘会在横屏后自动铺满，64 格和当前进度都会完整保留。</small>
      </div>
    )}
    {nativeTouchLayout && (
      <>
        <button
          className={mobileToolsOpen ? "mobile-tools-toggle active" : "mobile-tools-toggle"}
          type="button"
          onClick={() => setMobileToolsOpen((open) => !open)}
          aria-expanded={mobileToolsOpen}
          aria-controls="mobile-game-tools"
        >{mobileToolsOpen ? "收起" : "功能"}</button>
        <section className={mobileToolsOpen ? "mobile-game-tools open" : "mobile-game-tools"} id="mobile-game-tools" aria-label="游戏功能区">
          <header><b>游戏功能</b><button type="button" onClick={() => setMobileToolsOpen(false)} aria-label="收起功能区">×</button></header>
          <div>
            <button type="button" className={session.voiceEnabled ? "active" : ""} onClick={() => updateVoiceEnabled(!session.voiceEnabled)}><span>{session.voiceEnabled ? "🎙️" : "🚫"}</span><b>{session.voiceEnabled ? "回复开" : "回复关"}</b></button>
            <button type="button" className={narrationEnabled ? "active" : ""} onClick={() => updateVoiceNarrationEnabled(!narrationEnabled)}><span>{narrationEnabled ? "📣" : "🔇"}</span><b>{narrationEnabled ? "播报开" : "播报关"}</b></button>
            <button type="button" className={musicEnabled ? "active" : ""} onClick={() => onMusicChange(!musicEnabled)}><span>{musicEnabled ? "♫" : "♪"}</span><b>{musicEnabled ? "音乐开" : "音乐关"}</b></button>
            <button type="button" className={effectsEnabled ? "active" : ""} onClick={() => onEffectsChange(!effectsEnabled)}><span>{effectsEnabled ? "🔔" : "🔕"}</span><b>{effectsEnabled ? "音效开" : "音效关"}</b></button>
            <button type="button" className={rentDifficulty.id !== "standard" ? "active" : ""} onClick={cycleRentDifficulty}><span>🏨</span><b>租金 {rentDifficulty.name} ×{rentDifficulty.multiplier.toFixed(1)}</b></button>
            <button type="button" onClick={() => { setMobileToolsOpen(false); openAssetManager(); }}><span>🏦</span><b>查看资产</b></button>
            <button type="button" onClick={() => { setMobileToolsOpen(false); openRules("quick"); }}><span>📖</span><b>玩法规则</b></button>
            <button type="button" className="settlement" onClick={() => { setMobileToolsOpen(false); openSettlement(); }}><span>🏆</span><b>结算排行</b></button>
          </div>
        </section>
      </>
    )}
    <main className={`game-shell${effectiveTvMode || nativeTouchLayout ? " tv-mode" : ""} phase-${turnPhase}`} style={{ "--active-color": currentColor } as React.CSSProperties}>
      <header className="game-topbar">
        <a className="brand game-brand" href="#game-top" aria-label="环球大富翁对局首页">
          <span className="brand-mark" aria-hidden="true">🌍</span>
          <span><strong>环球大富翁</strong><small>家庭旅行指挥台</small></span>
        </a>
        <div className="game-round-chip">
          <span>ROUND</span>
          <b>{String(session.round).padStart(2, "0")}</b>
          <small>{gameLength.rounds ? `/ ${gameLength.rounds} 轮` : "不限轮"}</small>
        </div>
        <div className="game-toolbar">
          <span className="autosave-state"><i /> 已自动保存</span>
          <button
            className={musicEnabled ? "game-icon-action active" : "game-icon-action"}
            type="button"
            onClick={() => onMusicChange(!musicEnabled)}
            aria-label={musicEnabled ? "关闭背景音乐" : "打开背景音乐"}
            title={musicEnabled && !audioStarted ? "点击后开始播放" : musicEnabled ? "关闭背景音乐" : "打开背景音乐"}
            aria-pressed={musicEnabled}
          >{musicEnabled ? "♫" : "♪"}</button>
          <button className={effectsEnabled ? "game-icon-action active" : "game-icon-action"} type="button" onClick={() => onEffectsChange(!effectsEnabled)} aria-label={effectsEnabled ? "关闭游戏音效" : "打开游戏音效"} aria-pressed={effectsEnabled} title={effectsEnabled ? "关闭游戏音效" : "打开游戏音效"}>{effectsEnabled ? "🔔" : "🔕"}</button>
          <button className={session.voiceEnabled ? "game-icon-action active" : "game-icon-action"} type="button" onClick={() => updateVoiceEnabled(!session.voiceEnabled)} aria-label={session.voiceEnabled ? "关闭语音回复" : "打开语音回复"} aria-pressed={session.voiceEnabled} title={session.voiceEnabled ? "关闭麦克风和语音回复，主持仍会播报" : "打开麦克风和语音回复"}>{session.voiceEnabled ? "🎙️" : "🚫"}</button>
          <button className={narrationEnabled ? "game-icon-action active" : "game-icon-action"} type="button" onClick={() => updateVoiceNarrationEnabled(!narrationEnabled)} aria-label={narrationEnabled ? "关闭主持播报" : "打开主持播报"} aria-pressed={narrationEnabled} title={narrationEnabled ? "关闭主持播报" : "打开主持播报"}>{narrationEnabled ? "📣" : "🔇"}</button>
          <button className={isFullscreen ? "game-icon-action active" : "game-icon-action"} type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "退出全屏" : "进入全屏"} aria-pressed={isFullscreen} title={isFullscreen ? "退出全屏" : "进入电视全屏"}>{isFullscreen ? "↙" : "⛶"}</button>
          <button className="cast-button" type="button" onClick={onOpenRemoteController}>📱 iPhone 遥控</button>
          <button className="rules-button" type="button" onClick={() => openRules("quick")} aria-label="打开玩法规则手册" title="玩法规则手册，快捷键问号">📖 规则</button>
          <button className="game-text-action undo-action" type="button" disabled={!undoSnapshot} onClick={undoLastTransaction} title={undoSnapshot ? `撤销：${undoSnapshot.label}` : "暂无可撤销交易"}>↶ 撤销交易</button>
          <button className="game-text-action" type="button" onClick={() => { stopVoiceListening(); window.speechSynthesis?.cancel(); playUiSound("tap"); setDialog("new-game"); }}>重新开局</button>
          <button className="settle-button" type="button" onClick={openSettlement}>🏆 随时结算</button>
        </div>
      </header>

      <section className="round-progress" aria-label={`当前第 ${session.round} 轮`}>
        <div style={{ width: gameLength.rounds ? `${completedProgress}%` : "100%" }} />
      </section>

      <section className="player-rail" aria-label="玩家资产概览">
        {session.players.map((player, index) => {
          const color = PLAYER_COLORS.find((item) => item.id === player.color)?.hex ?? "#167f7b";
          const assets = calculateAssetBreakdown(player);
          const isActive = index === session.currentPlayerIndex;
          return (
            <article
              className={isActive ? "rail-player active" : "rail-player"}
              key={player.id}
              style={{ "--rail-color": color } as React.CSSProperties}
              aria-current={isActive ? "true" : undefined}
              role="button"
              tabIndex={0}
              aria-label={`查看${player.name}的资产`}
              onClick={() => { stopVoiceListening(); setMobileToolsOpen(false); setInspectedPlayerId(player.id); }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                stopVoiceListening();
                setInspectedPlayerId(player.id);
              }}
            >
              <span className="rail-avatar">{player.avatar}</span>
              <span className="rail-name"><b>{player.name} {player.isChild ? <i className="child-badge">小朋友</i> : null}</b><small>{isActive ? "正在行动" : `资产第 ${liveRank.get(player.id)} 名`}</small>{(player.cardStatus?.shieldTurns > 0 || player.cardStatus?.rentBoostTurns > 0) && <em className="card-status-badges">{player.cardStatus.shieldTurns > 0 && player.cardStatus.shieldUses > 0 ? `🛡️ 护盾 ${player.cardStatus.shieldTurns}` : ""}{player.cardStatus.rentBoostTurns > 0 ? ` 📈 租金 ${player.cardStatus.rentBoostTurns}` : ""}</em>}</span>
              <span className="rail-money"><small>总资产</small><b>¥{numberFormatter.format(assets.total)}</b></span>
              {isActive && <i className="active-flag">到你啦</i>}
            </article>
          );
        })}
      </section>

      {inspectedPlayer && inspectedAssets && (
        <div className="player-assets-backdrop" role="presentation" onClick={() => setInspectedPlayerId(null)}>
          <section className="player-assets-dialog" role="dialog" aria-modal="true" aria-labelledby="player-assets-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <span>{inspectedPlayer.avatar}</span>
              <div><small>PLAYER ASSETS</small><h2 id="player-assets-title">{inspectedPlayer.name}的资产</h2></div>
              <button type="button" data-remote-close-player-assets aria-label="关闭资产详情" onClick={() => setInspectedPlayerId(null)}>×</button>
            </header>
            <div className="player-assets-summary">
              <article><small>总资产</small><b>¥{numberFormatter.format(inspectedAssets.total)}</b></article>
              <article><small>现金</small><b>¥{numberFormatter.format(inspectedAssets.cash)}</b></article>
              <article><small>城市原价</small><b>¥{numberFormatter.format(inspectedAssets.cityOriginalValue)}</b></article>
              <article><small>建筑投入</small><b>¥{numberFormatter.format(inspectedAssets.buildingOriginalValue)}</b></article>
            </div>
            <div className="player-assets-city-list">
              <h3>名下城市 <span>{inspectedPlayer.properties.length} 座</span></h3>
              {inspectedPlayer.properties.length === 0 ? <p className="player-assets-empty">还没有购买城市</p> : inspectedPlayer.properties.map((property) => {
                const city = getCity(property.tileId);
                if (!city) return null;
                const building = property.mortgaged ? "已抵押" : property.buildingLevel === 5 ? "旅馆" : property.buildingLevel > 0 ? `${property.buildingLevel} 座房屋` : "空地";
                return <article key={property.tileId}><span>{city.icon}</span><div><b>{city.name}</b><small>{building} · 当前租金 ¥{numberFormatter.format(calculateRent(session, city, property))}</small></div><strong>¥{numberFormatter.format(property.purchasePrice + property.buildingInvestment)}</strong></article>;
              })}
            </div>
            <footer><button type="button" data-remote-close-player-assets onClick={() => setInspectedPlayerId(null)}>看完了</button></footer>
          </section>
        </div>
      )}

      {rentFlight && (
        <div className={`rent-flight-layer${reducedMotion ? " reduced" : ""}`} role="status" aria-live="assertive" key={rentFlight.id}>
          <div className="rent-flight-card">
            <span className="rent-flight-person"><i>{rentFlight.payerAvatar}</i><b>{rentFlight.payerName}</b><small>付款方</small></span>
            <div className="rent-flight-route">
              <b>向 {rentFlight.ownerName} 缴纳租金 ¥{numberFormatter.format(rentFlight.amount)}</b>
              <div aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ "--coin-index": index } as React.CSSProperties}>🪙</i>)}</div>
            </div>
            <span className="rent-flight-person owner"><i>{rentFlight.ownerAvatar}</i><b>{rentFlight.ownerName}</b><small>收款方</small></span>
          </div>
        </div>
      )}

      {propertyCelebration && (
        <div className={`property-celebration-backdrop kind-${propertyCelebration.kind}`} role="status" aria-live="assertive">
          <section className="property-celebration-card">
            <div className="property-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--confetti-index": index } as React.CSSProperties} />)}</div>
            <span>{propertyCelebration.icon}</span>
            <small>{propertyCelebration.kind === "purchase" ? "NEW CITY UNLOCKED" : propertyCelebration.kind === "hotel" ? "GRAND OPENING" : "CITY LEVEL UP"}</small>
            <h2>{propertyCelebration.title}</h2>
            <p>{propertyCelebration.detail}</p>
            <div><i>✦</i><b>{propertyCelebration.kind === "purchase" ? "城市已加入名下资产" : propertyCelebration.kind === "hotel" ? "最高等级建设达成" : "城市租金同步提升"}</b><i>✦</i></div>
          </section>
        </div>
      )}

      {knowledgeCity && (
        <div className="learning-backdrop" role="presentation">
          <section className="city-knowledge-card" role="dialog" aria-modal="true" aria-labelledby="city-knowledge-title">
            <header><span>{knowledgeCity.icon}</span><div><small>本次旅行新发现</small><h2 id="city-knowledge-title">认识 {knowledgeCity.name}</h2></div><button type="button" onClick={() => closeKnowledgeCard()} aria-label="关闭城市知识卡">×</button></header>
            <div className="knowledge-location"><b>{knowledgeCity.country}，{knowledgeCity.continentName}</b><span>{knowledgeCity.englishName}</span></div>
            <p>{knowledgeCity.knowledge}</p>
            {knowledgeExpanded && <div className="knowledge-detail"><span>{knowledgeCity.landmark}</span><b>{knowledgeCity.greeting ?? `Hello from ${knowledgeCity.englishName}!`}</b><small>英文名只在知识卡和语音中出现，不会挤占地图方格。</small></div>}
            <footer><button type="button" onClick={() => closeKnowledgeCard(true)}>本局不再提示</button><button type="button" onClick={() => setKnowledgeExpanded((value) => !value)}>{knowledgeExpanded ? "收起详情" : "展开一点"}</button><button className="primary" type="button" onClick={() => closeKnowledgeCard()}>知道了，继续 →</button></footer>
          </section>
        </div>
      )}

      {!knowledgeCity && challengeChoices.length > 0 && (
        <div className="learning-backdrop" role="presentation">
          <section className="travel-challenge-card" role="dialog" aria-modal="true" aria-labelledby="travel-challenge-title">
            {!activeChallenge ? <>
              <header><span>🧭</span><div><small>可选旅行挑战 · 不扣金币</small><h2 id="travel-challenge-title">挑一个喜欢的小任务</h2></div><button type="button" onClick={finishChallenge} aria-label="跳过旅行挑战">×</button></header>
              <p>完成后收集一枚旅行印章；今天不想答也可以直接继续。</p>
              <div className="challenge-category-grid">{challengeChoices.map((challenge) => { const label = LEARNING_CATEGORY_LABELS[challenge.category]; return <button type="button" key={challenge.id} onClick={() => chooseChallenge(challenge)}><span>{label.icon}</span><b>{label.name}</b><small>约 10 秒</small></button>; })}</div>
              <footer><button type="button" onClick={finishChallenge}>这次跳过，继续旅行</button></footer>
            </> : <>
              <header><span>{LEARNING_CATEGORY_LABELS[activeChallenge.category].icon}</span><div><small>{LEARNING_CATEGORY_LABELS[activeChallenge.category].name}</small><h2 id="travel-challenge-title">{activeChallenge.prompt}</h2></div><button type="button" onClick={finishChallenge} aria-label="跳过旅行挑战">×</button></header>
              <div className="challenge-options">{activeChallenge.options.map((option) => <button type="button" key={option} disabled={Boolean(challengeFeedback)} onClick={() => answerChallenge(option)}>{option}</button>)}</div>
              {challengeHint && !challengeFeedback && <p className="challenge-hint">💡 {activeChallenge.hint}</p>}
              {challengeFeedback && <p className="challenge-feedback">🌟 {challengeFeedback}<small>获得 1 枚旅行印章</small></p>}
              <footer>{!challengeFeedback ? <><button type="button" onClick={() => setChallengeHint(true)}>给我一点提示</button><button type="button" onClick={revealChallengeAnswer}>看看答案</button><button type="button" onClick={finishChallenge}>跳过</button></> : <button className="primary" type="button" onClick={finishChallenge}>收下印章，继续 →</button>}</footer>
            </>}
          </section>
        </div>
      )}

      <section className="control-deck" id="game-top">
        <aside className="current-player-card">
          <span className="card-kicker">CURRENT TRAVELER</span>
          <div className="current-avatar"><span>{currentPlayer.avatar}</span><i>#{liveRank.get(currentPlayer.id)}</i></div>
          <h1>{currentPlayer.name}</h1>
          <p>旅行接力棒现在在你手里</p>
          <div className="asset-total"><small>当前总资产</small><strong>¥{numberFormatter.format(currentAssets.total)}</strong></div>
          <div className="asset-mini-grid">
            <span><small>现金</small><b>¥{numberFormatter.format(currentAssets.cash)}</b></span>
            <span><small>城市</small><b>{currentPlayer.properties.length} 座</b></span>
            <span><small>建筑投入</small><b>¥{numberFormatter.format(currentAssets.buildingOriginalValue)}</b></span>
          </div>
          <button className="manage-assets-button" type="button" onClick={openAssetManager}>🏦 查看 / 管理我的资产</button>
          {session.voiceEnabled && <div className={`voice-ready state-${voiceVisualState}`}><i>{voiceVisualState === "speaking" ? "📣" : "🎙️"}</i><span><b>{voiceVisualState === "speaking" ? "主持人正在播报" : voiceVisualState === "listening" ? "麦克风正在倾听" : voiceVisualState === "heard" ? "已经收到你的回答" : currentPlayer.isChild ? "小小数学家模式" : "语音回复已准备"}</b><small>{recognizedTranscript ? `最近听到：“${recognizedTranscript}”` : voiceStatus}</small></span><div className="voice-wave" aria-hidden="true"><em /><em /><em /><em /><em /></div><button className="microphone-on" type="button" aria-pressed="true" onClick={() => updateVoiceEnabled(false)}>关闭语音回复</button></div>}
          {effectiveTvMode && !televisionMode && <button className="tv-exit-button" type="button" onClick={() => setTvMode(false)}>退出电视布局</button>}
        </aside>

        <section className="board-stage" aria-live="polite">
          <ClassicWorldBoard
            session={session}
            displayPosition={movementPosition ?? currentPlayer.position}
            phase={turnPhase}
            movementProgress={movementProgress}
            rouletteFace={rouletteFace}
            rouletteResult={rouletteResult}
            rouletteRotations={rouletteRotations}
            mathFeedback={mathFeedback}
            voiceStatus={voiceStatus}
            voiceVisualState={voiceVisualState}
            arrivalNotice={arrivalNotice}
            reducedMotion={reducedMotion}
            rollInputMode={rollInputMode}
            onStartTurn={() => beginTurn(sessionRef.current)}
            onManualRoll={submitManualRoll}
            onRollInputModeChange={changeRollInputMode}
            onAnswer={submitMathAnswer}
            onRetryAnswer={retryMathListening}
            onSkipAnimation={skipTurnAnimation}
            onReducedMotionChange={changeReducedMotion}
          />
        </section>

        <aside className="journey-log">
          <div className="log-heading"><span><b>旅行动态</b><small>最近 50 条自动记录</small></span><i>✦</i></div>
          <div className="log-list">
            {session.events.slice(0, 8).map((event, index) => (
              <article key={event.id} className={index === 0 ? "fresh" : ""}>
                <i>{eventIcon(event.kind)}</i>
                <span><b>{event.message}</b><small>第 {event.round} 轮 · {timeFormatter.format(event.createdAt)}</small></span>
              </article>
            ))}
          </div>
          <div className="game-rule-note"><span>💰</span><p><b>{economy.name}</b><small>初始现金 ¥{numberFormatter.format(economy.startingCash)}，系统会自动记录每一笔资产变化。</small></p></div>
        </aside>
      </section>

      {showFirstPlayer && (
        <div className="first-player-reveal" role="status" aria-live="assertive">
          <div className="reveal-rays" />
          <span className="reveal-label">幸运出发签</span>
          <div className="reveal-avatar">{currentPlayer.avatar}</div>
          <h2>由 {currentPlayer.name} 先出发！</h2>
          <p>好运已经选中第一位环球旅行家</p>
        </div>
      )}

      {onboardingOpen && (
        <div className="modal-backdrop onboarding-backdrop" role="presentation">
          <section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <header><span className="onboarding-logo">🌍</span><div><small>第一次环球旅行</small><b>4 步就会玩 · 全家都能听懂</b></div><button type="button" onClick={completeOnboarding}>跳过引导</button></header>
            <div className={`onboarding-visual onboarding-visual-${onboardingStep + 1}`} aria-hidden="true"><i>{onboardingPages[onboardingStep].icon}</i><span>{onboardingStep === 0 ? "爸爸，到你啦！" : onboardingStep === 1 ? "7 ＋ 5 ＝ 12" : onboardingStep === 2 ? "🌱 → 🏠×4 → 🏨" : "📱  ···  📺"}</span></div>
            <div className="onboarding-copy"><small>{onboardingPages[onboardingStep].eyebrow}</small><h2 id="onboarding-title">{onboardingPages[onboardingStep].title}</h2><p>{onboardingPages[onboardingStep].description}</p><ul>{onboardingPages[onboardingStep].points.map((point) => <li key={point}>✓ {point}</li>)}</ul></div>
            <footer><div className="onboarding-progress" aria-label={`引导第 ${onboardingStep + 1} 步，共 ${onboardingPages.length} 步`}>{onboardingPages.map((page, index) => <i className={index === onboardingStep ? "active" : index < onboardingStep ? "done" : ""} key={page.title} />)}</div><div><button type="button" disabled={onboardingStep === 0} onClick={() => setOnboardingStep((step) => Math.max(0, step - 1))}>上一步</button>{onboardingStep < onboardingPages.length - 1 ? <button type="button" onClick={() => { playUiSound("tap"); setOnboardingStep((step) => step + 1); }}>下一步 →</button> : <button type="button" onClick={completeOnboarding}>我会玩啦 · 开始旅行 →</button>}</div></footer>
          </section>
        </div>
      )}

      {rulesOpen && (
        <div className="modal-backdrop rules-backdrop" role="presentation">
          <section className="rules-dialog" role="dialog" aria-modal="true" aria-labelledby="rules-title">
            <header><span>📖</span><div><small>FAMILY RULE BOOK</small><h2 id="rules-title">环球大富翁家庭规则手册</h2><p>{economy.name} · {gameLength.name} · 所有资产结算均按购买原价</p></div><button type="button" onClick={closeRules} aria-label="关闭规则手册">×</button></header>
            <nav className="rules-tabs" aria-label="规则手册章节"><button className={rulesTab === "quick" ? "active" : ""} type="button" aria-current={rulesTab === "quick" ? "page" : undefined} onClick={() => setRulesTab("quick")}>🎒 快速玩法</button><button className={rulesTab === "cities" ? "active" : ""} type="button" aria-current={rulesTab === "cities" ? "page" : undefined} onClick={() => setRulesTab("cities")}>🏙️ 城市租金表</button><button className={rulesTab === "accessibility" ? "active" : ""} type="button" aria-current={rulesTab === "accessibility" ? "page" : undefined} onClick={() => setRulesTab("accessibility")}>⚙️ 辅助与开关</button></nav>

            {rulesTab === "quick" && (
              <div className="rules-quick-content">
                <section className="rules-flow" aria-label="每回合流程"><h3>一个回合怎么走</h3><div><article><i>1</i><b>点名</b><small>听到玩家名字</small></article><span>→</span><article><i>2</i><b>轮盘</b><small>双球相加</small></article><span>→</span><article><i>3</i><b>移动</b><small>逐格前进</small></article><span>→</span><article><i>4</i><b>结算</b><small>城市或卡牌</small></article><span>→</span><article><i>5</i><b>交接</b><small>轮到下一位</small></article></div></section>
                <div className="rules-card-grid"><article><span>🏙️</span><h3>城市经营</h3><p>无主城市可购买；自己的城市每次到访可建设一级；别人到访自动交租。</p><b>空地 → 4 座房屋 → 旅馆</b></article><article><span>🎈</span><h3>机会与命运</h3><p>牌袋抽完一轮前不会重复。现金损失、移动和临时增益都设置了家庭友好上限。</p><b>结果会自动结算</b></article><article><span>🛟</span><h3>现金不足</h3><p>先进入资产中心，可卖房、卖地、抵押；系统会解释并推荐损失较小的方案。</p><b>实在不足可申请家庭援助</b></article><article><span>🏆</span><h3>随时结算</h3><p>现金、城市购买原价与全部建筑原始投入相加。排行只看总资产，同分时现金更多者优先。</p><b>有事离开也能马上分胜负</b></article></div>
                <section className="rules-special-grid"><article><b>🚩 经过起点</b><small>获得 ¥{numberFormatter.format(economy.startReward)} 环游奖励</small></article><article><b>✈️ 机场</b><small>最多支付 ¥350 服务费，资金过低会触发援助</small></article><article><b>🏖️ 休息</b><small>安心停留，不扣钱、不强制操作</small></article><article><b>🎁 公共奖励</b><small>按地点自动领取家庭旅行金</small></article></section>
              </div>
            )}

            {rulesTab === "cities" && (
              <div className="rules-cities-content">
                <div className="rules-city-toolbar"><span><b>{economy.name} · {rentDifficulty.name}收费</b><small>旅费系数 ×{economy.rentMultiplier} × 地产强度 ×{rentDifficulty.multiplier}；临时卡牌加成不计入本表</small></span><div>{(["all", "asia", "oceania", "africa", "europe", "america"] as const).map((region) => <button className={rulesRegion === region ? "active" : ""} type="button" key={region} onClick={() => setRulesRegion(region)}>{region === "all" ? "全部" : regionLabels[region]}</button>)}</div></div>
                <div className="city-rent-table-wrap" tabIndex={0} aria-label="可横向滚动的城市价格和租金表">
                  <table className="city-rent-table"><thead><tr><th>城市</th><th>购买价</th><th>每次建设</th><th>空地租金</th><th>1 房</th><th>2 房</th><th>3 房</th><th>4 房</th><th>旅馆</th></tr></thead><tbody>{rulesCities.map((city) => <tr key={city.id}><th><span>{city.icon}</span><b>{city.name}</b><small>{regionLabels[city.region]} · {city.country}</small></th><td>¥{numberFormatter.format(city.price)}</td><td>¥{numberFormatter.format(city.buildCost)}</td>{Array.from({ length: 6 }, (_, level) => <td className={level === 5 ? "hotel-rent" : ""} key={level}>¥{numberFormatter.format(handbookRent(city, level))}</td>)}</tr>)}</tbody></table>
                </div>
                <p className="rent-table-note">抵押后的城市租金为 0，也不能建设；赎回后恢复。旅馆是第 5 次建设，建成后不再继续升级。</p>
              </div>
            )}

            {rulesTab === "accessibility" && (
              <div className="rules-accessibility-content">
                <div className="rent-difficulty-rules"><span><b>🏨 地产收费强度</b><small>游戏中可随时调整，下一笔租金立即生效</small></span><div>{RENT_DIFFICULTIES.map((difficulty) => <button className={rentDifficulty.id === difficulty.id ? "active" : ""} type="button" key={difficulty.id} onClick={() => { const nextSession = { ...sessionRef.current, rentDifficultyId: difficulty.id, updatedAt: Date.now() }; sessionRef.current = nextSession; onSessionChange(nextSession); playUiSound("tap"); }}><b>{difficulty.name}</b><small>×{difficulty.multiplier.toFixed(1)}</small></button>)}</div></div>
                <div className="accessibility-setting-list"><button type="button" aria-pressed={musicEnabled} onClick={() => onMusicChange(!musicEnabled)}><span>{musicEnabled ? "♫" : "♪"}</span><p><b>背景音乐</b><small>{musicEnabled ? "已开启 · 欢乐旅行曲" : "已关闭 · 不影响事件提示"}</small></p><em>{musicEnabled ? "开启" : "关闭"}</em></button><button type="button" aria-pressed={effectsEnabled} onClick={() => onEffectsChange(!effectsEnabled)}><span>{effectsEnabled ? "🔔" : "🔕"}</span><p><b>游戏音效</b><small>{effectsEnabled ? "已开启 · 按钮和事件有反馈" : "已关闭 · 画面会完整显示结果"}</small></p><em>{effectsEnabled ? "开启" : "关闭"}</em></button><button type="button" aria-pressed={session.voiceEnabled} onClick={() => { if (!session.voiceEnabled) setRulesOpen(false); updateVoiceEnabled(!session.voiceEnabled); }}><span>{session.voiceEnabled ? "🎙️" : "🚫"}</span><p><b>语音回复</b><small>{session.voiceEnabled ? "已开启 · 可直接回答和选择" : "已关闭 · 主持仍会播报，请用按钮操作"}</small></p><em>{session.voiceEnabled ? "开启" : "关闭"}</em></button><button type="button" aria-pressed={narrationEnabled} onClick={() => updateVoiceNarrationEnabled(!narrationEnabled)}><span>{narrationEnabled ? "📣" : "🔇"}</span><p><b>语音播报</b><small>{narrationEnabled ? "已开启 · 主持人会点名和说明结果" : "已关闭 · 不影响麦克风回复设置"}</small></p><em>{narrationEnabled ? "开启" : "关闭"}</em></button><button type="button" aria-pressed={reducedMotion} onClick={() => changeReducedMotion(!reducedMotion)}><span>{reducedMotion ? "✓" : "✨"}</span><p><b>简化动态效果</b><small>{reducedMotion ? "已简化 · 轮盘与移动会更快" : "标准动画 · 仍可随时跳过"}</small></p><em>{reducedMotion ? "简化" : "标准"}</em></button></div>
                <section className="accessibility-promises"><h3>全家都能看懂和操作</h3><div><article><span>◆</span><b>不只靠颜色</b><small>玩家归属同时显示头像、姓名、排名和文字标签。</small></article><article><span>⌨️</span><b>键盘可操作</b><small>Tab 切换按钮，Enter 或空格确认，Esc 关闭说明，? 打开规则。</small></article><article><span>👆</span><b>大触控热区</b><small>手机和平板上的关键按钮至少 48 像素，适合小朋友点击。</small></article><article><span>👁️</span><b>结果不只靠声音</b><small>语音、音乐或音效关闭时，点数、地点、金额与结果仍会显示。</small></article></div></section>
              </div>
            )}
            <footer><span>按 Esc 关闭 · 按 ? 随时再次打开</span><button type="button" onClick={closeRules}>看完了，继续游戏 →</button></footer>
          </section>
        </div>
      )}

      {voiceGuideOpen && (
        <div className="modal-backdrop voice-guide-backdrop" role="presentation">
          <section className="voice-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-guide-title">
            <header><span>🎙️</span><div><small>TV VOICE HOST</small><h2 id="voice-guide-title">让语音主持人听见全家</h2><p>第一次使用时，浏览器会询问麦克风权限。允许后，轮到谁、数学答题和城市选择都可以直接说。</p></div></header>
            <div className="voice-guide-steps"><article><i>1</i><span><b>点击开启麦克风</b><small>浏览器弹出询问时选择“允许”</small></span></article><article><i>2</i><span><b>听主持人说完和提示音</b><small>画面出现跳动波形后再回答</small></span></article><article><i>3</i><span><b>正常音量说短句</b><small>电视旁尽量不要同时有人说话</small></span></article></div>
            <div className={`voice-permission-preview state-${voiceVisualState}`}><span>{voiceVisualState === "error" ? "⚠️" : voiceVisualState === "unsupported" ? "🔕" : "🎙️"}</span><div><b>{voiceStatus}</b><small>{recognizedTranscript ? `最近识别：“${recognizedTranscript}”` : "语音只用于本机这一局的操作，不保存录音。"}</small></div><i className="voice-wave" aria-hidden="true"><em /><em /><em /><em /><em /></i></div>
            <div className="voice-guide-actions"><button type="button" onClick={closeVoiceGuide}>暂时不用 · 保留屏幕按钮</button><button type="button" onClick={enableMicrophoneFromGuide}>开启并测试麦克风 →</button></div>
            <footer>如果此前点了拒绝，请在浏览器地址栏旁的麦克风图标中改为允许，再重新测试。</footer>
          </section>
        </div>
      )}

      {activeCard && (
        <div className={`card-reveal-backdrop deck-${activeCard.card.deck}`} role="presentation">
          <section className={`family-card-dialog tone-${activeCard.card.tone}${reducedMotion ? " reduced" : ""}`} role="dialog" aria-modal="true" aria-labelledby="family-card-title">
            <div className="card-deck-shadow" aria-hidden="true"><i /><i /></div>
            <div className="family-card-face">
              <header><span>{activeCard.card.deck === "chance" ? "CHANCE · 机会" : "DESTINY · 命运"}</span><b>第 {activeCard.deckCycle} 轮牌袋</b></header>
              <div className="family-card-icon" aria-hidden="true">{activeCard.card.icon}</div>
              <small>{activeCard.card.tone === "good" ? "一份旅途好运" : activeCard.card.tone === "gentle" ? "温柔的小挑战" : "意想不到的转折"}</small>
              <h2 id="family-card-title">{activeCard.card.title}</h2>
              <p>{activeCard.card.text}</p>
              <div className={activeCard.wasShielded ? "card-result shielded" : "card-result"}>
                <span>{activeCard.wasShielded ? "🛡️" : "✓"}</span>
                <div><small>已自动结算</small>{activeCard.lines.map((line) => <b key={line}>{line}</b>)}</div>
              </div>
              <div className="card-safety-limits"><span>单次损失最多为现金 12%</span><span>移动不超过 6 格</span><span>增益最多 3 回合</span></div>
              <button type="button" onClick={() => finishCardResult(activeCard)}><span>牌袋还剩 {activeCard.deckRemaining} 张，本轮抽完前不会重复</span><b>收下结果 · 继续旅行 →</b></button>
              <footer>卡牌移动抵达新地点后不会连续触发第二次落点事件，避免无限连锁。</footer>
            </div>
          </section>
        </div>
      )}

      {landingDecision && decisionCity && !assetManagerOpen && !financialAction && (
        <div className="modal-backdrop economy-backdrop" role="presentation">
          <section className={`economy-dialog region-${decisionCity.region}`} role="dialog" aria-modal="true" aria-labelledby="economy-title">
            <aside className="economy-city-poster">
              <div className="city-deed-top"><span>WORLD CITY DEED</span><b>{decisionRegionName} · 第 {decisionCity.index + 1} 站</b></div>
              <div className="city-emblem"><i>{decisionCity.icon}</i><span>✦</span></div>
              <small>{decisionCity.country}</small>
              <h2 id="economy-title">{decisionCity.name}</h2>
              <p>{decisionCity.landmark}</p>
              <div className="city-silhouette" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
              <div className="city-owner-ribbon" style={{ "--deed-owner-color": currentColor } as React.CSSProperties}>{landingDecision.kind === "purchase" ? "等待一位新主人" : `${currentPlayer.avatar} ${currentPlayer.name} 正在处理`}</div>
            </aside>

            <div className="economy-deal-panel">
              <header className="economy-dialog-header"><div><small>{landingDecision.kind === "purchase" ? "发现无主城市 · 购买机会" : landingDecision.kind === "upgrade" ? "回到自己的城市 · 建设机会" : landingDecision.kind === "rent-due" ? "城市账单 · 现金不足" : "城市账单 · 已完成"}</small><h3>{landingDecision.kind === "purchase" ? `是否投资 ${decisionCity.name}？` : landingDecision.kind === "upgrade" ? "是否继续建设？" : "本次城市结算"}</h3></div><span>{currentPlayer.avatar}<b>{currentPlayer.name}</b></span></header>

              {landingDecision.kind === "purchase" && (
                <>
                  <div className="purchase-balance-preview">
                    <span><small>现有现金</small><b>¥{numberFormatter.format(currentPlayer.cash)}</b></span><i>− ¥{numberFormatter.format(decisionCity.price)}</i><span className={cashAfterPurchase < 0 ? "negative" : ""}><small>购买后余额</small><b>{cashAfterPurchase >= 0 ? `¥${numberFormatter.format(cashAfterPurchase)}` : `差 ¥${numberFormatter.format(Math.abs(cashAfterPurchase))}`}</b></span>
                  </div>
                  <div className="economy-stat-row"><span><i>🏷️</i><small>城市售价</small><b>¥{numberFormatter.format(decisionCity.price)}</b></span><span><i>🪙</i><small>基础租金</small><b>¥{numberFormatter.format(decisionCity.baseRent)}</b></span><span><i>🏗️</i><small>每次建设</small><b>¥{numberFormatter.format(decisionCity.buildCost)}</b></span></div>
                  <section className="rent-growth-board" aria-label={`${decisionCity.name}各建筑等级租金表`}>
                    <header><span><b>建设后的完整租金表</b><small>每次回到自己的城市，可以建设一级</small></span><em>空地 → 4 房 → 旅馆</em></header>
                    <div>{purchaseRentSchedule.map((item) => <article className={item.level === 5 ? "hotel-level" : ""} key={item.level}><span aria-hidden="true">{item.icon}</span><small>{item.compactLabel}</small><b>¥{numberFormatter.format(item.rent)}</b><em>{item.level === 0 ? "无需建设" : `累计建设 ¥${numberFormatter.format(item.level * decisionCity.buildCost)}`}</em></article>)}</div>
                  </section>
                  <div className="city-investment-note"><span>💡</span><p><b>买下后能做什么？</b><small>城市会标记成你的颜色；其他玩家来访会自动交租，按基础租金计算约 {baseRentVisits} 次到访可覆盖买价，升级建筑还能提高租金。</small></p></div>
                  {currentPlayer.cash < decisionCity.price && <div className="cash-warning"><span>⚠️</span><p><b>现金暂时不足</b><small>还差 ¥{numberFormatter.format(decisionCity.price - currentPlayer.cash)}。可以先进入资产中心筹钱，也可以放弃本次机会。</small></p></div>}
                  {session.voiceEnabled && <div className={`economy-voice-hint state-${voiceVisualState}`}><i className="voice-pulse" /> <span><b>听到提示音后，说“我要购买”</b><small>{recognizedTranscript ? `刚刚听到：“${recognizedTranscript}”` : "单说“买”也可以 · 没听清会持续监听，不用点击"}</small></span></div>}
                  <div className="economy-actions"><button className="economy-secondary" type="button" onClick={() => finishCityDecision()}><span>暂时不要</span><b>放弃购买</b></button><button className="economy-assets" type="button" onClick={openAssetManager}><span>现金不够？</span><b>管理资产</b></button><button className="economy-primary" type="button" onClick={() => requestPurchase(decisionCity.id)}><span>{currentPlayer.cash >= decisionCity.price ? "支付并获得地契" : "先筹钱再购买"}</span><b>购买 {decisionCity.name} →</b></button></div>
                </>
              )}

              {landingDecision.kind === "upgrade" && decisionProperty && (
                <>
                  <div className="building-level-view"><span>{Array.from({ length: 5 }, (_, index) => <i key={index} className={index < decisionProperty.buildingLevel ? "built" : ""}>{index === 4 ? "🏨" : "🏠"}</i>)}</span><b>{decisionProperty.mortgaged ? "城市已抵押" : decisionProperty.buildingLevel === 5 ? "已建成旅馆" : decisionProperty.buildingLevel === 0 ? "当前为空地" : `当前 ${decisionProperty.buildingLevel} 座房屋`}</b></div>
                  <div className="economy-stat-row"><span><small>本次升级</small><b>¥{numberFormatter.format(decisionCity.buildCost)}</b></span><span><small>当前租金</small><b>¥{numberFormatter.format(calculateRent(session, decisionCity, decisionProperty))}</b></span><span><small>升级后租金</small><b>{decisionProperty.buildingLevel < 5 && !decisionProperty.mortgaged ? `¥${numberFormatter.format(calculateRent(session, decisionCity, { ...decisionProperty, buildingLevel: (decisionProperty.buildingLevel + 1) as 1 | 2 | 3 | 4 | 5 }))}` : "—"}</b></span></div>
                  {decisionProperty.mortgaged && <div className="cash-warning"><span>⚠️</span><p><b>暂时不能升级</b><small>这座城市抵押中，需要先到资产中心赎回。</small></p></div>}
                  {session.voiceEnabled && <div className={`economy-voice-hint state-${voiceVisualState}`}><i className="voice-pulse" /><span><b>可以说“升级”或“结束”</b><small>{recognizedTranscript ? `刚刚听到：“${recognizedTranscript}”` : "语音没有听清时会自动继续等待"}</small></span></div>}
                  <div className="economy-actions"><button className="economy-secondary" type="button" onClick={() => finishCityDecision()}><b>结束回合</b></button><button className="economy-assets" type="button" onClick={openAssetManager}><b>管理资产</b></button><button className="economy-primary" type="button" disabled={decisionProperty.buildingLevel >= 5 || decisionProperty.mortgaged} onClick={() => requestUpgrade(decisionCity.id)}><b>升级建筑 →</b></button></div>
                </>
              )}

              {landingDecision.kind === "rent-paid" && <><div className="rent-result"><span>🪙</span><b>{landingDecision.rent > 0 ? `已向 ${landingDecision.ownerName} 支付 ¥${numberFormatter.format(landingDecision.rent)}` : "城市抵押中，本次免租"}</b><small>双方现金已经更新，并写入旅行动态。</small></div>{session.voiceEnabled && <div className="economy-voice-hint"><i className="voice-pulse" /><span><b>说“继续”进入下一位</b><small>主持人正在等待你的回答</small></span></div>}<div className="economy-actions single"><button className="economy-primary" type="button" onClick={() => finishCityDecision()}><b>完成本回合 →</b></button></div></>}

              {landingDecision.kind === "rent-due" && <><div className="rent-result danger"><span>🛟</span><b>需向 {landingDecision.ownerName} 缴纳 ¥{numberFormatter.format(landingDecision.rent)}</b><small>当前现金 ¥{numberFormatter.format(currentPlayer.cash)}，还差 ¥{numberFormatter.format(Math.max(0, landingDecision.rent - currentPlayer.cash))}</small></div><div className="economy-actions single"><button className="economy-primary" type="button" onClick={openAssetManager}><b>打开资产自救中心 →</b></button></div></>}
              <footer>🎙️ {voiceStatus}</footer>
            </div>
          </section>
        </div>
      )}

      {assetManagerOpen && !financialAction && (
        <div className="modal-backdrop asset-backdrop" role="presentation">
          <section className="asset-manager" role="dialog" aria-modal="true" aria-labelledby="asset-manager-title">
            <header><div><span className="step-label">ASSET RESCUE</span><h2 id="asset-manager-title">{currentPlayer.avatar} {currentPlayer.name} 的资产中心</h2><p>现金 ¥{numberFormatter.format(currentPlayer.cash)}{rescueShortage > 0 ? ` · 还需筹集 ¥${numberFormatter.format(rescueShortage)}` : " · 可自由整理资产"}</p></div><button type="button" onClick={closeAssetManager} aria-label="关闭资产中心">×</button></header>
            {rescuePlans.length > 0 && (
              <div className="rescue-plans" aria-label="资产自救推荐方案">
                <div className="rescue-plan-tabs">
                  {rescuePlans.map((plan) => <button className={plan.id === selectedRescuePlan?.id ? "selected" : ""} type="button" key={plan.id} onClick={() => setSelectedRescuePlanId(plan.id)}><i>{plan.icon}</i><span><b>{plan.title}</b><small>{plan.steps.length} 步 · ¥{numberFormatter.format(plan.recovery)}</small></span></button>)}
                </div>
                {selectedRescuePlan && <div className="rescue-plan-detail"><span><b>{selectedRescuePlan.title}</b><small>{selectedRescuePlan.reason}</small></span>{recommendedNextStep && <button type="button" onClick={() => requestAssetAction(recommendedNextStep.tileId, recommendedNextStep.action)}><small>建议下一步</small><b>{recommendedNextStep.label} · +¥{numberFormatter.format(recommendedNextStep.amount)} →</b></button>}</div>}
              </div>
            )}
            <div className="asset-property-list">
              {activePropertyDetails.length === 0 && <div className="empty-assets"><span>🧳</span><b>目前还没有可处理的城市资产</b><small>可以返回并放弃购买；强制付款不足时，可直接申请家庭援助。</small></div>}
              {activePropertyDetails.map(({ property, city }) => {
                const isRecommended = recommendedNextStep?.tileId === city.id;
                const actions = (["sell-building", "mortgage", "sell-city", "redeem"] as AssetAction[]).map((action) => ({ action, quote: quoteAssetAction(property, city, action) })).filter((item) => item.quote);
                return (
                  <article key={city.id} className={isRecommended ? "recommended" : ""}>
                    <div className="asset-city-head"><span>{city.icon}</span><p><b>{city.name}{property.mortgaged ? " · 已抵押" : ""}</b><small>原价 ¥{numberFormatter.format(property.purchasePrice)} · 建筑 {property.buildingLevel} 级 · 当前租金 ¥{numberFormatter.format(calculateRent(session, city, property))}</small></p>{isRecommended && <i>推荐</i>}</div>
                    <div className="asset-action-row">{actions.map(({ action, quote }) => quote && <button type="button" key={action} disabled={action === "redeem" && currentPlayer.cash < quote.amount} onClick={() => requestAssetAction(city.id, action)}><span>{action === "sell-building" ? "卖房" : action === "sell-city" ? "卖地" : action === "mortgage" ? "抵押" : "赎回"}</span><b>{action === "redeem" ? `-¥${numberFormatter.format(quote.amount)}` : `+¥${numberFormatter.format(quote.amount)}`}</b></button>)}</div>
                  </article>
                );
              })}
            </div>
            <footer><span>🎙️ {voiceStatus}</span><div>{undoSnapshot && <button type="button" onClick={undoLastTransaction}>↶ 撤销上一笔</button>}<button type="button" onClick={closeAssetManager}>返回</button>{landingDecision?.kind === "rent-due" && currentPlayer.cash < landingDecision.rent && <button className="family-aid-button" type="button" onClick={requestFamilyRelief}>🎁 申请家庭援助</button>}{landingDecision?.kind === "rent-due" && <button className="pay-debt-button" type="button" disabled={currentPlayer.cash < landingDecision.rent} onClick={payPendingRent}>{currentPlayer.cash >= landingDecision.rent ? `向${landingDecision.ownerName}付 ¥${numberFormatter.format(landingDecision.rent)}` : `仍差 ¥${numberFormatter.format(landingDecision.rent - currentPlayer.cash)}`}</button>}</div></footer>
          </section>
        </div>
      )}

      {financialAction && (
        <div className="modal-backdrop financial-confirm-backdrop" role="presentation">
          <section className="financial-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="financial-confirm-title">
            <span>🔐</span><small>语音与点击均需二次确认</small><h2 id="financial-confirm-title">确认这项资产操作？</h2><p>{financialAction.label}</p><div><button type="button" onClick={cancelFinancialAction}>取消</button><button type="button" onClick={executeFinancialAction}>确认执行</button></div><footer>🎙️ {voiceStatus}</footer>
          </section>
        </div>
      )}

      {dialog === "settle-confirm" && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="settle-title">
            <span className="dialog-illustration">🧮</span>
            <span className="step-label">公平结算</span>
            <h2 id="settle-title">现在查看本局资产排行？</h2>
            <p>所有城市和建筑均按购买原价计入，不折价、不加价。查看结果后仍可继续游戏。</p>
            <div className="dialog-formula"><b>总资产</b><span>现金 ＋ 城市原价 ＋ 建筑原始投入</span></div>
            <div className="dialog-actions"><button type="button" onClick={closeDialogAndResume}>继续旅行</button><button className="confirm-primary" type="button" onClick={confirmSettlement}>查看排行榜</button></div>
          </section>
        </div>
      )}

      {dialog === "new-game" && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-dialog compact" role="dialog" aria-modal="true" aria-labelledby="new-game-title">
            <span className="dialog-illustration">🧳</span>
            <h2 id="new-game-title">重新召集旅伴吗？</h2>
            <p>当前旅程存档会被清除。若只是暂时离开，直接关闭页面即可，下次会自动提示恢复。</p>
            <div className="dialog-actions"><button type="button" onClick={closeDialogAndResume}>保留本局</button><button className="danger-action" type="button" onClick={onEndGame}>清除并重新开局</button></div>
          </section>
        </div>
      )}

      {dialog === "settlement" && (
        <div className={`settlement-screen${reducedMotion || settlementCelebrationSkipped ? " reduced-celebration" : ""}`} role="dialog" aria-modal="true" aria-labelledby="winner-title">
          {!reducedMotion && !settlementCelebrationSkipped && <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => (
            <i
              key={index}
              style={{
                "--confetti-left": `${(index + 1) * 4}%`,
                "--confetti-duration": `${2.7 + (index % 5) * 0.25}s`,
                "--confetti-delay": `${(index % 7) * -0.3}s`,
                "--confetti-color": `hsl(${index * 37} 88% 65%)`,
              } as React.CSSProperties}
            />
          ))}</div>}
          <div className="winner-banner">
            <span>🏆</span><small>{champions.length > 1 ? "共同冠军" : "本次环球冠军"}</small>
            <h2 id="winner-title">恭喜 {championNames}！</h2>
            <p>{champions.length > 1 ? "总资产和现金完全相同，今天的好运属于大家！" : "你带着最丰厚的旅行资产抵达终点！"}</p>
            {!reducedMotion && !settlementCelebrationSkipped && <button className="settlement-skip-celebration" type="button" onClick={() => setSettlementCelebrationSkipped(true)}>跳过庆祝动画</button>}
          </div>
          <div className="ranking-table">
            <div className="ranking-head"><span>排名 / 旅行家</span><span>现金</span><span>城市原价</span><span>建筑投入</span><span>总资产</span></div>
            {ranking.map((entry) => (
              <article className={entry.isWinner ? "winner-row" : ""} key={entry.player.id}>
                <span className="rank-person"><i>{entry.rank === 1 ? "👑" : `#${entry.rank}`}</i><b>{entry.player.avatar} {entry.player.name}</b></span>
                <span data-label="现金">¥{numberFormatter.format(entry.assets.cash)}</span>
                <span data-label="城市原价">¥{numberFormatter.format(entry.assets.cityOriginalValue)}</span>
                <span data-label="建筑投入">¥{numberFormatter.format(entry.assets.buildingOriginalValue)}</span>
                <strong data-label="总资产">¥{numberFormatter.format(entry.assets.total)}</strong>
              </article>
            ))}
          </div>
          {learningAwards.length > 0 && <section className="learning-awards" aria-label="本局旅行奖项"><header><small>每一种成长都值得掌声</small><h3>旅行特别奖</h3></header><div>{learningAwards.map((award) => <article key={award.id}><span>{award.icon}</span><b>{award.title}</b><p>{award.playerIds.map((id) => { const player = session.players.find((candidate) => candidate.id === id); return player ? `${player.avatar} ${player.name}` : ""; }).filter(Boolean).join("、")}</p><small>{award.detail} · {award.value}</small></article>)}</div></section>}
          <div className="settlement-actions"><button type="button" onClick={continueAfterSettlement}>{settlementIsFinal ? "加赛继续玩" : "返回继续游戏"}</button><button type="button" className="finish-game" onClick={onEndGame}>结束本局 · 返回首页</button></div>
        </div>
      )}
    </main>
    </div>
  );
}
