"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BOARD_TILES,
  ECONOMY_PRESETS,
  GAME_LENGTHS,
  PLAYER_AVATARS,
  PLAYER_COLORS,
} from "./game/config";
import { GameSessionScreen } from "./game/GameSessionScreen";
import {
  clearGameSession,
  createGameSession,
  loadGameSession,
  saveGameSession,
} from "./game/session";
import { useGameAudio } from "./game/use-game-audio";
import type { EconomyPresetId, GameLengthId, GameSession, PlayerColor } from "./game/types";

interface DraftPlayer {
  id: number;
  name: string;
  avatar: string;
  color: PlayerColor;
  isChild: boolean;
}

const initialPlayers: DraftPlayer[] = [
  { id: 1, name: "爸爸", avatar: "🐼", color: "coral", isChild: false },
  { id: 2, name: "妈妈", avatar: "🦊", color: "ocean", isChild: false },
  { id: 3, name: "小宝", avatar: "🐯", color: "sunny", isChild: true },
  { id: 4, name: "大宝", avatar: "🐰", color: "grape", isChild: true },
];

const featuredCities = BOARD_TILES.filter((tile) => tile.type === "city").slice(0, 8);

export default function Home() {
  const [players, setPlayers] = useState(initialPlayers);
  const [economy, setEconomy] = useState<EconomyPresetId>("classic");
  const [gameLength, setGameLength] = useState<GameLengthId>("family");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [session, setSession] = useState<GameSession | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<GameSession | null>(null);
  const [freshSession, setFreshSession] = useState(false);
  const [homeRulesOpen, setHomeRulesOpen] = useState(false);
  const [iphoneGuideOpen, setIphoneGuideOpen] = useState(false);
  const { musicEnabled, effectsEnabled, audioStarted, setMusicEnabled, setEffectsEnabled, playUiSound } = useGameAudio();

  useEffect(() => {
    setRestoreCandidate(loadGameSession());
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(new URL("sw.js", document.baseURI).pathname).catch(() => {
        // Online play remains available if this browser blocks offline installation.
      });
    }
  }, []);

  const selectedEconomy = useMemo(
    () => ECONOMY_PRESETS.find((item) => item.id === economy) ?? ECONOMY_PRESETS[1],
    [economy],
  );

  const updatePlayer = (id: number, patch: Partial<DraftPlayer>) => {
    setPlayers((current) =>
      current.map((player) => (player.id === id ? { ...player, ...patch } : player)),
    );
  };

  const addPlayer = () => {
    if (players.length >= 6) return;
    playUiSound("add");
    const id = Math.max(...players.map((player) => player.id)) + 1;
    const color = PLAYER_COLORS.find(
      (candidate) => !players.some((player) => player.color === candidate.id),
    )?.id ?? "mint";
    setPlayers((current) => [
      ...current,
      {
        id,
        name: `玩家 ${current.length + 1}`,
        avatar: PLAYER_AVATARS[current.length] ?? "🦁",
        color,
        isChild: false,
      },
    ]);
  };

  const removePlayer = (id: number) => {
    if (players.length <= 2) return;
    playUiSound("remove");
    setPlayers((current) => current.filter((player) => player.id !== id));
  };

  const startGame = async (event: FormEvent) => {
    event.preventDefault();
    playUiSound("success");
    if (voiceEnabled && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // The game can still start; the in-game host will keep the fallback controls visible.
      }
    }
    const nextSession = createGameSession(players, economy, gameLength, voiceEnabled);
    saveGameSession(nextSession);
    setFreshSession(true);
    setSession(nextSession);
  };

  const updateSession = (nextSession: GameSession) => {
    saveGameSession(nextSession);
    setSession(nextSession);
  };

  const endGame = () => {
    clearGameSession();
    setSession(null);
    setRestoreCandidate(null);
    setFreshSession(false);
  };

  if (session) {
    return (
      <GameSessionScreen
        session={session}
        isFresh={freshSession}
        musicEnabled={musicEnabled}
        effectsEnabled={effectsEnabled}
        audioStarted={audioStarted}
        onMusicChange={setMusicEnabled}
        onEffectsChange={setEffectsEnabled}
        playUiSound={playUiSound}
        onSessionChange={updateSession}
        onEndGame={endGame}
      />
    );
  }

  return (
    <main className="app-shell">
      <div className="sky-decor sky-decor-one" aria-hidden="true">☁️</div>
      <div className="sky-decor sky-decor-two" aria-hidden="true">☁️</div>

      <header className="topbar">
        <a className="brand" href="#top" aria-label="环球大富翁首页">
          <span className="brand-mark" aria-hidden="true">🌍</span>
          <span>
            <strong>环球大富翁</strong>
            <small>我们的家庭旅行局</small>
          </span>
        </a>
        <div className="top-actions">
          <span className="status-pill"><i /> 玩家系统已就绪</span>
          <button
            className={musicEnabled ? "music-button active" : "music-button"}
            type="button"
            onClick={() => setMusicEnabled(!musicEnabled)}
            aria-label={musicEnabled ? "关闭背景音乐" : "打开背景音乐"}
            aria-pressed={musicEnabled}
            title={musicEnabled ? "关闭背景音乐" : "打开背景音乐"}
          >
            <span className="music-icon" aria-hidden="true">{musicEnabled ? "♫" : "♪"}</span>
            <span className="music-copy">
              <b>{musicEnabled ? "音乐开" : "音乐关"}</b>
              <small>{musicEnabled && !audioStarted ? "点击页面后播放" : "欢乐旅行曲"}</small>
            </span>
            <i aria-hidden="true"><em /></i>
          </button>
          <button className="round-button" type="button" onClick={() => { playUiSound("tap"); setHomeRulesOpen(true); }}>玩法说明</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>✦</span> 一块屏幕 · 一起环游</div>
          <h1>今晚，我们去<br /><em>环游世界！</em></h1>
          <p>
            不用数纸币，不怕算错账。叫上家人，挑好旅行伙伴，
            城市、惊喜和好运都已经在地图上等你。
          </p>
          <div className="hero-promise">
            <span>🎯 自动结算</span>
            <span>🎙️ 点名语音</span>
            <span>📺 家庭投屏</span>
          </div>
          <button className="iphone-install-button" type="button" onClick={() => { playUiSound("tap"); setIphoneGuideOpen(true); }}>
            <span>📱</span><b>装到 iPhone，随时开局</b><small>不再需要背着电脑 · 支持 AirPlay 到安卓电视</small><i>查看方法 →</i>
          </button>
        </div>

        <div className="travel-scene" aria-label="环球旅行地图预览">
          <div className="sun">☀</div>
          <div className="plane">✈</div>
          <div className="route route-one" />
          <div className="route route-two" />
          <div className="globe">
            <div className="continent continent-one" />
            <div className="continent continent-two" />
            <div className="continent continent-three" />
            <span className="pin pin-one">📍</span>
            <span className="pin pin-two">📍</span>
            <span className="pin pin-three">📍</span>
          </div>
          <div className="postcard postcard-paris"><span>🗼</span><b>PARIS</b></div>
          <div className="postcard postcard-tokyo"><span>🗻</span><b>TOKYO</b></div>
          <div className="luggage">🧳</div>
        </div>
      </section>

      <section className="setup-section" aria-labelledby="setup-title">
        <div className="section-heading">
          <div>
            <span className="step-label">STEP 01 · 召集旅伴</span>
            <h2 id="setup-title">今天谁一起出发？</h2>
          </div>
          <p>支持 2–6 人同屏，每个人都有自己的名字、颜色和旅行头像。</p>
        </div>

        <form onSubmit={startGame}>
          <div className="player-grid">
            {players.map((player, index) => {
              const color = PLAYER_COLORS.find((item) => item.id === player.color);
              return (
                <article
                  className="player-card"
                  key={player.id}
                  style={{ "--player-color": color?.hex ?? "#247ba0" } as React.CSSProperties}
                >
                  <div className="player-number">旅伴 {String(index + 1).padStart(2, "0")}</div>
                  <button
                    className="remove-player"
                    type="button"
                    onClick={() => removePlayer(player.id)}
                    disabled={players.length <= 2}
                    aria-label={`移除${player.name}`}
                  >
                    ×
                  </button>
                  <label className="avatar-picker">
                    <span className="sr-only">{player.name}的头像</span>
                    <select
                      value={player.avatar}
                      onChange={(event) => {
                        playUiSound("tap");
                        updatePlayer(player.id, { avatar: event.target.value });
                      }}
                    >
                      {PLAYER_AVATARS.map((avatar) => <option key={avatar}>{avatar}</option>)}
                    </select>
                    <span className="avatar-face" aria-hidden="true">{player.avatar}</span>
                    <span className="avatar-edit" aria-hidden="true">✎</span>
                  </label>
                  <label className="name-field">
                    <span>玩家名称</span>
                    <input
                      value={player.name}
                      maxLength={8}
                      onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
                      required
                      aria-label={`旅伴 ${index + 1} 的名称`}
                    />
                  </label>
                  <div className="color-row" aria-label="选择玩家颜色">
                    {PLAYER_COLORS.map((candidate) => (
                      <button
                        type="button"
                        key={candidate.id}
                        className={candidate.id === player.color ? "color-dot selected" : "color-dot"}
                        style={{ backgroundColor: candidate.hex }}
                        onClick={() => {
                          playUiSound("tap");
                          updatePlayer(player.id, { color: candidate.id });
                        }}
                        aria-label={candidate.label}
                        aria-pressed={candidate.id === player.color}
                      />
                    ))}
                  </div>
                  <label className={player.isChild ? "child-player-toggle active" : "child-player-toggle"}>
                    <input
                      type="checkbox"
                      checked={player.isChild}
                      onChange={(event) => {
                        playUiSound(event.target.checked ? "add" : "tap");
                        updatePlayer(player.id, { isChild: event.target.checked });
                      }}
                    />
                    <span>🧠</span><b>我是小朋友</b><i aria-hidden="true" />
                  </label>
                </article>
              );
            })}

            {players.length < 6 && (
              <button className="add-player" type="button" onClick={addPlayer}>
                <span>＋</span>
                <strong>再叫一位旅伴</strong>
                <small>最多 6 人</small>
              </button>
            )}
          </div>

          <div className="settings-grid">
            <fieldset className="setting-panel">
              <legend><span>💰</span> 旅费难度</legend>
              <div className="option-list">
                {ECONOMY_PRESETS.map((preset) => (
                  <label className={economy === preset.id ? "option-card selected" : "option-card"} key={preset.id}>
                    <input
                      type="radio"
                      name="economy"
                      value={preset.id}
                      checked={economy === preset.id}
                      onChange={() => { playUiSound("tap"); setEconomy(preset.id); }}
                    />
                    <span className="radio-mark" />
                    <span><strong>{preset.name}</strong><small>{preset.description}</small></span>
                    <b>¥{preset.startingCash.toLocaleString()}</b>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="setting-panel">
              <legend><span>⏱️</span> 今晚玩多久？</legend>
              <div className="option-list">
                {GAME_LENGTHS.map((length) => (
                  <label className={gameLength === length.id ? "option-card selected" : "option-card"} key={length.id}>
                    <input
                      type="radio"
                      name="length"
                      value={length.id}
                      checked={gameLength === length.id}
                      onChange={() => { playUiSound("tap"); setGameLength(length.id); }}
                    />
                    <span className="radio-mark" />
                    <span><strong>{length.name}</strong><small>{length.description}</small></span>
                  </label>
                ))}
              </div>
              <label className="voice-switch">
                <span><b>🎙️ 中文语音主持</b><small>轮到谁，就亲切地点名提醒</small></span>
                <input
                  type="checkbox"
                  checked={voiceEnabled}
                  onChange={(event) => { playUiSound("tap"); setVoiceEnabled(event.target.checked); }}
                />
                <i />
              </label>
            </fieldset>
          </div>

          <div className="settlement-note">
            <span className="settlement-icon">🏆</span>
            <div>
              <strong>有事要走？随时都能公平结算</strong>
              <p>总资产 = 现金 + 城市购买原价 + 房屋/旅馆原始投入。自动排行，冠军还有专属庆祝时刻！</p>
            </div>
            <span className="formula-chip">全部按原价</span>
          </div>

          <button className="primary-button" type="submit">
            <span>抽取先手 · 开始旅程</span>
            <b>→</b>
          </button>
        </form>
      </section>

      <section className="preview-section visible" id="journey-preview">
        <div className="preview-board">
          <div className="preview-map">
            <div className="preview-globe">🌎</div>
            <span className="dotted-orbit" />
            <div className="preview-title">
              <small>WORLD TOUR</small>
              <strong>{players.map((player) => player.avatar).join(" ")} 准备出发！</strong>
              <span>{selectedEconomy.name} · 每人 ¥{selectedEconomy.startingCash.toLocaleString()}</span>
            </div>
          </div>
          <div className="city-ribbon">
            {featuredCities.map((tile) => (
              <div key={tile.id} className={`mini-city region-${tile.type === "city" ? tile.region : "asia"}`}>
                <span>{tile.icon}</span>
                <b>{tile.name}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="foundation-summary">
          <span className="step-label">任务 02 · 玩家系统已就位</span>
          <h2>现在可以正式抽签出发了</h2>
          <p>
            进入旅程后会随机决定先手、自动交接回合并保存进度；任何时候都能按原价结算资产、查看排行和冠军庆祝。
            下一阶段会让棋盘真正出现，让棋子沿着世界城市逐格前进。
          </p>
          <div className="summary-numbers">
            <span><b>{players.length}</b> 位旅伴</span>
            <span><b>{BOARD_TILES.filter((tile) => tile.type === "city").length}</b> 座城市</span>
            <span><b>48</b> 张惊喜牌</span>
          </div>
        </div>
      </section>

      <footer>
        <span>🌍 环球大富翁 · 家庭专属版</span>
        <span>一起旅行，比输赢更重要</span>
      </footer>

      {homeRulesOpen && (
        <div className="modal-backdrop home-rules-backdrop" role="presentation">
          <section className="home-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="home-rules-title">
            <header><span>📖</span><div><small>开局前先看一分钟</small><h2 id="home-rules-title">环球大富翁怎么玩？</h2></div><button type="button" onClick={() => setHomeRulesOpen(false)} aria-label="关闭玩法说明">×</button></header>
            <div><article><i>🎱</i><b>双球相加向前走</b><small>两个小球都是 0–12，总和就是步数；小朋友先回答加法。</small></article><article><i>🏙️</i><b>买城市、建房和旅馆</b><small>回到自己的城市可从空地依次建四座房屋，最后升级旅馆。</small></article><article><i>🎈</i><b>抽机会与命运</b><small>卡牌自动结算，一轮牌袋抽完以前不会重复。</small></article><article><i>🏆</i><b>随时按原价结算</b><small>现金、城市原价与建筑原始投入相加，马上产生家庭排行榜。</small></article></div>
            <p>正式进入对局后还有 4 步图文引导，以及每座城市从空地到旅馆的完整租金表。</p>
            <button type="button" onClick={() => { playUiSound("success"); setHomeRulesOpen(false); document.querySelector("#setup-title")?.scrollIntoView({ behavior: "smooth" }); }}>明白了 · 去设置玩家 →</button>
          </section>
        </div>
      )}

      {iphoneGuideOpen && (
        <div className="modal-backdrop iphone-guide-backdrop" role="presentation">
          <section className="iphone-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="iphone-guide-title">
            <header><span>📱</span><div><small>IPHONE · 随身家庭版</small><h2 id="iphone-guide-title">以后直接从 iPhone 开始游戏</h2><p>首次打开一次后，可安装到主屏幕并缓存游戏；以后像普通 App 一样启动，不必一直带着电脑。</p></div><button type="button" onClick={() => setIphoneGuideOpen(false)} aria-label="关闭 iPhone 安装说明">×</button></header>
            <div className="iphone-guide-flow">
              <article><i>1</i><span><b>用 Safari 打开游戏网址</b><small>上线后我会给你一个固定地址。第一次需要联网打开完整页面。</small></span></article>
              <article><i>2</i><span><b>分享 → 添加到主屏幕</b><small>在 Safari 底部点分享图标，再选“添加到主屏幕”，名称保留“环球大富翁”。</small></span></article>
              <article><i>3</i><span><b>像 App 一样随时点开</b><small>完成首次缓存后，即使临时断网也能打开；对局只保存在你的 iPhone，不上传家庭记录。</small></span></article>
            </div>
            <div className="iphone-cast-note"><span>📺</span><p><b>投到安卓电视怎么办？</b><small>电视自带 AirPlay：直接用 iPhone 控制中心的“屏幕镜像”。电视没有 AirPlay：在电视应用商店安装 AirScreen 等 AirPlay 接收端，再从 iPhone 选择这台电视。</small></p></div>
            <div className="iphone-guide-actions"><button type="button" onClick={() => setIphoneGuideOpen(false)}>我知道了</button><button type="button" onClick={() => { setIphoneGuideOpen(false); document.querySelector("#setup-title")?.scrollIntoView({ behavior: "smooth" }); }}>去设置玩家 · 准备开局 →</button></div>
            <footer>投屏时 iPhone 继续负责麦克风和操作，请放在家人附近并保持横屏、不要锁屏。</footer>
          </section>
        </div>
      )}

      {restoreCandidate && (
        <div className="modal-backdrop" role="presentation">
          <section className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-title">
            <div className="restore-stamp">旅程存档</div>
            <span className="dialog-illustration">🗺️</span>
            <span className="step-label">欢迎回来</span>
            <h2 id="restore-title">发现上次还没走完的旅程</h2>
            <p>{restoreCandidate.players.map((player) => `${player.avatar}${player.name}`).join("、")} · 第 {restoreCandidate.round} 轮</p>
            <small>对局已安全保存在这台设备上，可以从上次轮到的玩家继续。</small>
            <div className="dialog-actions">
              <button type="button" onClick={() => { clearGameSession(); setRestoreCandidate(null); }}>重新召集旅伴</button>
              <button
                className="confirm-primary"
                type="button"
                onClick={() => {
                  playUiSound("success");
                  setFreshSession(false);
                  setSession(restoreCandidate);
                  setRestoreCandidate(null);
                }}
              >继续上次旅程</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
