import { useEffect } from 'react'

export function CursorRipple() {
  useEffect(() => {
    const enabled = matchMedia('(any-pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none)')
    const active = new Map<HTMLElement, Animation>()
    const onClick = (event: MouseEvent) => {
      if (!enabled.matches || event.detail === 0 || ('pointerType' in event && event.pointerType === 'touch')) return
      const ring = document.createElement('span')
      ring.className = 'cursor-ripple'
      ring.setAttribute('aria-hidden', 'true')
      ring.style.left = `${event.clientX}px`
      ring.style.top = `${event.clientY}px`
      document.body.append(ring)
      const animation = ring.animate([
        { transform: 'translate(-50%, -50%) scale(.26)', opacity: .95 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ], { duration: 410, easing: 'cubic-bezier(.16, .65, .35, 1)' })
      active.set(ring, animation)
      const remove = () => { ring.remove(); active.delete(ring) }
      void animation.finished.then(remove, remove)
    }
    document.addEventListener('click', onClick, { capture: true, passive: true })
    return () => {
      document.removeEventListener('click', onClick, true)
      for (const [ring, animation] of active) { animation.cancel(); ring.remove() }
    }
  }, [])
  return null
}
