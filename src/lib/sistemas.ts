/**
 * Consolas que admite la app y cómo se reconoce cada ROM.
 * Se mira primero la cabecera del cartucho y, si no es concluyente, la extensión del fichero.
 */
import { unzipSync } from 'fflate'

export type Sistema = 'gb' | 'gbc' | 'gba' | 'nes' | 'snes' | 'nds'
export type NombreNucleo = 'mgba' | 'snes9x' | 'melonds' | 'fceumm'

export interface InfoSistema {
  nombre: string
  corto: string
  nucleo: NombreNucleo
  extension: string
  /** Botones que tiene la consola, para dibujar el mando */
  hombros: boolean
  /** A, B, X e Y en rombo (Super Nintendo y DS) en lugar de solo A y B */
  cuatroBotones: boolean
  /** Rebobinar disponible (no en DS: sus estados pesan varios megas) */
  rebobinado: boolean
  /** Pantalla táctil: tocar la imagen hace de lápiz */
  tactil: boolean
  color: string
}

export const SISTEMAS: Record<Sistema, InfoSistema> = {
  gb: { nombre: 'Game Boy', corto: 'GB', nucleo: 'mgba', extension: 'gb', hombros: false, cuatroBotones: false, rebobinado: true, tactil: false, color: '#8E8E93' },
  gbc: { nombre: 'Game Boy Color', corto: 'GBC', nucleo: 'mgba', extension: 'gbc', hombros: false, cuatroBotones: false, rebobinado: true, tactil: false, color: '#AF52DE' },
  gba: { nombre: 'Game Boy Advance', corto: 'GBA', nucleo: 'mgba', extension: 'gba', hombros: true, cuatroBotones: false, rebobinado: true, tactil: false, color: '#5856D6' },
  nes: { nombre: 'NES', corto: 'NES', nucleo: 'fceumm', extension: 'nes', hombros: false, cuatroBotones: false, rebobinado: true, tactil: false, color: '#C8102E' },
  snes: { nombre: 'Super Nintendo', corto: 'SNES', nucleo: 'snes9x', extension: 'sfc', hombros: true, cuatroBotones: true, rebobinado: true, tactil: false, color: '#6E6E80' },
  nds: { nombre: 'Nintendo DS', corto: 'DS', nucleo: 'melonds', extension: 'nds', hombros: true, cuatroBotones: true, rebobinado: false, tactil: true, color: '#34343C' },
}

/**
 * Consolas tal como se enseñan en la app (inicio, bibliotecas y estadísticas). Game Boy y Game Boy
 * Color van juntas; por dentro siguen siendo dos sistemas, cada uno con su tema y sus opciones.
 * Game Boy Advance va aparte (decisión del usuario).
 */
export type Consola = 'gb' | 'gba' | 'nes' | 'snes' | 'nds'

export interface InfoConsola {
  nombre: string
  /** Versión corta para la cabecera de la biblioteca */
  titulo: string
  /** Qué incluye, para la tarjeta del inicio */
  descripcion?: string
  sistemas: Sistema[]
  color: string
  extensiones: string
}

export const CONSOLAS_APP: Record<Consola, InfoConsola> = {
  gb: { nombre: 'Game Boy y Game Boy Color', titulo: 'Game Boy y Color', sistemas: ['gb', 'gbc'], color: '#AF52DE', extensiones: '.gb, .gbc' },
  gba: { nombre: 'Game Boy Advance', titulo: 'Game Boy Advance', sistemas: ['gba'], color: '#5856D6', extensiones: '.gba' },
  nes: { nombre: 'NES', titulo: 'NES', descripcion: 'También Famicom', sistemas: ['nes'], color: '#C8102E', extensiones: '.nes' },
  snes: { nombre: 'Super Nintendo', titulo: 'Super Nintendo', sistemas: ['snes'], color: '#6E6E80', extensiones: '.sfc, .smc' },
  nds: { nombre: 'Nintendo DS', titulo: 'Nintendo DS', descripcion: 'En pruebas', sistemas: ['nds'], color: '#34343C', extensiones: '.nds' },
}

/** Orden en el que se enseñan las consolas */
export const CONSOLAS: Consola[] = ['gb', 'gba', 'nes', 'snes', 'nds']

export const consolaDe = (s: Sistema): Consola => (s === 'gbc' ? 'gb' : s)

const EXTENSIONES: Record<string, Sistema> = { gb: 'gb', gbc: 'gbc', cgb: 'gbc', gba: 'gba', agb: 'gba', sfc: 'snes', smc: 'snes', swc: 'snes', fig: 'snes', nds: 'nds', nes: 'nes' }

export function extensionDe(nombre: string): string {
  const i = nombre.lastIndexOf('.')
  return i < 0 ? '' : nombre.slice(i + 1).toLowerCase()
}

function esGba(b: Uint8Array): boolean {
  return b.length >= 0xc0 && b[3] === 0xea && b[0xb2] === 0x96
}

function esGb(b: Uint8Array): boolean {
  return b.length >= 0x150 && b[0x104] === 0xce && b[0x105] === 0xed && b[0x106] === 0x66 && b[0x107] === 0x66
}

/** Cabecera iNES de los juegos de NES: «NES» y el carácter 0x1A. */
function esNes(b: Uint8Array): boolean {
  return b.length >= 16 && b[0] === 0x4e && b[1] === 0x45 && b[2] === 0x53 && b[3] === 0x1a
}

/** Consola de una ROM, o null si no se reconoce. */
export function detectarSistema(bytes: Uint8Array, nombreFichero: string): Sistema | null {
  if (esNes(bytes)) return 'nes'
  if (esGba(bytes)) return 'gba'
  if (esGb(bytes)) return bytes[0x143] & 0x80 ? 'gbc' : 'gb'
  const porExtension = EXTENSIONES[extensionDe(nombreFichero)]
  return porExtension ?? null
}

function texto(bytes: Uint8Array, desde: number, hasta: number): string {
  let s = ''
  for (let i = desde; i < hasta && i < bytes.length; i++) {
    const c = bytes[i]
    if (c === 0) break
    if (c >= 0x20 && c < 0x7f) s += String.fromCharCode(c)
  }
  return s.trim()
}

/**
 * Cabecera de un cartucho de Super Nintendo: en 0x7FC0 (LoROM) o 0xFFC0 (HiROM), más 512 bytes si el
 * fichero trae la cabecera de las copiadoras antiguas. Se elige la que tiene la suma de control
 * coherente con su complemento.
 */
function cabeceraSnes(b: Uint8Array): number | null {
  const extra = b.length % 1024 === 512 ? 512 : 0
  for (const base of [0x7fc0, 0xffc0, 0x40ffc0]) {
    const o = base + extra
    if (o + 0x20 > b.length) continue
    const complemento = b[o + 0x1c] | (b[o + 0x1d] << 8)
    const suma = b[o + 0x1e] | (b[o + 0x1f] << 8)
    if ((complemento ^ suma) === 0xffff) return o
  }
  return null
}

/** Título interno del cartucho (en mayúsculas y recortado), si lo tiene. */
export function tituloInterno(bytes: Uint8Array, sistema: Sistema): string {
  if (sistema === 'snes') {
    const o = cabeceraSnes(bytes)
    return o === null ? '' : texto(bytes, o, o + 21)
  }
  if (sistema === 'nds') return texto(bytes, 0, 12)
  // Los cartuchos de NES no llevan título
  if (sistema === 'nes') return ''
  if (sistema === 'gba') return texto(bytes, 0xa0, 0xac)
  // En Game Boy Color el título ocupa menos: los últimos bytes son el código y el indicador de color
  return texto(bytes, 0x134, sistema === 'gbc' ? 0x143 : 0x144)
}

/**
 * Nombre para la biblioteca a partir del fichero: sin extensión, sin las etiquetas habituales
 * entre corchetes y sin guiones bajos. «Pokemon_Esmeralda (S) [!].gba» queda «Pokemon Esmeralda (S)».
 */
export function nombreDesdeFichero(nombre: string): string {
  const sinRuta = nombre.split(/[\\/]/).pop() ?? nombre
  const i = sinRuta.lastIndexOf('.')
  const base = i > 0 ? sinRuta.slice(0, i) : sinRuta
  const limpio = base
    .replace(/\[[^\]]*\]/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return limpio || base
}

export interface RomLeida {
  bytes: Uint8Array
  nombreFichero: string
  sistema: Sistema
}

/**
 * Lee un fichero elegido por el usuario. Si es un .zip, toma la primera ROM que encuentre dentro.
 * Devuelve null si no hay ninguna ROM reconocible.
 */
export function leerRom(bytes: Uint8Array, nombreFichero: string): RomLeida | null {
  if (extensionDe(nombreFichero) === 'zip' || (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) {
    let ficheros: Record<string, Uint8Array>
    try {
      ficheros = unzipSync(bytes, { filter: (f) => !f.name.endsWith('/') && f.originalSize <= 512 * 1024 * 1024 })
    } catch {
      return null
    }
    const nombres = Object.keys(ficheros).sort((a, b) => Number(!EXTENSIONES[extensionDe(a)]) - Number(!EXTENSIONES[extensionDe(b)]))
    for (const n of nombres) {
      const sistema = detectarSistema(ficheros[n], n)
      if (sistema) return { bytes: ficheros[n], nombreFichero: n, sistema }
    }
    return null
  }
  const sistema = detectarSistema(bytes, nombreFichero)
  return sistema ? { bytes, nombreFichero, sistema } : null
}
