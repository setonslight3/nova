import { UserSettings } from '../types/nova';

export type VoiceModeState = 'off' | 'standby_wake' | 'awake_listening' | 'manual_listening' | 'unsupported';

export interface VoiceCallbacks {
  onStateChange: (state: VoiceModeState) => void;
  onInterimTranscript: (text: string) => void;
  onCommandCaptured: (command: string, triggeredByWakeWord: boolean) => void;
  onWakeTriggered: (wakePhrase: string) => void;
  onError: (msg: string) => void;
}

// Minimal Web Speech API typing
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

/**
 * Plays a pleasant, non-intrusive ascending two-note wake chime via Web Audio API.
 */
export function playWakeChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [523.25, 783.99]; // C5 -> G5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.001, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.09 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // Ignore audio context restriction
  }
}

/**
 * Checks whether a spoken transcript contains an enabled wake word ("Hey Nova" / "Hi Nova" / custom)
 * and extracts any trailing command spoken after the wake word.
 */
export function detectWakeWordInTranscript(
  transcript: string,
  settings: UserSettings
): { matched: boolean; wakeLabel: string; commandAfterWake: string } {
  const normalized = transcript.trim();
  if (!normalized) return { matched: false, wakeLabel: '', commandAfterWake: '' };

  const patterns: Array<{ label: string; regex: RegExp }> = [];

  if (settings.allowHeyNova) {
    // Include common Web Speech phonetic transcriptions for "Hey Nova"
    patterns.push({
      label: 'Hey Nova',
      regex: /\b(?:hey|hay|hei)\s+(?:nova|noah|nora|over|rover|mova|novah)\b[,!.\s]*(.*)/i,
    });
  }

  if (settings.allowHiNova) {
    patterns.push({
      label: 'Hi Nova',
      regex: /\b(?:hi|high|hello)\s+(?:nova|noah|nora|over|rover|mova|novah)\b[,!.\s]*(.*)/i,
    });
  }

  if (settings.customWakePhrase.trim().length >= 3) {
    const escaped = settings.customWakePhrase
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    patterns.push({
      label: settings.customWakePhrase.trim(),
      regex: new RegExp(`\\b${escaped}\\b[,!.\\s]*(.*)`, 'i'),
    });
  }

  for (const p of patterns) {
    const match = normalized.match(p.regex);
    if (match) {
      return {
        matched: true,
        wakeLabel: p.label,
        commandAfterWake: (match[1] || '').trim(),
      };
    }
  }

  return { matched: false, wakeLabel: '', commandAfterWake: '' };
}

export class NovaVoiceController {
  private recognition: SpeechRecognitionLike | null = null;
  private settings: UserSettings;
  private callbacks: VoiceCallbacks;
  private mode: VoiceModeState = 'off';
  private shouldKeepRunning = false;
  private isSpeakingTts = false;
  private silenceTimer: number | null = null;
  private awakeTimeoutTimer: number | null = null;
  private restartTimer: number | null = null;
  private capturedBuffer = '';
  private permissionBlocked = false;

  constructor(settings: UserSettings, callbacks: VoiceCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
  }

  public updateSettings(next: UserSettings): void {
    const prevWake = this.settings.wakeWordEnabled && this.settings.voiceEnabled;
    const prevLang = this.settings.voiceLanguage;
    this.settings = next;
    const nextWake = next.wakeWordEnabled && next.voiceEnabled;

    if (!next.voiceEnabled) {
      this.stopAll();
      return;
    }

    if (nextWake && (!prevWake || prevLang !== next.voiceLanguage || this.mode === 'off')) {
      this.permissionBlocked = false;
      this.startWakeWordStandby();
    } else if (!nextWake && (this.mode === 'standby_wake' || this.mode === 'awake_listening')) {
      this.stopAll();
    }
  }

  public startWakeWordStandby(): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.setMode('unsupported');
      return;
    }
    if (!this.settings.voiceEnabled || !this.settings.wakeWordEnabled || this.permissionBlocked) {
      this.setMode('off');
      return;
    }

    this.clearTimers();
    this.shouldKeepRunning = true;
    this.capturedBuffer = '';
    this.setMode('standby_wake');
    this.bootRecognitionInstance(true);
  }

  public startManualVoiceCapture(): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.setMode('unsupported');
      this.callbacks.onError('Voice recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    this.permissionBlocked = false;
    this.clearTimers();
    this.stopCurrentInstance();
    this.shouldKeepRunning = false;
    this.capturedBuffer = '';
    if (this.settings.wakeChimeEnabled) playWakeChime();
    this.setMode('manual_listening');
    this.bootRecognitionInstance(false);
  }

  public stopManualOrAwakeCapture(): void {
    this.clearTimers();
    if (this.capturedBuffer.trim()) {
      const cmd = this.capturedBuffer.trim();
      this.capturedBuffer = '';
      this.callbacks.onInterimTranscript('');
      this.callbacks.onCommandCaptured(cmd, this.mode === 'awake_listening');
    }
    if (this.settings.voiceEnabled && this.settings.wakeWordEnabled && !this.permissionBlocked) {
      this.startWakeWordStandby();
    } else {
      this.stopAll();
    }
  }

  public stopAll(): void {
    this.shouldKeepRunning = false;
    this.clearTimers();
    this.capturedBuffer = '';
    this.callbacks.onInterimTranscript('');
    this.stopCurrentInstance();
    this.setMode('off');
  }

  public speakReply(text: string): void {
    if (!this.settings.voiceReplyTts || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_#`→✓]/g, '').slice(0, 260);
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = this.settings.voiceLanguage || 'en-NG';
      utterance.rate = 1.03;

      this.isSpeakingTts = true;
      if (this.mode === 'standby_wake') {
        this.stopCurrentInstance();
      }

      const resumeAfterSpeech = () => {
        this.isSpeakingTts = false;
        if (this.settings.voiceEnabled && this.settings.wakeWordEnabled && !this.permissionBlocked) {
          this.startWakeWordStandby();
        }
      };

      utterance.onend = resumeAfterSpeech;
      utterance.onerror = resumeAfterSpeech;
      window.speechSynthesis.speak(utterance);
    } catch {
      this.isSpeakingTts = false;
    }
  }

  private setMode(next: VoiceModeState): void {
    this.mode = next;
    this.callbacks.onStateChange(next);
  }

  private clearTimers(): void {
    if (this.silenceTimer) window.clearTimeout(this.silenceTimer);
    if (this.awakeTimeoutTimer) window.clearTimeout(this.awakeTimeoutTimer);
    if (this.restartTimer) window.clearTimeout(this.restartTimer);
    this.silenceTimer = null;
    this.awakeTimeoutTimer = null;
    this.restartTimer = null;
  }

  private stopCurrentInstance(): void {
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.abort();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
  }

  private scheduleCommandCommit(triggeredByWakeWord: boolean, delayMs = 1500): void {
    if (this.silenceTimer) window.clearTimeout(this.silenceTimer);
    this.silenceTimer = window.setTimeout(() => {
      const cmd = this.capturedBuffer.trim();
      if (!cmd) return;
      this.capturedBuffer = '';
      this.callbacks.onInterimTranscript('');
      this.callbacks.onCommandCaptured(cmd, triggeredByWakeWord);

      if (this.settings.voiceEnabled && this.settings.wakeWordEnabled && !this.permissionBlocked) {
        this.stopCurrentInstance();
        this.startWakeWordStandby();
      } else {
        this.stopAll();
      }
    }, delayMs);
  }

  private enterAwakeListening(wakeLabel: string, initialCommand: string): void {
    if (this.settings.wakeChimeEnabled) playWakeChime();
    this.setMode('awake_listening');
    this.callbacks.onWakeTriggered(wakeLabel);
    this.capturedBuffer = initialCommand;
    this.callbacks.onInterimTranscript(initialCommand);

    if (initialCommand) {
      this.scheduleCommandCommit(true, 1350);
    }

    if (this.awakeTimeoutTimer) window.clearTimeout(this.awakeTimeoutTimer);
    this.awakeTimeoutTimer = window.setTimeout(() => {
      if (this.mode === 'awake_listening') {
        if (this.capturedBuffer.trim()) {
          this.scheduleCommandCommit(true, 50);
        } else {
          this.callbacks.onInterimTranscript('');
          this.startWakeWordStandby();
        }
      }
    }, 8500);
  }

  private bootRecognitionInstance(continuousStandby: boolean): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || this.isSpeakingTts) return;

    this.stopCurrentInstance();
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.settings.voiceLanguage || 'en-NG';

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let latestTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        latestTranscript += event.results[i][0].transcript + ' ';
      }
      const clean = latestTranscript.trim();
      if (!clean) return;

      if (this.mode === 'standby_wake') {
        const wakeCheck = detectWakeWordInTranscript(clean, this.settings);
        if (wakeCheck.matched) {
          this.enterAwakeListening(wakeCheck.wakeLabel, wakeCheck.commandAfterWake);
        }
        return;
      }

      if (this.mode === 'awake_listening') {
        // Strip wake phrase if still in the ongoing recognition segment
        const wakeCheck = detectWakeWordInTranscript(clean, this.settings);
        const cmdText = wakeCheck.matched ? wakeCheck.commandAfterWake : clean;
        if (cmdText) {
          this.capturedBuffer = cmdText;
          this.callbacks.onInterimTranscript(cmdText);
          this.scheduleCommandCommit(true, 1450);
        }
        return;
      }

      if (this.mode === 'manual_listening') {
        this.capturedBuffer = clean;
        this.callbacks.onInterimTranscript(clean);
        this.scheduleCommandCommit(false, 1550);
      }
    };

    rec.onerror = (ev: { error: string }) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        this.permissionBlocked = true;
        this.shouldKeepRunning = false;
        this.setMode('off');
        this.callbacks.onError('Microphone permission denied. Allow microphone access in your browser to use "Hey Nova".');
      }
    };

    rec.onend = () => {
      if (this.isSpeakingTts || this.permissionBlocked) return;
      if (continuousStandby && this.shouldKeepRunning && (this.mode === 'standby_wake' || this.mode === 'awake_listening')) {
        this.restartTimer = window.setTimeout(() => {
          if (this.shouldKeepRunning && !this.isSpeakingTts) {
            this.bootRecognitionInstance(true);
          }
        }, 350);
      } else if (this.mode === 'manual_listening') {
        if (this.capturedBuffer.trim()) {
          this.scheduleCommandCommit(false, 80);
        } else {
          this.setMode('off');
        }
      }
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch {
      // Safe guard if already started
    }
  }
}
