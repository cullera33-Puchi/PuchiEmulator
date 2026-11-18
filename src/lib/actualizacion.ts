/**
 * Versión nueva de la app (v0.45.0). El aviso «Nueva versión disponible» dura unos segundos; si se
 * pasaba, la versión nueva quedaba descargada sin forma de aplicarla salvo cerrando la app. Aquí se
 * guarda si hay una pendiente y cómo aplicarla, para Ajustes, Acerca de, y cómo buscar otra a mano.
 */
import { useEffect, useState } from 'react'

let pendiente = false
let aplicar: (() => void) | null = null
let registroSW: ServiceWorkerRegistration | undefined
const oyentes = new Set<() => void>()

/** Lo pone la app cuando el service worker tiene una versión nueva esperando */
export function ponerActualizacion(hay: boolean, f: () => void): void {
  pendiente = hay
  aplicar = f
  oyentes.forEach((o) => o())
}

export function ponerRegistroSW(r: ServiceWorkerRegistration | undefined): void {
  registroSW = r
}

/** Hay una versión nueva descargada, pendiente de aplicar */
export function useActualizacionPendiente(): boolean {
  const [hay, setHay] = useState(pendiente)
  useEffect(() => {
    const f = () => setHay(pendiente)
    oyentes.add(f)
    f()
    return () => void oyentes.delete(f)
  }, [])
  return hay
}

/** Enseña las novedades y aplica la versión nueva (lo mismo que el botón del aviso) */
export function aplicarActualizacion(): void {
  aplicar?.()
}

/**
 * Busca una versión nueva ahora. Si la hay, se descarga y queda pendiente (sale también el aviso).
 * Espera como mucho 20 segundos a que se descargue.
 */
export async function buscarActualizacion(): Promise<'nueva' | 'al-dia' | 'sin-conexion'> {
  if (!registroSW) return 'sin-conexion'
  try {
    await registroSW.update()
  } catch {
    return 'sin-conexion'
  }
  const limite = Date.now() + 20_000
  while (Date.now() < limite) {
    if (pendiente || registroSW.waiting) return 'nueva'
    if (!registroSW.installing) break
    await new Promise((r) => setTimeout(r, 300))
  }
  return pendiente || registroSW.waiting ? 'nueva' : 'al-dia'
}
