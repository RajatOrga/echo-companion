import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, Lightformer } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import type { EmotionEngine } from "@/lib/emotion";
import { Room } from "@/components/avatar/Room";
import { AVATAR_MODELS, FURNITURE_MODELS, type SceneConfig } from "@/lib/scenes";

for (const url of AVATAR_MODELS) useGLTF.preload(url);
for (const url of FURNITURE_MODELS) useGLTF.preload(url);

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Strips vendor prefixes (Daz FACS, eCTRL, ARKit, Mixamo, VRM)
 * and generates bidirectional aliases (e.g. Left/Right <-> L/R)
 * so Daz 3D & custom rigs bind seamlessly with ARKit 52 morphs.
 */
function getMorphAliases(name: string): string[] {
  const norm = normalize(name);
  const aliases = new Set<string>([norm]);

  // Strip common 3D vendor / blendshape prefixes:
  // facs_ctrl_, facs_jnt_, facs_, ectrl_, ejcm_, ctrl_, vrm_, blendshape_, bs_
  const stripped = norm.replace(/^(facsctrl|facsjnt|facs|ectrl|ejcm|ctrl|vrm|blendshape|bs)/, "");
  if (stripped && stripped !== norm) {
    aliases.add(stripped);
  }

  // Generate Left/Right <-> L/R equivalents for ARKit / Daz morph matching
  for (const a of Array.from(aliases)) {
    if (a.endsWith("left")) {
      aliases.add(a.slice(0, -4) + "l");
    } else if (a.endsWith("l") && !a.endsWith("all")) {
      aliases.add(a.slice(0, -1) + "left");
    }
    if (a.endsWith("right")) {
      aliases.add(a.slice(0, -5) + "r");
    } else if (a.endsWith("r")) {
      aliases.add(a.slice(0, -1) + "right");
    }
  }

  return Array.from(aliases);
}

type Targets = { mesh: THREE.SkinnedMesh; map: Map<string, number> };

function RealisticAvatar({
  engine,
  gazeRef,
  active,
  listening = false,
  headGesture,
  gestureKey,
  config,
}: {
  engine: EmotionEngine;
  gazeRef: { current: string };
  active: boolean;
  listening?: boolean;
  headGesture?: string;
  gestureKey?: number;
  config: SceneConfig;
}) {
  const modelUrl = config.avatar || "/models/avatars/companion_female.glb";
  const { scene } = useGLTF(modelUrl);
  // SkeletonUtils.clone ensures SkinnedMesh and bones rebind correctly
  const avatar = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  // Find all skinned meshes with morph targets
  const morphTargets = useMemo<Targets[]>(() => {
    const found: Targets[] = [];
    avatar.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of materials) {
          if (m) {
            const name = mesh.name.toLowerCase();
            if ("map" in m && m.map) {
              m.transparent = true;
              m.depthWrite = true;
              if (name.includes("jiemao") || name.includes("hair") || name.includes("gaoguang")) {
                m.alphaTest = 0.35;
              }
            }
            if ("roughness" in m) {
              const mat = m as THREE.MeshStandardMaterial;
              if (name.includes("outfit") || name.includes("hair") || name.includes("top") || name.includes("bottom")) {
                mat.roughness = 0.88;
                mat.metalness = 0.02;
              } else if (name.includes("skin") || name.includes("head") || name.includes("body") || name.includes("face")) {
                mat.roughness = 0.62;
                mat.metalness = 0.0;
              } else if (!name.includes("eye")) {
                mat.roughness = Math.max(mat.roughness ?? 0.7, 0.65);
                mat.metalness = Math.min(mat.metalness ?? 0, 0.1);
              }
            }
          }
        }

        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
          const map = new Map<string, number>();
          for (const [key, index] of Object.entries(mesh.morphTargetDictionary)) {
            const idx = index as number;
            for (const alias of getMorphAliases(key)) {
              if (!map.has(alias)) {
                map.set(alias, idx);
              }
            }
          }
          found.push({ mesh, map });
        }
      }
    });
    return found;
  }, [avatar]);

  // Locate skeletal bones for posing and lifelike head/face movement across rigs
  // (ReadyPlayerMe, Daz Genesis 3/8/8.1/9, Mixamo, Unreal, 3ds Max Bip001)
  const bones = useMemo(() => {
    let head: THREE.Bone | null = null;
    let neck: THREE.Bone | null = null;
    let spine: THREE.Bone | null = null;
    let spine1: THREE.Bone | null = null;
    let leftShoulder: THREE.Bone | null = null;
    let rightShoulder: THREE.Bone | null = null;
    let leftArm: THREE.Bone | null = null;
    let rightArm: THREE.Bone | null = null;
    let leftForearm: THREE.Bone | null = null;
    let rightForearm: THREE.Bone | null = null;
    let leftThigh: THREE.Bone | null = null;
    let rightThigh: THREE.Bone | null = null;
    let leftCalf: THREE.Bone | null = null;
    let rightCalf: THREE.Bone | null = null;
    let mouth: THREE.Bone | null = null;
    let lowerLip: THREE.Bone | null = null;
    let upperEyelidL: THREE.Bone | null = null;
    let upperEyelidR: THREE.Bone | null = null;
    let lowerEyelidL: THREE.Bone | null = null;
    let lowerEyelidR: THREE.Bone | null = null;
    let browL: THREE.Bone | null = null;
    let browR: THREE.Bone | null = null;
    let eyeballL: THREE.Bone | null = null;
    let eyeballR: THREE.Bone | null = null;
    let isBip = false;

    avatar.traverse((child) => {
      if (child.type === "Bone") {
        const n = child.name.toLowerCase();
        if (n.includes("bip001")) isBip = true;

        // Head bone
        if (!head && (n === "head" || n.endsWith("_head") || n.includes("mixamorighead") || n.includes("genesis8_head") || n.includes("genesis9_head") || n.includes("head_076") || (n.includes("head") && !n.includes("end")))) {
          head = child as THREE.Bone;
        }
        // Neck bone
        else if (!neck && (n === "neck" || n === "neckupper" || n === "necklower" || n.endsWith("_neck") || n.includes("mixamorigneck") || n.includes("neck_075") || (n.includes("neck") && !n.includes("end")))) {
          neck = child as THREE.Bone;
        }
        // Lower Spine / Abdomen
        else if (!spine && (n === "spine" || n === "abdomenlower" || n === "abdomen" || n.includes("mixamorigspine") || n.includes("spine_06") || n.includes("spine_05"))) {
          spine = child as THREE.Bone;
        }
        // Upper Spine / Chest
        else if (!spine1 && (n === "spine1" || n === "spine2" || n === "chest" || n === "chestupper" || n.includes("mixamorigspine1") || n.includes("mixamorigspine2") || n.includes("spine1_07") || n.includes("spine2_08"))) {
          spine1 = child as THREE.Bone;
        }
        // Shoulders / Clavicles
        else if (!leftShoulder && (n === "leftshoulder" || n === "lshldr" || n === "lcollar" || n.includes("mixamorigleftshoulder") || (n.includes("clavicle") && (n.includes("-l-") || n.includes("_l_") || n.includes("left"))))) {
          leftShoulder = child as THREE.Bone;
        }
        else if (!rightShoulder && (n === "rightshoulder" || n === "rshldr" || n === "rcollar" || n.includes("mixamorigrightshoulder") || (n.includes("clavicle") && (n.includes("-r-") || n.includes("_r_") || n.includes("right"))))) {
          rightShoulder = child as THREE.Bone;
        }
        // Upper Arms
        else if (!leftArm && (n === "leftarm" || n === "lshldrbend" || n === "lupperarm" || n.includes("mixamorigleftarm") || (n.includes("upperarm") && (n.includes("-l-") || n.includes("_l_") || n.includes("left"))))) {
          leftArm = child as THREE.Bone;
        }
        else if (!rightArm && (n === "rightarm" || n === "rshldrbend" || n === "rupperarm" || n.includes("mixamorigrightarm") || (n.includes("upperarm") && (n.includes("-r-") || n.includes("_r_") || n.includes("right"))))) {
          rightArm = child as THREE.Bone;
        }
        // Forearms
        else if (!leftForearm && (n === "leftforearm" || n === "lforearmbend" || n.includes("mixamorigleftforearm") || (n.includes("forearm") && (n.includes("-l-") || n.includes("_l_") || n.includes("left"))))) {
          leftForearm = child as THREE.Bone;
        }
        else if (!rightForearm && (n === "rightforearm" || n === "rforearmbend" || n.includes("mixamorigrightforearm") || (n.includes("forearm") && (n.includes("-r-") || n.includes("_r_") || n.includes("right"))))) {
          rightForearm = child as THREE.Bone;
        }
        // Thighs
        else if (!leftThigh && ((n.includes("thigh") && (n.includes("-l-") || n.includes("_l_") || n.includes("left"))) || n.includes("leftupleg"))) {
          leftThigh = child as THREE.Bone;
        }
        else if (!rightThigh && ((n.includes("thigh") && (n.includes("-r-") || n.includes("_r_") || n.includes("right"))) || n.includes("rightupleg"))) {
          rightThigh = child as THREE.Bone;
        }
        // Calves
        else if (!leftCalf && ((n.includes("calf") && (n.includes("-l-") || n.includes("_l_") || n.includes("left"))) || n.includes("leftleg"))) {
          leftCalf = child as THREE.Bone;
        }
        else if (!rightCalf && ((n.includes("calf") && (n.includes("-r-") || n.includes("_r_") || n.includes("right"))) || n.includes("rightleg"))) {
          rightCalf = child as THREE.Bone;
        }
        // Face joints
        else if (!mouth && (n.includes("mouth") || n.includes("jaw"))) {
          mouth = child as THREE.Bone;
        }
        else if (!lowerLip && n.includes("lolip_m")) {
          lowerLip = child as THREE.Bone;
        }
        else if (!upperEyelidL && (n.includes("eyelid_up_l") || n.includes("eyelid04_up_l") || n.includes("eyelid05_up_l"))) {
          upperEyelidL = child as THREE.Bone;
        }
        else if (!upperEyelidR && (n.includes("eyelid_up_r") || n.includes("eyelid04_up_r") || n.includes("eyelid05_up_r"))) {
          upperEyelidR = child as THREE.Bone;
        }
        else if (!lowerEyelidL && (n.includes("eyelid_lo_l") || n.includes("eyelid02_lo_l") || n.includes("eyelid03_lo_l"))) {
          lowerEyelidL = child as THREE.Bone;
        }
        else if (!lowerEyelidR && (n.includes("eyelid_lo_r") || n.includes("eyelid02_lo_r") || n.includes("eyelid03_lo_r"))) {
          lowerEyelidR = child as THREE.Bone;
        }
        else if (!browL && (n.includes("eyebrow01_l") || n.includes("eyebrow_l"))) {
          browL = child as THREE.Bone;
        }
        else if (!browR && (n.includes("eyebrow01_r") || n.includes("eyebrow_r"))) {
          browR = child as THREE.Bone;
        }
        else if (!eyeballL && (n.includes("eyeball_l") || n.includes("eye_l"))) {
          eyeballL = child as THREE.Bone;
        }
        else if (!eyeballR && (n.includes("eyeball_r") || n.includes("eye_r"))) {
          eyeballR = child as THREE.Bone;
        }
      }
    });
    return {
      head, neck, spine, spine1, leftShoulder, rightShoulder,
      leftArm, rightArm, leftForearm, rightForearm,
      leftThigh, rightThigh, leftCalf, rightCalf,
      mouth, lowerLip, upperEyelidL, upperEyelidR, lowerEyelidL, lowerEyelidR,
      browL, browR, eyeballL, eyeballR, isBip
    };
  }, [avatar]);

  // Seated pose setup: bends thighs & knees to sit on the chair, rests arms on lap
  useEffect(() => {
    if (bones.isBip) {
      // 1. Pose legs to sit comfortably on chair
      if (bones.leftThigh) bones.leftThigh.rotation.set(-Math.PI, 0, (179.6 - 82) * (Math.PI / 180));
      if (bones.rightThigh) bones.rightThigh.rotation.set(-Math.PI, 0, (179.6 - 82) * (Math.PI / 180));
      if (bones.leftCalf) bones.leftCalf.rotation.set(0, 0, (-2.3 + 86) * (Math.PI / 180));
      if (bones.rightCalf) bones.rightCalf.rotation.set(0, 0, (-2.3 + 86) * (Math.PI / 180));

      // 2. Pose arms to rest naturally on lap instead of locked in A-pose
      if (bones.leftArm) bones.leftArm.rotation.set(5.1 * (Math.PI / 180), 20 * (Math.PI / 180), -42 * (Math.PI / 180));
      if (bones.rightArm) bones.rightArm.rotation.set(-5.1 * (Math.PI / 180), -20 * (Math.PI / 180), -42 * (Math.PI / 180));
      if (bones.leftForearm) bones.leftForearm.rotation.set(0, 15 * (Math.PI / 180), 28 * (Math.PI / 180));
      if (bones.rightForearm) bones.rightForearm.rotation.set(0, -15 * (Math.PI / 180), 28 * (Math.PI / 180));
    } else {
      // Standard rigs (Mixamo / ReadyPlayerMe / Daz Genesis)
      if (bones.leftArm) bones.leftArm.rotation.set(1.31, 0.19, 0.12);
      if (bones.rightArm) bones.rightArm.rotation.set(1.31, -0.19, -0.12);
      if (bones.leftForearm) bones.leftForearm.rotation.set(0.18, 0.12, 0.38);
      if (bones.rightForearm) bones.rightForearm.rotation.set(0.18, -0.12, -0.38);
      if (bones.leftThigh) bones.leftThigh.rotation.set(1.48, 0.1, 0.08);
      if (bones.rightThigh) bones.rightThigh.rotation.set(1.48, -0.1, -0.08);
      if (bones.leftCalf) bones.leftCalf.rotation.set(-1.42, 0, 0);
      if (bones.rightCalf) bones.rightCalf.rotation.set(-1.42, 0, 0);
    }
  }, [bones]);

  // Gesture state management
  const gestureState = useRef<{
    type: "nod" | "tilt" | "shake" | "none";
    startTime: number;
    duration: number;
    intensity: number;
  }>({
    type: "none",
    startTime: 0,
    duration: 0,
    intensity: 1,
  });

  const lastGestureTrigger = useRef<number | undefined>(undefined);
  const initialHeadRot = useRef<THREE.Euler | null>(null);
  const initialNeckRot = useRef<THREE.Euler | null>(null);
  const initialMouthPos = useRef<THREE.Vector3 | null>(null);
  const initialMouthRot = useRef<THREE.Euler | null>(null);
  const initialLowerLipPos = useRef<THREE.Vector3 | null>(null);
  const initialUpperEyelidLPos = useRef<THREE.Vector3 | null>(null);
  const initialUpperEyelidRPos = useRef<THREE.Vector3 | null>(null);
  const initialLowerEyelidLPos = useRef<THREE.Vector3 | null>(null);
  const initialLowerEyelidRPos = useRef<THREE.Vector3 | null>(null);
  const initialBrowLPos = useRef<THREE.Vector3 | null>(null);
  const initialBrowRPos = useRef<THREE.Vector3 | null>(null);
  const listeningNodTimer = useRef<number>(4.0 + Math.random() * 3.0);
  const postureShiftTimer = useRef<number>(8.0 + Math.random() * 6.0);
  const currentLean = useRef<number>(0);
  const targetLean = useRef<number>(0);
  const currentSlouch = useRef<number>(0);
  const targetSlouch = useRef<number>(0);

  // Trigger explicit gestures from AI response
  useEffect(() => {
    if (gestureKey !== undefined && gestureKey !== lastGestureTrigger.current) {
      lastGestureTrigger.current = gestureKey;
      const now = performance.now() / 1000;
      if (headGesture === "nod") {
        gestureState.current = {
          type: "nod",
          startTime: now,
          duration: 1.35,
          intensity: 1.0,
        };
      } else if (headGesture === "tilt") {
        gestureState.current = {
          type: "tilt",
          startTime: now,
          duration: 2.1,
          intensity: 1.0,
        };
      } else if (headGesture === "shake") {
        gestureState.current = {
          type: "shake",
          startTime: now,
          duration: 1.45,
          intensity: 1.0,
        };
      }
    }
  }, [gestureKey, headGesture]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const weights = engine.tick(dt);
    const t = performance.now() / 1000;

    // Apply morph targets for facial expressions and lip-sync
    for (const { mesh, map } of morphTargets) {
      const influences = mesh.morphTargetInfluences;
      if (!influences) continue;
      for (const [name, value] of Object.entries(weights)) {
        const index = map.get(normalize(name));
        if (index !== undefined) {
          influences[index] = Math.min(Math.max(value, 0), 1);
        }
      }

      // Drive Oculus visemes for mouth movement if present
      const jaw = weights.jawOpen ?? 0;
      const visemeAa = map.get("visemeaa");
      if (visemeAa !== undefined) {
        influences[visemeAa] = Math.min(jaw * 0.95, 1);
      }
      const visemeO = map.get("visemeo");
      if (visemeO !== undefined) {
        influences[visemeO] = Math.min(jaw * 0.45, 1);
      }
    }

    // Bone-driven jaw & mouth opening (lip-sync for mint.glb / skeletal rigs)
    if (bones.mouth) {
      if (!initialMouthPos.current) initialMouthPos.current = bones.mouth.position.clone();
      if (!initialMouthRot.current) initialMouthRot.current = bones.mouth.rotation.clone();

      const jaw = weights.jawOpen ?? 0;
      bones.mouth.position.x = initialMouthPos.current.x - jaw * 0.007;
      bones.mouth.position.y = initialMouthPos.current.y - jaw * 0.009;
      bones.mouth.rotation.z = initialMouthRot.current.z - jaw * 0.35;

      if (bones.lowerLip) {
        if (!initialLowerLipPos.current) initialLowerLipPos.current = bones.lowerLip.position.clone();
        bones.lowerLip.position.y = initialLowerLipPos.current.y - jaw * 0.006;
      }
    }

    // Bone-driven eyelids (blinking)
    const blink = Math.max(weights.eyeBlinkLeft ?? 0, weights.eyeBlinkRight ?? 0);
    if (bones.upperEyelidL && bones.upperEyelidR) {
      if (!initialUpperEyelidLPos.current) initialUpperEyelidLPos.current = bones.upperEyelidL.position.clone();
      if (!initialUpperEyelidRPos.current) initialUpperEyelidRPos.current = bones.upperEyelidR.position.clone();
      bones.upperEyelidL.position.y = initialUpperEyelidLPos.current.y - blink * 0.009;
      bones.upperEyelidR.position.y = initialUpperEyelidRPos.current.y - blink * 0.009;
    }
    if (bones.lowerEyelidL && bones.lowerEyelidR) {
      if (!initialLowerEyelidLPos.current) initialLowerEyelidLPos.current = bones.lowerEyelidL.position.clone();
      if (!initialLowerEyelidRPos.current) initialLowerEyelidRPos.current = bones.lowerEyelidR.position.clone();
      bones.lowerEyelidL.position.y = initialLowerEyelidLPos.current.y + blink * 0.004;
      bones.lowerEyelidR.position.y = initialLowerEyelidRPos.current.y + blink * 0.004;
    }

    // Bone-driven eyebrows
    const browUp = (weights.browInnerUp ?? 0) - (weights.browDownLeft ?? 0);
    if (bones.browL && bones.browR) {
      if (!initialBrowLPos.current) initialBrowLPos.current = bones.browL.position.clone();
      if (!initialBrowRPos.current) initialBrowRPos.current = bones.browR.position.clone();
      bones.browL.position.y = initialBrowLPos.current.y + browUp * 0.005;
      bones.browR.position.y = initialBrowRPos.current.y + browUp * 0.005;
    }

    // 1. Gesture Offsets Calculation
    let gestureHeadPitch = 0;
    let gestureHeadYaw = 0;
    let gestureHeadRoll = 0;
    let gestureNeckPitch = 0;

    const g = gestureState.current;
    if (g.type !== "none") {
      const elapsed = t - g.startTime;
      if (elapsed < g.duration) {
        const p = elapsed / g.duration;
        if (g.type === "nod") {
          // Double nod: natural spring dip & rebound
          const wave = Math.sin(p * Math.PI * 3.4) * Math.pow(1 - p, 1.1);
          gestureHeadPitch = wave * 0.17 * g.intensity;
          gestureNeckPitch = wave * 0.07 * g.intensity;
        } else if (g.type === "tilt") {
          // Curious head tilt
          const wave = Math.sin(p * Math.PI) * Math.pow(1 - p, 0.5);
          gestureHeadRoll = wave * 0.14 * g.intensity;
          gestureHeadYaw = wave * 0.035 * g.intensity;
        } else if (g.type === "shake") {
          // Empathetic / thoughtful head shake
          const wave = Math.sin(p * Math.PI * 3.0) * Math.pow(1 - p, 1.1);
          gestureHeadYaw = wave * 0.13 * g.intensity;
        }
      } else {
        g.type = "none";
      }
    }

    // 2. Listening Micro-Nods (when user is speaking)
    if (listening && g.type === "none") {
      listeningNodTimer.current -= dt;
      if (listeningNodTimer.current <= 0) {
        listeningNodTimer.current = 4.0 + Math.random() * 3.5;
        gestureState.current = {
          type: "nod",
          startTime: t,
          duration: 0.85,
          intensity: 0.45, // subtle acknowledgment
        };
      }
    }

    // 3. Natural Seated Posture Weight Shifts
    postureShiftTimer.current -= dt;
    if (postureShiftTimer.current <= 0) {
      postureShiftTimer.current = 9.0 + Math.random() * 8.0;
      targetLean.current = (Math.random() - 0.5) * 0.055;
      targetSlouch.current = (Math.random() - 0.5) * 0.035;
    }
    currentLean.current += (targetLean.current - currentLean.current) * dt * 0.7;
    currentSlouch.current += (targetSlouch.current - currentSlouch.current) * dt * 0.7;

    // 4. Natural gaze and subtle micro-saccades
    const gaze = gazeRef.current;
    const saccade = Math.sin(t * 1.8) > 0.94 ? (Math.sin(t * 12) * 0.012) : 0;
    const targetHeadY =
      (gaze === "away" ? 0.22 : Math.sin(t * 0.35) * 0.038 + saccade) + gestureHeadYaw;
    const targetHeadX =
      (gaze === "down" ? 0.14 : Math.sin(t * 0.28) * 0.022) + gestureHeadPitch;
    const targetHeadZ = Math.sin(t * 0.25) * 0.01 + gestureHeadRoll;

    // Subtle breathing presence
    const amp = active ? 1.35 : 1.0;
    const breath = Math.sin(t * (active ? 1.8 : 1.15)) * 0.013 * amp;

    if (bones.head) {
      if (!initialHeadRot.current) initialHeadRot.current = bones.head.rotation.clone();
      if (bones.isBip) {
        // Bip001: Z is Up (Yaw), X is Sideways (Pitch), Y is Forward (Roll)
        bones.head.rotation.x = initialHeadRot.current.x - targetHeadX * 0.6;
        bones.head.rotation.z = initialHeadRot.current.z + targetHeadY * 0.7;
        bones.head.rotation.y = initialHeadRot.current.y + gestureHeadRoll * 0.6;
      } else {
        bones.head.rotation.y += (targetHeadY - bones.head.rotation.y) * 0.06;
        bones.head.rotation.x += (targetHeadX - bones.head.rotation.x) * 0.06;
        bones.head.rotation.z += (targetHeadZ - bones.head.rotation.z) * 0.06;
      }
    }
    if (bones.neck) {
      if (!initialNeckRot.current) initialNeckRot.current = bones.neck.rotation.clone();
      if (bones.isBip) {
        bones.neck.rotation.x = initialNeckRot.current.x - targetHeadX * 0.25;
        bones.neck.rotation.z = initialNeckRot.current.z + targetHeadY * 0.25;
      } else {
        bones.neck.rotation.y += (targetHeadY * 0.3 - bones.neck.rotation.y) * 0.05;
        bones.neck.rotation.x +=
          (targetHeadX * 0.3 + config.seat.lean * 0.08 + gestureNeckPitch - bones.neck.rotation.x) *
          0.05;
        bones.neck.rotation.z += (targetHeadZ * 0.25 - bones.neck.rotation.z) * 0.05;
      }
    }
    if (bones.spine1) {
      bones.spine1.rotation.x = breath + config.seat.lean * 0.12 + currentSlouch.current;
      bones.spine1.rotation.z = Math.sin(t * 0.38) * 0.005 * amp + currentLean.current;
      bones.spine1.rotation.y = currentLean.current * 0.35;
    }
    if (bones.spine) {
      bones.spine.rotation.z = currentLean.current * 0.45;
      bones.spine.rotation.x = currentSlouch.current * 0.5;
    }
    if (bones.leftShoulder && bones.rightShoulder) {
      bones.leftShoulder.rotation.z = -currentLean.current * 0.35 + breath * 0.006;
      bones.rightShoulder.rotation.z = currentLean.current * 0.35 - breath * 0.006;
    }
  });

  // Seat placement: offsets down so head is positioned at ideal conversational camera height (~1.0m)
  const seatPos = config.seat.position;
  return (
    <primitive
      object={avatar}
      position={[seatPos[0], seatPos[1] - 0.95, seatPos[2]]}
      rotation={[0, config.seat.rotationY || 0, 0]}
    />
  );
}

function Lights({ active, config }: { active: boolean; config: SceneConfig }) {
  const key = useRef<THREE.SpotLight>(null);
  useFrame(() => {
    if (!key.current) return;
    const t = performance.now() / 1000;
    const goal = active ? 5.8 + Math.sin(t * 2.6) * 1.2 : 4.2;
    key.current.intensity += (goal - key.current.intensity) * 0.06;
  });

  return (
    <>
      <ambientLight intensity={0.28} color={config.fill} />
      <hemisphereLight intensity={0.32} color={config.fill} groundColor={config.floor} />
      <spotLight
        ref={key}
        position={[0.35, 1.9, 1.4]}
        angle={0.85}
        penumbra={0.85}
        intensity={4.2}
        distance={10}
        decay={1.4}
        color={config.key}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-2.2, 2.4, 0.6]} intensity={0.35} color={config.fill} />
      <pointLight
        position={[0.15, 1.25, 0.95]}
        intensity={1.4}
        distance={3.5}
        decay={1.4}
        color="#ffd7ad"
      />
    </>
  );
}

function Camera({ config }: { config: SceneConfig }) {
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    const t = performance.now() / 1000;
    camera.position.set(
      config.camera.position[0] + Math.sin(t * 0.17) * 0.015,
      config.camera.position[1] + Math.sin(t * 0.23) * 0.01,
      config.camera.position[2],
    );
    camera.lookAt(...config.camera.target);
  });
  return null;
}

export default function AvatarFace({
  engine,
  gazeRef,
  active,
  listening = false,
  headGesture,
  gestureKey,
  config,
}: {
  engine: EmotionEngine;
  gazeRef: { current: string };
  active: boolean;
  listening?: boolean;
  headGesture?: string;
  gestureKey?: number;
  config: SceneConfig;
}) {
  return (
    <Canvas
      shadows
      camera={{ position: config.camera.position, fov: config.camera.fov }}
      dpr={[1, 2]}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
    >
      <color attach="background" args={[config.wall]} />
      <fog attach="fog" args={[config.wall, 7, 18]} />
      <Camera config={config} />
      <Suspense fallback={null}>
        <Lights active={active} config={config} />
        <Room config={config} active={active} />
        <RealisticAvatar
          engine={engine}
          gazeRef={gazeRef}
          active={active}
          listening={listening}
          headGesture={headGesture}
          gestureKey={gestureKey}
          config={config}
        />
        <Environment>
          <Lightformer intensity={0.35} position={[0, 3, 1]} scale={[6, 4, 1]} color="#ffe4c4" />
          <Lightformer
            intensity={0.35}
            color={config.fill}
            position={[-3, 1.5, -1]}
            rotation-y={Math.PI / 2}
            scale={[8, 3, 1]}
          />
        </Environment>
      </Suspense>
    </Canvas>
  );
}
