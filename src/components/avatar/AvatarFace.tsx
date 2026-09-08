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
  config,
}: {
  engine: EmotionEngine;
  gazeRef: { current: string };
  active: boolean;
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

        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat.roughness !== undefined) {
            mat.roughness = Math.max(mat.roughness, 0.45);
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

    avatar.traverse((child) => {
      if (child.type === "Bone") {
        if (child.name === "Head") head = child as THREE.Bone;
        else if (child.name === "Neck") neck = child as THREE.Bone;
        else if (child.name === "Spine") spine = child as THREE.Bone;
        else if (child.name === "Spine1" || child.name === "Spine2") spine1 = child as THREE.Bone;
      }
    });
    return { head, neck, spine, spine1 };
  }, [avatar]);

  // Natural seated pose setup
  useEffect(() => {
    avatar.traverse((child) => {
      if (child.type === "Bone") {
        const bone = child as THREE.Bone;
        // Pose legs into a seated position
        if (bone.name === "LeftUpLeg") {
          bone.rotation.x = -Math.PI / 2.2;
          bone.rotation.z = 0.08;
          bone.rotation.y = -0.05;
        } else if (bone.name === "RightUpLeg") {
          bone.rotation.x = -Math.PI / 2.2;
          bone.rotation.z = -0.08;
          bone.rotation.y = 0.05;
        } else if (bone.name === "LeftLeg" || bone.name === "RightLeg") {
          bone.rotation.x = Math.PI / 2.1;
        } else if (bone.name === "LeftArm") {
          bone.rotation.z = -Math.PI / 3.4;
          bone.rotation.x = 0.35;
        } else if (bone.name === "RightArm") {
          bone.rotation.z = Math.PI / 3.4;
          bone.rotation.x = 0.35;
        } else if (bone.name === "LeftForeArm") {
          bone.rotation.x = 0.55;
        } else if (bone.name === "RightForeArm") {
          bone.rotation.x = 0.55;
        }
      }
    });
  }, [avatar]);

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

    // Natural gaze and subtle micro-movements
    const gaze = gazeRef.current;
    const targetHeadY = gaze === "away" ? 0.22 : Math.sin(t * 0.35) * 0.045;
    const targetHeadX = gaze === "down" ? 0.14 : Math.sin(t * 0.28) * 0.025;

    // Subtle breathing presence
    const amp = active ? 1.3 : 1.0;
    const breath = Math.sin(t * (active ? 1.8 : 1.2)) * 0.012 * amp;

    if (bones.head) {
      bones.head.rotation.y += (targetHeadY - bones.head.rotation.y) * 0.045;
      bones.head.rotation.x += (targetHeadX - bones.head.rotation.x) * 0.045;
      bones.head.rotation.z = Math.sin(t * 0.25) * 0.012;
    }
    if (bones.neck) {
      bones.neck.rotation.y += (targetHeadY * 0.35 - bones.neck.rotation.y) * 0.045;
      bones.neck.rotation.x +=
        (targetHeadX * 0.35 + config.seat.lean * 0.08 - bones.neck.rotation.x) * 0.045;
    }
    if (bones.spine1) {
      bones.spine1.rotation.x = breath + config.seat.lean * 0.12;
      bones.spine1.rotation.z = Math.sin(t * 0.4) * 0.006 * amp;
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
  config,
}: {
  engine: EmotionEngine;
  gazeRef: { current: string };
  active: boolean;
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
