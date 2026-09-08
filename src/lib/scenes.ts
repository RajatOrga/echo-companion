/**
 * Room scenes. Each conversation mode happens somewhere real-feeling:
 * a bedroom for the companion, an office for the interview, and so on.
 * All furniture is CC0 (Kenney furniture kit) and served from /models/furniture.
 */

import type { ModeSlug } from "@/lib/modes";

export type Prop = {
  model: string;
  /** metres, room space */
  position: [number, number, number];
  /** radians around Y */
  rotationY?: number;
  scale?: number;
};

export type SceneConfig = {
  id: "bedroom" | "office";
  label: string;
  floor: string;
  wall: string;
  /** key light colour — the "screen glow" on the face */
  key: string;
  fill: string;
  props: Prop[];
  /** hip height + placement of the seated figure */
  seat: { position: [number, number, number]; rotationY: number; lean: number };
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number };
};

const F = 1.9;
const WALL = 1.93; // slight overlap so the wall panels show no seams // Kenney furniture kit → metres

function wallRow(model: "wall" | "wallWindow", x: number): Prop {
  return { model, position: [x, 0, -2.3], scale: WALL };
}

const BEDROOM: SceneConfig = {
  id: "bedroom",
  label: "Her room",
  floor: "#4a3a30",
  wall: "#2b2733",
  key: "#ffc98a",
  fill: "#6c6f9c",
  props: [
    wallRow("wall", -2.85),
    wallRow("wallWindow", -0.95),
    wallRow("wall", 0.95),
    { model: "bedDouble", position: [-0.85, 0, -0.35], rotationY: 0, scale: 1 },
    { model: "pillowLong", position: [-0.72, 0.38, -2.0], scale: 1.5 },
    { model: "pillowBlue", position: [0.2, 0.42, -1.85], rotationY: 0.3, scale: 1.4 },
    { model: "cabinetBedDrawerTable", position: [-1.65, 0, -1.9], scale: F },
    { model: "lampRoundTable", position: [-1.45, 0.49, -1.6], scale: F },
    { model: "bookcaseOpen", position: [1.35, 0, -2.2], scale: F },
    { model: "books", position: [1.6, 0.55, -2.05], scale: 1.2 },
    { model: "pottedPlant", position: [2.3, 0, -1.7], scale: F },
    { model: "lampSquareFloor", position: [-2.5, 0, -1.1], scale: F },
    { model: "rugRounded", position: [-1.5, 0.005, 1.0], scale: F },
    { model: "laptop", position: [0.66, 0.38, -0.5], rotationY: Math.PI * 0.85, scale: 0.62 },
    { model: "plantSmall2", position: [-1.6, 0.49, -2.05], scale: F },
  ],
  seat: { position: [0, 0.4, -0.5], rotationY: 0.05, lean: 0.1 },
  camera: { position: [0.34, 1.24, 1.95], target: [-0.02, 0.95, -0.45], fov: 34 },
};

const OFFICE: SceneConfig = {
  id: "office",
  label: "The office",
  floor: "#3b3a3f",
  wall: "#26262e",
  key: "#f4e9dd",
  fill: "#6a7690",
  props: [
    wallRow("wall", -2.85),
    wallRow("wallWindow", -0.95),
    wallRow("wall", 0.95),
    { model: "chairDesk", position: [-0.1, 0, -0.62], rotationY: 0, scale: 1.45 },
    { model: "desk", position: [-0.68, 0, 0.95], scale: F },
    { model: "laptop", position: [0.34, 0.72, 0.78], rotationY: Math.PI, scale: 0.72 },
    { model: "computerKeyboard", position: [-0.26, 0.72, 0.62], rotationY: Math.PI, scale: 1.1 },
    { model: "books", position: [-0.62, 0.72, 0.8], scale: 1.2 },
    { model: "bookcaseClosedWide", position: [-2.6, 0, -2.15], scale: F },
    { model: "pottedPlant", position: [2.25, 0, -1.8], scale: F },
    { model: "lampSquareFloor", position: [1.55, 0, -1.9], scale: F },
    { model: "trashcan", position: [-1.9, 0, 0.3], scale: 1 },
    { model: "rugRectangle", position: [-1.6, 0.005, 0.2], scale: F },
  ],
  seat: { position: [0, 0.52, -0.42], rotationY: -0.04, lean: 0.14 },
  camera: { position: [0.32, 1.38, 2.05], target: [-0.02, 1.05, -0.4], fov: 34 },
};

const BY_MODE: Record<ModeSlug, SceneConfig> = {
  companion: BEDROOM,
  english: BEDROOM,
  communication: OFFICE,
  interview: OFFICE,
  study: OFFICE,
};

export function getScene(mode: string): SceneConfig {
  return BY_MODE[mode as ModeSlug] ?? BEDROOM;
}

export const FURNITURE_MODELS = Array.from(
  new Set([...BEDROOM.props, ...OFFICE.props].map((prop) => prop.model)),
).map((name) => `/models/furniture/${name}.glb`);
