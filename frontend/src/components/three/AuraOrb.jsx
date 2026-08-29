import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../../state/store'

const STATE_COLORS = {
  none: new THREE.Color('#5ee7c8'),
  nail_biting: new THREE.Color('#f5647c'),
  hair_pulling: new THREE.Color('#f5647c'),
  face_touching: new THREE.Color('#f5a35e'),
  lip_biting: new THREE.Color('#f5a35e'),
  watching: new THREE.Color('#7c9cf5'),
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  varying vec3 vNormal;
  varying float vDisplacement;

  // simple hash-based noise, no external deps
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vNormal = normal;
    float n = hash(position * 2.3 + uTime * 0.15);
    float wobble = sin(position.x * 4.0 + uTime * 1.4) * 0.06
                 + sin(position.y * 5.0 + uTime * 1.1) * 0.05
                 + n * 0.05;
    float displacement = wobble * (0.4 + uEnergy * 1.6);
    vDisplacement = displacement;
    vec3 newPosition = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uEnergy;
  varying vec3 vNormal;
  varying float vDisplacement;

  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.2);
    vec3 base = uColor * (0.55 + vDisplacement * 1.5);
    vec3 glow = uColor * fresnel * (1.4 + uEnergy * 1.2);
    vec3 color = base + glow;
    gl_FragColor = vec4(color, 0.92);
  }
`

function Orb() {
  const meshRef = useRef()
  const materialRef = useRef()
  const targetColor = useRef(new THREE.Color('#5ee7c8'))

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#5ee7c8') },
      uEnergy: { value: 0.15 },
    }),
    []
  )

  useFrame((_, delta) => {
    const { currentLabel, currentConfidence, isDetecting } = useStore.getState()
    uniforms.uTime.value += delta

    const key = isDetecting ? currentLabel || 'none' : 'watching'
    const desired = STATE_COLORS[key] || STATE_COLORS.none
    targetColor.current.lerp(desired, 0.04)
    uniforms.uColor.value.copy(targetColor.current)

    const targetEnergy = isDetecting && currentLabel !== 'none' ? currentConfidence : 0.12
    uniforms.uEnergy.value += (targetEnergy - uniforms.uEnergy.value) * 0.08

    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.12
      meshRef.current.rotation.x += delta * 0.04
      const pulse = 1 + Math.sin(uniforms.uTime.value * (1 + uniforms.uEnergy.value * 3)) * 0.02 * (0.3 + uniforms.uEnergy.value)
      meshRef.current.scale.setScalar(pulse)
    }
  })

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.4, 24]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  )
}

function Particles() {
  const pointsRef = useRef()
  const count = 260
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 2.4 + Math.random() * 1.6
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame((_, delta) => {
    if (pointsRef.current) pointsRef.current.rotation.y += delta * 0.02
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#5ee7c8" transparent opacity={0.35} sizeAttenuation />
    </points>
  )
}

export default function AuraOrb({ className = '' }) {
  return (
    <div className={className}>
      {/* antialias off: this canvas is always small (a status panel, not a
          hero visual) and runs continuously for the whole session, on the
          same GPU MediaPipe's own delegate is using -- MSAA cost here buys
          very little visible smoothing at this size for real concurrent
          GPU budget. (r3f already caps dpr at [1,2] by default, so that
          axis was already reasonable -- verified in its own source rather
          than assumed.) */}
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: false, alpha: true }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[3, 3, 3]} intensity={0.8} />
        <Orb />
        <Particles />
      </Canvas>
    </div>
  )
}
