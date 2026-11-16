/**
 * Volver deslizando desde el borde izquierdo en una pantalla apilada (guía de usabilidad, 4.2):
 * la pantalla sigue al dedo y vuelve si pasa de un tercio del ancho o con un lanzamiento rápido.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { vibrar } from '../lib/vibracion'

const BORDE = 28

/** Momento del último «volver» hecho deslizando: la navegación no repite la animación de salida */
let volvioDeslizando = 0
export function seVolvioDeslizando(): boolean {
  const si = Date.now() - volvioDeslizando < 400
  volvioDeslizando = 0
  return si
}

export interface OpcionesVolver {
  /** Lo que sigue al dedo; por defecto, la capa de la pantalla (App) o el propio elemento */
  mover?: () => HTMLElement | null
  /** La pantalla de debajo, que se ve mientras se desliza (v0.26.1); por defecto, la capa de fondo de App */
  fondo?: () => HTMLElement | null
}

/** Cuánto se desplaza la pantalla de debajo al empezar, como en iOS */
const PARALAJE = 30
const CURVA = 'cubic-bezier(.32,.72,0,1)'

export function useVolverDeslizando(ref: RefObject<HTMLElement | null>, alVolver: () => void, opciones?: OpcionesVolver): void {
  // En referencias (v0.30.0): si cambiaran las dependencias del efecto, un redibujado a mitad de gesto
  // (por ejemplo, al acabar la animación de entrada) quitaba los oyentes y dejaba la pantalla movida
  const alVolverRef = useRef(alVolver)
  const opcionesRef = useRef(opciones)
  useLayoutEffect(() => {
    alVolverRef.current = alVolver
    opcionesRef.current = opciones
  })
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
    let movido: HTMLElement = el
    let fondo: HTMLElement | null = null
    let temporizador = 0

    const colocar = (dx: number) => {
      movido.style.transform = `translate3d(${Math.max(0, dx)}px, 0, 0)`
      if (fondo) {
        const f = Math.min(1, Math.max(0, dx) / window.innerWidth)
        fondo.style.transform = `translate3d(${-PARALAJE * (1 - f)}%, 0, 0)`
        fondo.style.filter = `brightness(${0.94 + 0.06 * f})`
      }
    }
    const limpiar = (e: HTMLElement | null) => {
      if (!e) return
      for (const k of ['transform', 'transition', 'filter', 'visibility', 'boxShadow'] as const) e.style[k] = ''
    }
    /** Devuelve todo a su sitio, con animación, y deja los estilos como estaban al acabar */
    const devolver = () => {
      const transicion = `transform 0.5s ${CURVA}, filter 0.5s ${CURVA}`
      movido.style.transition = transicion
      if (fondo) fondo.style.transition = transicion
      colocar(0)
      const [m, f] = [movido, fondo]
      temporizador = window.setTimeout(() => {
        limpiar(f)
        limpiar(m)
      }, 520)
    }

    const alEmpezar = (e: TouchEvent) => {
      // Otro dedo a mitad del gesto: se cancela y todo vuelve a su sitio (v0.30.0)
      if (siguiendo) {
        activo = false
        siguiendo = false
        devolver()
        return
      }
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
        window.clearTimeout(temporizador)
        const o = opcionesRef.current
        // En App se mueve toda la capa y debajo se ve la pantalla anterior
        movido = o?.mover?.() ?? (el.closest('.capa') as HTMLElement | null) ?? el
        fondo = o?.fondo ? o.fondo() : movido === el ? null : document.querySelector<HTMLElement>('.capa.fondo')
        movido.style.transition = 'none'
        movido.style.boxShadow = '-12px 0 32px rgb(0 0 0 / 0.15)'
        if (fondo) {
          fondo.style.transition = 'none'
          fondo.style.visibility = 'visible'
        }
      }
      e.preventDefault()
      const dt = e.timeStamp - ultimaT
      if (dt > 0) velocidad = 0.6 * ((t.clientX - ultimaX) / dt) + 0.4 * velocidad
      ultimaX = t.clientX
      ultimaT = e.timeStamp
      colocar(dx)
    }
    const alSoltar = (e: TouchEvent) => {
      if (!activo || !siguiendo) {
        activo = false
        return
      }
      activo = false
      siguiendo = false
      const dx = ultimaX - inicioX
      const v = e.timeStamp - ultimaT > 80 ? 0 : velocidad
      if (e.type === 'touchend' && (dx > window.innerWidth / 3 || (v > 0.4 && dx > 30))) {
        const transicion = `transform 0.35s ${CURVA}, filter 0.35s ${CURVA}`
        movido.style.transition = transicion
        if (fondo) fondo.style.transition = transicion
        colocar(window.innerWidth)
        vibrar()
        const [m, f] = [movido, fondo]
        // Se navega al acabar la animación (o, como mucho, a los 400 ms): sin saltos al final (v0.30.0)
        let hecho = false
        const terminar = () => {
          if (hecho) return
          hecho = true
          m.removeEventListener('transitionend', alTerminar)
          volvioDeslizando = Date.now()
          alVolverRef.current()
          // La pantalla de debajo pasa a ser la actual: se le quita lo puesto aquí
          requestAnimationFrame(() => {
            limpiar(f)
            limpiar(m)
          })
        }
        const alTerminar = (ev: TransitionEvent) => ev.target === m && ev.propertyName === 'transform' && terminar()
        m.addEventListener('transitionend', alTerminar)
        temporizador = window.setTimeout(terminar, 400)
      } else {
        devolver()
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
      // Si se desmonta a mitad de gesto, nada se queda movido
      if (siguiendo) {
        limpiar(movido)
        limpiar(fondo)
      }
    }
  }, [ref])
}
