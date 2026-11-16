/**
 * Carátulas de los juegos.
 * - Búsqueda: en el índice de nombres del archivo público de libretro (public/caratulas), dentro
 *   del iPhone. Solo sale a internet la descarga de la imagen que elige el usuario.
 * - Foto propia: una imagen de Fotos o de Archivos.
 * En los dos casos se guarda reducida (JPEG de 400 px como máximo) en IndexedDB.
 */
import type { Sistema } from './sistemas'

export interface Candidato {
  nombre: string
  puntos: number
  /** El título coincide entero con lo buscado (sin etiquetas, signos ni palabras vacías) */
  exacto?: boolean
}

interface Indice {
  repo: string
  nombres: string[]
  normalizados: string[][]
}

const indices = new Map<Sistema, Promise<Indice>>()

const PALABRAS_VACIAS = new Set(['the', 'a', 'an', 'el', 'la', 'los', 'las', 'of', 'de', 'and', 'y', 'version', 'edicion'])

/** Palabras de un título sin acentos, signos, etiquetas entre paréntesis ni palabras vacías. */
export function palabras(titulo: string): string[] {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p && !PALABRAS_VACIAS.has(p))
}

/** Preferencia por la edición europea o española, que es la que suele tener el usuario, y por la
 * versión comercial frente a demos, prototipos o reediciones. */
function bonusRegion(nombre: string): number {
  if (/\((Beta|Proto|Demo|Sample|Taikenban|Pirate|Unl|Alternate|Virtual Console|Switch Online|Kiosk)[^)]*\)/i.test(nombre)) return -0.04
  if (/\(([^)]*\b)?(Spain|Europe)\b/.test(nombre)) return 0.06
  if (/\(([^)]*\b)?World\b/.test(nombre)) return 0.04
  if (/\(([^)]*\b)?USA\b/.test(nombre)) return 0.02
  return 0
}

/**
 * Candidatos ordenados por parecido (coeficiente de Dice entre palabras, con un extra si el título
 * coincide entero y por región). Se quedan los que comparten al menos una palabra.
 */
export function buscarEn(nombres: string[], normalizados: string[][], consulta: string, maximo = 12): Candidato[] {
  const q = palabras(consulta)
  if (!q.length) return []
  const qSet = new Set(q)
  const qTexto = q.join(' ')
  const resultado: Candidato[] = []
  for (let i = 0; i < nombres.length; i++) {
    const c = normalizados[i]
    if (!c.length) continue
    let comunes = 0
    const vistas = new Set<string>()
    for (const p of c) {
      if (!vistas.has(p) && (qSet.has(p) || [...qSet].some((x) => x.length >= 4 && p.length >= 4 && (p.startsWith(x) || x.startsWith(p))))) {
        comunes++
        vistas.add(p)
      }
    }
    if (!comunes) continue
    let puntos = (2 * comunes) / (qSet.size + new Set(c).size)
    const exacto = c.join(' ') === qTexto
    if (exacto) puntos += 0.5
    puntos += bonusRegion(nombres[i])
    resultado.push({ nombre: nombres[i], puntos, exacto })
  }
  return resultado.sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre)).slice(0, maximo)
}

/** Etiquetas entre paréntesis de un nombre, en minúsculas: «(USA, Europe) (Rev 1)» da usa, europe, rev 1. */
function etiquetas(nombre: string): Set<string> {
  const r = new Set<string>()
  for (const m of nombre.matchAll(/\(([^)]*)\)/g)) for (const t of m[1].split(',')) r.add(t.trim().toLowerCase())
  return r
}

/**
 * Elección sin preguntar, solo si es segura: el mismo nombre de fichero que la carátula o el mismo
 * título. Entre varias con el mismo título, la que comparte región con el fichero o, si el fichero
 * no la dice, la europea o española. Si no hay coincidencia segura, null (la elige el usuario).
 */
export function elegirAutomatica(consulta: string, candidatos: Candidato[]): Candidato | null {
  const limpia = consulta.trim().toLowerCase()
  const igual = candidatos.find((c) => nombreVisible(c.nombre).toLowerCase() === limpia)
  if (igual) return igual
  const exactos = candidatos.filter((c) => c.exacto)
  if (!exactos.length) return null
  const propias = etiquetas(consulta)
  if (propias.size) {
    const conRegion = exactos.find((c) => [...etiquetas(nombreVisible(c.nombre))].some((t) => propias.has(t)))
    if (conRegion) return conRegion
  }
  return exactos[0]
}

function cargarIndice(sistema: Sistema): Promise<Indice> {
  let p = indices.get(sistema)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}caratulas/${sistema}.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Sin índice de carátulas')
        return r.json() as Promise<{ repo: string; nombres: string[] }>
      })
      .then(({ repo, nombres }) => ({ repo, nombres, normalizados: nombres.map(palabras) }))
    p.catch(() => indices.delete(sistema))
    indices.set(sistema, p)
  }
  return p
}

export async function buscarCaratulas(sistema: Sistema, consulta: string): Promise<{ repo: string; candidatos: Candidato[] }> {
  // Un juego de Game Boy puede tener la carátula en la carpeta de Game Boy Color y al revés
  const sistemas: Sistema[] = sistema === 'gb' ? ['gb', 'gbc'] : sistema === 'gbc' ? ['gbc', 'gb'] : [sistema]
  const principal = await cargarIndice(sistemas[0])
  let candidatos = buscarEn(principal.nombres, principal.normalizados, consulta)
  if (sistemas[1] && (!candidatos.length || candidatos[0].puntos < 0.8)) {
    const otro = await cargarIndice(sistemas[1]).catch(() => null)
    if (otro) {
      const extra = buscarEn(otro.nombres, otro.normalizados, consulta).map((c) => ({ ...c, nombre: `${otro.repo}/${c.nombre}` }))
      candidatos = [...candidatos, ...extra].sort((a, b) => b.puntos - a.puntos).slice(0, 12)
    }
  }
  return { repo: principal.repo, candidatos }
}

/** Dirección de la imagen. El nombre puede llevar delante «repo/» si es de otra consola. */
export function urlCaratula(repo: string, nombre: string): string {
  const i = nombre.indexOf('/')
  const [r, n] = i > 0 && nombre.startsWith('Nintendo_-_') ? [nombre.slice(0, i), nombre.slice(i + 1)] : [repo, nombre]
  return `https://raw.githubusercontent.com/libretro-thumbnails/${r}/master/Named_Boxarts/${encodeURIComponent(n)}.png`
}

/** Nombre para mostrar de un candidato (sin la carpeta de otra consola). */
export function nombreVisible(nombre: string): string {
  const i = nombre.indexOf('/')
  return i > 0 && nombre.startsWith('Nintendo_-_') ? nombre.slice(i + 1) : nombre
}

/** Reduce una imagen a JPEG de 400 px como máximo de lado. */
export async function reducirImagen(imagen: Blob, lado = 400): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(imagen)
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
  const ancho = Math.max(1, Math.round(bitmap.width * escala))
  const alto = Math.max(1, Math.round(bitmap.height * escala))
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('No se ha podido preparar la imagen')
  return blob.arrayBuffer()
}

export async function descargarCaratula(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url, { mode: 'cors' })
  if (!r.ok) throw new Error(`Carátula no disponible (${r.status})`)
  return reducirImagen(await r.blob())
}
