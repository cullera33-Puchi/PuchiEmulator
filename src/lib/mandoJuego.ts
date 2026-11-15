/**
 * Mando para juegos de rol (JRPG), activado por juego (v0.13.0, petición del usuario: «solo para
 * JRPG, no para todos los juegos»). A grande donde descansa el pulgar, B y el botón de menú del
 * juego a su alrededor, y «correr fijo»: un toque deja pulsado B o Y (configurable) y otro lo suelta.
 */
import { cambiarAjustes, leerAjustes, type Ajustes } from './ajustes'
import { SISTEMAS, type Sistema } from './sistemas'
import { bit, type NombreBoton } from '../emulador/botones'
import type { PrincipalDS } from '../emulador/pantallasDS'

export type BotonMenu = 'X' | 'Y' | 'START' | 'SELECT'
export type BotonCorrer = 'B' | 'Y'

export interface MandoJuego {
  jrpg: boolean
  /** El botón que abre el menú en ese juego (X en Final Fantasy o Chrono Trigger; Start en GBA) */
  menu: BotonMenu
  /** El botón que se mantiene pulsado para correr */
  correr: BotonCorrer
  /** Cruceta con diagonales (8) o sin ellas (4), para los juegos que se mueven por casillas */
  direcciones: 8 | 4
}

/**
 * Ajustes de pantalla y botones que se guardan por juego (v0.13.3, petición del usuario). Los de
 * Ajustes son los de por defecto para los juegos que no tienen los suyos.
 */
/** Apartado «Pantalla» (v0.18.0): imagen, por juego. */
export const CLAVES_PANTALLA = ['pantallaGrande', 'nitido', 'coloresConsola', 'snesAspecto', 'pantallasDS', 'tamanoMiniDS', 'filtro'] as const
/** Apartado «Mando»: botones, por juego. */
export const CLAVES_MANDO = ['escalaMando', 'modoMando', 'mano', 'opacidadMando'] as const
export const CLAVES_CONTROL = [...CLAVES_PANTALLA, ...CLAVES_MANDO] as const
export type ClaveControl = (typeof CLAVES_CONTROL)[number]
export type ControlesMando = Pick<Ajustes, ClaveControl>

/**
 * Lo que se guarda de cada juego: el modo JRPG, los ajustes propios de pantalla y botones y, en DS
 * con «grande y pequeña», cuál va grande y dónde está la miniatura (fracción de la pantalla).
 */
export type MandoGuardado = Partial<MandoJuego & ControlesMando> & {
  principalDS?: PrincipalDS
  miniDS?: { x: number; y: number }
  /** Botones con turbo en este juego (v0.19.0) */
  turbo?: NombreBoton[]
}

/** Pantalla y botones de un juego: los suyos o, si no tiene, los generales. */
export function controlesDe(a: Ajustes, juegoId: string): ControlesMando {
  const propios = a.mandos[juegoId] ?? {}
  const r = {} as Record<ClaveControl, unknown>
  for (const k of CLAVES_CONTROL) r[k] = propios[k] ?? a[k]
  return r as ControlesMando
}

/** El juego tiene algún ajuste propio de esas claves (por defecto, de pantalla o de botones). */
export function tieneControlesPropios(a: Ajustes, juegoId: string, claves: readonly ClaveControl[] = CLAVES_CONTROL): boolean {
  const propios = a.mandos[juegoId] ?? {}
  return claves.some((k) => propios[k] !== undefined)
}

/** Guarda un cambio solo para ese juego. */
export function cambiarMandoJuego(juegoId: string, cambio: MandoGuardado): void {
  const mandos = leerAjustes().mandos
  cambiarAjustes({ mandos: { ...mandos, [juegoId]: { ...mandos[juegoId], ...cambio } } })
}

/** Quita los ajustes propios del juego de esas claves (conserva el modo JRPG y lo demás). */
export function usarControlesGenerales(juegoId: string, claves: readonly ClaveControl[] = CLAVES_CONTROL): void {
  const mandos = leerAjustes().mandos
  const propio: MandoGuardado = { ...mandos[juegoId] }
  for (const k of claves) delete propio[k]
  cambiarAjustes({ mandos: { ...mandos, [juegoId]: propio } })
}

export const NOMBRE_BOTON: Record<BotonMenu | BotonCorrer, string> = { X: 'X', Y: 'Y', START: 'Start', SELECT: 'Select', B: 'B' }

/** Botones que pueden hacer de menú en cada consola. */
export function menusDe(sistema: Sistema): BotonMenu[] {
  return SISTEMAS[sistema].cuatroBotones ? ['X', 'Y', 'START', 'SELECT'] : ['START', 'SELECT']
}

/** Botones con los que se puede correr: Y solo si la consola lo tiene. */
export function correrDe(sistema: Sistema): BotonCorrer[] {
  return SISTEMAS[sistema].cuatroBotones ? ['B', 'Y'] : ['B']
}

export function mandoPorDefecto(sistema: Sistema): MandoJuego {
  return { jrpg: false, menu: SISTEMAS[sistema].cuatroBotones ? 'X' : 'START', correr: 'B', direcciones: 8 }
}

/** El mando de un juego, con lo que no valga para su consola cambiado por lo de por defecto. */
export function mandoDe(mandos: Ajustes['mandos'], juegoId: string, sistema: Sistema): MandoJuego {
  const base = mandoPorDefecto(sistema)
  const guardado = mandos[juegoId] ?? {}
  return {
    jrpg: guardado.jrpg ?? base.jrpg,
    menu: guardado.menu && menusDe(sistema).includes(guardado.menu) ? guardado.menu : base.menu,
    correr: guardado.correr && correrDe(sistema).includes(guardado.correr) ? guardado.correr : base.correr,
    direcciones: guardado.direcciones === 4 ? 4 : 8,
  }
}

/** X e Y que siguen a la vista en el modo JRPG (los que no hacen de menú), más pequeños. */
export function extrasJrpg(sistema: Sistema, menu: BotonMenu): ('X' | 'Y')[] {
  if (!SISTEMAS[sistema].cuatroBotones) return []
  return (['X', 'Y'] as const).filter((b) => b !== menu)
}

/**
 * Botones que llegan al juego con «correr fijo». Si el usuario toca el botón que está fijo (por
 * ejemplo, B para cancelar), el juego no lo notaría porque ya está pulsado: se suelta unos
 * fotogramas (`hueco`) para que vea una pulsación nueva.
 */
export function mascaraConCorrer(base: number, correr: number, hueco: boolean): number {
  if (!correr) return base
  return hueco ? base & ~correr : base | correr
}

export const bitCorrer = (b: BotonCorrer) => bit(b)

/** Botones a los que se puede poner turbo en cada consola. */
export function botonesTurbo(sistema: Sistema): NombreBoton[] {
  const info = SISTEMAS[sistema]
  return [...(['A', 'B'] as NombreBoton[]), ...(info.cuatroBotones ? (['X', 'Y'] as NombreBoton[]) : []), ...(info.hombros ? (['L', 'R'] as NombreBoton[]) : [])]
}

/** Máscara de los botones con turbo de un juego (solo los que tiene su consola). */
export function mascaraTurbo(mandos: Ajustes['mandos'], juegoId: string, sistema: Sistema): number {
  const validos = botonesTurbo(sistema)
  return (mandos[juegoId]?.turbo ?? []).filter((b) => validos.includes(b)).reduce((m, b) => m | bit(b), 0)
}

/** Fotogramas que dura cada mitad del turbo: 3 pulsado y 3 suelto, unas diez pulsaciones por segundo. */
export const FOTOGRAMAS_TURBO = 3

/**
 * Turbo (v0.19.0): mientras se mantiene un botón con turbo, el juego lo ve pulsarse y soltarse solo.
 * `fotograma` es un contador que avanza uno por fotograma emulado.
 */
export function mascaraConTurbo(base: number, turbo: number, fotograma: number): number {
  if (!turbo || !(base & turbo)) return base
  return Math.floor(fotograma / FOTOGRAMAS_TURBO) % 2 ? base & ~turbo : base
}
