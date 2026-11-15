/**
 * Zona segura (Dynamic Island, esquinas y barra de inicio).
 *
 * iOS da la zona segura con env(safe-area-inset-*), pero tras girar el iPhone a veces la deja a 0
 * en vertical hasta que algo la recalcula: la imagen del juego queda bajo la Dynamic Island. Por eso
 * se mide en cada cambio de orientación y se recuerda la mayor de cada orientación; el CSS usa el
 * máximo entre lo que dice iOS y lo recordado (variables --zona-* en <html>).
 */
import { registrar } from './registro'

type Orientacion = 'vertical' | 'horizontal'
interface Medida {
  arriba: number
  abajo: number
  izquierda: number
  derecha: number
}

const CLAVE = 'puchiemulator-zona-segura'
const CERO: Medida = { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 }

function leer(): Record<Orientacion, Medida> {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Partial<Record<Orientacion, Medida>>
    return { vertical: { ...CERO, ...v.vertical }, horizontal: { ...CERO, ...v.horizontal } }
  } catch {
    return { vertical: { ...CERO }, horizontal: { ...CERO } }
  }
}

/** La mayor de cada lado: un 0 pasajero de iOS no borra lo que ya se sabe. */
export function combinar(recordada: Medida, nueva: Medida): Medida {
  return {
    arriba: Math.max(recordada.arriba, nueva.arriba),
    abajo: Math.max(recordada.abajo, nueva.abajo),
    izquierda: Math.max(recordada.izquierda, nueva.izquierda),
    derecha: Math.max(recordada.derecha, nueva.derecha),
  }
}

function medirAhora(): Medida {
  const sonda = document.createElement('div')
  sonda.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  document.body.appendChild(sonda)
  const e = getComputedStyle(sonda)
  const m = {
    arriba: parseFloat(e.paddingTop) || 0,
    abajo: parseFloat(e.paddingBottom) || 0,
    izquierda: parseFloat(e.paddingLeft) || 0,
    derecha: parseFloat(e.paddingRight) || 0,
  }
  sonda.remove()
  return m
}

function orientacion(): Orientacion {
  return window.innerWidth > window.innerHeight ? 'horizontal' : 'vertical'
}

let ultimaRegistrada = ''

function actualizar(): void {
  const o = orientacion()
  const todas = leer()
  const medida = medirAhora()
  const recordada = combinar(todas[o], medida)
  todas[o] = recordada
  try {
    localStorage.setItem(CLAVE, JSON.stringify(todas))
  } catch {
    // sin almacenamiento: vale para esta sesión
  }
  const raiz = document.documentElement.style
  raiz.setProperty('--zona-arriba', `${recordada.arriba}px`)
  raiz.setProperty('--zona-abajo', `${recordada.abajo}px`)
  raiz.setProperty('--zona-izquierda', `${recordada.izquierda}px`)
  raiz.setProperty('--zona-derecha', `${recordada.derecha}px`)
  // En el registro, para ver en el iPhone si iOS falla al girar (solo cuando cambia algo)
  const firma = `${o}:${JSON.stringify(medida)}:${JSON.stringify(recordada)}`
  if (firma !== ultimaRegistrada) {
    ultimaRegistrada = firma
    registrar('info', 'Zona segura', { orientacion: o, ios: medida, usada: recordada })
  }
}

/** Mide ahora y después de cada giro (iOS tarda un poco en dar los valores buenos). */
export function vigilarZonaSegura(): void {
  actualizar()
  let temporizador = 0
  const despues = () => {
    clearTimeout(temporizador)
    actualizar()
    temporizador = window.setTimeout(actualizar, 400)
  }
  window.addEventListener('resize', despues)
  window.addEventListener('orientationchange', despues)
}
