/**
 * Direcciones de las imágenes de las carátulas y de las fotos de las consolas (v0.35.1). El inicio
 * vuelve a leerlas al volver de otra pantalla; antes creaba direcciones nuevas para todas y tiraba las
 * anteriores, y las imágenes se quedaban un instante en blanco (el parpadeo que veía el usuario al
 * volver de Estadísticas). Ahora se reutiliza la dirección de las que no han cambiado.
 */

export interface ImagenGuardada {
  id: string
  datos: ArrayBuffer
  fecha: number
}

export interface UrlGuardada {
  url: string
  /** Para saber si la imagen ha cambiado: fecha y tamaño */
  firma: string
}

const firmaDe = (c: ImagenGuardada) => `${c.fecha}:${c.datos.byteLength}`

/**
 * Pone al día las direcciones: reutiliza las de las imágenes que siguen igual, crea las de las nuevas o
 * cambiadas y suelta las que ya no están o han cambiado. Devuelve las nuevas direcciones por id.
 */
export function actualizarUrls(
  antes: Map<string, UrlGuardada>,
  imagenes: ImagenGuardada[],
  crear: (c: ImagenGuardada) => string,
  soltar: (url: string) => void,
): Map<string, UrlGuardada> {
  const nuevas = new Map<string, UrlGuardada>()
  for (const c of imagenes) {
    const firma = firmaDe(c)
    const vieja = antes.get(c.id)
    nuevas.set(c.id, vieja && vieja.firma === firma ? vieja : { url: crear(c), firma })
  }
  for (const [id, vieja] of antes) if (nuevas.get(id) !== vieja) soltar(vieja.url)
  return nuevas
}
