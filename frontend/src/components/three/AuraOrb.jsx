import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../../state/store'

// Default (dark-theme) palette -- untouched, still what Home.jsx renders.
// Live.jsx passes its own `palette` prop (see components/ui palette maps) so
// its paper-theme redesign doesn't recolor Home's orb too.
const DEFAULT_PALETTE_HEX = {
  none: '#5ee7c8',
  nail_biting: '#f5647c',
  hair_pulling: '#f5647c',
  face_touching: '#f5a35e',
  lip_biting: '#f5a35e',
  watching: '#7c9cf5',
}
const DEFAULT_PARTICLE_COLOR = '#5ee7c8'

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

function Orb({ paletteHex }) {
  const meshRef = useRef()
  const materialRef = useRef()
  const targetColor = useRef(new THREE.Color(paletteHex.none))

  // Rebuilt only when the palette prop reference changes (Live.jsx defines
  // its palette as a module-level constant, so this is effectively once).
  const stateColors = useMemo(
    () => Object.fromEntries(Object.entries(paletteHex).map(([k, hex]) => [k, new THREE.Color(hex)])),
    [paletteHex]
  )

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(paletteHex.none) },
      uEnergy: { value: 0.15 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useFrame((_, delta) => {
    const { currentLabel, currentConfidence, isDetecting } = useStore.getState()
    uniforms.uTime.value += delta

    const key = isDetecting ? currentLabel || 'none' : 'watching'
    const desired = stateColors[key] || stateColors.none
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

function Particles({ color }) {
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
      <pointsMaterial size={0.02} color={color} transparent opacity={0.35} sizeAttenuation />
    </points>
  )
}

export default function AuraOrb({ className = '', palette, particleColor = DEFAULT_PARTICLE_COLOR }) {
  const paletteHex = palette || DEFAULT_PALETTE_HEX
  return (
    <div className={className}>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[3, 3, 3]} intensity={0.8} />
        <Orb paletteHex={paletteHex} />
        <Particles color={particleColor} />
      </Canvas>
    </div>
  )
}
