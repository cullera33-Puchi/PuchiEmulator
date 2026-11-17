/**
 * Rendimiento de los núcleos (v0.27.0): milisegundos por fotograma de cada núcleo con su ROM de
 * prueba, sin la app alrededor (ni dibujo ni sonido), para comparar versiones de los núcleos.
 *
 * Si existe dist/referencia/nucleos (los de la versión anterior), se miden los dos en la misma
 * máquina, alternando, y se da la diferencia. Solo compara bien en la misma máquina y ejecución.
 * El resultado va a la consola, a test-results/rendimiento.json y, en GitHub, al resumen del flujo.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { OPCIONES } from '../../src/emulador/nucleo'
import type { NombreNucleo } from '../../src/lib/sistemas'

const CASOS: { nucleo: NombreNucleo; consola: string; rom: string; extension: string; opciones?: Record<string, string>; disco?: string }[] = [
  { nucleo: 'mgba', consola: 'Game Boy Advance', rom: 'prueba.gba', extension: 'gba' },
  { nucleo: 'fceumm', consola: 'NES', rom: 'prueba.nes', extension: 'nes' },
  { nucleo: 'snes9x', consola: 'Super Nintendo', rom: 'prueba.sfc', extension: 'sfc' },
  { nucleo: 'melonds', consola: 'Nintendo DS', rom: 'prueba.nds', extension: 'nds' },
  { nucleo: 'genesis', consola: 'Mega Drive', rom: 'prueba.md', extension: 'md' },
  { nucleo: 'n64', consola: 'Nintendo 64', rom: 'prueba.z64', extension: 'z64' },
  // PlayStation (v0.37.0): el CD de prueba en BIN con su CUE, que el núcleo lee por la ruta
  { nucleo: 'psx', consola: 'PlayStation', rom: 'prueba-psx.bin', extension: 'cue', disco: 'prueba-psx.cue' },
]

/** Cada ronda dura lo mismo en todas las consolas, para que las rápidas no midan casi nada */
const MS_POR_RONDA = 1500
const RONDAS = 7

const hayReferencia = existsSync('dist/referencia/nucleos')

test('rendimiento de los núcleos', async ({ page }) => {
  await page.goto('/')
  const filas: { consola: string; nucleo: string; ms: number; referencia?: number }[] = []
  for (const c of CASOS) {
    const rom = [...readFileSync(`tests/fixtures/${c.rom}`)]
    const cue = c.disco ? readFileSync(`tests/fixtures/${c.disco}`, 'utf8') : null
    const opciones = { ...OPCIONES[c.nucleo], ...c.opciones }
    const medir = (raiz: string) =>
      page.evaluate(
        async ({ raiz, nucleo, rom, extension, opciones, msRonda, cue }) => {
          type M = Record<string, (...a: number[]) => number> & { HEAPU8: Uint8Array; stringToNewUTF8(s: string): number; FS?: { mkdirTree(r: string): void; writeFile(r: string, d: Uint8Array | string): void } }
          const { default: crear } = await import(/* @vite-ignore */ `${raiz}${nucleo}.js`)
          const m = (await crear({ locateFile: (r: string) => `${raiz}${r}`, print: () => undefined, printErr: () => undefined })) as M
          // Nintendo 64 dibuja con WebGL 2 en el lienzo que le deja la app (v0.32.0)
          const mm = m as unknown as { specialHTMLTargets?: Record<string, unknown> }
          const lienzo = nucleo === 'n64' ? new OffscreenCanvas(640, 480) : null
          if (lienzo && mm.specialHTMLTargets) mm.specialHTMLTargets['!lienzo'] = lienzo
          // Las opciones, antes de iniciar el núcleo, como en la app (v0.40.0)
          for (const [k, v] of Object.entries(opciones)) m._pf_opcion(m.stringToNewUTF8(k), m.stringToNewUTF8(v))
          m._pf_iniciar()
          m.FS?.mkdirTree('/sistema')
          let cargado: number
          if (cue !== null && m.FS) {
            // Disco: en la memoria del módulo para medir (en la app, en los ficheros, por WORKERFS)
            m.FS.mkdirTree('/disco')
            m.FS.writeFile('/disco/prueba-psx.bin', new Uint8Array(rom))
            m.FS.writeFile('/disco/prueba-psx.cue', cue)
            cargado = m._pf_cargar_ruta(m.stringToNewUTF8('/disco/prueba-psx.cue'))
          } else {
            const p = m._malloc(rom.length)
            m.HEAPU8.set(rom, p)
            // Con las corrutinas de Nintendo 64, el resultado se lee aparte (pf_resultado)
            cargado = m._pf_cargar(p, rom.length, m.stringToNewUTF8(extension))
          }
          if ((m._pf_resultado ? m._pf_resultado() : cargado) !== 1) throw new Error(`${nucleo}: no carga la ROM`)
          // Calentamiento: el navegador optimiza el código de WebAssembly en las primeras vueltas
          for (let i = 0; i < 120; i++) m._pf_fotograma()
          const t0 = performance.now()
          let n = 0
          while (performance.now() - t0 < msRonda) {
            for (let i = 0; i < 10; i++) m._pf_fotograma()
            n += 10
          }
          const ms = (performance.now() - t0) / n
          m._pf_descargar()
          // Suelta el contexto de WebGL: el navegador admite pocos a la vez y cada ronda crea uno
          ;(lienzo?.getContext('webgl2') as WebGL2RenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext()
          return ms
        },
        { raiz, nucleo: c.nucleo, rom, extension: c.extension, opciones, msRonda: MS_POR_RONDA, cue },
      )
    const actual: number[] = []
    const anterior: number[] = []
    // Alternando, para que un momento de máquina ocupada no afecte solo a uno
    for (let r = 0; r < RONDAS; r++) {
      actual.push(await medir('/nucleos/'))
      if (hayReferencia && existsSync(`dist/referencia/nucleos/${c.nucleo}.wasm`)) anterior.push(await medir('/referencia/nucleos/'))
    }
    const mediana = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1]
    filas.push({ consola: c.consola, nucleo: c.nucleo, ms: mediana(actual), referencia: anterior.length ? mediana(anterior) : undefined })
  }

  const n = (v: number) => v.toFixed(2).replace('.', ',')
  const lineas = [
    '| Consola | Núcleo | ms por fotograma | Versión anterior | Diferencia |',
    '| --- | --- | --- | --- | --- |',
    ...filas.map((f) => {
      const pc = f.referencia ? Math.round(((f.ms - f.referencia) / f.referencia) * 100) : 0
      const dif = f.referencia ? `${pc > 0 ? '+' : ''}${pc} %` : 'sin referencia'
      return `| ${f.consola} | ${f.nucleo} | ${n(f.ms)} | ${f.referencia ? n(f.referencia) : 'no hay'} | ${dif} |`
    }),
  ]
  console.log(['', `Rendimiento de los núcleos (mediana de ${RONDAS} rondas de ${MS_POR_RONDA / 1000} s)`, ...lineas].join('\n'))
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/rendimiento.json', JSON.stringify(filas, null, 2))
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['## Rendimiento de los núcleos', '', ...lineas, ''].join('\n'))
  // Aviso en GitHub (sin fallar) si algún núcleo va más de un 15 % más lento que el anterior
  for (const f of filas) if (f.referencia && f.ms > f.referencia * 1.15) console.log(`::warning::${f.consola}: ${n(f.ms)} ms por fotograma, antes ${n(f.referencia)}`)
  for (const f of filas) expect(f.ms).toBeGreaterThan(0)
})
