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

/**
 * Altos de la pantalla según el navegador (v0.35.0), para ver en el registro si la app instalada llega
 * hasta abajo: el de la ventana, el grande (lvh), el de la pantalla y si va instalada.
 */
function altos(): { ventana: number; grande: number; pantalla: number; instalada: boolean } {
  const sonda = document.createElement('div')
  sonda.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:100lvh;visibility:hidden;pointer-events:none'
  document.body.appendChild(sonda)
  const grande = Math.round(sonda.getBoundingClientRect().height)
  sonda.remove()
  const vertical = window.innerWidth <= window.innerHeight
  const pantalla = vertical ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
  let instalada = false
  try {
    instalada = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    // sin matchMedia
  }
  return { ventana: window.innerHeight, grande, pantalla, instalada }
}

function orientacion(): Orientacion {
  return window.innerWidth > window.innerHeight ? 'horizontal' : 'vertical'
}

let ultimaRegistrada = ''

/** Alto y ancho de la ventana de verdad para el CSS, solo si han cambiado (v0.42.1; v0.43.0) */
function ponerTamanoVentana(): void {
  const raiz = document.documentElement.style
  const alto = `${window.innerHeight}px`
  const ancho = `${window.innerWidth}px`
  if (raiz.getPropertyValue('--alto-ventana') !== alto) raiz.setProperty('--alto-ventana', alto)
  if (raiz.getPropertyValue('--ancho-ventana') !== ancho) raiz.setProperty('--ancho-ventana', ancho)
}

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
  // Alto de la ventana de verdad (v0.42.1): en la app instalada, iOS 26 la abre unas veces con todo el
  // alto de la pantalla (874 en el iPhone 17) y otras con 62 puntos menos (812); lo que pase de ella
  // no se ve. El juego mide esto, ni más (se cortaba) ni menos (quedaba una franja)
  ponerTamanoVentana()
  // En el registro, para ver en el iPhone si iOS falla al girar (solo cuando cambia algo)
  const firma = `${o}:${JSON.stringify(medida)}:${JSON.stringify(recordada)}`
  if (firma !== ultimaRegistrada) {
    ultimaRegistrada = firma
    registrar('info', 'Zona segura', { orientacion: o, ios: medida, usada: recordada, alto: altos() })
  }
}

/** Mide ahora y después de cada giro (iOS tarda un poco en dar los valores buenos). */
export function vigilarZonaSegura(): void {
  actualizar()
  let temporizadores: number[] = []
  const despues = () => {
    for (const t of temporizadores) clearTimeout(t)
    actualizar()
    // iOS puede dar el alto bueno un poco más tarde que el aviso de giro: se vuelve a mirar (v0.43.0)
    temporizadores = [150, 400, 1000].map((ms) => window.setTimeout(actualizar, ms))
  }
  window.addEventListener('resize', despues)
  // El alto de la ventana también puede cambiar sin «resize» (v0.43.0): solo el tamaño, sin medir más
  window.visualViewport?.addEventListener('resize', ponerTamanoVentana)
  window.addEventListener('orientationchange', despues)
  // Al volver de segundo plano, iOS puede haber cambiado el alto de la ventana (v0.42.1)
  window.addEventListener('pageshow', despues)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && despues())
}
