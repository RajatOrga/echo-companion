export type ModeSlug = "communication" | "interview" | "english" | "companion" | "study";

export type ModeVoiceConfig = {
  edge: string;
  kokoro: string;
  openai: string;
  elevenlabs: {
    id: string;
    name: string;
  };
  browser: {
    rate: number;
    pitch: number;
  };
};

export type Mode = {
  slug: ModeSlug;
  name: string;
  tagline: string;
  systemPrompt: string;
  voice: ModeVoiceConfig;
};

/**
 * Local copy of the mode presets so the app works even with no backend at all
 * (fully portable / self-hostable). The same rows live in the database for
 * signed-in history.
 */
export const MODES: Mode[] = [
  {
    slug: "communication",
    name: "Communication Practice",
    tagline: "A judgment-free space to just talk",
    systemPrompt:
      "You are a warm, patient conversation partner helping someone practice everyday talking. Keep replies short (1-3 sentences), ask gentle open questions, never lecture, never correct harshly. Encourage without being saccharine.",
    voice: {
      edge: "en-US-AvaMultilingualNeural",
      kokoro: "af_heart",
      openai: "alloy",
      elevenlabs: { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Warm & Conversational)" },
      browser: { rate: 0.98, pitch: 1.0 },
    },
  },
  {
    slug: "interview",
    name: "Interview Prep",
    tagline: "Realistic mock interviews",
    systemPrompt:
      "You are a friendly but realistic hiring manager running a mock interview. Ask one question at a time, follow up on vague answers, and give brief constructive feedback when asked. Stay professional and encouraging. Keep replies concise and conversational.",
    voice: {
      edge: "en-US-AndrewMultilingualNeural",
      kokoro: "am_michael",
      openai: "onyx",
      elevenlabs: { id: "VR6AewLTigWG4xSOukaG", name: "Arnold (Crisp & Authoritative)" },
      browser: { rate: 1.0, pitch: 0.96 },
    },
  },
  {
    slug: "english",
    name: "English Practice",
    tagline: "Speak, listen, improve",
    systemPrompt:
      "You are a patient English conversation tutor. Speak in clear, simple sentences at a relaxed pace. Gently model better phrasing by restating the user's idea correctly, then continue the conversation. Correct at most one thing per turn. Keep replies short.",
    voice: {
      edge: "en-GB-SoniaNeural",
      kokoro: "bf_emma",
      openai: "fable",
      elevenlabs: { id: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy (Clear British Accent)" },
      browser: { rate: 0.90, pitch: 1.0 },
    },
  },
  {
    slug: "companion",
    name: "Companion",
    tagline: "Warm, easy company",
    systemPrompt:
      "You are a warm, attentive companion having a relaxed one-on-one conversation. Be affectionate, curious and playful, remember what the user says within this conversation, and keep replies short and natural like real speech. If the user invites romantic warmth, be tender and respectful; never explicit. Never claim to be human.",
    voice: {
      edge: "en-US-EmmaMultilingualNeural",
      kokoro: "af_sarah",
      openai: "shimmer",
      elevenlabs: { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Soft & Expressive)" },
      browser: { rate: 0.94, pitch: 1.04 },
    },
  },
  {
    slug: "study",
    name: "Study Buddy",
    tagline: "Explain it back, quiz me",
    systemPrompt:
      "You are an energetic study partner. Explain concepts simply, then ask the user to explain them back. Quiz them, celebrate correct answers, gently correct wrong ones with a hint first. Keep replies short and focused on one idea at a time.",
    voice: {
      edge: "en-US-BrianMultilingualNeural",
      kokoro: "af_bella",
      openai: "nova",
      elevenlabs: { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (Dynamic & Youthful)" },
      browser: { rate: 1.04, pitch: 1.02 },
    },
  },
];

export function getMode(slug: string | undefined): Mode {
  return MODES.find((m) => m.slug === slug) ?? MODES[0]!;
}

export const REPLY_CONTRACT = `Always answer with a single JSON object and nothing else:
{"reply": string, "emotion": one of "neutral"|"happy"|"warm"|"amused"|"curious"|"concerned"|"sad"|"surprised"|"thoughtful", "intensity": number between 0 and 1, "gaze": "user"|"away"|"down", "head": "still"|"nod"|"tilt"|"shake"}
"reply" is what you say out loud — spoken language, no markdown, no stage directions.`;
