"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UiSound = "tap" | "add" | "remove" | "success" | "spin" | "step" | "turn" | "arrival" | "purchase" | "upgrade" | "card" | "rent" | "reward";
type BrowserAudioContext = typeof AudioContext;

const MUSIC_PREFERENCE_KEY = "family-world-tour-music";
const EFFECTS_PREFERENCE_KEY = "family-world-tour-effects";

function getAudioContextConstructor(): BrowserAudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: BrowserAudioContext }).webkitAudioContext;
}

export function useGameAudio() {
  const [musicEnabled, setMusicEnabledState] = useState(true);
  const [effectsEnabled, setEffectsEnabledState] = useState(true);
  const [audioStarted, setAudioStarted] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const musicBusRef = useRef<GainNode | null>(null);
  const musicTimerRef = useRef<number | null>(null);
  const nextBarRef = useRef(0);
  const enabledRef = useRef(true);
  const effectsEnabledRef = useRef(true);

  const ensureContext = useCallback(() => {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) return null;

    if (!contextRef.current) {
      const context = new AudioContextConstructor();
      const musicBus = context.createGain();
      musicBus.gain.value = 0.0001;
      musicBus.connect(context.destination);
      contextRef.current = context;
      musicBusRef.current = musicBus;
    }

    const context = contextRef.current;
    if (context.state === "suspended") void context.resume();
    setAudioStarted(true);
    return context;
  }, []);

  const scheduleTone = useCallback((
    context: AudioContext,
    destination: AudioNode,
    frequency: number,
    startsAt: number,
    duration: number,
    volume: number,
    wave: OscillatorType = "sine",
  ) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    envelope.gain.setValueAtTime(0.0001, startsAt);
    envelope.gain.exponentialRampToValueAtTime(volume, startsAt + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + duration + 0.03);
  }, []);

  const scheduleMusicBar = useCallback((startsAt: number) => {
    const context = contextRef.current;
    const musicBus = musicBusRef.current;
    if (!context || !musicBus || !enabledRef.current) return;

    const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 783.99];
    const bass = [130.81, 174.61, 146.83, 196];
    melody.forEach((frequency, index) => {
      scheduleTone(context, musicBus, frequency, startsAt + index * 0.36, 0.24, 0.2, "sine");
    });
    bass.forEach((frequency, index) => {
      scheduleTone(context, musicBus, frequency, startsAt + index * 0.72, 0.52, 0.09, "triangle");
    });
    [0, 1.44].forEach((offset) => {
      scheduleTone(context, musicBus, 1046.5, startsAt + offset, 0.08, 0.045, "sine");
    });
  }, [scheduleTone]);

  const stopMusic = useCallback(() => {
    if (musicTimerRef.current !== null) {
      window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }
    const context = contextRef.current;
    const musicBus = musicBusRef.current;
    if (context && musicBus) {
      musicBus.gain.cancelScheduledValues(context.currentTime);
      musicBus.gain.setTargetAtTime(0.0001, context.currentTime, 0.08);
    }
  }, []);

  const startMusic = useCallback(() => {
    const context = ensureContext();
    const musicBus = musicBusRef.current;
    if (!context || !musicBus || !enabledRef.current || musicTimerRef.current !== null) return;

    musicBus.gain.cancelScheduledValues(context.currentTime);
    musicBus.gain.setTargetAtTime(0.32, context.currentTime, 0.22);
    nextBarRef.current = context.currentTime + 0.08;
    scheduleMusicBar(nextBarRef.current);
    nextBarRef.current += 2.88;
    musicTimerRef.current = window.setInterval(() => {
      const activeContext = contextRef.current;
      if (!activeContext || !enabledRef.current) return;
      while (nextBarRef.current < activeContext.currentTime + 1.2) {
        scheduleMusicBar(nextBarRef.current);
        nextBarRef.current += 2.88;
      }
    }, 850);
  }, [ensureContext, scheduleMusicBar]);

  const playUiSound = useCallback((sound: UiSound = "tap") => {
    if (!effectsEnabledRef.current) return;
    const context = ensureContext();
    if (!context) return;
    const output = context.createGain();
    output.gain.value = 0.4;
    output.connect(context.destination);
    const now = context.currentTime + 0.008;
    const patterns: Record<UiSound, Array<[number, number, number, OscillatorType]>> = {
      tap: [[740, 0, 0.09, "sine"], [980, 0.045, 0.08, "sine"]],
      add: [[523.25, 0, 0.1, "sine"], [659.25, 0.08, 0.1, "sine"], [783.99, 0.16, 0.14, "sine"]],
      remove: [[620, 0, 0.08, "triangle"], [420, 0.06, 0.13, "triangle"]],
      success: [[523.25, 0, 0.12, "sine"], [659.25, 0.1, 0.12, "sine"], [783.99, 0.2, 0.2, "sine"]],
      spin: [[440, 0, 0.08, "triangle"], [554.37, 0.07, 0.08, "triangle"], [659.25, 0.14, 0.08, "triangle"], [830.61, 0.21, 0.12, "sine"]],
      step: [[250, 0, 0.055, "square"], [520, 0.025, 0.075, "sine"]],
      turn: [[392, 0, 0.1, "triangle"], [523.25, 0.09, 0.12, "sine"], [783.99, 0.2, 0.2, "sine"]],
      arrival: [[659.25, 0, 0.1, "triangle"], [783.99, 0.09, 0.12, "sine"], [1046.5, 0.19, 0.18, "sine"]],
      purchase: [[523.25, 0, 0.09, "triangle"], [659.25, 0.07, 0.1, "triangle"], [987.77, 0.15, 0.22, "sine"]],
      upgrade: [[440, 0, 0.08, "square"], [659.25, 0.08, 0.1, "triangle"], [880, 0.17, 0.12, "sine"], [1174.66, 0.27, 0.2, "sine"]],
      card: [[587.33, 0, 0.08, "triangle"], [739.99, 0.06, 0.08, "triangle"], [932.33, 0.12, 0.12, "sine"], [1244.51, 0.22, 0.2, "sine"]],
      rent: [[880, 0, 0.08, "sine"], [659.25, 0.07, 0.09, "triangle"], [523.25, 0.15, 0.16, "triangle"]],
      reward: [[659.25, 0, 0.1, "sine"], [830.61, 0.08, 0.1, "sine"], [987.77, 0.16, 0.1, "sine"], [1318.51, 0.26, 0.24, "sine"]],
    };
    patterns[sound].forEach(([frequency, offset, duration, wave]) => {
      scheduleTone(context, output, frequency, now + offset, duration, 0.22, wave);
    });
  }, [ensureContext, scheduleTone]);

  const setEffectsEnabled = useCallback((enabled: boolean) => {
    effectsEnabledRef.current = enabled;
    setEffectsEnabledState(enabled);
    window.localStorage.setItem(EFFECTS_PREFERENCE_KEY, enabled ? "on" : "off");
    if (enabled) playUiSound("add");
  }, [playUiSound]);

  const setMusicEnabled = useCallback((enabled: boolean) => {
    enabledRef.current = enabled;
    setMusicEnabledState(enabled);
    window.localStorage.setItem(MUSIC_PREFERENCE_KEY, enabled ? "on" : "off");
    if (enabled) {
      playUiSound("add");
      startMusic();
    } else {
      playUiSound("tap");
      stopMusic();
    }
  }, [playUiSound, startMusic, stopMusic]);

  useEffect(() => {
    const enabled = window.localStorage.getItem(MUSIC_PREFERENCE_KEY) !== "off";
    const effects = window.localStorage.getItem(EFFECTS_PREFERENCE_KEY) !== "off";
    enabledRef.current = enabled;
    effectsEnabledRef.current = effects;
    setMusicEnabledState(enabled);
    setEffectsEnabledState(effects);

    const unlockAudio = () => {
      if (enabledRef.current) startMusic();
      else ensureContext();
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      stopMusic();
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, [ensureContext, startMusic, stopMusic]);

  return { musicEnabled, effectsEnabled, audioStarted, setMusicEnabled, setEffectsEnabled, playUiSound };
}
