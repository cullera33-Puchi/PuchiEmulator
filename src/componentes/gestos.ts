/**
 * Volver deslizando desde el borde izquierdo en una pantalla apilada (guía de usabilidad, 4.2):
 * la pantalla sigue al dedo y vuelve si pasa de un tercio del ancho o con un lanzamiento rápido.
 */
import { useEffect, type RefObject } from 'react'
import { vibrar } from '../lib/vibracion'

const BORDE = 28

export function useVolverDeslizando(ref: RefObject<HTMLElement | null>, alVolver: () => void): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let inicioX = 0
    let inicioY = 0
    let ultimaX = 0
    let ultimaT = 0
    let velocidad = 0
    let activo = false
    let siguiendo = false
    const alEmpezar = (e: TouchEvent) => {
      const t = e.touches[0]
      activo = e.touches.length === 1 && t.clientX <= BORDE
      siguiendo = false
      inicioX = ultimaX = t.clientX
      inicioY = t.clientY
      ultimaT = e.timeStamp
      velocidad = 0
    }
    const alMover = (e: TouchEvent) => {
      if (!activo) return
      const t = e.touches[0]
      const dx = t.clientX - inicioX
      if (!siguiendo) {
        if (Math.abs(t.clientY - inicioY) > Math.abs(dx) && Math.abs(t.clientY - inicioY) > 8) {
          activo = false
          return
        }
        if (dx < 10) return
        siguiendo = true
        el.style.transition = 'none'
      }
      e.preventDefault()
      const dt = e.timeStamp - ultimaT
      if (dt > 0) velocidad = 0.6 * ((t.clientX - ultimaX) / dt) + 0.4 * velocidad
      ultimaX = t.clientX
      ultimaT = e.timeStamp
      el.style.transform = `translate3d(${Math.max(0, dx)}px, 0, 0)`
    }
    const alSoltar = (e: TouchEvent) => {
      if (!activo || !siguiendo) {
        activo = false
        return
      }
      activo = false
      const dx = ultimaX - inicioX
      const v = e.timeStamp - ultimaT > 80 ? 0 : velocidad
      el.style.transition = 'transform 0.5s cubic-bezier(.32,.72,0,1)'
      if (e.type === 'touchend' && (dx > window.innerWidth / 3 || (v > 0.4 && dx > 30))) {
        el.style.transform = 'translate3d(100%, 0, 0)'
        vibrar()
        window.setTimeout(alVolver, 260)
      } else {
        el.style.transform = ''
      }
    }
    el.addEventListener('touchstart', alEmpezar, { passive: true })
    el.addEventListener('touchmove', alMover, { passive: false })
    el.addEventListener('touchend', alSoltar)
    el.addEventListener('touchcancel', alSoltar)
    return () => {
      el.removeEventListener('touchstart', alEmpezar)
      el.removeEventListener('touchmove', alMover)
      el.removeEventListener('touchend', alSoltar)
      el.removeEventListener('touchcancel', alSoltar)
    }
  }, [ref, alVolver])
}
