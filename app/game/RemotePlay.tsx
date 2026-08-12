"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DataConnection, Peer } from "peerjs";
import { QRCodeSVG } from "qrcode.react";
import { parseSpokenNumber } from "./voice";

type Direction = "up" | "down" | "left" | "right";

type RemoteCommand =
  | { type: "navigate"; direction: Direction }
  | { type: "activate" }
  | { type: "primary" }
  | { type: "back" }
  | { type: "disconnect" }
  | { type: "answer"; value: number }
  | { type: "intent"; value: string }
  | { type: "voice"; transcript: string };

interface RemoteUiState {
  type: "state";
  activePlayer: string;
  title: string;
  detail: string;
  actions: string[];
  awaitingMathAnswer: boolean;
  players: Array<{
    id: string;
    name: string;
    avatar: string;
    cash: number;
    total: number;
    cities: Array<{ name: string; icon: string; building: string; rent: number; mortgaged: boolean }>;
  }>;
  cityOffer: null | {
    name: string;
    icon: string;
    price: number;
    baseRent: number;
    buildCost: number;
    cashAfter: number;
    kind: string;
  };
}

type RemoteHostMessage = RemoteUiState | { type: "disconnected" };

interface TelevisionRemoteHostProps {
  enabled: boolean;
  pairingOpen: boolean;
  onClosePairing: () => void;
  onExitTelevisionMode: () => void;
}

interface SpeechRecognitionResultLike extends ArrayLike<{ transcript: string }> {
  isFinal?: boolean;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorLike extends Event {
  error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const ROOM_STORAGE_KEY = "family-world-tour-tv-room";
const AUTO_VOICE_STORAGE_KEY = "family-world-tour-remote-auto-voice";
const PEER_PREFIX = "dafuweng-tv-";
const REMOTE_ANSWER_EVENT = "family-world-tour-remote-answer";
const REMOTE_CLOSE_OVERLAY_EVENT = "family-world-tour-remote-close-overlay";

function createRoomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(10_000_000 + (values[0] % 90_000_000));
}

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
}

function getFocusableElements() {
  return Array.from(document.querySelectorAll<HTMLElement>(
    "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
  )).filter((element) => !element.closest("[data-remote-ui]") && isVisible(element));
}

function clickFirstVisible(selectors: string[]) {
  for (const selector of selectors) {
    const target = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible);
    if (target) {
      target.focus({ preventScroll: false });
      target.click();
      return true;
    }
  }
  return false;
}

function clickButtonByText(pattern: RegExp) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
    .filter((button) => !button.closest("[data-remote-ui]") && isVisible(button));
  const target = buttons.find((button) => pattern.test(button.textContent?.replace(/\s+/g, "") ?? ""));
  if (!target) return false;
  target.focus({ preventScroll: false });
  target.click();
  return true;
}

function focusPrimaryAction() {
  return clickFirstVisible([
    ".player-assets-dialog > footer button:not(:disabled)",
    ".start-turn-button:not(:disabled)",
    ".economy-primary:not(:disabled)",
    ".family-card-face > button:not(:disabled)",
    ".financial-confirm-dialog button:last-child:not(:disabled)",
    ".dialog-actions .confirm-primary:not(:disabled)",
    ".dialog-actions button:last-child:not(:disabled)",
    ".onboarding-actions button:last-child:not(:disabled)",
    ".rules-dialog footer button:not(:disabled)",
    "form .primary-button[type='submit']:not(:disabled)",
  ]);
}

function moveFocus(direction: Direction) {
  const focusable = getFocusableElements();
  if (!focusable.length) return;
  const active = document.activeElement instanceof HTMLElement && focusable.includes(document.activeElement)
    ? document.activeElement
    : null;
  if (!active) {
    focusable[0].focus({ preventScroll: false });
    return;
  }
  const origin = active.getBoundingClientRect();
  const originX = origin.left + origin.width / 2;
  const originY = origin.top + origin.height / 2;
  let best: { element: HTMLElement; score: number } | null = null;
  for (const element of focusable) {
    if (element === active) continue;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const dx = x - originX;
    const dy = y - originY;
    const forward = direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
    if (forward <= 4) continue;
    const cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = forward + cross * 2.6;
    if (!best || score < best.score) best = { element, score };
  }
  best?.element.focus({ preventScroll: false });
}

export function useTelevisionRemoteNavigation() {
  useEffect(() => {
    const handleRemoteKey = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      const directions: Partial<Record<string, Direction>> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const legacyDirections: Partial<Record<number, Direction>> = {
        37: "left",
        38: "up",
        39: "right",
        40: "down",
      };
      const direction = directions[event.key] ?? legacyDirections[event.keyCode];
      if (direction && !isEditing) {
        event.preventDefault();
        moveFocus(direction);
        return;
      }
      if ((event.key === "Enter" || event.key === "Select" || event.keyCode === 13) && document.activeElement === document.body) {
        event.preventDefault();
        getFocusableElements()[0]?.focus({ preventScroll: false });
        return;
      }
      if (event.key === "GoBack" || event.key === "Back" || event.key === "BrowserBack" || event.keyCode === 461 || event.keyCode === 10009) {
        event.preventDefault();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
    };
    window.addEventListener("keydown", handleRemoteKey);
    return () => window.removeEventListener("keydown", handleRemoteKey);
  }, []);
}

function runIntent(value: string) {
  if (value === "close" && clickFirstVisible(["[data-remote-close-player-assets]", ".player-assets-dialog > footer button:not(:disabled)"])) return;
  const intentPatterns: Record<string, RegExp> = {
    purchase: /购买|买下|确认购买/,
    upgrade: /升级|建房|建造/,
    giveup: /放弃|暂不购买|结束回合|不用了/,
    assets: /管理资产|查看资产|资产中心/,
    confirm: /确认|确定支付|确认执行|继续旅行/,
    continue: /继续|知道了|看完了|下一步|开始旅程|开始前进/,
    settlement: /结算|排行榜/,
    close: /关闭|返回|取消|稍后/,
  };
  const pattern = intentPatterns[value];
  if (pattern && clickButtonByText(pattern)) return;
  if (value === "close") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  else if (value === "continue" || value === "confirm") focusPrimaryAction();
}

function handleVoiceTranscript(transcript: string) {
  const answer = parseSpokenNumber(transcript);
  if (answer !== null && clickButtonByText(new RegExp(`^${answer}$`))) return;
  if (/买|购买/.test(transcript)) runIntent("purchase");
  else if (/升级|建房|旅馆/.test(transcript)) runIntent("upgrade");
  else if (/资产|卖房|卖地|抵押|赎回/.test(transcript)) runIntent("assets");
  else if (/放弃|不要|不用|结束/.test(transcript)) runIntent("giveup");
  else if (/返回|取消|关闭|看完|知道了|^×$/.test(transcript)) runIntent("close");
  else if (/结算|排行/.test(transcript)) runIntent("settlement");
  else if (/继续|开始|出发|确认|确定|可以|好/.test(transcript)) runIntent("continue");
}

function handleRemoteCommand(command: RemoteCommand) {
  if (command.type === "navigate") moveFocus(command.direction);
  else if (command.type === "activate") {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.click();
    else focusPrimaryAction();
  } else if (command.type === "primary") focusPrimaryAction();
  else if (command.type === "back") {
    window.dispatchEvent(new CustomEvent(REMOTE_CLOSE_OVERLAY_EVENT));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  else if (command.type === "answer") {
    window.dispatchEvent(new CustomEvent(REMOTE_ANSWER_EVENT, { detail: command.value }));
  }
  else if (command.type === "intent") runIntent(command.value);
  else if (command.type === "voice") handleVoiceTranscript(command.transcript);
}

function readText(selectors: string[]) {
  for (const selector of selectors) {
    const element = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible);
    const text = element?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

function collectUiState(): RemoteUiState {
  const actions = Array.from(document.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
    .filter((button) => !button.closest("[data-remote-ui]") && isVisible(button))
    .map((button) => button.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter(Boolean)
    .slice(0, 8);
  const serializedGameState = document.querySelector<HTMLElement>("[data-remote-game-state]")?.dataset.remoteGameState;
  let gameState: Pick<RemoteUiState, "players" | "cityOffer"> = { players: [], cityOffer: null };
  if (serializedGameState) {
    try {
      gameState = JSON.parse(serializedGameState) as Pick<RemoteUiState, "players" | "cityOffer">;
    } catch {
      // Keep basic remote controls working if state serialization is unavailable.
    }
  }
  return {
    type: "state",
    activePlayer: readText([".current-player-card h1", ".rail-player.active .rail-name b"]),
    title: readText(["[role='dialog'] h2", ".classic-turn-copy h2", ".turn-phase-copy b", ".setup-section h2"]),
    detail: readText(["[role='dialog'] p", ".classic-turn-copy p", ".turn-phase-copy span", ".section-heading p"]),
    actions,
    awaitingMathAnswer: Boolean(document.querySelector(".game-shell.phase-answering .math-answer-panel")),
    ...gameState,
  };
}

function isRemoteCommand(value: unknown): value is RemoteCommand {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return ["navigate", "activate", "primary", "back", "disconnect", "answer", "intent", "voice"].includes(String(value.type));
}

export function TelevisionRemoteHost({ enabled, pairingOpen, onClosePairing, onExitTelevisionMode }: TelevisionRemoteHostProps) {
  const [roomCode, setRoomCode] = useState(() => {
    if (typeof window === "undefined") return "";
    const stored = window.sessionStorage.getItem(ROOM_STORAGE_KEY);
    return stored && /^\d{8}$/.test(stored) ? stored : createRoomCode();
  });
  const [status, setStatus] = useState<"starting" | "ready" | "connected" | "error">("starting");
  const [controllerName, setControllerName] = useState("iPhone");
  const connectionRef = useRef<DataConnection | null>(null);
  const onClosePairingRef = useRef(onClosePairing);

  useEffect(() => {
    onClosePairingRef.current = onClosePairing;
  }, [onClosePairing]);

  useEffect(() => {
    if (!enabled) return;
    document.body.classList.add("remote-tv-mode");
    return () => document.body.classList.remove("remote-tv-mode");
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !roomCode) return;
    window.sessionStorage.setItem(ROOM_STORAGE_KEY, roomCode);
    let disposed = false;
    let peer: Peer | null = null;
    const bindConnection = (connection: DataConnection) => {
      connectionRef.current?.close();
      connectionRef.current = connection;
      connection.on("open", () => {
        if (disposed) return;
        setControllerName(String(connection.metadata && typeof connection.metadata === "object" && "device" in connection.metadata ? connection.metadata.device : "iPhone"));
        setStatus("connected");
        connection.send(collectUiState());
        window.setTimeout(() => onClosePairingRef.current(), 650);
        window.setTimeout(() => getFocusableElements()[0]?.focus({ preventScroll: false }), 120);
      });
      connection.on("data", (data) => {
        if (!isRemoteCommand(data)) return;
        if (data.type === "disconnect") {
          connection.close();
          if (connectionRef.current === connection) connectionRef.current = null;
          setStatus("ready");
          return;
        }
        handleRemoteCommand(data);
        window.setTimeout(() => connection.open && connection.send(collectUiState()), 120);
      });
      connection.on("close", () => {
        if (!disposed) setStatus("ready");
      });
      connection.on("error", () => {
        if (!disposed) setStatus("error");
      });
    };

    import("peerjs").then(({ Peer: PeerConstructor }) => {
      if (disposed) return;
      peer = new PeerConstructor(`${PEER_PREFIX}${roomCode}`, { debug: 1 });
      peer.on("open", () => !disposed && setStatus("ready"));
      peer.on("connection", bindConnection);
      peer.on("error", (error) => {
        if (disposed) return;
        if (error.type === "unavailable-id") {
          const nextCode = createRoomCode();
          window.sessionStorage.setItem(ROOM_STORAGE_KEY, nextCode);
          setRoomCode(nextCode);
        } else setStatus("error");
      });
    }).catch(() => setStatus("error"));

    const stateTimer = window.setInterval(() => {
      if (connectionRef.current?.open) connectionRef.current.send(collectUiState());
    }, 900);
    return () => {
      disposed = true;
      window.clearInterval(stateTimer);
      connectionRef.current?.close();
      connectionRef.current = null;
      peer?.destroy();
    };
  }, [enabled, roomCode]);

  const controllerUrl = useMemo(() => {
    if (!roomCode || typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("controller", roomCode);
    return url.toString();
  }, [roomCode]);

  const disconnectController = () => {
    const connection = connectionRef.current;
    if (!connection) return;
    if (connection.open) connection.send({ type: "disconnected" } satisfies RemoteHostMessage);
    window.setTimeout(() => {
      connection.close();
      if (connectionRef.current === connection) connectionRef.current = null;
      setStatus("ready");
    }, 120);
  };

  if (!enabled || !roomCode) return null;
  const showPairing = pairingOpen;
  return (
    <>
      {showPairing && (
        <div className="remote-pairing-backdrop" data-remote-ui role="presentation">
          <section className="remote-pairing-dialog" role="dialog" aria-modal="true" aria-labelledby="remote-pairing-title">
            <header><span>📺</span><div><small>电视独立显示 · iPhone 遥控</small><h2 id="remote-pairing-title">用 iPhone 扫码连接</h2><p>不是投屏。电视保持 16:9 画面，操作和麦克风都留在 iPhone。</p></div><button type="button" onClick={onClosePairing} aria-label="关闭连接窗口">×</button></header>
            <div className="remote-pairing-main">
              <div className="remote-qr">{controllerUrl && <QRCodeSVG value={controllerUrl} size={248} level="M" marginSize={2} />}</div>
              <div className="remote-pairing-copy"><span className={`remote-link-state state-${status}`}><i />{status === "connected" ? `${controllerName} 已连接` : status === "ready" ? "等待 iPhone 连接" : status === "error" ? "连接服务暂时不可用" : "正在建立房间"}</span><small>房间码用于确认 iPhone 连到的是这台电视</small><b>{roomCode.slice(0, 4)}&nbsp;{roomCode.slice(4)}</b><ol><li>iPhone 打开“相机”扫描二维码</li><li>Safari 遥控页面会自动连接电视</li><li>之后用手机按钮或语音操作整局</li></ol></div>
            </div>
            <footer><span>手机和电视建议连接同一个 Wi-Fi</span><div><button type="button" onClick={status === "connected" ? onClosePairing : onExitTelevisionMode}>{status === "connected" ? "返回游戏" : "退出电视模式"}</button>{status === "connected" && <button className="remote-disconnect-button" type="button" onClick={disconnectController}>断开手机</button>}</div></footer>
          </section>
        </div>
      )}
      <button className={`remote-tv-badge state-${status}`} data-remote-ui type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-tv-remote"))}><i />{status === "connected" ? `${controllerName} 遥控中` : `房间 ${roomCode}`}</button>
    </>
  );
}

interface RemoteControllerScreenProps { roomCode: string; }

export function RemoteControllerScreen({ roomCode }: RemoteControllerScreenProps) {
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "disconnected" | "error">("connecting");
  const [uiState, setUiState] = useState<RemoteUiState>({ type: "state", activePlayer: "", title: "等待电视画面", detail: "", actions: [], awaitingMathAnswer: false, players: [], cityOffer: null });
  const [assetPlayerId, setAssetPlayerId] = useState("");
  const [assetViewerOpen, setAssetViewerOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("点麦克风后说：继续、购买、升级或数字答案");
  const [autoVoice, setAutoVoice] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [answerDrawerOpen, setAnswerDrawerOpen] = useState(false);
  const connectionRef = useRef<DataConnection | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const autoVoiceRef = useRef(autoVoice);
  const microphoneEnabledRef = useRef(false);
  const voiceRestartTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const manuallyDisconnectedRef = useRef(false);
  const answerDrawerRef = useRef<HTMLDetailsElement | null>(null);
  const answerReturnScrollRef = useRef<number | null>(null);
  const autoAnchoredAnswerRef = useRef(false);

  const clearVoiceRestart = () => {
    if (voiceRestartTimerRef.current !== null) window.clearTimeout(voiceRestartTimerRef.current);
    voiceRestartTimerRef.current = null;
  };

  const releaseMicrophone = (message = "麦克风已关闭，需要时请点“打开麦克风”") => {
    microphoneEnabledRef.current = false;
    autoVoiceRef.current = false;
    setMicrophoneEnabled(false);
    setAutoVoice(false);
    window.localStorage.setItem(AUTO_VOICE_STORAGE_KEY, "off");
    clearVoiceRestart();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.abort();
    } catch {
      // Safari can throw if recognition ended immediately before abort().
    }
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
    setVoiceStatus(message);
  };

  useEffect(() => {
    let disposed = false;
    let peer: Peer | null = null;
    let reconnectTimer: number | null = null;
    const connect = () => {
      if (!peer || peer.destroyed || disposed) return;
      setStatus((current) => current === "connected" ? current : "connecting");
      const connection = peer.connect(`${PEER_PREFIX}${roomCode}`, { reliable: true, metadata: { device: "iPhone" } });
      connectionRef.current = connection;
      connection.on("open", () => !disposed && setStatus("connected"));
      connection.on("data", (data) => {
        if (!data || typeof data !== "object" || !("type" in data)) return;
        if (data.type === "state") setUiState(data as RemoteUiState);
        if (data.type === "disconnected") {
          manuallyDisconnectedRef.current = true;
          setStatus("disconnected");
          connection.close();
        }
      });
      connection.on("close", () => {
        if (disposed) return;
        if (manuallyDisconnectedRef.current) {
          setStatus("disconnected");
          return;
        }
        setStatus("reconnecting");
        reconnectTimer = window.setTimeout(connect, 1200);
      });
      connection.on("error", () => !disposed && setStatus("reconnecting"));
    };
    import("peerjs").then(({ Peer: PeerConstructor }) => {
      if (disposed) return;
      peer = new PeerConstructor({ debug: 1 });
      peer.on("open", connect);
      peer.on("disconnected", () => {
        if (!disposed && peer && !peer.destroyed) {
          setStatus("reconnecting");
          peer.reconnect();
        }
      });
      peer.on("error", () => !disposed && setStatus("error"));
    }).catch(() => setStatus("error"));
    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      clearVoiceRestart();
      microphoneEnabledRef.current = false;
      autoVoiceRef.current = false;
      try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
      recognitionRef.current = null;
      wakeLockRef.current?.release().catch(() => undefined);
      connectionRef.current?.close();
      peer?.destroy();
    };
  }, [roomCode]);

  const send = (command: RemoteCommand) => {
    if (!connectionRef.current?.open) {
      setStatus("reconnecting");
      return;
    }
    connectionRef.current.send(command);
  };

  const disconnect = () => {
    manuallyDisconnectedRef.current = true;
    releaseMicrophone("麦克风已关闭，正在断开电视连接");
    if (connectionRef.current?.open) connectionRef.current.send({ type: "disconnect" });
    window.setTimeout(() => connectionRef.current?.close(), 120);
    setStatus("disconnected");
  };

  const leaveController = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("controller");
    window.location.assign(url.toString());
  };

  const requestWakeLock = async () => {
    const navigatorWithWakeLock = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (!navigatorWithWakeLock.wakeLock || document.visibilityState !== "visible") return;
    try {
      wakeLockRef.current = await navigatorWithWakeLock.wakeLock.request("screen");
    } catch {
      // iOS may decline wake lock in low-power mode; voice remains usable.
    }
  };

  const startVoice = (automatic = autoVoiceRef.current) => {
    if (document.visibilityState !== "visible") {
      releaseMicrophone("页面进入后台，麦克风已自动关闭");
      return;
    }
    const browserWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus("当前 Safari 不支持网页语音识别，请使用下方按钮和数字键盘");
      return;
    }
    clearVoiceRestart();
    try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = automatic;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result?.[0]?.transcript?.trim() ?? "";
      if (!transcript) return;
      setVoiceStatus(`听到：“${transcript}”`);
      send({ type: "voice", transcript });
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        microphoneEnabledRef.current = false;
        setMicrophoneEnabled(false);
        autoVoiceRef.current = false;
        setAutoVoice(false);
        window.localStorage.setItem(AUTO_VOICE_STORAGE_KEY, "off");
        setVoiceStatus("请在 Safari 地址栏设置中允许麦克风");
      } else {
        setVoiceStatus(automatic ? "倾听短暂中断，正在自动恢复…" : "没有听清，请再说一次");
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (automatic && autoVoiceRef.current && microphoneEnabledRef.current && document.visibilityState === "visible") {
        clearVoiceRestart();
        voiceRestartTimerRef.current = window.setTimeout(() => {
          if (autoVoiceRef.current && microphoneEnabledRef.current && document.visibilityState === "visible") startVoice(true);
        }, 500);
      } else if (!automatic && microphoneEnabledRef.current) {
        microphoneEnabledRef.current = false;
        setMicrophoneEnabled(false);
        setVoiceStatus("本次倾听已结束，需要时可再次打开麦克风");
      }
    };
    recognitionRef.current = recognition;
    microphoneEnabledRef.current = true;
    setMicrophoneEnabled(true);
    setVoiceStatus(automatic ? "自动倾听中，可以直接说操作或数字…" : "正在听，请说出操作或数字…");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      microphoneEnabledRef.current = false;
      setMicrophoneEnabled(false);
      setVoiceStatus("麦克风正在忙，请稍后再试");
    }
  };

  const changeAutoVoice = (enabled: boolean) => {
    autoVoiceRef.current = enabled;
    setAutoVoice(enabled);
    window.localStorage.setItem(AUTO_VOICE_STORAGE_KEY, enabled ? "on" : "off");
    clearVoiceRestart();
    if (enabled) {
      microphoneEnabledRef.current = true;
      setMicrophoneEnabled(true);
      setVoiceStatus("正在开启自动倾听…");
      void requestWakeLock();
      startVoice(true);
    } else {
      releaseMicrophone("自动倾听和麦克风均已关闭，需要时请重新打开");
    }
  };

  useEffect(() => {
    window.localStorage.setItem(AUTO_VOICE_STORAGE_KEY, "off");
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") releaseMicrophone("页面进入后台，麦克风已自动关闭");
    };
    const stopWhenLeaving = () => releaseMicrophone("页面已离开，麦克风已关闭");
    document.addEventListener("visibilitychange", stopWhenHidden);
    window.addEventListener("pagehide", stopWhenLeaving);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      window.removeEventListener("pagehide", stopWhenLeaving);
    };
    // This lifetime guard intentionally owns the current release function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const shouldAnchor = uiState.awaitingMathAnswer && !microphoneEnabled;
    if (shouldAnchor && !autoAnchoredAnswerRef.current) {
      autoAnchoredAnswerRef.current = true;
      answerReturnScrollRef.current = window.scrollY;
      setAnswerDrawerOpen(true);
      window.setTimeout(() => answerDrawerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
      return;
    }
    if (!uiState.awaitingMathAnswer && autoAnchoredAnswerRef.current) {
      autoAnchoredAnswerRef.current = false;
      setAnswerDrawerOpen(false);
      const returnY = answerReturnScrollRef.current;
      answerReturnScrollRef.current = null;
      if (returnY !== null) window.setTimeout(() => window.scrollTo({ top: returnY, behavior: "smooth" }), 80);
    }
  }, [uiState.awaitingMathAnswer, microphoneEnabled]);

  const sendAnswer = (value: number) => {
    send({ type: "answer", value });
    setVoiceStatus(`已把答案 ${value} 发送到电视`);
  };

  const selectedAssetPlayer = uiState.players.find((player) => player.id === assetPlayerId)
    ?? uiState.players.find((player) => uiState.activePlayer.includes(player.name))
    ?? uiState.players[0];

  return (
    <main className="iphone-remote-shell" data-remote-ui>
      <header className="iphone-remote-header"><span>🌍</span><div><small>环球大富翁 · iPhone 遥控器</small><b>{status === "connected" ? "已连接客厅电视" : status === "disconnected" ? "已断开电视" : status === "error" ? "暂时无法连接" : "正在连接电视…"}</b></div><i className={`state-${status}`} /></header>
      {status === "disconnected" && <section className="iphone-disconnected"><span>👋</span><div><b>手机已与电视断开</b><small>电视端可以重新显示二维码，之后仍可再次连接。</small></div><button type="button" onClick={() => window.location.reload()}>重新连接</button><button type="button" onClick={leaveController}>返回游戏首页</button></section>}
      {uiState.players.length > 0 && <nav className="iphone-player-strip" aria-label="点击玩家查看资产">{uiState.players.map((player) => <button type="button" key={player.id} onClick={() => { setAssetPlayerId(player.id); setAssetViewerOpen(true); }}><span>{player.avatar}</span><b>{player.name}</b><small>¥{player.total.toLocaleString()}</small></button>)}</nav>}
      <section className="iphone-remote-now"><small>{uiState.activePlayer || "电视房间"}</small><h1>{uiState.title}</h1><p>{uiState.detail || `房间码 ${roomCode}`}</p></section>
      {uiState.cityOffer && (
        <section className="iphone-game-info" aria-label="玩家与城市资产信息">
          {uiState.cityOffer && <article className="iphone-city-offer"><span>{uiState.cityOffer.icon}</span><div><small>{uiState.cityOffer.kind === "purchase" ? "当前购买机会" : "当前城市信息"}</small><b>{uiState.cityOffer.name}</b><p>售价 ¥{uiState.cityOffer.price.toLocaleString()} · 基础租金 ¥{uiState.cityOffer.baseRent.toLocaleString()} · 建设 ¥{uiState.cityOffer.buildCost.toLocaleString()}</p><em className={uiState.cityOffer.cashAfter < 0 ? "negative" : ""}>{uiState.cityOffer.cashAfter >= 0 ? `购买后剩余 ¥${uiState.cityOffer.cashAfter.toLocaleString()}` : `现金还差 ¥${Math.abs(uiState.cityOffer.cashAfter).toLocaleString()}`}</em></div></article>}
        </section>
      )}
      {assetViewerOpen && selectedAssetPlayer && <div className="iphone-assets-backdrop" role="presentation" onClick={() => setAssetViewerOpen(false)}><section className="iphone-assets-dialog" role="dialog" aria-modal="true" aria-label={`${selectedAssetPlayer.name}的资产`} onClick={(event) => event.stopPropagation()}><header><span>{selectedAssetPlayer.avatar}</span><div><small>玩家资产</small><b>{selectedAssetPlayer.name}</b></div><button type="button" onClick={() => setAssetViewerOpen(false)} aria-label="关闭资产信息">×</button></header><div className="iphone-player-tabs">{uiState.players.map((player) => <button className={selectedAssetPlayer.id === player.id ? "active" : ""} type="button" key={player.id} onClick={() => setAssetPlayerId(player.id)}>{player.avatar} {player.name}</button>)}</div><article className="iphone-player-assets"><header><strong>总资产 ¥{selectedAssetPlayer.total.toLocaleString()}</strong></header><div className="iphone-asset-totals"><span><small>现金</small><b>¥{selectedAssetPlayer.cash.toLocaleString()}</b></span><span><small>城镇</small><b>{selectedAssetPlayer.cities.length} 座</b></span></div><div className="iphone-owned-cities">{selectedAssetPlayer.cities.length > 0 ? selectedAssetPlayer.cities.map((city) => <span key={city.name}><i>{city.icon}</i><b>{city.name}</b><small>{city.mortgaged ? "已抵押" : city.building} · 租金 ¥{city.rent.toLocaleString()}</small></span>) : <p>还没有城市资产</p>}</div></article></section></div>}
      <button className="iphone-remote-primary" type="button" onClick={() => send({ type: "primary" })}><span>当前主要操作</span><b>开始 / 继续 / 确认</b></button>
      <section className="iphone-remote-intents" aria-label="常用游戏操作"><button type="button" onClick={() => send({ type: "intent", value: "purchase" })}>🏙️ 购买</button><button type="button" onClick={() => send({ type: "intent", value: "upgrade" })}>🏠 升级</button><button type="button" onClick={() => send({ type: "intent", value: "assets" })}>💰 资产</button><button type="button" onClick={() => send({ type: "intent", value: "giveup" })}>↪ 放弃</button></section>
      <section className="iphone-remote-navigation" aria-label="电视遥控方向键"><button className="up" type="button" onClick={() => send({ type: "navigate", direction: "up" })}>▲</button><button className="left" type="button" onClick={() => send({ type: "navigate", direction: "left" })}>◀</button><button className="ok" type="button" onClick={() => send({ type: "activate" })}>确定</button><button className="right" type="button" onClick={() => send({ type: "navigate", direction: "right" })}>▶</button><button className="down" type="button" onClick={() => send({ type: "navigate", direction: "down" })}>▼</button></section>
      <div className="iphone-remote-secondary"><button type="button" onClick={() => send({ type: "back" })}>← 返回</button><button className={microphoneEnabled ? "iphone-voice-button microphone-on" : "iphone-voice-button"} type="button" aria-pressed={microphoneEnabled} onClick={() => microphoneEnabled ? releaseMicrophone() : startVoice(autoVoiceRef.current)}>🎙️ {microphoneEnabled ? "关闭麦克风" : "打开麦克风"}</button></div>
      <label className={autoVoice ? "iphone-auto-voice active" : "iphone-auto-voice"} htmlFor="iphone-auto-voice" aria-label="自动倾听">
        <span><b>🎧 自动倾听</b><small>{autoVoice ? "手机放在桌上即可，识别结束会自动继续" : "关闭时，每次需要手动点“说话操作”"}</small></span>
        <input id="iphone-auto-voice" type="checkbox" checked={autoVoice} onChange={(event) => changeAutoVoice(event.target.checked)} />
        <i aria-hidden="true" />
      </label>
      <p className="iphone-voice-status">{voiceStatus}</p>
      <details ref={answerDrawerRef} className={uiState.awaitingMathAnswer && !microphoneEnabled ? "iphone-answer-drawer answering" : "iphone-answer-drawer"} open={answerDrawerOpen} onToggle={(event) => setAnswerDrawerOpen(event.currentTarget.open)}><summary>{uiState.awaitingMathAnswer ? "请选择计算出的数字 0–24" : "数字答案 0–24"}</summary><div>{Array.from({ length: 25 }, (_, value) => <button type="button" key={value} onClick={() => sendAnswer(value)}>{value}</button>)}</div></details>
      {uiState.actions.length > 0 && <section className="iphone-remote-actions"><small>电视当前可执行</small><div>{uiState.actions.map((action, index) => <button type="button" key={`${action}-${index}`} onClick={() => send({ type: "voice", transcript: action })}>{action}</button>)}</div></section>}
      <footer><span>房间 {roomCode.slice(0, 4)} {roomCode.slice(4)} · 电视与 iPhone 不传输画面，只同步操作</span>{status === "connected" && <button type="button" onClick={disconnect}>断开电视连接</button>}</footer>
    </main>
  );
}
