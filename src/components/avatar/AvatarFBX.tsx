import { useFBX } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { EmotionEngine } from "@/lib/emotion";
import type { SceneConfig } from "@/lib/scenes";

export function FBXAvatar({
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
  const fbx = useFBX("/models/avatars/claudia.fbx");
  const avatar = useMemo(() => SkeletonUtils.clone(fbx), [fbx]);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load("/models/avatars/claudia_diffuse.jpg", (tex) => {
      tex.flipY = false;
      avatar.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of materials) {
            if (mat && "map" in mat) {
              (mat as THREE.MeshStandardMaterial).map = tex;
              (mat as THREE.MeshStandardMaterial).needsUpdate = true;
            }
          }
        }
      });
    });
  }, [avatar]);

  const bones = useMemo(() => {
    let head: THREE.Bone | null = null;
    let neck: THREE.Bone | null = null;
    let spine1: THREE.Bone | null = null;
    let jaw: THREE.Bone | null = null;
    let leftThigh: THREE.Bone | null = null;
    let rightThigh: THREE.Bone | null = null;
    let leftCalf: THREE.Bone | null = null;
    let rightCalf: THREE.Bone | null = null;
    let leftArm: THREE.Bone | null = null;
    let rightArm: THREE.Bone | null = null;
    let leftForearm: THREE.Bone | null = null;
    let rightForearm: THREE.Bone | null = null;
    let isBip = false;

    avatar.traverse((child) => {
      if (child.type === "Bone") {
        const n = child.name.toLowerCase();
        if (n.includes("bip001") || n.includes("bip_")) isBip = true;
        if (!head && n.includes("head") && !n.includes("end")) head = child as THREE.Bone;
        else if (!neck && n.includes("neck") && !n.includes("end")) neck = child as THREE.Bone;
        else if (!spine1 && (n === "spine1" || n.includes("chest"))) spine1 = child as THREE.Bone;
        else if (!jaw && (n.includes("jaw") || n.includes("mouth"))) jaw = child as THREE.Bone;
        else if (!leftThigh && (n.includes("thigh") || n.includes("upleg")) && (n.includes("l") || n.includes("left"))) leftThigh = child as THREE.Bone;
        else if (!rightThigh && (n.includes("thigh") || n.includes("upleg")) && (n.includes("r") || n.includes("right"))) rightThigh = child as THREE.Bone;
        else if (!leftCalf && (n.includes("calf") || n.includes("leg")) && (n.includes("l") || n.includes("left"))) leftCalf = child as THREE.Bone;
        else if (!rightCalf && (n.includes("calf") || n.includes("leg")) && (n.includes("r") || n.includes("right"))) rightCalf = child as THREE.Bone;
        else if (!leftArm && (n.includes("upperarm") || n.includes("l_arm"))) leftArm = child as THREE.Bone;
        else if (!rightArm && (n.includes("upperarm") || n.includes("r_arm"))) rightArm = child as THREE.Bone;
        else if (!leftForearm && n.includes("forearm") && (n.includes("l") || n.includes("left"))) leftForearm = child as THREE.Bone;
        else if (!rightForearm && n.includes("forearm") && (n.includes("r") || n.includes("right"))) rightForearm = child as THREE.Bone;
      }
    });
    return { head, neck, spine1, jaw, leftThigh, rightThigh, leftCalf, rightCalf, leftArm, rightArm, leftForearm, rightForearm, isBip };
  }, [avatar]);

  const poseApplied = useRef(false);
  useEffect(() => {
    const d = (deg: number) => deg * (Math.PI / 180);
    const rot = (bone: THREE.Bone | null, x: number, y: number, z: number) => {
      if (bone) bone.rotation.set(x, y, z);
    };
    if (bones.isBip) {
      rot(bones.leftThigh, -Math.PI, 0, d(179.6 - 82));
      rot(bones.rightThigh, -Math.PI, 0, d(179.6 - 82));
      rot(bones.leftCalf, 0, 0, d(-2.3 + 86));
      rot(bones.rightCalf, 0, 0, d(-2.3 + 86));
      rot(bones.leftArm, d(90), d(-30), d(80));
      rot(bones.leftForearm, d(90), 0, d(30));
      rot(bones.rightArm, d(90), d(30), d(-80));
      rot(bones.rightForearm, d(90), 0, d(-30));
    } else {
      rot(bones.leftArm, 1.31, 0.19, 0.12);
      rot(bones.rightArm, 1.31, -0.19, -0.12);
      rot(bones.leftForearm, 0.18, 0.12, 0.38);
      rot(bones.rightForearm, 0.18, -0.12, -0.38);
      rot(bones.leftThigh, 1.48, 0.1, 0.08);
      rot(bones.rightThigh, 1.48, -0.1, -0.08);
      rot(bones.leftCalf, -1.42, 0, 0);
      rot(bones.rightCalf, -1.42, 0, 0);
    }
    poseApplied.current = true;
    initHead.current = null;
    initNeck.current = null;
    initJaw.current = null;
    initSpine1.current = null;
  }, [bones]);

  const initHead = useRef<THREE.Euler | null>(null);
  const initNeck = useRef<THREE.Euler | null>(null);
  const initJaw = useRef<THREE.Euler | null>(null);
  const initSpine1 = useRef<THREE.Euler | null>(null);

  const morphTargets = useMemo(() => {
    const found: Array<{ mesh: THREE.SkinnedMesh; map: Map<string, number> }> = [];
    avatar.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        const map = new Map<string, number>();
        for (const [key, index] of Object.entries(mesh.morphTargetDictionary)) {
          map.set(key.toLowerCase().replace(/[^a-z0-9]/g, ""), index as number);
        }
        found.push({ mesh, map });
      }
    });
    return found;
  }, [avatar]);

  useFrame((_, delta) => {
    if (!poseApplied.current) return;
    const dt = Math.min(delta, 0.05);
    const weights = engine.tick(dt);
    const t = performance.now() / 1000;

    for (const { mesh, map } of morphTargets) {
      const influences = mesh.morphTargetInfluences;
      if (!influences) continue;
      for (const [name, value] of Object.entries(weights)) {
        const idx = map.get(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
        if (idx !== undefined) influences[idx] = Math.min(Math.max(value, 0), 1);
      }
    }

    const jawVal = weights["jawOpen"] ?? 0;
    if (bones.jaw) {
      if (!initJaw.current) initJaw.current = bones.jaw.rotation.clone();
      const init = initJaw.current;
      if (init) bones.jaw.rotation.x = init.x + jawVal * 0.22;
    }

    const gaze = gazeRef.current;
    const targetY = gaze === "away" ? 0.18 : Math.sin(t * 0.32) * 0.04;
    const targetX = Math.sin(t * 0.26) * 0.022;
    if (bones.head) {
      if (!initHead.current) initHead.current = bones.head.rotation.clone();
      const init = initHead.current;
      if (init) {
        if (bones.isBip) {
          bones.head.rotation.x = init.x - targetX * 0.6;
          bones.head.rotation.z = init.z + targetY * 0.7;
        } else {
          bones.head.rotation.y += (init.y + targetY - bones.head.rotation.y) * 0.06;
          bones.head.rotation.x += (init.x + targetX - bones.head.rotation.x) * 0.06;
        }
      }
    }
    if (bones.neck) {
      if (!initNeck.current) initNeck.current = bones.neck.rotation.clone();
      const init = initNeck.current;
      if (init) {
        bones.neck.rotation.y += (init.y + targetY * 0.3 - bones.neck.rotation.y) * 0.05;
        bones.neck.rotation.x += (init.x + targetX * 0.3 - bones.neck.rotation.x) * 0.05;
      }
    }

    const amp = active ? 1.3 : 1.0;
    if (bones.spine1) {
      if (!initSpine1.current) initSpine1.current = bones.spine1.rotation.clone();
      const init = initSpine1.current;
      if (init) {
        const breath = Math.sin(t * (active ? 1.8 : 1.1)) * 0.012 * amp;
        bones.spine1.rotation.x = init.x + breath;
      }
    }
  });

  const seatPos = config.seat.position;
  return (
    <primitive
      object={avatar}
      position={[seatPos[0], seatPos[1] - 0.95, seatPos[2]]}
      rotation={[0, config.seat.rotationY || 0, 0]}
    />
  );
}
