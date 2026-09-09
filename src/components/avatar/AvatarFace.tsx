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
  listening?: boolean | undefined;
  headGesture?: string | undefined;
  gestureKey?: number | undefined;
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

interface BonesDict {
  head: THREE.Bone | null;
  neck: THREE.Bone | null;
  spine: THREE.Bone | null;
  spine1: THREE.Bone | null;
  leftShoulder: THREE.Bone | null;
  rightShoulder: THREE.Bone | null;
  leftArm: THREE.Bone | null;
  rightArm: THREE.Bone | null;
  leftForearm: THREE.Bone | null;
  rightForearm: THREE.Bone | null;
  leftThigh: THREE.Bone | null;
  rightThigh: THREE.Bone | null;
  leftCalf: THREE.Bone | null;
  rightCalf: THREE.Bone | null;
  mouth: THREE.Bone | null;
  lowerLip: THREE.Bone | null;
  upperEyelidL: THREE.Bone | null;
  upperEyelidR: THREE.Bone | null;
  lowerEyelidL: THREE.Bone | null;
  lowerEyelidR: THREE.Bone | null;
  browL: THREE.Bone | null;
  browR: THREE.Bone | null;
  eyeballL: THREE.Bone | null;
  eyeballR: THREE.Bone | null;
  isBip: boolean;
  isBipPosed?: boolean;
}

  // Locate skeletal bones for posing and lifelike head/face movement across rigs
  // (ReadyPlayerMe, Daz Genesis 3/8/8.1/9, Mixamo, Unreal, 3ds Max Bip001)
  const bones = useMemo<BonesDict>(() => {
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
    // Helper avoids TS narrowing bug where Bone|null collapses to 'never'
    const rot = (bone: THREE.Bone | null, x: number, y: number, z: number) => {
      if (bone) bone.rotation.set(x, y, z);
    };
    const rotAdd = (bone: THREE.Bone | null, axis: "x" | "y" | "z", deg: number) => {
      if (bone) bone.rotation[axis] += deg * (Math.PI / 180);
    };
    const d = (deg: number) => deg * (Math.PI / 180);

    // Detect if this is Mint / companion_female rig (Unity Humanoid naming)
    const isCompanion = !!(
      bones.leftThigh?.name.toLowerCase().includes("leftupleg") ||
      bones.leftCalf?.name.toLowerCase().includes("leftleg") ||
      (bones.leftArm?.name.toLowerCase() === "leftarm" &&
        bones.leftForearm?.name.toLowerCase() === "leftforearm")
    );

    if (isCompanion) {
      // 1. Pose legs to sit comfortably on chair (thighs horizontal, calves vertical)
      rot(bones.leftThigh, d(6.47 - 82), 0, d(-176.15));
      rot(bones.leftCalf, d(-4.32 - 85), d(0.04), d(-0.11));

      rot(bones.rightThigh, d(6.47 - 82), 0, d(176.15));
      rot(bones.rightCalf, d(-4.32 - 85), d(-0.04), d(0.11));

      // 2. Pose arms to rest naturally on lap (symmetrical, hands forward and flat)
      rot(bones.leftArm, d(68), d(12), d(-15));
      rot(bones.leftForearm, d(1.96 + 35), d(-0.61), d(27.51 - 50));

      rot(bones.rightArm, d(68), d(-12), d(15));
      rot(bones.rightForearm, d(1.96 + 35), d(0.61), d(-27.51 + 50));

      // 3. Natural upright spine & gentle head tilt
      rot(bones.spine1, d(-4.17 + 5), 0, 0);
      rot(bones.head, d(-6.12), 0, d(2.5));
    } else if (bones.isBip) {
      rot(bones.leftThigh, -Math.PI, 0, d(179.6 - 82));
      rot(bones.rightThigh, -Math.PI, 0, d(179.6 - 82));
      rot(bones.leftCalf, 0, 0, d(-2.3 + 86));
      rot(bones.rightCalf, 0, 0, d(-2.3 + 86));

      // Bip001 rig (Mint): bone local X aligns along the bone length
      // Swing arms down and forward to rest naturally on thighs
      rot(bones.leftArm, d(-88), d(28), d(-100));
      rot(bones.leftForearm, d(90), 0, d(30));
      rot(bones.rightArm, d(90), d(30), d(-80));
      rot(bones.rightForearm, d(90), 0, d(-30));
    } else {
      // Standard rigs (Mixamo / ReadyPlayerMe)
      rot(bones.leftArm, 1.31, 0.19, 0.12);
      rot(bones.rightArm, 1.31, -0.19, -0.12);
      rot(bones.leftForearm, 0.18, 0.12, 0.38);
      rot(bones.rightForearm, 0.18, -0.12, -0.38);
      rot(bones.leftThigh, 1.48, 0.1, 0.08);
      rot(bones.rightThigh, 1.48, -0.1, -0.08);
      rot(bones.leftCalf, -1.42, 0, 0);
      rot(bones.rightCalf, -1.42, 0, 0);
    }

    // Reset cached initial rotations so useFrame recaptures post-pose values
    initialSpineRot.current = null;
    initialSpine1Rot.current = null;
    initialShoulderLRot.current = null;
    initialShoulderRRot.current = null;
    initialLeftArmRot.current = null;
    initialRightArmRot.current = null;
    initialLeftForearmRot.current = null;
    initialRightForearmRot.current = null;
    initialHeadRot.current = null;
    initialNeckRot.current = null;
    poseApplied.current = true;
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
  const initialSpineRot = useRef<THREE.Euler | null>(null);
  const initialSpine1Rot = useRef<THREE.Euler | null>(null);
  const initialShoulderLRot = useRef<THREE.Euler | null>(null);
  const initialShoulderRRot = useRef<THREE.Euler | null>(null);
  const initialLeftArmRot = useRef<THREE.Euler | null>(null);
  const initialRightArmRot = useRef<THREE.Euler | null>(null);
  const initialLeftForearmRot = useRef<THREE.Euler | null>(null);
  const initialRightForearmRot = useRef<THREE.Euler | null>(null);
  // Set to true after seated-pose useEffect runs so useFrame captures post-pose values
  const poseApplied = useRef<boolean>(false);
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

    // Don't animate bones until the seated pose useEffect has run at least once
    const poseReady = poseApplied.current;

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
      const jaw = weights["jawOpen"] ?? 0;
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
    const mouthBone = bones.mouth;
    if (mouthBone) {
      if (!initialMouthPos.current) initialMouthPos.current = mouthBone.position.clone();
      if (!initialMouthRot.current) initialMouthRot.current = mouthBone.rotation.clone();

      const initPos = initialMouthPos.current;
      const initRot = initialMouthRot.current;
      if (initPos && initRot) {
        const jaw = weights["jawOpen"] ?? 0;
        mouthBone.position.x = initPos.x - jaw * 0.007;
        mouthBone.position.y = initPos.y - jaw * 0.009;
        mouthBone.rotation.z = initRot.z - jaw * 0.35;
      }

      const lipBone = bones.lowerLip;
      if (lipBone) {
        if (!initialLowerLipPos.current) initialLowerLipPos.current = lipBone.position.clone();
        const initLipPos = initialLowerLipPos.current;
        if (initLipPos) {
          const jaw = weights["jawOpen"] ?? 0;
          lipBone.position.y = initLipPos.y - jaw * 0.006;
        }
      }
    }

    // Bone-driven eyelids (blinking)
    const blink = Math.max(weights["eyeBlinkLeft"] ?? 0, weights["eyeBlinkRight"] ?? 0);
    const ueL = bones.upperEyelidL, ueR = bones.upperEyelidR;
    if (ueL && ueR) {
      if (!initialUpperEyelidLPos.current) initialUpperEyelidLPos.current = ueL.position.clone();
      if (!initialUpperEyelidRPos.current) initialUpperEyelidRPos.current = ueR.position.clone();
      const initUel = initialUpperEyelidLPos.current;
      const initUer = initialUpperEyelidRPos.current;
      if (initUel && initUer) {
        ueL.position.y = initUel.y - blink * 0.009;
        ueR.position.y = initUer.y - blink * 0.009;
      }
    }
    const leL = bones.lowerEyelidL, leR = bones.lowerEyelidR;
    if (leL && leR) {
      if (!initialLowerEyelidLPos.current) initialLowerEyelidLPos.current = leL.position.clone();
      if (!initialLowerEyelidRPos.current) initialLowerEyelidRPos.current = leR.position.clone();
      const initLel = initialLowerEyelidLPos.current;
      const initLer = initialLowerEyelidRPos.current;
      if (initLel && initLer) {
        leL.position.y = initLel.y + blink * 0.004;
        leR.position.y = initLer.y + blink * 0.004;
      }
    }

    // Bone-driven eyebrows
    const browUp = (weights["browInnerUp"] ?? 0) - (weights["browDownLeft"] ?? 0);
    const bL = bones.browL, bR = bones.browR;
    if (bL && bR) {
      if (!initialBrowLPos.current) initialBrowLPos.current = bL.position.clone();
      if (!initialBrowRPos.current) initialBrowRPos.current = bR.position.clone();
      const initBl = initialBrowLPos.current;
      const initBr = initialBrowRPos.current;
      if (initBl && initBr) {
        bL.position.y = initBl.y + browUp * 0.005;
        bR.position.y = initBr.y + browUp * 0.005;
      }
    }

    // 1. Gesture Offsets Calculation
    // Only animate body/head bones after seated pose has been applied
    if (!poseReady) return;

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

    const headBone = bones.head;
    if (headBone) {
      if (!initialHeadRot.current) initialHeadRot.current = headBone.rotation.clone();
      const initHead = initialHeadRot.current;
      if (initHead) {
        if (bones.isBip) {
          // Bip001: Z is Up (Yaw), X is Sideways (Pitch), Y is Forward (Roll)
          headBone.rotation.x = initHead.x - targetHeadX * 0.6;
          headBone.rotation.z = initHead.z + targetHeadY * 0.7;
          headBone.rotation.y = initHead.y + gestureHeadRoll * 0.6;
        } else {
          // Lerp toward target offset from initial rest rotation
          const goalY = initHead.y + targetHeadY;
          const goalX = initHead.x + targetHeadX;
          const goalZ = initHead.z + targetHeadZ;
          headBone.rotation.y += (goalY - headBone.rotation.y) * 0.06;
          headBone.rotation.x += (goalX - headBone.rotation.x) * 0.06;
          headBone.rotation.z += (goalZ - headBone.rotation.z) * 0.06;
        }
      }
    }
    const neckBone = bones.neck;
    if (neckBone) {
      if (!initialNeckRot.current) initialNeckRot.current = neckBone.rotation.clone();
      const initNeck = initialNeckRot.current;
      if (initNeck) {
        if (bones.isBip) {
          neckBone.rotation.x = initNeck.x - targetHeadX * 0.25;
          neckBone.rotation.z = initNeck.z + targetHeadY * 0.25;
        } else {
          const goalNeckY = initNeck.y + targetHeadY * 0.3;
          const goalNeckX = initNeck.x + targetHeadX * 0.3 + config.seat.lean * 0.08 + gestureNeckPitch;
          const goalNeckZ = initNeck.z + targetHeadZ * 0.25;
          neckBone.rotation.y += (goalNeckY - neckBone.rotation.y) * 0.05;
          neckBone.rotation.x += (goalNeckX - neckBone.rotation.x) * 0.05;
          neckBone.rotation.z += (goalNeckZ - neckBone.rotation.z) * 0.05;
        }
      }
    }
    const spine1Bone = bones.spine1;
    if (spine1Bone) {
      if (!initialSpine1Rot.current) initialSpine1Rot.current = spine1Bone.rotation.clone();
      const init = initialSpine1Rot.current;
      if (init) {
        spine1Bone.rotation.x = init.x + breath + config.seat.lean * 0.12 + currentSlouch.current;
        spine1Bone.rotation.z = init.z + Math.sin(t * 0.38) * 0.005 * amp + currentLean.current;
        spine1Bone.rotation.y = init.y + currentLean.current * 0.35;
      }
    }
    const spineBone = bones.spine;
    if (spineBone) {
      if (!initialSpineRot.current) initialSpineRot.current = spineBone.rotation.clone();
      const init = initialSpineRot.current;
      if (init) {
        spineBone.rotation.z = init.z + currentLean.current * 0.45;
        spineBone.rotation.x = init.x + currentSlouch.current * 0.5;
      }
    }
    const lShoulder = bones.leftShoulder, rShoulder = bones.rightShoulder;
    if (lShoulder && rShoulder) {
      if (!initialShoulderLRot.current) initialShoulderLRot.current = lShoulder.rotation.clone();
      if (!initialShoulderRRot.current) initialShoulderRRot.current = rShoulder.rotation.clone();
      const initL = initialShoulderLRot.current;
      const initR = initialShoulderRRot.current;
      if (initL && initR) {
        lShoulder.rotation.z = initL.z - currentLean.current * 0.15 + breath * 0.008;
        rShoulder.rotation.z = initR.z + currentLean.current * 0.15 - breath * 0.008;
      }
    }

    // Subtle conversational breathing & gentle arm presence
    // CRITICAL: use absolute assignment from initial rotation, NOT += (which accumulates to infinity)
    const jawVal = weights["jawOpen"] ?? 0;
    if (bones.leftArm && bones.rightArm) {
      if (!initialLeftArmRot.current) initialLeftArmRot.current = bones.leftArm.rotation.clone();
      if (!initialRightArmRot.current) initialRightArmRot.current = bones.rightArm.rotation.clone();
    }
    if (bones.leftForearm && bones.rightForearm) {
      if (!initialLeftForearmRot.current) initialLeftForearmRot.current = bones.leftForearm.rotation.clone();
      if (!initialRightForearmRot.current) initialRightForearmRot.current = bones.rightForearm.rotation.clone();
      const initLF = initialLeftForearmRot.current;
      const initRF = initialRightForearmRot.current;
      if (initLF && initRF) {
        // Gentle sinusoidal sway offset from the INITIAL (seated) pose — never accumulates
        const armSway = Math.sin(t * 1.6) * 0.003 * (jawVal > 0.05 ? 1.3 : 0.7);
        bones.leftForearm.rotation.z = initLF.z + armSway;
        bones.rightForearm.rotation.z = initRF.z - armSway;
      }
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
  listening?: boolean | undefined;
  headGesture?: string | undefined;
  gestureKey?: number | undefined;
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
