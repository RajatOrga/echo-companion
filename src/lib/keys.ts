/**
 * BYOK settings live in this browser only. They are never written to the
 * database and never logged — they are sent with a single request at a time to
 * the model provider you chose.
 */

export type LlmProvider = "openai" | "anthropic" | "gemini" | "custom";

export type KeySettings = {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  ttsProvider: "none" | "openai" | "elevenlabs";
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

export const EMPTY_SETTINGS: KeySettings = {
  provider: "openai",
  apiKey: "",
  model: DEFAULT_MODELS.openai,
  baseUrl: "",
  ttsProvider: "none",
  ttsKey: "",
  voice: "alloy",
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
