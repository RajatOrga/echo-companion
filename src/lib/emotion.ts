/**
 * Emotion engine: a persistent mood vector that eases toward a target, mapped
 * to ARKit-style blendshape weights. Pure logic — no rendering, no React.
 */

export type Mood = {
  calm: number;
  warmth: number;
  energy: number;
  concern: number;
  amusement: number;
};

export type EmotionName =
  | "neutral"
  | "happy"
  | "warm"
  | "amused"
  | "curious"
  | "concerned"
  | "sad"
  | "surprised"
  | "thoughtful";

const NEUTRAL: Mood = { calm: 0.7, warmth: 0.35, energy: 0.25, concern: 0, amusement: 0 };

const EMOTION_TARGETS: Record<EmotionName, Mood> = {
  neutral: NEUTRAL,
  happy: { calm: 0.4, warmth: 0.8, energy: 0.7, concern: 0, amusement: 0.5 },
  warm: { calm: 0.65, warmth: 0.9, energy: 0.35, concern: 0, amusement: 0.15 },
  amused: { calm: 0.35, warmth: 0.7, energy: 0.75, concern: 0, amusement: 0.9 },
  curious: { calm: 0.45, warmth: 0.45, energy: 0.6, concern: 0.1, amusement: 0.15 },
  concerned: { calm: 0.5, warmth: 0.5, energy: 0.3, concern: 0.8, amusement: 0 },
  sad: { calm: 0.6, warmth: 0.4, energy: 0.12, concern: 0.6, amusement: 0 },
  surprised: { calm: 0.15, warmth: 0.4, energy: 0.95, concern: 0.25, amusement: 0.2 },
  thoughtful: { calm: 0.8, warmth: 0.35, energy: 0.2, concern: 0.2, amusement: 0.05 },
};

export function isEmotionName(value: unknown): value is EmotionName {
  return typeof value === "string" && value in EMOTION_TARGETS;
}

const KEYS: (keyof Mood)[] = ["calm", "warmth", "energy", "concern", "amusement"];

export class EmotionEngine {
  private current: Mood = { ...NEUTRAL };
  private target: Mood = { ...NEUTRAL };
  /** 0 = idle, 1 = speaking loudly. Drives the mouth. */
  private mouth = 0;
  private mouthTarget = 0;
  private blinkTimer = 1.5;
  private blink = 0;
  private t = 0;
  /** Seconds of continuous silence — triggers passive mood reset */
  private idleTime = 0;

  /** Nudge the mood toward an emotion; intensity scales how far it moves. */
  nudge(emotion: EmotionName, intensity = 0.6) {
    const goal = EMOTION_TARGETS[emotion] ?? NEUTRAL;
    const k = Math.min(Math.max(intensity, 0), 1) * 0.85 + 0.15;
    for (const key of KEYS) {
      this.target[key] = this.target[key] * (1 - k) + goal[key] * k;
    }
    this.idleTime = 0; // reset idle timer on any emotion nudge
  }

  /** Slowly drift back to a resting mood (called when idle for a while). */
  settle(amount = 0.25) {
    for (const key of KEYS) {
      this.target[key] = this.target[key] * (1 - amount) + NEUTRAL[key] * amount;
    }
  }

  setMouth(level: number) {
    this.mouthTarget = Math.min(Math.max(level, 0), 1);
  }

  getMood(): Mood {
    return { ...this.current };
  }

  /** Advance the simulation. dt in seconds. Returns blendshape weights. */
  tick(dt: number): Record<string, number> {
    const step = 1 - Math.exp(-dt * 2.2); // smooth exponential ease, never a hard cut
    for (const key of KEYS) {
      this.current[key] += (this.target[key] - this.current[key]) * step;
    }
    this.mouth += (this.mouthTarget - this.mouth) * (1 - Math.exp(-dt * 18));
    this.t += dt;

    // Passive idle drift: if mouth has been silent for 8+ seconds, nudge back to neutral
    if (this.mouthTarget < 0.05) {
      this.idleTime += dt;
      if (this.idleTime > 8) {
        this.settle(0.012 * dt); // very gentle, continuous drift
      }
    } else {
      this.idleTime = 0;
    }

    // Blinking with a little randomness so the face never looks frozen.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = 2 + Math.random() * 3.5;
      this.blink = 1;
    }
    this.blink = Math.max(0, this.blink - dt * 7.5);
    const blinkWeight = Math.sin(Math.min(this.blink, 1) * Math.PI);

    const { warmth, energy, concern, amusement, calm } = this.current;
    const breath = (Math.sin(this.t * 0.9) + 1) / 2;

    const baseSmile = warmth * 0.58 + amusement * 0.48;
    // Conversational brow lift on spoken syllables
    const speechBrowLift = Math.max(0, this.mouth - 0.25) * 0.35 * energy;
    const browUp = energy * 0.45 + concern * 0.2 + speechBrowLift;
    const browDown = concern * 0.55;
    const squint = amusement * 0.4 + baseSmile * 0.18;
    const jaw = this.mouth * 0.8 + amusement * 0.05;

    // Organic facial asymmetry (humans have ~5-10% natural variance)
    const smileLeft = baseSmile * 1.03;
    const smileRight = baseSmile * 0.97;
    const browLeft = browUp * 0.98;
    const browRight = browUp * 1.04;

    return {
      jawOpen: jaw,
      mouthOpen: jaw * 0.65,
      mouthClose: (1 - this.mouth) * 0.05,
      mouthSmileLeft: smileLeft,
      mouthSmileRight: smileRight,
      mouthFrownLeft: concern * 0.38,
      mouthFrownRight: concern * 0.32,
      mouthPucker: this.mouth * 0.12,
      mouthDimpleLeft: smileLeft * 0.45,
      mouthDimpleRight: smileRight * 0.4,
      cheekSquintLeft: squint * 1.02,
      cheekSquintRight: squint * 0.98,
      browInnerUp: browUp * 0.85 + concern * 0.45,
      browOuterUpLeft: browLeft,
      browOuterUpRight: browRight,
      browDownLeft: browDown * 1.03,
      browDownRight: browDown * 0.97,
      eyeBlinkLeft: Math.max(blinkWeight, squint * 0.22),
      eyeBlinkRight: Math.max(blinkWeight, squint * 0.22),
      eyeSquintLeft: squint,
      eyeSquintRight: squint,
      eyeWideLeft: energy * 0.35 * (1 - calm),
      eyeWideRight: energy * 0.35 * (1 - calm),
      noseSneerLeft: concern * 0.12,
      noseSneerRight: concern * 0.08,
      // subtle life
      mouthStretchLeft: breath * 0.035,
      mouthStretchRight: breath * 0.035,
    };
  }
}
