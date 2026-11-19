import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { RobotFraming, RobotLoadStatus, RobotState } from './robotTypes'

export interface RobotSceneController {
  update: (next: RobotState) => void
  dispose: () => void
}

type Eye = THREE.Mesh<THREE.BufferGeometry, THREE.Material>
type Point = readonly [number, number]
type SignPath = readonly [Point, ...Point[]]

// Each mounted scene owns its resources, including a model that resolves after unmount.
function createResourceTracker() {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()

  return {
    track(root: THREE.Object3D) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        geometries.add(object.geometry)
        const objectMaterials: THREE.Material[] = Array.isArray(object.material)
          ? object.material
          : [object.material]
        for (const material of objectMaterials) {
          materials.add(material)
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value)
          }
        }
      })
    },
    dispose() {
      const images = new Set<unknown>()
      for (const texture of textures) {
        images.add(texture.source.data)
        texture.dispose()
      }
      for (const image of images) {
        if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close()
      }
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      geometries.clear()
      materials.clear()
      textures.clear()
    },
  }
}

function isEye(object: THREE.Object3D): object is Eye {
  return object instanceof THREE.Mesh && !Array.isArray(object.material)
}

function gesture(seconds: number, start: number, duration: number) {
  const progress = THREE.MathUtils.clamp((seconds - start) / duration, 0, 1)
  return Math.sin(Math.PI * progress) ** 2
}

function holdGesture(seconds: number, start: number, peak: number, release: number, end: number) {
  return THREE.MathUtils.smoothstep(seconds, start, peak)
    * (1 - THREE.MathUtils.smoothstep(seconds, release, end))
}

export function createRobotScene(
  viewer: HTMLDivElement,
  onStatus: (status: RobotLoadStatus) => void,
  framing: RobotFraming = 'full',
): RobotSceneController {
  let disposed = false
  let renderer: THREE.WebGLRenderer | undefined
  let environment: THREE.WebGLRenderTarget | undefined
  let resizeObserver: ResizeObserver | undefined
  let animate: ((time: number) => void) | undefined
  const abortController = new AbortController()
  const resources = createResourceTracker()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const pointer = new THREE.Vector2()
  let hasPointer = false
  let state: RobotState = {
    feedback: 'idle', feedbackKey: 0, passwordVisible: false, attentionTarget: null,
  }
  let feedback: 'success' | 'error' | null = null
  let feedbackStarted = 0

  function followPointer(event: PointerEvent) {
    if (event.pointerType === 'touch' && event.type === 'pointermove') return
    pointer.set(event.clientX, event.clientY)
    hasPointer = true
  }
  function clearPointer() { hasPointer = false }
  function syncVisibility() {
    if (!disposed && renderer && animate) {
      renderer.setAnimationLoop(document.hidden ? null : animate)
    }
  }
  function loseContext(event: Event) {
    event.preventDefault()
    if (!disposed) {
      renderer?.setAnimationLoop(null)
      onStatus('error')
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    abortController.abort()
    resizeObserver?.disconnect()
    window.removeEventListener('pointermove', followPointer)
    window.removeEventListener('pointerdown', followPointer)
    window.removeEventListener('blur', clearPointer)
    document.documentElement.removeEventListener('pointerleave', clearPointer)
    document.removeEventListener('visibilitychange', syncVisibility)
    renderer?.domElement.removeEventListener('webglcontextlost', loseContext)
    renderer?.setAnimationLoop(null)
    resources.dispose()
    environment?.dispose()
    renderer?.domElement.remove()
    renderer?.dispose()
    renderer?.forceContextLoss()
  }

  async function load() {
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 0.98
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30)
      if (framing === 'portrait') {
        camera.position.set(0, 0.62, 3.2)
        camera.lookAt(0, 0.62, 0)
      } else {
        camera.position.set(0, 1.1, 5.65)
        camera.lookAt(0, 0, 0)
      }
      const mascot = new THREE.Group()
      scene.add(mascot)
      const studio = new RoomEnvironment()
      const reflections = new THREE.PMREMGenerator(renderer)
      try {
        environment = reflections.fromScene(studio, 0.065)
      } finally {
        studio.dispose()
        reflections.dispose()
      }
      scene.environment = environment.texture
      scene.environmentIntensity = 0.31
      scene.add(new THREE.HemisphereLight(0xeff0ff, 0x696366, 0.58))
      const key = new THREE.DirectionalLight(0xfff1df, 2.35)
      key.position.set(-2, 4.8, 5)
      const rim = new THREE.DirectionalLight(0xd8dcff, 1.4)
      rim.position.set(3, 2.6, -4)
      scene.add(key, rim)

      const modelUrl = `${import.meta.env.BASE_URL}assets/robot/contour-robot.glb`
      const response = await fetch(modelUrl, { signal: abortController.signal })
      if (!response.ok) throw new Error(`Robot model request failed: ${response.status}`)
      const buffer = await response.arrayBuffer()
      if (disposed) return
      const gltf = await new GLTFLoader().parseAsync(buffer, '')
      if (disposed) {
        const lateResources = createResourceTracker()
        lateResources.track(gltf.scene)
        lateResources.dispose()
        return
      }
      resources.track(gltf.scene)
      gltf.scene.getObjectByName('Pedestal')?.removeFromParent()
      gltf.scene.getObjectByName('Pedestal_top_plate')?.removeFromParent()
      const head = gltf.scene.getObjectByName('CRT_head')
      const eyes = head?.children.filter(isEye)
        .filter((node) => /^White_display_eye(?:_\d+)?$/.test(node.name)) ?? []
      if (!head || eyes.length !== 2) throw new Error('Robot animation nodes are missing')
      head.scale.multiplyScalar(0.86)
      head.position.y -= 0.12

      const bounds = new THREE.Box3().setFromObject(gltf.scene)
      const center = bounds.getCenter(new THREE.Vector3())
      const size = bounds.getSize(new THREE.Vector3())
      const scale = 2.65 / Math.max(size.x, size.y, size.z)
      gltf.scene.scale.multiplyScalar(scale)
      gltf.scene.position.addScaledVector(center, -scale)
      mascot.add(gltf.scene)

      const headRest = head.rotation.clone()
      headRest.x += 0.065
      headRest.y = headRest.z = 0
      const arms = ['Left_arm', 'Right_arm'].map((name, index) => {
        const shoulder = gltf.scene.getObjectByName(name)
        const elbow = shoulder?.children.find((node) => node.name.startsWith('Forearm_articulation'))
        const joint = elbow?.children.find((node) => node.name.startsWith('Wrist_joint'))
        if (!shoulder || !elbow || !joint) throw new Error('Robot arm joints are missing')
        const wrist = new THREE.Group()
        wrist.position.copy(joint.position)
        elbow.add(wrist)
        const fingers: { knuckle: THREE.Group; thumb: boolean }[] = []
        for (const part of [...elbow.children]) {
          if (!/^(Hand_palm|Finger_|Thumb)/.test(part.name)) continue
          wrist.attach(part)
          part.position.x *= -1
          part.rotation.z *= -1
          if (part.name.startsWith('Hand_palm')) continue
          const thumb = part.name.startsWith('Thumb')
          const knuckle = new THREE.Group()
          knuckle.position.copy(part.position)
          knuckle.position.y += thumb ? 0.045 : 0.067
          wrist.add(knuckle)
          knuckle.add(part)
          part.position.sub(knuckle.position)
          fingers.push({ knuckle, thumb })
        }
        const side = index === 0 ? -1 : 1
        shoulder.rotation.set(-0.045, 0, side * 0.28)
        elbow.rotation.set(-0.12, 0, -side * 0.035)
        wrist.rotation.set(0, -side * 0.68, 0)
        return { shoulder, elbow, wrist, fingers, side }
      })
      const eyeRest = eyes.map((eye) => eye.scale.clone())
      const eyePositions = eyes.map((eye) => eye.position.clone())
      const eyeAngles = eyes.map((eye) => eye.rotation.z)
      for (const eye of eyes) {
        eye.material = eye.material.clone()
        eye.material.transparent = true
        eye.material.depthWrite = false
      }

      const signGeometry = new THREE.PlaneGeometry(0.7, 0.7)
      function createSign(color: string, paths: readonly SignPath[], y = -0.102) {
        const image = document.createElement('canvas')
        image.width = image.height = 128
        const context = image.getContext('2d')
        if (!context) throw new Error('Robot visor canvas is unavailable')
        context.strokeStyle = color
        context.lineWidth = 11
        context.lineCap = context.lineJoin = 'round'
        context.shadowColor = color
        context.shadowBlur = 14
        for (const [first, ...points] of paths) {
          context.beginPath()
          context.moveTo(first[0], first[1])
          for (const point of points) context.lineTo(point[0], point[1])
          context.stroke()
        }
        const map = new THREE.CanvasTexture(image)
        map.colorSpace = THREE.SRGBColorSpace
        const sign = new THREE.Mesh(signGeometry, new THREE.MeshBasicMaterial({
          map, transparent: true, depthWrite: false, toneMapped: false,
        }))
        sign.position.set(0, y, 1.025)
        sign.visible = false
        head?.add(sign)
        return sign
      }
      const check = createSign('#68ffad', [[[29, 66], [54, 90], [100, 38]]])
      const cross = createSign('#ff596e', [[[37, 37], [91, 91]], [[91, 37], [37, 91]]])
      const smile = createSign('#f3fff7', [[[36, 57], [43, 65], [53, 71], [64, 73], [75, 71], [85, 65], [92, 57]]], -0.34)
      const frown = createSign('#fff0f2', [[[39, 70], [48, 62], [56, 59], [64, 58], [72, 59], [80, 62], [89, 70]]], -0.34)
      resources.track(gltf.scene)
      const canvas = renderer.domElement
      canvas.setAttribute('aria-hidden', 'true')
      canvas.addEventListener('webglcontextlost', loseContext)
      viewer.append(canvas)
      window.addEventListener('pointermove', followPointer, { passive: true })
      window.addEventListener('pointerdown', followPointer, { passive: true })
      window.addEventListener('blur', clearPointer)
      document.documentElement.addEventListener('pointerleave', clearPointer)
      document.addEventListener('visibilitychange', syncVisibility)
      function resize() {
        const width = viewer.clientWidth
        const height = viewer.clientHeight
        if (!width || !height || !renderer) return
        camera.aspect = width / height
        camera.zoom = Math.min(1, camera.aspect / (framing === 'portrait' ? 0.68 : 0.78))
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
      }
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(viewer)
      resize()
      let startedAt: number | undefined
      let previousTime: number | undefined
      let gazeYaw = 0
      const headOnScreen = new THREE.Vector3()

      animate = (time) => {
        if (!renderer || disposed || !viewer.clientWidth || !viewer.clientHeight) return
        startedAt ??= time
        const seconds = (time - startedAt) / 1000
        const delta = Math.min((time - (previousTime ?? time)) / 1000, 0.05)
        previousTime = time
        const animated = !reducedMotion.matches
        const cycle = seconds % 17
        const curious = animated ? gesture(cycle, 2, 2.5) : 0
        const surprise = animated ? gesture(cycle, 7, 1.2) : 0
        const blink = animated ? gesture(seconds % 3.8, 1.1, 0.19) : 0
        const feedbackSeconds = (performance.now() - feedbackStarted) / 1000
        const showingResult = feedback !== null && feedbackSeconds < 3.8
        const privateInput = state.passwordVisible
        const guiding = feedback === 'error' && state.correctionTarget
          && feedbackSeconds >= 3.1 && feedbackSeconds < 5.4
        const idle = animated && !state.attentionTarget && !showingResult
        const succeeded = feedback === 'success'
        const symbol = showingResult ? 1 - THREE.MathUtils.smoothstep(feedbackSeconds, 1.45, 1.9) : 0
        const expression = showingResult
          ? THREE.MathUtils.smoothstep(feedbackSeconds, 1.55, 2.05)
            * (1 - THREE.MathUtils.smoothstep(feedbackSeconds, 2.75, 3.8))
          : 0
        check.material.opacity = cross.material.opacity = symbol
        check.visible = symbol > 0 && succeeded
        cross.visible = symbol > 0 && !succeeded
        smile.material.opacity = frown.material.opacity = expression
        smile.visible = expression > 0 && succeeded
        frown.visible = expression > 0 && !succeeded
        let lookX = 0
        let lookY = 0
        if (animated && !privateInput && (guiding || (hasPointer && !showingResult))) {
          head.getWorldPosition(headOnScreen).project(camera)
          const rect = canvas.getBoundingClientRect()
          const target = guiding ? state.correctionTarget : null
          const targetX = target ? target.x : pointer.x
          const targetY = target ? target.y : pointer.y
          const headX = rect.left + (headOnScreen.x + 1) * rect.width / 2
          const headY = rect.top + (1 - headOnScreen.y) * rect.height / 2
          lookX = Math.atan((targetX - headX) / (rect.width * 0.52))
          lookY = Math.atan((headY - targetY) / (rect.height * 0.44))
        }
        const ease = 1 - Math.exp(-delta * 9)
        const bodyEase = 1 - Math.exp(-delta * 3.6)
        const desiredGaze = privateInput && animated ? -0.72 : THREE.MathUtils.clamp(lookX * 0.86, -0.66, 1.02)
        gazeYaw = THREE.MathUtils.lerp(gazeYaw, desiredGaze, ease)
        const bodyAngle = gazeYaw * 0.45
        mascot.rotation.y = THREE.MathUtils.lerp(mascot.rotation.y, bodyAngle, bodyEase)
        const reaction = animated && showingResult ? gesture(feedbackSeconds, 0, 1.35) : 0
        const shake = cross.visible ? reaction * 0.085 * Math.sin(feedbackSeconds * 13) : 0
        const nod = check.visible ? reaction * 0.16 : 0
        const torsoFollow = mascot.rotation.y
        const headTurn = THREE.MathUtils.clamp(gazeYaw - torsoFollow, -0.63, 0.63) + shake
        const headTilt = privateInput && animated ? -0.13 : -lookY * 0.44 - (idle ? surprise * 0.15 - curious * 0.08 : 0) + nod
        head.rotation.y = headRest.y + headTurn
        head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, headRest.x + headTilt, ease)
        head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, headRest.z - headTurn * 0.12 - (idle ? curious * 0.12 : 0), ease)
        const animateResult = animated && showingResult && !privateInput
        const cheer = animateResult && succeeded ? holdGesture(feedbackSeconds, 0.12, 0.6, 0.88, 1.92) : 0
        const squeeze = animateResult && succeeded ? holdGesture(feedbackSeconds, 0.32, 0.58, 0.63, 0.74) : 0
        const flick = animateResult && succeeded ? gesture(feedbackSeconds, 0.64, 0.23) : 0
        const shrug = animateResult && !succeeded ? holdGesture(feedbackSeconds, 0.68, 1.52, 2.05, 3.25) : 0
        const followThrough = animated ? THREE.MathUtils.clamp(gazeYaw * 0.45 - torsoFollow, -0.23, 0.23) : 0
        mascot.rotation.z = THREE.MathUtils.lerp(mascot.rotation.z, -0.1 * followThrough - 0.027 * cheer, bodyEase)
        mascot.rotation.x = THREE.MathUtils.lerp(mascot.rotation.x, 0.027 * shrug - 0.025 * cheer, bodyEase)
        for (const { shoulder, elbow, wrist, fingers, side } of arms) {
          const lead = side === 1
          const lift = cheer * (lead ? 1 : 0.12)
          shoulder.rotation.x = -0.065 - 0.29 * lift - 0.075 * shrug + side * followThrough * 0.2
          shoulder.rotation.z = side * (0.27 + 0.24 * lift + 0.18 * shrug)
          elbow.rotation.x = -0.15 - 1.02 * lift - 0.46 * shrug
          elbow.rotation.z = side * (-0.035 - 0.07 * lift + 0.07 * shrug)
          wrist.rotation.x = 0.055 * shrug - (lead ? 0.17 * squeeze - 0.13 * flick : 0)
          wrist.rotation.y = side * (-0.64 + 0.25 * lift + 0.33 * shrug)
          for (const { knuckle, thumb } of fingers) {
            knuckle.rotation.x = lead ? (thumb ? -0.3 : -0.65) * squeeze + (thumb ? 0.04 : 0.18) * flick : 0
            knuckle.rotation.z = lead && thumb ? Math.sign(knuckle.position.x) * -0.38 * squeeze : 0
          }
        }
        eyes.forEach((eye, index) => {
          eye.visible = symbol < 1
          eye.material.opacity = 1 - symbol
          const rest = eyeRest[index]
          const neutralX = 1 + 0.19 * surprise
          const neutralY = Math.max(0.12, (1 + 0.38 * surprise) * (1 - 0.93 * blink))
          eye.scale.x = rest.x * THREE.MathUtils.lerp(neutralX, succeeded ? 1.32 : 1.14, expression)
          eye.scale.y = rest.y * THREE.MathUtils.lerp(neutralY, succeeded ? 0.43 : 0.74, expression)
          eye.position.y = eyePositions[index].y + expression * 0.083
          eye.rotation.z = eyeAngles[index] + expression * Math.sign(eyePositions[index].x) * (succeeded ? 0.17 : -0.32)
        })
        renderer.render(scene, camera)
      }
      syncVisibility()
      onStatus('ready')
    } catch (error) {
      if (disposed) return
      dispose()
      console.warn('3D-превью робота недоступно.', error)
      onStatus('error')
    }
  }

  void load()

  return {
    update(next) {
      if (disposed) return
      if (next.feedback !== state.feedback || next.feedbackKey !== state.feedbackKey) {
        feedback = next.feedback === 'success' || next.feedback === 'error' ? next.feedback : null
        feedbackStarted = performance.now()
      }
      if (next.attentionTarget && next.attentionTarget !== state.attentionTarget) {
        pointer.set(next.attentionTarget.x, next.attentionTarget.y)
        hasPointer = true
      }
      state = next
    },
    dispose,
  }
}
