/**
 * Trucos (v0.48.0). Los ficheros de trucos del archivo público de libretro (libretro-database,
 * carpeta cht, licencia CC BY-SA 4.0): la app lleva un índice con los nombres
 * (public/trucos/<sistema>.json, `npm run indice:trucos`), busca el juego en el iPhone como con las
 * carátulas y solo descarga el fichero que toca. El usuario también puede escribir sus códigos.
 *
 * Cada núcleo recibe los trucos activos uno a uno (`envios`): la lista se vacía y se vuelve a mandar
 * entera cada vez que cambia algo.
 */
import { buscarEn, elegirAutomatica, palabras, type Candidato } from './caratulas'
import type { Truco } from './almacen'
import type { Sistema } from './sistemas'

/** Consolas con trucos y su carpeta en el archivo. La DS aplica cada truco una sola vez y no deja quitarlo; N64 y PlayStation, más adelante */
export const CARPETAS_TRUCOS: Partial<Record<Sistema, string>> = {
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  gba: 'Nintendo - Game Boy Advance',
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  md: 'Sega - Mega Drive - Genesis',
  sms: 'Sega - Master System - Mark III',
  gg: 'Sega - Game Gear',
}

export const tieneTrucos = (s: Sistema) => s in CARPETAS_TRUCOS

/**
 * Lo más largo que admite cada núcleo en una llamada y si un código de varias partes («A+B+C») se
 * puede mandar por trozos. Snes9x y Genesis Plus GX copian el código en 256 bytes; FCEUmm, en 1024.
 * Los de Game Boy no tienen tope, pero no se parten: hay códigos que dependen de la línea anterior.
 */
const LIMITES: Partial<Record<Sistema, { largo: number; partir: boolean }>> = {
  snes: { largo: 250, partir: true },
  md: { largo: 250, partir: true },
  sms: { largo: 250, partir: true },
  gg: { largo: 250, partir: true },
  nes: { largo: 1000, partir: true },
}
const SIN_TOPE = 4000

/** Un código limpio: sin espacios a los lados ni saltos de línea (que algunos pegan) */
export function limpiarCodigo(codigo: string): string {
  return codigo
    .trim()
    .replace(/\s*\n\s*/g, '+')
    .replace(/\++/g, '+')
    .replace(/^\+|\+$/g, '')
}

/**
 * Lo que se manda al núcleo por los trucos activos, en orden: cada uno en una llamada o, si es muy
 * largo y la consola lo permite, en varias por sus partes. Los que no caben van a `fuera`.
 */
export function envios(trucos: Truco[], sistema: Sistema): { codigos: string[]; fuera: Truco[] } {
  const { largo, partir } = LIMITES[sistema] ?? { largo: SIN_TOPE, partir: false }
  const codigos: string[] = []
  const fuera: Truco[] = []
  for (const t of trucos) {
    if (!t.activo) continue
    const c = limpiarCodigo(t.codigo)
    if (!c) continue
    if (c.length <= largo) {
      codigos.push(c)
      continue
    }
    const partes = c.split('+')
    if (!partir || partes.some((p) => p.length > largo)) {
      fuera.push(t)
      continue
    }
    let trozo = ''
    for (const p of partes) {
      if (trozo && trozo.length + 1 + p.length > largo) {
        codigos.push(trozo)
        trozo = ''
      }
      trozo = trozo ? `${trozo}+${p}` : p
    }
    if (trozo) codigos.push(trozo)
  }
  return { codigos, fuera }
}

/** Valor de una línea «clave = valor» de un fichero .cht, sin comillas */
function valor(v: string): string {
  const t = v.trim()
  if (t.startsWith('"')) {
    const fin = t.lastIndexOf('"')
    return (fin > 0 ? t.slice(1, fin) : t.slice(1)).replace(/\\"/g, '"')
  }
  return t
}

/**
 * Lee un fichero de trucos de libretro (.cht): «cheatN_desc», «cheatN_code» y «cheatN_enable». Los
 * que no tienen código (los de búsqueda en memoria de RetroArch) se dejan fuera.
 */
export function leerCht(texto: string): Truco[] {
  const porNumero = new Map<number, { nombre?: string; codigo?: string; activo?: boolean }>()
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*cheat(\d+)_(desc|code|enable)\s*=\s*(.*)$/.exec(linea)
    if (!m) continue
    const n = Number(m[1])
    const t = porNumero.get(n) ?? {}
    const v = valor(m[3])
    if (m[2] === 'desc') t.nombre = v
    else if (m[2] === 'code') t.codigo = v
    else t.activo = v === 'true'
    porNumero.set(n, t)
  }
  return [...porNumero.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, t]) => t.codigo && limpiarCodigo(t.codigo))
    .map(([n, t]) => ({ nombre: (t.nombre || `Truco ${n + 1}`).slice(0, 120), codigo: t.codigo!.slice(0, SIN_TOPE), activo: false }))
}

/* ---- Índice y búsqueda ---- */

interface Indice {
  carpeta: string
  nombres: string[]
  normalizados: string[][]
}

const indices = new Map<Sistema, Promise<Indice>>()

function cargarIndice(sistema: Sistema): Promise<Indice> {
  let p = indices.get(sistema)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}trucos/${sistema}.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Sin índice de trucos')
        return r.json() as Promise<{ carpeta: string; nombres: string[] }>
      })
      .then(({ carpeta, nombres }) => ({ carpeta, nombres, normalizados: nombres.map(palabras) }))
    p.catch(() => indices.delete(sistema))
    indices.set(sistema, p)
  }
  return p
}

/** Un fichero de trucos que puede ser el del juego */
export interface FicheroTrucos extends Candidato {
  carpeta: string
}

/**
 * Ficheros de trucos parecidos al nombre del juego, del más al menos parecido. Los de Game Boy
 * pueden estar en la carpeta de Game Boy Color y al revés.
 */
export async function buscarTrucos(sistema: Sistema, consulta: string): Promise<FicheroTrucos[]> {
  const sistemas: Sistema[] = sistema === 'gb' ? ['gb', 'gbc'] : sistema === 'gbc' ? ['gbc', 'gb'] : [sistema]
  const lista: FicheroTrucos[] = []
  for (const s of sistemas) {
    const indice = await cargarIndice(s).catch(() => null)
    if (!indice) continue
    lista.push(...buscarEn(indice.nombres, indice.normalizados, consulta, 20).map((c) => ({ ...c, carpeta: indice.carpeta })))
  }
  return lista.sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre)).slice(0, 20)
}

/** El fichero del juego sin preguntar, solo si la coincidencia es segura (como las carátulas) */
export function elegirTrucos(consulta: string, ficheros: FicheroTrucos[]): FicheroTrucos | null {
  return (elegirAutomatica(consulta, ficheros) as FicheroTrucos | null) ?? null
}

export function urlTrucos(f: { carpeta: string; nombre: string }): string {
  return `https://raw.githubusercontent.com/libretro/libretro-database/master/cht/${encodeURIComponent(f.carpeta)}/${encodeURIComponent(f.nombre)}.cht`
}

/** Descarga y lee un fichero de trucos */
export async function descargarTrucos(f: { carpeta: string; nombre: string }): Promise<Truco[]> {
  const r = await fetch(urlTrucos(f))
  if (!r.ok) throw new Error(`No se ha podido descargar (${r.status})`)
  return leerCht(await r.text())
}

/**
 * Junta los trucos descargados con los que ya tenía el juego: los propios se quedan, y los del
 * archivo que estaban puestos siguen puestos si el código es el mismo.
 */
export function juntarTrucos(antes: Truco[], nuevos: Truco[]): Truco[] {
  const puestos = new Set(antes.filter((t) => t.activo && !t.propio).map((t) => limpiarCodigo(t.codigo)))
  return [...antes.filter((t) => t.propio), ...nuevos.map((t) => ({ ...t, activo: puestos.has(limpiarCodigo(t.codigo)) }))]
}
