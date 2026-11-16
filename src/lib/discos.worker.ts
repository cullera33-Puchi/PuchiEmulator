/**
 * Copia de un disco de PlayStation a los ficheros privados de la app (v0.37.0), en un hilo aparte:
 * por trozos de 8 MB, sin tenerlo entero en memoria, y con el SHA-1 de los datos a la vez. Escribe
 * con el acceso síncrono de OPFS (createSyncAccessHandle), que solo existe en los hilos.
 */
import { CARPETA_DISCOS } from './discos'
import { Sha1 } from './sha1'

const TROZO = 8 * 1024 * 1024

interface AccesoSincrono {
  write(datos: Uint8Array, opciones: { at: number }): number
  flush(): void | Promise<void>
  close(): void | Promise<void>
}

interface Orden {
  orden: 'copiar'
  carpeta: string
  ficheros: { fichero: File; nombre: string }[]
  texto?: { nombre: string; contenido: string }
}

async function escribir(carpeta: FileSystemDirectoryHandle, nombre: string, trozos: AsyncIterable<Uint8Array>): Promise<void> {
  const fichero = await carpeta.getFileHandle(nombre, { create: true })
  const acceso = (await (fichero as unknown as { createSyncAccessHandle(): Promise<AccesoSincrono> }).createSyncAccessHandle()) as AccesoSincrono
  try {
    let en = 0
    for await (const t of trozos) {
      let escrito = 0
      while (escrito < t.length) escrito += acceso.write(t.subarray(escrito), { at: en + escrito })
      en += t.length
    }
    await acceso.flush()
  } finally {
    await acceso.close()
  }
}

self.onmessage = async (e: MessageEvent<Orden>) => {
  const o = e.data
  try {
    const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle(CARPETA_DISCOS, { create: true })
    const carpeta = await raiz.getDirectoryHandle(o.carpeta, { create: true })
    const resumen = new Sha1()
    let hecho = 0
    for (const { fichero, nombre } of o.ficheros) {
      await escribir(
        carpeta,
        nombre,
        (async function* () {
          for (let desde = 0; desde < fichero.size; desde += TROZO) {
            const t = new Uint8Array(await fichero.slice(desde, desde + TROZO).arrayBuffer())
            resumen.actualizar(t)
            hecho += t.length
            self.postMessage({ progreso: hecho })
            yield t
          }
        })(),
      )
    }
    if (o.texto) {
      const contenido = new TextEncoder().encode(o.texto.contenido)
      await escribir(carpeta, o.texto.nombre, (async function* () { yield contenido })())
    }
    self.postMessage({ hecho: { sha1: resumen.resumen(), tam: hecho } })
  } catch (err) {
    const error = err as DOMException
    self.postMessage({ error: error?.name === 'QuotaExceededError' ? 'No cabe en el iPhone: libera espacio y vuelve a intentarlo.' : (error?.message ?? String(err)) })
  }
}
