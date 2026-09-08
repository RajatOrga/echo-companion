import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { Prop, SceneConfig } from "@/lib/scenes";

function FurniturePiece({ prop }: { prop: Prop }) {
  const { scene } = useGLTF(`/models/furniture/${prop.model}.glb`);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  return (
    <primitive
      object={model}
      position={prop.position}
      rotation-y={prop.rotationY ?? 0}
      scale={prop.scale ?? 1}
    />
  );
}

/** The practical light in the room — a lamp or a window — breathes gently. */
function Practicals({ config, active }: { config: SceneConfig; active: boolean }) {
  const lamp = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (!lamp.current) return;
    const t = performance.now() / 1000;
    const goal = (active ? 2.8 : 2.1) + Math.sin(t * 0.7) * 0.25;
    lamp.current.intensity += (goal - lamp.current.intensity) * 0.05;
  });

  const bedroom = config.id === "bedroom";
  return (
    <>
      <pointLight
        ref={lamp}
        position={bedroom ? [-1.45, 0.75, -1.6] : [1.55, 1.45, -1.85]}
        intensity={2.1}
        distance={7}
        decay={1.6}
        color={bedroom ? "#ffb066" : "#cfe0ff"}
      />
      {/* cool daylight leaking through the window behind her */}
      <rectAreaLight
        position={[-0.15, 1.5, -2.25]}
        width={1.7}
        height={1.3}
        intensity={bedroom ? 0.7 : 0.85}
        color={bedroom ? "#7f86c8" : "#bcd3ff"}
      />
    </>
  );
}

export function Room({ config, active }: { config: SceneConfig; active: boolean }) {
  return (
    <group>
      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -0.4]} receiveShadow>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial color={config.floor} roughness={0.85} metalness={0.02} />
      </mesh>
      {/* back + side walls, behind the kit wall pieces so no seams show */}
      <mesh position={[0, 1.5, -2.45]} receiveShadow>
        <planeGeometry args={[9, 3]} />
        <meshStandardMaterial color={config.wall} roughness={0.95} />
      </mesh>
      <mesh position={[-3.1, 1.5, -0.4]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[5, 3]} />
        <meshStandardMaterial color={config.wall} roughness={0.95} />
      </mesh>
      <mesh position={[3.1, 1.5, -0.4]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[5, 3]} />
        <meshStandardMaterial color={config.wall} roughness={0.95} />
      </mesh>

      {config.props.map((prop, index) => (
        <FurniturePiece key={`${prop.model}-${index}`} prop={prop} />
      ))}

      <Practicals config={config} active={active} />
    </group>
  );
}
