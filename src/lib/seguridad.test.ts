import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _reiniciarConexion, guardarPartida, leerPartida, listarPartidas } from './almacen'
import { borrarCopia, copiaDiaria, crearCopia, hoy, listarCopias, restaurarCopia } from './seguridad'

const almacen = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => void almacen.set(k, v),
  removeItem: (k: string) => void almacen.delete(k),
})

const borrarBase = (nombre: string) =>
  new Promise<void>((r) => {
    const p = indexedDB.deleteDatabase(nombre)
    p.onsuccess = p.onerror = p.onblocked = () => r()
  })

const id = 'b'.repeat(40)

beforeEach(async () => {
  _reiniciarConexion()
  almacen.clear()
  await borrarBase('puchiemulator')
  await borrarBase('puchiemulator-copias')
})

describe('copias de seguridad', () => {
  it('la copia diaria se hace una vez al día y solo si hay partidas', async () => {
    await copiaDiaria()
    expect(await listarCopias()).toHaveLength(0)
    await guardarPartida({ id, datos: new Uint8Array([1]).buffer, fecha: 1 })
    await copiaDiaria()
    await copiaDiaria()
    const copias = await listarCopias()
    expect(copias).toHaveLength(1)
    expect(copias[0]).toMatchObject({ fecha: hoy(), motivo: 'diaria', partidas: 1 })
  })

  it('conserva las 7 más recientes', async () => {
    await guardarPartida({ id, datos: new Uint8Array([1]).buffer, fecha: 1 })
    for (let i = 0; i < 9; i++) {
      vi.setSystemTime(new Date(2026, 10, 15, 10, 0, i))
      await crearCopia('manual')
    }
    vi.useRealTimers()
    expect(await listarCopias()).toHaveLength(7)
  })

  it('restaurar sustituye las partidas y devuelve las de antes para deshacer', async () => {
    await guardarPartida({ id, datos: new Uint8Array([1]).buffer, fecha: 1 })
    const copia = await crearCopia('manual')
    await guardarPartida({ id, datos: new Uint8Array([2]).buffer, fecha: 2 })
    const otro = 'c'.repeat(40)
    await guardarPartida({ id: otro, datos: new Uint8Array([3]).buffer, fecha: 3 })
    const { antes, restauradas } = await restaurarCopia(copia.fecha)
    expect(restauradas).toBe(1)
    expect(new Uint8Array((await leerPartida(id))!.datos)).toEqual(new Uint8Array([1]))
    expect(await leerPartida(otro)).toBeUndefined()
    expect(antes).toHaveLength(2)
    expect((await listarCopias()).some((c) => c.motivo === 'previa')).toBe(true)
    expect(await listarPartidas()).toHaveLength(1)
  })

  it('si se borra a mano la copia de hoy, no se vuelve a crear hasta mañana', async () => {
    await guardarPartida({ id, datos: new Uint8Array([1]).buffer, fecha: 1 })
    await copiaDiaria()
    await borrarCopia(hoy())
    await copiaDiaria()
    expect(await listarCopias()).toHaveLength(0)
  })
})
