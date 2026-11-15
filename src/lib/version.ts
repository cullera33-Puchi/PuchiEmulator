declare const __APP_VERSION__: string

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

export interface Novedad {
  version: string
  fecha: string
  cambios: string[]
}

export function compararVersiones(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

export async function cargarNovedades(): Promise<Novedad[] | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}novedades.json`, { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()) as Novedad[]
  } catch {
    return null
  }
}

/** Novedades de las versiones posteriores a la instalada. */
export function novedadesPosteriores(lista: Novedad[], instalada = APP_VERSION): Novedad[] {
  return lista.filter((n) => compararVersiones(n.version, instalada) > 0)
}
