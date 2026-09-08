import { useFrame } from "@react-three/fiber";
import { type ReactNode, useRef } from "react";
import * as THREE from "three";

/**
 * A seated figure, built from primitives and posed by hand: hips on the seat,
 * a slight forward lean, hands resting forward. The head is passed in as a
 * child so the expressive face model rides on top of the neck.
 */

const SKIN = "#c98f6d";
const CLOTH = "#3d4457";
const CLOTH_DARK = "#2b3040";
const HAIR = "#241c22";

function Limb({
  position,
  rotation,
  radius,
  length,
  color,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  radius: number;
  length: number;
  color: string;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <capsuleGeometry args={[radius, length, 6, 14]} />
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>
  );
}

export function Body({
  seat,
  lean,
  active,
  children,
}: {
  seat: [number, number, number];
  lean: number;
  active: boolean;
  children: ReactNode;
}) {
  const upper = useRef<THREE.Group>(null);
  const chest = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = performance.now() / 1000;
    if (upper.current) {
      // breathing + a small live sway; a touch more alive while talking
      const amp = active ? 1.4 : 1;
      const sway = Math.sin(t * 0.42) * 0.02 * amp;
      const nodding = Math.sin(t * 0.31) * 0.012 * amp;
      upper.current.rotation.z += (sway - upper.current.rotation.z) * (1 - Math.exp(-dt * 2));
      upper.current.rotation.x +=
        (lean + nodding - upper.current.rotation.x) * (1 - Math.exp(-dt * 2));
    }
    if (chest.current) {
      const breath = 1 + Math.sin(t * (active ? 1.5 : 1.05)) * 0.014;
      chest.current.scale.set(breath, 1, breath);
    }
  });

  return (
    <group position={seat}>
      {/* legs, dropping off the seat toward the camera */}
      <Limb
        position={[-0.13, -0.03, 0.16]}
        rotation={[Math.PI / 2.1, 0, 0.06]}
        radius={0.095}
        length={0.28}
        color={CLOTH_DARK}
      />
      <Limb
        position={[0.14, -0.03, 0.16]}
        rotation={[Math.PI / 2.1, 0, -0.06]}
        radius={0.095}
        length={0.28}
        color={CLOTH_DARK}
      />
      <Limb
        position={[-0.14, -0.28, 0.3]}
        rotation={[0.08, 0, 0.05]}
        radius={0.075}
        length={0.24}
        color={CLOTH_DARK}
      />
      <Limb
        position={[0.15, -0.28, 0.3]}
        rotation={[0.08, 0, -0.05]}
        radius={0.075}
        length={0.24}
        color={CLOTH_DARK}
      />

      <group ref={upper} rotation={[lean, 0, 0]}>
        {/* hips + torso */}
        <mesh position={[0, 0.02, 0]} castShadow>
          <capsuleGeometry args={[0.155, 0.1, 6, 16]} />
          <meshStandardMaterial color={CLOTH} roughness={0.78} />
        </mesh>
        <mesh ref={chest} position={[0, 0.27, -0.01]} castShadow>
          <capsuleGeometry args={[0.145, 0.26, 8, 20]} />
          <meshStandardMaterial color={CLOTH} roughness={0.78} />
        </mesh>
        {/* shoulders */}
        <mesh position={[0, 0.41, -0.01]} scale={[0.98, 0.54, 0.78]} castShadow>
          <sphereGeometry args={[0.155, 20, 16]} />
          <meshStandardMaterial color={CLOTH} roughness={0.78} />
        </mesh>

        {/* arms: upper arms down, forearms forward, hands resting */}
        <Limb
          position={[-0.2, 0.28, 0.01]}
          rotation={[0.14, 0, -0.05]}
          radius={0.058}
          length={0.2}
          color={CLOTH}
        />
        <Limb
          position={[0.2, 0.28, 0.01]}
          rotation={[0.14, 0, 0.05]}
          radius={0.058}
          length={0.2}
          color={CLOTH}
        />
        <Limb
          position={[-0.19, 0.1, 0.15]}
          rotation={[Math.PI / 2.4, 0, -0.08]}
          radius={0.05}
          length={0.2}
          color={SKIN}
        />
        <Limb
          position={[0.19, 0.1, 0.15]}
          rotation={[Math.PI / 2.4, 0, 0.08]}
          radius={0.05}
          length={0.2}
          color={SKIN}
        />
        <mesh position={[-0.18, 0.05, 0.29]} scale={[1, 0.7, 1.25]} castShadow>
          <sphereGeometry args={[0.055, 16, 14]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>
        <mesh position={[0.18, 0.05, 0.29]} scale={[1, 0.7, 1.25]} castShadow>
          <sphereGeometry args={[0.055, 16, 14]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>

        {/* sweater collar, so the neck reads as clothed */}
        <mesh position={[0, 0.48, -0.01]} castShadow>
          <cylinderGeometry args={[0.082, 0.1, 0.08, 18]} />
          <meshStandardMaterial color={CLOTH} roughness={0.8} />
        </mesh>

        {/* neck */}
        <mesh position={[0, 0.51, -0.01]} castShadow>
          <cylinderGeometry args={[0.052, 0.062, 0.1, 16]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>

        {/* hair mass behind the head, so the face model doesn't float */}
        <mesh position={[0, 0.7, -0.075]} scale={[1.0, 1.02, 0.95]}>
          <sphereGeometry args={[0.092, 20, 18]} />
          <meshStandardMaterial color={HAIR} roughness={0.85} />
        </mesh>

        <group position={[0, 0.64, 0.01]}>{children}</group>
      </group>
    </group>
  );
}
