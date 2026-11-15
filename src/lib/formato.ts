export function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toLocaleString('es-ES', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`
}

export function plural(n: number, uno: string, varios: string): string {
  return `${n.toLocaleString('es-ES')} ${n === 1 ? uno : varios}`
}

/** «hoy a las 18:30», «ayer a las 9:05» o «12 nov. a las 20:00». */
export function cuando(fecha: number, ahora = Date.now()): string {
  const d = new Date(fecha)
  const hoy = new Date(ahora)
  const hora = d.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })
  const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (mismoDia(d, hoy)) return `hoy a las ${hora}`
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  if (mismoDia(d, ayer)) return `ayer a las ${hora}`
  const opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  if (d.getFullYear() !== hoy.getFullYear()) opciones.year = 'numeric'
  return `${d.toLocaleDateString('es-ES', opciones)} a las ${hora}`
}
