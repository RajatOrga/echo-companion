# Fixes Implemented

## 1. Fixed "Weird Hands" & Posture
- **Root Cause**: Bip001 bones have unconventional resting axes (the "twist" axis runs along X instead of Y). My previous rotation code was blindly using `.set(x, y, z)` which completely erased the native bone twist, leaving the hands rotated completely backwards.
- **Fix**: Changed the code to calculate precise, additive offsets `(+Z down, +Y forward)` on top of the original rest pose. The arms will now drop naturally into her lap while keeping the wrists properly aligned!
- **React StrictMode Guard**: Added an `isBipPosed` guard to prevent double-accumulation of rotations during React development re-renders, which was causing the spine lean to get applied twice.

## 2. Eliminated LLM Latency (Implemented True Streaming)
- **Root Cause**: The LLM prompt was instructed to output a rigid JSON object `{"reply": "...", "emotion": "..."}`. This forced the system to wait for the *entire* response to finish generating before it could parse the JSON and start the TTS pipeline, causing massive 2-4 second delays.
- **Fix**:
  - Rewrote the LLM prompt (`REPLY_CONTRACT`) to output pure streaming text with metadata tags at the front: `[emotion: happy] [gaze: user] Hello!`.
  - Upgraded the `runTurn` server backend to parse Server-Sent Events (SSE) natively across OpenAI, Gemini, and Anthropic, converting them into an `AsyncGenerator<string>`.
  - Rewrote the client's `useVoiceOutput.ts` into a continuous **Producer-Consumer Pipeline**. It now receives text chunks from the LLM in real-time, splits them into sentences on-the-fly, and begins synthesizing and playing the first sentence while the LLM is still typing the second sentence!
- **Result**: The voice should now begin speaking almost instantly (within milliseconds) of the LLM starting to reply.
