/**
 * BYOK settings live in this browser only. They are never written to the
 * database and never logged — they are sent with a single request at a time to
 * the model provider you chose.
 */

import { getMode, type Mode, type ModeSlug } from "./modes";

export type LlmProvider = "openai" | "anthropic" | "gemini" | "custom";

export type KeySettings = {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  ttsProvider: "edge" | "kokoro" | "openai" | "elevenlabs" | "none";
  ttsKey: string;
  voice: string;
};

const STORAGE_KEY = "companion.keys.v1";

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-2.0-flash",
  custom: "",
};

export const KOKORO_VOICES = [
  { id: "auto", name: "Auto (Section-tuned)", description: "Adapts to Interview, Casual, Companion, etc." },
  { id: "af_heart", name: "Heart (Warm & Emotional)", description: "Grade A American female (Top Quality)" },
  { id: "af_bella", name: "Bella (Expressive & Dynamic)", description: "Grade A American female" },
  { id: "af_nicole", name: "Nicole (Conversational)", description: "Clear, natural American female" },
  { id: "af_sarah", name: "Sarah (Gentle & Tender)", description: "Soft, intimate American female" },
  { id: "am_michael", name: "Michael (Authoritative)", description: "Deep, confident American male" },
  { id: "am_fenrir", name: "Fenrir (Grounded & Rich)", description: "Resonant American male" },
  { id: "bf_emma", name: "Emma (British Accent)", description: "Clear, articulate British female" },
  { id: "bm_george", name: "George (British Accent)", description: "Warm, distinguished British male" },
] as const;

export const EDGE_VOICES = [
  { id: "auto", name: "Auto (Section-tuned)", description: "Adapts to Interview, Casual, Companion, etc." },
  { id: "en-US-AvaMultilingualNeural", name: "Ava", description: "Warm, empathetic, expressive (Default)" },
  { id: "en-US-AndrewMultilingualNeural", name: "Andrew", description: "Confident, grounded, authoritative" },
  { id: "en-US-EmmaMultilingualNeural", name: "Emma", description: "Soft, gentle, intimate" },
  { id: "en-US-BrianMultilingualNeural", name: "Brian", description: "Dynamic, clear, enthusiastic" },
  { id: "en-GB-SoniaNeural", name: "Sonia", description: "Articulate, pleasant British accent" },
  { id: "en-US-AriaNeural", name: "Aria", description: "Natural, melodic, engaging" },
  { id: "en-US-GuyNeural", name: "Guy", description: "Relaxed, friendly male" },
  { id: "en-US-JennyNeural", name: "Jenny", description: "Bright, friendly, articulate" },
] as const;

export const OPENAI_VOICES = [
  { id: "auto", name: "Auto (Section-tuned)", description: "Adapts to Interview, Casual, Companion, etc." },
  { id: "alloy", name: "Alloy", description: "Neutral, balanced, conversational" },
  { id: "ash", name: "Ash", description: "Clear, direct, modern" },
  { id: "coral", name: "Coral", description: "Friendly, warm, expressive" },
  { id: "echo", name: "Echo", description: "Smooth, warm, casual" },
  { id: "fable", name: "Fable", description: "British, articulate, storytelling" },
  { id: "onyx", name: "Onyx", description: "Deep, authoritative (Interview Prep)" },
  { id: "nova", name: "Nova", description: "Bright, energetic (Study Buddy)" },
  { id: "sage", name: "Sage", description: "Calm, thoughtful, soothing" },
  { id: "shimmer", name: "Shimmer", description: "Tender, emotional, intimate (Companion)" },
] as const;

export const ELEVENLABS_VOICES = [
  { id: "auto", name: "Auto (Section-tuned)", description: "Adapts to Interview, Casual, Companion, etc." },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Warm, calm, natural (Casual & Everyday)" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Crisp, authoritative (Interview Prep)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Soft, tender, intimate (Companion)" },
  { id: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy", description: "Pleasant, clear, British (English Practice)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Young, dynamic, enthusiastic (Study Buddy)" },
  { id: "XB0fDUnXU5ikfxIpGcqS", name: "Charlotte", description: "Warm, gentle, Swedish-accented English" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", description: "Casual, confident, conversational" },
  { id: "29vD33N1CtxCmqQRPOHJ", name: "Drew", description: "Deep, grounded, well-rounded" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", description: "Confident, engaging, professional" },
] as const;

export function getVoiceForMode(settings: KeySettings, mode: Mode): string {
  if (settings.voice && settings.voice !== "auto") {
    return settings.voice;
  }
  if (settings.ttsProvider === "kokoro") {
    return mode.voice.kokoro || "af_heart";
  }
  if (settings.ttsProvider === "elevenlabs") {
    return mode.voice.elevenlabs.id;
  }
  if (settings.ttsProvider === "openai") {
    return mode.voice.openai;
  }
  return mode.voice.edge;
}

export const EMPTY_SETTINGS: KeySettings = {
  provider: "openai",
  apiKey: "",
  model: DEFAULT_MODELS.openai,
  baseUrl: "",
  ttsProvider: "edge",
  ttsKey: "",
  voice: "auto",
};

export function loadSettings(): KeySettings {
  if (typeof window === "undefined") return EMPTY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SETTINGS;
    return { ...EMPTY_SETTINGS, ...(JSON.parse(raw) as Partial<KeySettings>) };
  } catch {
    return EMPTY_SETTINGS;
  }
}

export function saveSettings(settings: KeySettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearSettings() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function hasKey(settings: KeySettings) {
  return settings.apiKey.trim().length > 0 || settings.provider === "custom";
}
