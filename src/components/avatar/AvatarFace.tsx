import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, Lightformer } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { KTX2Loader } from "three-stdlib";

import type { EmotionEngine } from "@/lib/emotion";
import { Body } from "@/components/avatar/Body";
import { Room } from "@/components/avatar/Room";
import { FURNITURE_MODELS, type SceneConfig } from "@/lib/scenes";

const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/facecap.glb";

const TRANSCODER_PATH =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/jsm/libs/basis/";

/** Real head height, in metres — keeps the face in scale with the body. */
const HEAD_HEIGHT = 0.285;

for (const url of FURNITURE_MODELS) useGLTF.preload(url);

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

type Targets = { mesh: THREE.Mesh; map: Map<string, number> };

function Head({ engine, gazeRef }: { engine: EmotionEngine; gazeRef: { current: string } }) {
  const gl = useThree((state) => state.gl);
  const extend = useMemo(
    () => (loader: { setKTX2Loader?: (l: KTX2Loader) => unknown }) => {
      const ktx2 = new KTX2Loader().setTranscoderPath(TRANSCODER_PATH).detectSupport(gl);
      loader.setKTX2Loader?.(ktx2);
    },
    [gl],
  );
  const { scene } = useGLTF(MODEL_URL, true, true, extend);
  const group = useRef<THREE.Group>(null);
  const model = useMemo(() => scene.clone(true), [scene]);

  const targets = useMemo<Targets[]>(() => {
    const found: Targets[] = [];
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        const map = new Map<string, number>();
        for (const [key, index] of Object.entries(mesh.morphTargetDictionary)) {
          map.set(normalize(key), index as number);
        }
        found.push({ mesh, map });
      }
    });
    return found;
  }, [model]);

  // Frame the head consistently regardless of the model's own scale/origin.
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = HEAD_HEIGHT / Math.max(size.y || 1, 0.0001);
    return { scale, center };
  }, [model]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const weights = engine.tick(dt);
    for (const { mesh, map } of targets) {
      const influences = mesh.morphTargetInfluences;
      if (!influences) continue;
      for (const [name, value] of Object.entries(weights)) {
        const index = map.get(normalize(name));
        if (index !== undefined) influences[index] = Math.min(Math.max(value, 0), 1);
      }
    }

    if (group.current) {
      const t = performance.now() / 1000;
      const gaze = gazeRef.current;
      const targetY = gaze === "away" ? 0.26 : Math.sin(t * 0.31) * 0.06;
      const targetX = gaze === "down" ? 0.16 : Math.sin(t * 0.24) * 0.035;
      group.current.rotation.y += (targetY - group.current.rotation.y) * 0.035;
      group.current.rotation.x += (targetX - group.current.rotation.x) * 0.035;
    }
  });

  return (
    <group ref={group}>
      <primitive
        object={model}
        scale={fit.scale}
        position={[
          -fit.center.x * fit.scale,
          -fit.center.y * fit.scale,
          -fit.center.z * fit.scale,
        ]}
      />
    </group>
  );
}

function Lights({ active, config }: { active: boolean; config: SceneConfig }) {
  const key = useRef<THREE.SpotLight>(null);
  useFrame(() => {
    if (!key.current) return;
    const t = performance.now() / 1000;
    const goal = active ? 5.5 + Math.sin(t * 2.6) * 1.3 : 3.8;
    key.current.intensity += (goal - key.current.intensity) * 0.06;
  });
  return (
    <>
      <ambientLight intensity={0.12} color={config.fill} />
      <hemisphereLight intensity={0.14} color={config.fill} groundColor={config.floor} />
      {/* the "screen" light on her face, coming from the camera side */}
      <spotLight
        ref={key}
        position={[0.35, 1.75, 1.3]}
        angle={0.85}
        penumbra={0.9}
        intensity={3.8}
        distance={9}
        decay={1.5}
        color={config.key}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-2.2, 2.4, 0.6]} intensity={0.22} color={config.fill} />
      {/* close warm fill, so her face never reads grey */}
      <pointLight position={[0.15, 1.15, 0.85]} intensity={1.1} distance={3} decay={1.4} color="#ffd7ad" />
    </>
  );
}

function Camera({ config }: { config: SceneConfig }) {
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    const t = performance.now() / 1000;
    // a barely-there handheld drift, like a webcam on a desk
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
  useEffect(() => {
    return () => useGLTF.clear(MODEL_URL);
  }, []);

  return (
    <Canvas
      shadows
      camera={{ position: config.camera.position, fov: config.camera.fov }}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[config.wall]} />
      <fog attach="fog" args={[config.wall, 7, 18]} />
      <Camera config={config} />
      <Suspense fallback={null}>
        <Lights active={active} config={config} />
        <Room config={config} active={active} />
        <Body seat={config.seat.position} lean={config.seat.lean} active={active}>
          <Head engine={engine} gazeRef={gazeRef} />
        </Body>
        <Environment>
          <Lightformer intensity={0.3} position={[0, 3, 1]} scale={[6, 4, 1]} color="#ffe4c4" />
          <Lightformer
            intensity={0.3}
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
