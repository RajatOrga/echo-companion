import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, Lightformer } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { EmotionEngine } from "@/lib/emotion";
import { Room } from "@/components/avatar/Room";
import { AVATAR_MODELS, FURNITURE_MODELS, type SceneConfig } from "@/lib/scenes";

for (const url of AVATAR_MODELS) useGLTF.preload(url);
for (const url of FURNITURE_MODELS) useGLTF.preload(url);

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
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
  const avatar = useMemo(() => scene.clone(true), [scene]);

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
          if (m && "roughness" in m) {
            const mat = m as THREE.MeshStandardMaterial;
            const name = mesh.name.toLowerCase();
            if (name.includes("outfit") || name.includes("hair") || name.includes("top") || name.includes("bottom")) {
              mat.roughness = 0.88;
              mat.metalness = 0.02;
            } else if (name.includes("skin") || name.includes("head") || name.includes("body")) {
              mat.roughness = 0.62;
              mat.metalness = 0.0;
            } else if (!name.includes("eye")) {
              mat.roughness = Math.max(mat.roughness ?? 0.7, 0.65);
              mat.metalness = Math.min(mat.metalness ?? 0, 0.1);
            }
          }
        }

        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
          const map = new Map<string, number>();
          for (const [key, index] of Object.entries(mesh.morphTargetDictionary)) {
            map.set(normalize(key), index as number);
          }
          found.push({ mesh, map });
        }
      }
    });
    return found;
  }, [avatar]);

  // Locate skeletal bones for posing and lifelike head movement
  const bones = useMemo(() => {
    let head: THREE.Bone | null = null;
    let neck: THREE.Bone | null = null;
    let spine: THREE.Bone | null = null;
    let spine1: THREE.Bone | null = null;
    let leftShoulder: THREE.Bone | null = null;
    let rightShoulder: THREE.Bone | null = null;
    let leftArm: THREE.Bone | null = null;
    let rightArm: THREE.Bone | null = null;

    avatar.traverse((child) => {
      if (child.type === "Bone") {
        if (child.name === "Head") head = child as THREE.Bone;
        else if (child.name === "Neck") neck = child as THREE.Bone;
        else if (child.name === "Spine") spine = child as THREE.Bone;
        else if (child.name === "Spine1" || child.name === "Spine2") spine1 = child as THREE.Bone;
        else if (child.name === "LeftShoulder") leftShoulder = child as THREE.Bone;
        else if (child.name === "RightShoulder") rightShoulder = child as THREE.Bone;
        else if (child.name === "LeftArm") leftArm = child as THREE.Bone;
        else if (child.name === "RightArm") rightArm = child as THREE.Bone;
      }
    });
    return { head, neck, spine, spine1, leftShoulder, rightShoulder, leftArm, rightArm };
  }, [avatar]);

  // Natural seated pose setup
  useEffect(() => {
    avatar.traverse((child) => {
      if (child.type === "Bone") {
        const bone = child as THREE.Bone;
        // Pose legs into a seated position
        if (bone.name === "LeftArm") {
          bone.rotation.set(1.31, 0.19, 0.12);
        } else if (bone.name === "RightArm") {
          bone.rotation.set(1.31, -0.19, -0.12);
        } else if (bone.name === "LeftForeArm") {
          bone.rotation.set(0.18, 0.12, 0.38);
        } else if (bone.name === "RightForeArm") {
          bone.rotation.set(0.18, -0.12, -0.38);
        }
      }
    });
  }, [avatar]);

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
      bones.head.rotation.y += (targetHeadY - bones.head.rotation.y) * 0.06;
      bones.head.rotation.x += (targetHeadX - bones.head.rotation.x) * 0.06;
      bones.head.rotation.z += (targetHeadZ - bones.head.rotation.z) * 0.06;
    }
    if (bones.neck) {
      bones.neck.rotation.y += (targetHeadY * 0.3 - bones.neck.rotation.y) * 0.05;
      bones.neck.rotation.x +=
        (targetHeadX * 0.3 + config.seat.lean * 0.08 + gestureNeckPitch - bones.neck.rotation.x) *
        0.05;
      bones.neck.rotation.z += (targetHeadZ * 0.25 - bones.neck.rotation.z) * 0.05;
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
