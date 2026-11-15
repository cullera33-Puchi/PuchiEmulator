/**
 * Mando para juegos de rol (JRPG), activado por juego (v0.13.0, petición del usuario: «solo para
 * JRPG, no para todos los juegos»). A grande donde descansa el pulgar, B y el botón de menú del
 * juego a su alrededor, y «correr fijo»: un toque deja pulsado B o Y (configurable) y otro lo suelta.
 */
import type { Ajustes } from './ajustes'
import { SISTEMAS, type Sistema } from './sistemas'
import { bit } from '../emulador/botones'

export type BotonMenu = 'X' | 'Y' | 'START' | 'SELECT'
export type BotonCorrer = 'B' | 'Y'

export interface MandoJuego {
  jrpg: boolean
  /** El botón que abre el menú en ese juego (X en Final Fantasy o Chrono Trigger; Start en GBA) */
  menu: BotonMenu
  /** El botón que se mantiene pulsado para correr */
  correr: BotonCorrer
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
  return { jrpg: false, menu: SISTEMAS[sistema].cuatroBotones ? 'X' : 'START', correr: 'B' }
}

/** El mando de un juego, con lo que no valga para su consola cambiado por lo de por defecto. */
export function mandoDe(mandos: Ajustes['mandos'], juegoId: string, sistema: Sistema): MandoJuego {
  const base = mandoPorDefecto(sistema)
  const guardado = mandos[juegoId] ?? {}
  return {
    jrpg: guardado.jrpg ?? base.jrpg,
    menu: guardado.menu && menusDe(sistema).includes(guardado.menu) ? guardado.menu : base.menu,
    correr: guardado.correr && correrDe(sistema).includes(guardado.correr) ? guardado.correr : base.correr,
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
