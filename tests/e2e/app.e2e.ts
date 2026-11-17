/**
 * Recorrido de la app en un iPhone simulado con las ROMs de prueba propias (tests/fixtures):
 * añadir juegos, jugar, botones, estados, salir y seguir, y la distribución en horizontal.
 */
import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const rom = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url))

// La hoja de bienvenida se da por vista salvo en su propia prueba
test.beforeEach(async ({ page }, info) => {
  if (info.title.includes('bienvenida')) return
  await page.addInitScript(() => {
    // Colores sin corregir (las pruebas comparan colores exactos) y sin el aviso de la copia, salvo en sus pruebas
    if (!localStorage.getItem('puchiemulator-ajustes'))
      localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ bienvenidaVista: true, coloresConsola: false, ultimaCopia: Date.now() }))
  })
})

/** Color del píxel central de la pantalla del juego. */
async function colorCentral(page: Page): Promise<[number, number, number]> {
  return page.getByTestId('pantalla').evaluate((c: HTMLCanvasElement) => {
    const d = ((t) => { t.width = c.width; t.height = c.height; const g = t.getContext('2d')!; g.drawImage(c, 0, 0); return g })(document.createElement('canvas')).getImageData(c.width >> 1, c.height >> 1, 1, 1).data
    return [d[0], d[1], d[2]] as [number, number, number]
  })
}

const CONSOLA: Record<string, string> = { 'prueba.gba': 'Game Boy Advance', 'prueba.gb': 'Game Boy y Game Boy Color', 'prueba.sfc': 'Super Nintendo', 'prueba.nds': 'Nintendo DS', 'prueba.nes': 'NES', 'prueba.md': 'Mega Drive', 'prueba.sms': 'Master System y Game Gear', 'prueba.gg': 'Master System y Game Gear', 'prueba.z64': 'Nintendo 64' }

/** Abre la biblioteca de una consola desde el inicio. */
/** Selector de ficheros de la pantalla de arriba: el inicio se queda montado debajo de las apiladas (v0.26.1) */
const selector = (page: Page) => page.locator('.capa:not(.fondo)').getByTestId('selector')

async function entrar(page: Page, consola: string) {
  await page.getByTestId('consolas').getByRole('button', { name: new RegExp(`^${consola},`) }).click()
}

/** Añade una ROM desde el inicio y entra en la biblioteca de su consola. */
async function anadir(page: Page, fichero: string) {
  await selector(page).setInputFiles(rom(fichero))
  await expect(page.getByText(/añadido|ya estaba/i)).toBeVisible()
  await entrar(page, CONSOLA[fichero])
}

async function pulsar(page: Page, etiqueta: string, ms = 300) {
  const caja = (await page.getByTestId('mando').getByRole('button', { name: etiqueta, exact: true }).boundingBox())!
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
}

test('inicio sin juegos, añadir un juego de GBA y jugar con los botones', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/Añade tus juegos con/)).toBeVisible()
  await expect(page.getByTestId('consolas').getByRole('button', { name: /sin juegos/ })).toHaveCount(9)

  await anadir(page, 'prueba.gba')
  await expect(page.getByRole('button', { name: /prueba.*Game Boy Advance/i })).toBeVisible()

  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByTestId('juego')).toBeVisible()
  await expect(page.getByText('Cargando…')).toBeHidden()
  // GBA: L y R visibles
  await expect(page.getByTestId('mando').getByRole('button', { name: 'L', exact: true })).toBeVisible()

  // Sin pulsar, azul; con A, verde
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).toEqual([0, 251, 0])
  await page.mouse.up()
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])

  // Deslizar de B a A sin levantar el dedo
  await pulsar(page, 'B', 100)
  const a = (await page.getByTestId('mando').getByRole('button', { name: 'A', exact: true }).boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 5 })
  await expect.poll(() => colorCentral(page)).toEqual([0, 251, 0])
  await page.mouse.up()
})

test('teclado, estados guardados, salir y seguir donde se dejó', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()

  await page.keyboard.down('KeyX')
  await expect.poll(() => colorCentral(page)).toEqual([0, 251, 0])
  await page.keyboard.up('KeyX')

  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Estados guardados' }).click()
  await expect(page.getByRole('button', { name: 'Cargar la ranura 1' })).toBeDisabled()
  await page.getByRole('button', { name: 'Guardar en la ranura 1' }).click()
  await expect(page.getByText('Guardado en «Ranura 1»')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cargar la ranura 1' })).toBeEnabled()
  await page.getByRole('button', { name: 'Cargar la ranura 1' }).click()
  await expect(page.getByText('«Ranura 1» cargado')).toBeVisible()

  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await expect(page.getByText(/(\d+ s|min), hoy|Jugado hoy/)).toBeVisible()

  // Opciones del juego: hay estado «auto» para seguir
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await expect(page.getByRole('button', { name: 'Seguir donde lo dejé' })).toBeVisible()
  await page.getByRole('button', { name: 'Seguir donde lo dejé' }).click()
  await expect(page.getByTestId('juego')).toBeVisible()
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
})

test('Game Boy: sin L ni R, tema Clásica con el verde original y la pantalla responde a A', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gb')
  await page.getByRole('button', { name: /prueba.*Game Boy/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).toHaveAttribute('data-tema', 'clasica')
  await expect(page.getByTestId('mando').getByRole('button', { name: 'L', exact: true })).toHaveCount(0)
  // Verde claro de la Game Boy original; con A, el más oscuro
  await expect.poll(() => colorCentral(page)).toEqual([140, 162, 74])
  await pulsar(page, 'A')
  await expect.poll(async () => (await colorCentral(page)).reduce((a, b) => a + b)).toBeLessThan(150)
  await page.mouse.up()

  // Otro tema y la paleta gris, desde el menú del juego
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: /^Tema/ }).click()
  await page.getByRole('radio', { name: 'Turquesa' }).click()
  await page.getByRole('radio', { name: 'Gris' }).click()
  await expect(page.getByTestId('juego')).toHaveAttribute('data-tema', 'turquesa')
  // Pasada la guardia contra toques fantasma (450 ms), tocar el fondo cierra la hoja
  await page.waitForTimeout(500)
  await page.mouse.click(200, 30)
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  await expect.poll(() => colorCentral(page)).toEqual([255, 251, 255])
})

test('un fichero que no es un juego se rechaza', async ({ page }) => {
  await page.goto('/')
  await selector(page).setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') })
  await expect(page.getByText(/no es un juego/)).toBeVisible()
  await expect(page.getByTestId('consolas').getByRole('button', { name: /sin juegos/ })).toHaveCount(9)
})

test.describe('en horizontal', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  test('la pantalla queda en el centro y los controles a los lados, sin salirse', async ({ page }) => {
    await page.goto('/')
    await anadir(page, 'prueba.gba')
    await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    const mando = page.getByTestId('mando')
    const pantalla = (await page.getByTestId('pantalla').boundingBox())!
    const cruceta = (await mando.getByLabel('Cruceta').boundingBox())!
    const a = (await mando.getByRole('button', { name: 'A', exact: true }).boundingBox())!
    const start = (await mando.getByRole('button', { name: 'Start', exact: true }).boundingBox())!
    expect(pantalla.height).toBeGreaterThan(300)
    expect(cruceta.x + cruceta.width).toBeLessThan(844 / 2)
    expect(a.x).toBeGreaterThan(844 / 2)
    for (const c of [cruceta, a, start]) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y + c.height).toBeLessThanOrEqual(390)
    }
    await pulsar(page, 'A')
    await expect.poll(() => colorCentral(page)).toEqual([0, 251, 0])
    await page.mouse.up()
  })
})

test('en vertical, los controles quedan debajo de la pantalla', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  const pantalla = (await page.getByTestId('pantalla').boundingBox())!
  const mando = page.getByTestId('mando')
  for (const nombre of ['L', 'R']) {
    const b = (await mando.getByRole('button', { name: nombre, exact: true }).boundingBox())!
    expect(b.y).toBeGreaterThanOrEqual(pantalla.y + pantalla.height)
  }
  const cruceta = (await mando.getByLabel('Cruceta').boundingBox())!
  expect(cruceta.y).toBeGreaterThan(pantalla.y + pantalla.height)
})

test('la partida guardada dentro del juego se conserva en el iPhone al cerrar la app', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  // Partida nueva: azul. Al pulsar A, la ROM escribe su marca en la memoria de partida
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
  await pulsar(page, 'A')
  await page.mouse.up()
  // El guardado automático mira cada segundo si la partida ha cambiado
  await page.waitForTimeout(1500)

  // Se cierra la app sin pasar por el menú
  await page.reload()
  await entrar(page, 'Game Boy Advance')
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await expect(page.getByText(/Partida guardada/).locator('..')).toContainText('hoy')
  // Si la app se cierra a la fuerza puede no haber estado «auto»: entonces el botón es «Jugar»
  await page.getByRole('button', { name: /^(Jugar|Arrancar el juego desde el principio)$/ }).click()
  // Arranca desde cero, pero con la partida: la ROM la lee y pinta de rojo
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect.poll(() => colorCentral(page)).toEqual([255, 0, 0])
})

test('guardar y cargar rápido, con Deshacer', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Cargar rápido' })).toBeDisabled()
  await page.getByRole('button', { name: 'Guardar rápido', exact: true }).click()
  await expect(page.getByText('Guardado rápido', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cargar rápido' })).toBeEnabled()
  await page.getByRole('button', { name: 'Cargar rápido' }).click()
  await expect(page.getByText('Guardado rápido cargado')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByText('Guardado rápido cargado')).toBeHidden()
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
})

test('rebobinar vuelve atrás en el juego y el avance rápido cambia de velocidad', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  // Desactivado por decisión del usuario (v0.37.3): sin botón. El código sigue y se prueba activándolo
  await expect(page.getByRole('button', { name: /Rebobinar/ })).toHaveCount(0)
  // El avance rápido sigue (decisión del usuario: solo se quita ir hacia atrás)
  await page.getByRole('button', { name: /Avance rápido/ }).click()
  await expect(page.getByRole('button', { name: /Avance rápido/ })).toHaveAccessibleName('Avance rápido (x2)')
  await page.getByRole('button', { name: /Avance rápido/ }).click()
  await page.getByRole('button', { name: /Avance rápido/ }).click()
  await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('puchiemulator-ajustes') ?? '{}')
    localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ ...a, rebobinado: true }))
  })
  await page.reload()
  await entrar(page, 'Game Boy Advance')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  // Un segundo con A pulsado (verde) y medio segundo sin pulsar (azul)
  await page.keyboard.down('KeyX')
  await page.waitForTimeout(1000)
  await page.keyboard.up('KeyX')
  await page.waitForTimeout(500)
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
  // Manteniendo rebobinar se vuelve al momento en que A estaba pulsado
  const boton = page.getByRole('button', { name: /Rebobinar/ })
  await boton.dispatchEvent('pointerdown', { pointerId: 7, isPrimary: true })
  await expect.poll(() => colorCentral(page), { timeout: 3000 }).toEqual([0, 251, 0])
  await boton.dispatchEvent('pointerup', { pointerId: 7, isPrimary: true })

  const rapido = page.getByRole('button', { name: /Avance rápido/ })
  await rapido.click()
  await expect(rapido).toHaveAccessibleName('Avance rápido (x2)')
  await rapido.click()
  await expect(rapido).toHaveAccessibleName('Avance rápido (x4)')
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
  await rapido.click()
  await expect(rapido).toHaveAccessibleName('Avance rápido (desactivado)')
})

test('carátulas: buscar en el archivo de libretro, foto propia y quitar con Deshacer', async ({ page }) => {
  // Sin internet en las pruebas: las imágenes de libretro se sirven con un PNG local
  await page.route('https://raw.githubusercontent.com/**', (r) => r.fulfill({ path: rom('../../public/icono-512.png'), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }))
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await expect(page.getByTestId('biblioteca').locator('img')).toHaveCount(0)

  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: 'Poner carátula' }).click()
  const busqueda = page.getByRole('textbox', { name: 'Buscar carátula' })
  await expect(busqueda).toHaveValue('prueba')
  await busqueda.fill('advance wars')
  await busqueda.press('Enter')
  const candidatos = page.getByTestId('candidatos').getByRole('button')
  await expect(candidatos.first()).toContainText('Advance Wars')
  await candidatos.first().click()
  await expect(page.getByText('Carátula puesta')).toBeVisible()
  await expect(page.getByTestId('biblioteca').locator('img')).toHaveCount(1)

  // Foto propia y quitar, con Deshacer
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: 'Cambiar la carátula' }).click()
  await page.getByTestId('selector-foto').setInputFiles(rom('../../public/icono-192.png'))
  await expect(page.getByText('Carátula puesta')).toBeVisible()
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: 'Cambiar la carátula' }).click()
  await page.getByRole('button', { name: 'Quitar la carátula' }).click()
  await expect(page.getByTestId('biblioteca').locator('img')).toHaveCount(0)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByTestId('biblioteca').locator('img')).toHaveCount(1)
})

test('quitar un juego y borrar su partida se pueden deshacer', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: 'Quitar de la biblioteca' }).click()
  await expect(page.getByText('Aún no hay juegos')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByRole('button', { name: /prueba.*Game Boy Advance/i })).toBeVisible()
  // El juego vuelve con su ROM: se puede jugar
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
})

test('la hoja de bienvenida sale la primera vez y no vuelve', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('dialog', { name: 'Bienvenido' })).toBeVisible()
  await page.getByRole('button', { name: 'Entendido' }).click()
  await expect(page.getByRole('dialog', { name: 'Bienvenido' })).toBeHidden()
  await page.reload()
  await expect(page.getByText(/Añade tus juegos con/)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Bienvenido' })).toBeHidden()
})

test('ajustes: registro con lo ocurrido, copias de seguridad y restaurar con Deshacer', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  // Una partida guardada para que las copias tengan algo
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await pulsar(page, 'A')
  await page.mouse.up()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()

  await page.getByRole('button', { name: 'Consolas' }).click()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  // Ajustes por apartados (v0.25.0): una lista corta y una pantalla por apartado
  await expect(page.getByRole('button', { name: /^Sonido/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver registro' })).toHaveCount(0)
  await page.getByRole('button', { name: /^Registro/ }).click()
  await expect(page.getByRole('heading', { name: 'Registro' })).toBeVisible()
  await page.getByRole('button', { name: /Ver registro/ }).click()
  const registro = page.getByRole('textbox', { name: 'Registro' })
  await expect(registro).toHaveValue(/Inicio v/)
  await expect(registro).toHaveValue(/Juegos añadidos/)
  await expect(registro).toHaveValue(/Juego abierto/)
  // Sin nombres de juegos
  await expect(registro).not.toHaveValue(/prueba/i)
  await page.getByRole('dialog', { name: /Registro/ }).getByRole('button', { name: 'Copiar' }).click()
  await page.waitForTimeout(500)
  await page.mouse.click(200, 60)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByRole('button', { name: /^Copias de seguridad/ }).click()
  const copias = page.getByTestId('copias')
  await page.getByRole('button', { name: 'Crear copia ahora' }).click()
  await expect(page.getByText('Copia creada: 1 partida')).toBeVisible()
  await copias.getByRole('button', { name: /Manual, 1 partida/ }).click()
  await page.getByRole('button', { name: 'Restaurar esta copia' }).click()
  // La confirmación ignora los toques de sus primeros 450 ms (toques fantasma de iOS)
  await page.waitForTimeout(500)
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restaurar' }).click()
  await expect(page.getByText('Copia restaurada')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  // La restauración deja también una copia previa
  await expect(copias.getByRole('button', { name: /Antes de recuperar/ })).toBeVisible()

  // De vuelta en la lista, el apartado enseña cuántas copias hay
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Copias de seguridad\s*\d/ })).toBeVisible()
  await page.getByRole('button', { name: 'Consolas' }).click()
  await expect(page.getByTestId('consolas')).toBeVisible()
})

test('inicio: cada juego va a su consola, recuentos, seguir jugando y foto de la consola', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  // Desde la biblioteca de GBA se añade uno de Super Nintendo: va a su consola y se avisa
  await selector(page).setInputFiles(rom('prueba.sfc'))
  await expect(page.getByText('Juego añadido a Super Nintendo')).toBeVisible()
  await expect(page.getByTestId('biblioteca').getByRole('button', { name: /Super Nintendo$/ })).toHaveCount(0)

  await page.getByRole('button', { name: /prueba, Game Boy Advance/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await page.getByRole('button', { name: 'Consolas' }).click()

  const consolas = page.getByTestId('consolas')
  await expect(consolas.getByRole('button', { name: 'Game Boy Advance, 1 juego', exact: true })).toBeVisible()
  await expect(consolas.getByRole('button', { name: 'Super Nintendo, 1 juego', exact: true })).toBeVisible()
  await expect(consolas.getByRole('button', { name: 'Game Boy y Game Boy Color, sin juegos', exact: true })).toBeVisible()

  // Foto propia de una consola y vuelta al dibujo con Deshacer
  // Dos columnas (v0.26.0): la última jugada (GBA) va delante y las vacías, juntas al final
  const orden = await consolas.getByRole('button', { name: /^(Game Boy Advance|Super Nintendo), 1 juego$/ }).evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))
  expect(orden).toEqual(['Game Boy Advance, 1 juego', 'Super Nintendo, 1 juego'])
  await expect(page.getByTestId('sin-juegos')).toContainText('Mega Drive')
  await consolas.getByRole('button', { name: 'Opciones de Game Boy Advance', exact: true }).click()
  await page.getByTestId('selector-foto-consola').setInputFiles(rom('../../public/icono-512.png'))
  await expect(page.getByText('Foto puesta')).toBeVisible()
  await expect(consolas.locator('img')).toHaveCount(1)
  // Al ir a Ajustes y volver, la foto conserva su dirección: no se vuelve a cargar ni parpadea (v0.35.1)
  const src = await consolas.locator('img').getAttribute('src')
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Consolas', exact: true }).click()
  await expect(consolas.locator('img')).toHaveAttribute('src', src!)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(consolas.locator('img')).toHaveCount(0)

  // Seguir jugando abre el último juego y, al salir, vuelve a la biblioteca de su consola
  await page.getByRole('button', { name: /Seguir jugando a prueba/ }).click()
  await expect(page.getByTestId('juego')).toBeVisible()
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await expect(page.getByRole('heading', { name: 'Game Boy Advance', exact: true })).toBeVisible()
})

test.describe('mando', () => {
  test('modo una mano en vertical, para la mano derecha y la izquierda, y tamaño de los botones', async ({ page }) => {
    await page.goto('/')
    await anadir(page, 'prueba.gba')
    await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    const mando = page.getByTestId('mando')
    const ancho = page.viewportSize()!.width
    const caja = async (nombre: string) => (nombre === 'Cruceta' ? mando.getByLabel('Cruceta') : mando.getByRole('button', { name: nombre, exact: true })).boundingBox()
    const tamNormal = (await caja('Cruceta'))!.width

    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: /^Mando/ }).click()
    await page.getByRole('radio', { name: 'Una mano' }).click()
    await page.getByRole('radio', { name: 'Mano derecha' }).click()
    await page.getByRole('button', { name: 'Volver al menú' }).click()
    await page.getByRole('button', { name: 'Seguir jugando' }).click()
    await expect(page.getByTestId('juego')).toHaveClass(/una-mano/)
    // Todo en la mitad derecha y abajo
    for (const n of ['Cruceta', 'A', 'B', 'Start', 'Select', 'L', 'R']) {
      const c = (await caja(n))!
      expect(c.x + c.width / 2, n).toBeGreaterThan(ancho * 0.2)
      expect(c.x + c.width, n).toBeLessThanOrEqual(ancho)
      expect(c.x, n).toBeGreaterThanOrEqual(0)
    }
    await pulsar(page, 'A')
    await expect.poll(() => colorCentral(page)).toEqual([0, 251, 0])
    await page.mouse.up()

    // Mano izquierda: en espejo
    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: /^Mando/ }).click()
    await page.getByRole('radio', { name: 'Mano izquierda' }).click()
    await page.getByRole('radio', { name: 'Enormes' }).click()
    await page.getByRole('button', { name: 'Volver al menú' }).click()
    await page.getByRole('button', { name: 'Seguir jugando' }).click()
    const cruceta = (await caja('Cruceta'))!
    const a = (await caja('A'))!
    expect(cruceta.x).toBeLessThan(a.x)
    expect(cruceta.x).toBeLessThan(ancho * 0.2)
    for (const n of ['Cruceta', 'A', 'B', 'Start', 'Select', 'L', 'R']) {
      const c = (await caja(n))!
      expect(c.x, n).toBeGreaterThanOrEqual(0)
      expect(c.x + c.width, n).toBeLessThanOrEqual(ancho)
    }

    // Dos manos con botones enormes: la cruceta crece
    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: /^Mando/ }).click()
    await page.getByRole('radio', { name: 'Dos manos' }).click()
    await page.getByRole('button', { name: 'Volver al menú' }).click()
    await page.getByRole('button', { name: 'Seguir jugando' }).click()
    expect((await caja('Cruceta'))!.width).toBeGreaterThan(tamNormal)
  })
})

test('carátulas automáticas: se ponen al añadir, no vuelven si se quitan y se pueden buscar las que faltan', async ({ page }) => {
  const descargas: string[] = []
  await page.route('https://raw.githubusercontent.com/**', (r) => {
    descargas.push(decodeURIComponent(r.request().url()))
    return r.fulfill({ path: rom('../../public/icono-512.png'), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } })
  })
  await page.goto('/')
  // Un fichero con el nombre habitual: la carátula se pone sola
  await selector(page).setInputFiles({ name: 'Advance Wars (Europe) (En,Fr,De,Es).gba', mimeType: 'application/octet-stream', buffer: readFileSync(rom('prueba.gba')) })
  await expect(page.getByText('Carátula puesta')).toBeVisible()
  expect(descargas.at(-1)).toContain('Nintendo_-_Game_Boy_Advance/master/Named_Boxarts/Advance Wars (Europe) (En,Fr,De,Es).png')
  await entrar(page, 'Game Boy Advance')
  await expect(page.getByTestId('biblioteca').locator('img')).toHaveCount(1)

  // Si se quita, no vuelve a ponerse sola al abrir la app otra vez
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: 'Cambiar la carátula' }).click()
  await page.getByRole('button', { name: 'Quitar la carátula' }).click()
  await expect(page.getByTestId('biblioteca').locator('img')).toHaveCount(0)
  await page.reload()
  await page.waitForTimeout(1000)
  await entrar(page, 'Game Boy Advance')
  await expect(page.getByTestId('biblioteca').getByRole('button', { name: /^Advance Wars/ })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByTestId('biblioteca').locator('img')).toHaveCount(0)

  // Con el interruptor apagado no se busca al añadir
  await page.getByRole('button', { name: 'Consolas' }).click()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: /^Carátulas/ }).click()
  await page.getByRole('switch', { name: 'Poner la carátula al añadir un juego' }).click()
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Carátulas.*A mano/ })).toBeVisible()
  await page.getByRole('button', { name: 'Consolas' }).click()
  const antes = descargas.length
  await selector(page).setInputFiles({ name: 'Tetris (World) (Rev 1).gb', mimeType: 'application/octet-stream', buffer: readFileSync(rom('prueba.gb')) })
  await expect(page.getByText(/Juego añadido/)).toBeVisible()
  await page.waitForTimeout(1000)
  expect(descargas.length).toBe(antes)

  // «Buscar ahora las que faltan» pone las dos
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: /^Carátulas/ }).click()
  await page.getByRole('button', { name: 'Buscar ahora las que faltan' }).click()
  await expect(page.getByText('2 carátulas puestas')).toBeVisible()
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Consolas' }).click()
  await entrar(page, 'Game Boy y Game Boy Color')
  await expect(page.getByTestId('biblioteca').locator('img')).toHaveCount(1)
})

test.describe('una mano en horizontal', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  for (const mano of ['derecha', 'izquierda'] as const) {
    test(`mano ${mano}: la pantalla a un lado a toda la altura y los controles en columna al otro`, async ({ page }) => {
      await page.addInitScript((m) => {
        localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ bienvenidaVista: true, coloresConsola: false, ultimaCopia: Date.now(), modoMando: 'una-mano', mano: m }))
      }, mano)
      await page.goto('/')
      await anadir(page, 'prueba.gba')
      await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
      await expect(page.getByText('Cargando…')).toBeHidden()
      // La imagen de GBA a toda la altura (3:2) pegada al lado contrario a la mano
      const lienzo = (await page.getByTestId('pantalla').boundingBox())!
      expect(lienzo.height).toBe(390)
      expect(lienzo.width).toBe(585)
      // Pegada al borde contrario a la mano
      if (mano === 'derecha') expect(lienzo.x).toBeLessThan(2)
      else expect(lienzo.x + lienzo.width).toBeGreaterThan(842)
      const finImagen = mano === 'derecha' ? lienzo.x + lienzo.width : lienzo.x
      const mando = page.getByTestId('mando')
      for (const n of ['Cruceta', 'A', 'B', 'L', 'R', 'Start', 'Select']) {
        const c = (await (n === 'Cruceta' ? mando.getByLabel('Cruceta') : mando.getByRole('button', { name: n, exact: true })).boundingBox())!
        if (mano === 'derecha') expect(c.x, n).toBeGreaterThanOrEqual(finImagen - 1)
        else expect(c.x + c.width, n).toBeLessThanOrEqual(finImagen + 1)
        expect(c.y, n).toBeGreaterThanOrEqual(0)
        expect(c.y + c.height, n).toBeLessThanOrEqual(390)
      }
      await pulsar(page, 'A')
      await expect.poll(() => colorCentral(page)).toEqual([0, 251, 0])
      await page.mouse.up()
    })
  }
})

test('pantalla grande: en vertical, la imagen de GBA de borde a borde; sin ella, con marco', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  const ancho = page.viewportSize()!.width
  expect((await page.getByTestId('pantalla').boundingBox())!.width).toBe(ancho)
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: /^Pantalla/ }).click()
  await page.getByRole('switch', { name: 'Pantalla lo más grande posible' }).click()
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  expect((await page.getByTestId('pantalla').boundingBox())!.width).toBeLessThan(ancho - 30)
})

test('tiempo jugado: se cuenta al jugar y se ve en la biblioteca, el detalle y las estadísticas', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Estadísticas' })).toHaveCount(0)
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await pulsar(page, 'A', 3000)
  await page.mouse.up()
  await page.getByRole('button', { name: 'Menú' }).click()
  await expect(page.getByText(/Llevas \d+ s en esta partida/)).toBeVisible()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()

  // En la ficha del juego y en su detalle
  await expect(page.getByTestId('biblioteca').getByText(/^\d+ s, hoy$/)).toBeVisible()
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await expect(page.getByText(/^\d+ s en 1 partida$/)).toBeVisible()
  // Pasada la guardia contra toques fantasma, tocar el fondo cierra la hoja
  await page.waitForTimeout(500)
  await page.mouse.click(200, 40)
  await expect(page.getByRole('dialog')).toBeHidden()

  // En las estadísticas
  await page.getByRole('button', { name: 'Consolas' }).click()
  await page.getByRole('button', { name: 'Estadísticas' }).click()
  await expect(page.getByTestId('total')).toContainText(/\d+ s/)
  await expect(page.getByText('1', { exact: true }).first()).toBeVisible()
  await expect(page.getByTestId('tus-juegos')).toContainText('prueba')
  await expect(page.getByTestId('por-consola')).toContainText('Game Boy Advance')
  // Al tocar la columna de hoy se ve su tiempo
  await page.getByTestId('grafico-tiempo').getByRole('button').last().click()
  await expect(page.getByTestId('grafico-tiempo')).toContainText(/: \d+ s/)
  for (const periodo of ['Mes', 'Año', 'Siempre']) {
    await page.getByRole('radio', { name: periodo }).click()
    await expect(page.getByTestId('total')).toContainText(/\d+ s/)
  }
  await page.getByRole('button', { name: 'Consolas' }).click()
  // Desde la v0.26.0, un icono en la cabecera del inicio
  await expect(page.getByRole('button', { name: 'Estadísticas' })).toBeVisible()
})

test('Super Nintendo: cuatro botones, tema Super, botones que responden y partida guardada', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.sfc')
  await expect(page.getByRole('heading', { name: 'Super Nintendo' })).toBeVisible()
  await page.getByRole('button', { name: /prueba, Super Nintendo/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).toHaveAttribute('data-tema', 'super')
  const mando = page.getByTestId('mando')
  for (const n of ['A', 'B', 'X', 'Y', 'L', 'R', 'Start', 'Select']) await expect(mando.getByRole('button', { name: n, exact: true })).toBeVisible()
  // Rombo: X arriba, B abajo, Y a la izquierda y A a la derecha
  const caja = async (n: string) => (await mando.getByRole('button', { name: n, exact: true }).boundingBox())!
  const [a, b, x, y] = [await caja('A'), await caja('B'), await caja('X'), await caja('Y')]
  expect(x.y).toBeLessThan(a.y)
  expect(b.y).toBeGreaterThan(a.y)
  expect(y.x).toBeLessThan(x.x)
  expect(a.x).toBeGreaterThan(x.x)

  // Azul sin pulsar; con A, verde y la marca en la memoria de partida
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).toEqual([0, 255, 0])
  await page.mouse.up()
  await page.waitForTimeout(1500)
  await page.reload()
  await entrar(page, 'Super Nintendo')
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: /^(Jugar|Arrancar el juego desde el principio)$/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect.poll(() => colorCentral(page)).toEqual([255, 0, 0])
})

test('Game Boy y Game Boy Color comparten consola y biblioteca, GBA va aparte, y cada juego conserva su tema', async ({ page }) => {
  const gb = readFileSync(rom('prueba.gb'))
  const gbc = Buffer.from(gb)
  gbc[0x143] = 0x80 // indicador de Game Boy Color
  gbc[0x134] = 0x51 // otra ROM distinta
  await page.goto('/')
  await selector(page).setInputFiles([
    { name: 'Clasico.gb', mimeType: 'application/octet-stream', buffer: gb },
    { name: 'En color.gbc', mimeType: 'application/octet-stream', buffer: gbc },
  ])
  await expect(page.getByText('2 juegos añadidos')).toBeVisible()
  const consolas = page.getByTestId('consolas')
  await expect(consolas.getByRole('button')).toHaveCount(10) // su tarjeta con el botón de opciones y las ocho vacías juntas (v0.26.0; la N64, desde la v0.32.0; la PlayStation, desde la v0.37.0)
  await expect(page.getByTestId('sin-juegos').getByRole('button')).toHaveCount(8)
  await expect(consolas.getByRole('button', { name: 'Game Boy y Game Boy Color, 2 juegos', exact: true })).toBeVisible()

  await entrar(page, 'Game Boy y Game Boy Color')
  await expect(page.getByRole('heading', { name: 'Game Boy y Color', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clasico, Game Boy', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'En color, Game Boy Color', exact: true })).toBeVisible()

  // El de Color se juega con su tema y, al salir, se vuelve a la biblioteca conjunta
  await page.getByRole('button', { name: 'En color, Game Boy Color', exact: true }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).toHaveAttribute('data-tema', 'uva')
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await expect(page.getByRole('heading', { name: 'Game Boy y Color', exact: true })).toBeVisible()

  // Uno de GBA va a su propia consola, con aviso
  await selector(page).setInputFiles(rom('prueba.gba'))
  await expect(page.getByText('Juego añadido a Game Boy Advance')).toBeVisible()
  await expect(page.getByRole('button', { name: 'prueba, Game Boy Advance', exact: true })).toHaveCount(0)
})

test.describe('pantalla de Super Nintendo', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  test('en horizontal, a 4:3 a toda la altura y sin el menú encima; con píxel exacto, a 8:7', async ({ page }) => {
    await page.goto('/')
    await anadir(page, 'prueba.sfc')
    await page.getByRole('button', { name: /prueba, Super Nintendo/ }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    const lienzo = (await page.getByTestId('pantalla').boundingBox())!
    expect(lienzo.height).toBe(390)
    expect(lienzo.width).toBe(520)
    // Ninguna herramienta (tampoco el menú) en el centro de la imagen
    for (const n of ['Menú', 'Guardar rápido', 'Cargar rápido']) {
      const c = (await page.getByRole('button', { name: n, exact: true }).boundingBox())!
      expect(c.x + c.width, n).toBeLessThan(lienzo.x + 60)
    }
    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: /^Pantalla/ }).click()
    await page.getByRole('radio', { name: 'Píxel exacto (8:7)' }).click()
    await page.getByRole('button', { name: 'Volver al menú' }).click()
    await page.getByRole('button', { name: 'Seguir jugando' }).click()
    await expect.poll(async () => (await page.getByTestId('pantalla').boundingBox())!.width).toBe(445)
    await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
  })
})

test.describe('transiciones', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('entrar y volver se animan y no admiten toques repetidos', async ({ page }) => {
    await page.goto('/')
    await anadir(page, 'prueba.gba') // entra en la biblioteca con animación
    // Durante la animación conviven las dos pantallas: la que se va, sin poder tocarse
    const saliente = page.locator('[data-saliendo]')
    await page.getByRole('button', { name: 'Consolas' }).click()
    await expect(saliente).toHaveCount(1)
    await expect(saliente).toHaveAttribute('aria-hidden', 'true')
    await expect(page.locator('.capa.entra-desde-izquierda')).toHaveCount(1)
    // Un segundo toque durante la animación no navega
    await page.getByRole('button', { name: 'Ajustes' }).click({ force: true })
    await expect(saliente).toHaveCount(0)
    await expect(page.getByTestId('consolas')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ajustes' })).toHaveCount(0)
    // Pasada la animación, sí
    await page.getByRole('button', { name: 'Ajustes' }).click()
    await expect(page.locator('.capa.entra-desde-derecha')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
    await expect(saliente).toHaveCount(0)
  })
})

test('Nintendo DS (en pruebas): arranca sin BIOS, dos pantallas, botones, táctil y sin rebobinado', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto('/')
  await anadir(page, 'prueba.nds')
  await expect(page.getByRole('heading', { name: 'Nintendo DS' })).toBeVisible()
  await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  // Dos pantallas apiladas: 256 x 384
  const lienzo = page.getByTestId('pantalla')
  await expect.poll(() => lienzo.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([256, 384])
  // En vertical, las dos pantallas a todo lo ancho (v0.12.0): los controles van encima de la de abajo
  const ancho = page.viewportSize()!.width
  await expect.poll(async () => (await lienzo.boundingBox())!.width).toBeGreaterThan(ancho - 4)
  const cajaA = (await page.getByTestId('mando').getByRole('button', { name: 'A', exact: true }).boundingBox())!
  const cajaLienzo = (await lienzo.boundingBox())!
  expect(cajaA.y).toBeLessThan(cajaLienzo.y + cajaLienzo.height)
  const arriba = () => lienzo.evaluate((c: HTMLCanvasElement) => [...((t) => { t.width = c.width; t.height = c.height; const g = t.getContext('2d')!; g.drawImage(c, 0, 0); return g })(document.createElement('canvas')).getImageData(128, 96, 1, 1).data.slice(0, 3)])
  await expect.poll(arriba).toEqual([0, 0, 251])
  await pulsar(page, 'A')
  await expect.poll(arriba).toEqual([0, 251, 0])
  await page.mouse.up()
  await expect.poll(arriba).toEqual([0, 0, 251])
  // Tocar la pantalla de abajo hace de lápiz y no pulsa ningún botón
  const caja = (await lienzo.boundingBox())!
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height * 0.75)
  await page.mouse.down()
  await page.mouse.move(caja.x + caja.width * 0.7, caja.y + caja.height * 0.8, { steps: 4 })
  await page.mouse.up()
  await expect.poll(arriba).toEqual([0, 0, 251])
  // Sin rebobinado en DS; X e Y sí
  await expect(page.getByRole('button', { name: /Rebobinar/ })).toHaveCount(0)
  await expect(page.getByTestId('mando').getByRole('button', { name: 'X', exact: true })).toBeVisible()
  expect(errores).toEqual([])
})

test('mando para juegos de rol: por juego, A grande, botón de menú elegido y correr fijo', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.sfc')
  await page.getByRole('button', { name: /prueba, Super Nintendo/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  const mando = page.getByTestId('mando')
  await expect(page.getByRole('button', { name: /^Correr/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /^Mando/ }).click()
  await page.getByRole('switch', { name: 'Mando para juegos de rol' }).click()
  // Super Nintendo: menú en X por defecto; se cambia a Start y se corre con Y
  await expect(page.getByRole('radiogroup', { name: 'Botón de menú' }).getByRole('radio', { name: 'X' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radiogroup', { name: 'Botón de menú' }).getByRole('radio', { name: 'Start' }).click()
  await page.getByRole('radiogroup', { name: 'Correr con' }).getByRole('radio', { name: 'Y' }).click()
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()

  // A más grande que B; el menú del juego encima de A; X e Y siguen a la vista
  const caja = async (n: string | RegExp) => (await mando.getByRole('button', { name: n, exact: typeof n === 'string' }).boundingBox())!
  const [a, b, menu] = [await caja('A'), await caja('B'), await caja(/^Menú del juego \(Start\)$/)]
  expect(a.width).toBeGreaterThan(b.width * 1.4)
  expect(menu.y + menu.height / 2).toBeLessThan(a.y)
  await expect(mando.getByRole('button', { name: 'X', exact: true })).toBeVisible()
  await expect(mando.getByRole('button', { name: 'Y', exact: true })).toBeVisible()
  // A responde igual que siempre
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).toEqual([0, 255, 0])
  await page.mouse.up()

  // Correr fijo con Y, debajo de la A: se activa y se suelta con un toque
  const correr = mando.getByRole('button', { name: 'Correr con Y fijo' })
  const cajaCorrer = (await correr.boundingBox())!
  expect(cajaCorrer.y).toBeGreaterThanOrEqual(a.y + a.height - 4)
  expect(cajaCorrer.x + cajaCorrer.width).toBeGreaterThan(a.x + a.width / 2)
  await correr.click()
  await expect(correr).toHaveAttribute('aria-pressed', 'true')
  await correr.click()
  await expect(correr).toHaveAttribute('aria-pressed', 'false')

  // Es solo de este juego: un juego de GBA sigue con el mando normal
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await expect(page.getByTestId('juego')).toHaveCount(0)
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByRole('button', { name: /^Correr/ })).toHaveCount(0)
  await expect(mando.getByRole('button', { name: /^Menú del juego/ })).toHaveCount(0)
})

test('Nintendo DS: reiniciar varias veces no rompe el juego y se vuelve a abrir', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto('/')
  await anadir(page, 'prueba.nds')
  await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  const lienzo = page.getByTestId('pantalla')
  const arriba = () => lienzo.evaluate((c: HTMLCanvasElement) => [...((t) => { t.width = c.width; t.height = c.height; const g = t.getContext('2d')!; g.drawImage(c, 0, 0); return g })(document.createElement('canvas')).getImageData(128, 96, 1, 1).data.slice(0, 3)])
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Menú', exact: true }).click()
    await page.getByRole('button', { name: 'Reiniciar' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Reiniciar', exact: true }).last().click()
    await expect(page.getByText('No se ha podido abrir')).toHaveCount(0)
  }
  // Sigue en español y responde a A después de reiniciar
  await expect.poll(arriba).toEqual([0, 0, 251])
  await pulsar(page, 'A')
  await expect.poll(arriba).toEqual([0, 251, 0])
  await page.mouse.up()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect.poll(arriba).toEqual([0, 0, 251])
  expect(errores).toEqual([])
})

test('si la última vez no se pudo seguir donde se dejó, se abre con la partida guardada y avisa', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  // Como si la página se hubiera caído al cargar el punto donde se dejó
  const id = createHash('sha1').update(readFileSync(rom('prueba.gba'))).digest('hex')
  await page.evaluate((id) => localStorage.setItem('puchiemulator-cargando-auto', id), id)
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByText(/No se ha podido seguir donde lo dejaste/)).toBeVisible()
  await expect(page.getByText('No se ha podido abrir')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('puchiemulator-cargando-auto'))).toBeNull()
})

test('los ajustes de pantalla y botones se guardan por juego', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  // En este juego, botones enormes y una mano
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /^Mando/ }).click()
  await expect(page.getByText('Botones de este juego')).toBeVisible()
  await page.getByRole('radiogroup', { name: 'Tamaño de los botones' }).getByRole('radio', { name: 'Enormes' }).click()
  await page.getByRole('radiogroup', { name: 'Distribución del mando' }).getByRole('radio', { name: 'Una mano' }).click()
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  await expect(page.getByTestId('juego')).toHaveClass(/una-mano/)
  await expect(page.getByTestId('juego')).toHaveAttribute('style', /--escala: 1\.3/)
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()

  // Otro juego sigue con los generales
  await page.goto('/')
  await anadir(page, 'prueba.sfc')
  await page.getByRole('button', { name: /prueba, Super Nintendo/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).not.toHaveClass(/una-mano/)
  await expect(page.getByTestId('juego')).toHaveAttribute('style', /--escala: 1;/)
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()

  // Y el primero conserva los suyos hasta que vuelve a los generales
  await page.goto('/')
  await entrar(page, 'Game Boy Advance')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).toHaveClass(/una-mano/)
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /^Mando/ }).click()
  await page.getByRole('button', { name: 'Usar los ajustes generales' }).click()
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  await expect(page.getByTestId('juego')).not.toHaveClass(/una-mano/)
})

test('colores como en la consola: la GBA se ve con sus colores reales y se puede quitar', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ bienvenidaVista: true, ultimaCopia: Date.now() })))
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  // El azul puro de la ROM sale más apagado, como en la pantalla de la GBA
  await expect.poll(async () => (await colorCentral(page))[2]).toBeLessThan(250)
  const corregido = await colorCentral(page)
  expect(corregido).not.toEqual([0, 0, 255])
})

test('aviso para guardar la copia de partidas: sale con partidas y «Más tarde» lo calla', async ({ page }) => {
  // Solo en la primera carga: después, la app guarda lo que haga el usuario («Más tarde»)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('ajustes-puestos')) return
    sessionStorage.setItem('ajustes-puestos', '1')
    localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ bienvenidaVista: true, coloresConsola: false }))
  })
  await page.goto('/')
  await expect(page.getByTestId('aviso-copia')).toHaveCount(0)
  await anadir(page, 'prueba.sfc')
  await page.getByRole('button', { name: /prueba, Super Nintendo/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await pulsar(page, 'A') // la ROM de prueba guarda en la partida al pulsar A
  await page.mouse.up()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await page.goto('/')
  const aviso = page.getByTestId('aviso-copia')
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('Aún no has guardado ninguna')
  await aviso.getByRole('button', { name: 'Más tarde' }).click()
  await expect(aviso).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('consolas')).toBeVisible()
  await expect(page.getByTestId('aviso-copia')).toHaveCount(0)
})

test('biblioteca: buscar, ordenar, favoritos y notas', async ({ page }) => {
  await page.goto('/')
  // Un segundo juego de GBA: la misma ROM con un byte distinto al final (otra huella, otro juego)
  const otra = Buffer.from(readFileSync(rom('prueba.gba')))
  otra[otra.length - 1] ^= 0xff
  const tipo = 'application/octet-stream'
  await selector(page).setInputFiles([
    { name: 'prueba.gba', mimeType: tipo, buffer: readFileSync(rom('prueba.gba')) },
    { name: 'Árbol Épico.gba', mimeType: tipo, buffer: otra },
  ])
  await expect(page.getByText(/añadido|ya estaba/i)).toBeVisible()
  await entrar(page, 'Game Boy Advance')
  const biblioteca = page.getByTestId('biblioteca')
  await expect(biblioteca.getByRole('button', { name: /Game Boy Advance$/ })).toHaveCount(2)

  // Buscar sin acentos ni mayúsculas
  await page.getByRole('searchbox', { name: 'Buscar juegos' }).fill('ARBOL epi')
  await expect(biblioteca.getByRole('button', { name: /Game Boy Advance$/ })).toHaveCount(1)
  await page.getByRole('searchbox', { name: 'Buscar juegos' }).fill('zelda')
  await expect(page.getByText('Ningún juego coincide con «zelda»')).toBeVisible()
  await page.getByRole('button', { name: 'Borrar la búsqueda' }).click()
  await expect(biblioteca.getByRole('button', { name: /Game Boy Advance$/ })).toHaveCount(2)

  // Por nombre
  await page.getByRole('radiogroup', { name: 'Ordenar los juegos' }).getByRole('radio', { name: 'Nombre' }).click()
  const nombres = () => biblioteca.getByRole('button', { name: /Game Boy Advance$/ }).evaluateAll((l) => l.map((b) => b.getAttribute('aria-label')))
  await expect.poll(nombres).toEqual(['Árbol Épico, Game Boy Advance', 'prueba, Game Boy Advance'])

  // Favorito: pasa arriba, en su grupo
  await page.getByRole('button', { name: 'Opciones de prueba', exact: true }).click()
  await page.getByRole('button', { name: 'Añadir a favoritos' }).click()
  await expect(page.getByText('Favoritos', { exact: true })).toBeVisible()
  await expect.poll(nombres).toEqual(['prueba, Game Boy Advance', 'Árbol Épico, Game Boy Advance'])

  // Notas desde la biblioteca; se ven después en el menú del juego
  await page.getByRole('button', { name: 'Notas' }).click()
  await page.getByRole('textbox', { name: 'Notas del juego' }).fill('Voy por la segunda mazmorra')
  await expect(page.getByText('Guardada')).toBeVisible()
  await page.goto('/')
  await entrar(page, 'Game Boy Advance')
  await page.getByRole('button', { name: 'prueba, Game Boy Advance' }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Notas' }).click()
  await expect(page.getByRole('textbox', { name: 'Notas del juego' })).toHaveValue('Voy por la segunda mazmorra')
})

test('estado de cada juego: se cambia en sus opciones, filtra la biblioteca y sale en estadísticas', async ({ page }) => {
  await page.goto('/')
  const otra = Buffer.from(readFileSync(rom('prueba.gba')))
  otra[otra.length - 1] ^= 0xff
  const tipo = 'application/octet-stream'
  await selector(page).setInputFiles([
    { name: 'prueba.gba', mimeType: tipo, buffer: readFileSync(rom('prueba.gba')) },
    { name: 'Otro.gba', mimeType: tipo, buffer: otra },
  ])
  await expect(page.getByText(/añadido/i)).toBeVisible()
  await entrar(page, 'Game Boy Advance')
  const chips = page.getByRole('radiogroup', { name: 'Ver los juegos' })
  await expect(chips.getByRole('radio', { name: 'Pendiente 2' })).toBeVisible()

  await page.getByRole('button', { name: 'Opciones de prueba', exact: true }).click()
  const estado = page.getByRole('radiogroup', { name: 'Estado del juego' })
  await expect(estado.getByRole('radio', { name: 'Pendiente' })).toHaveAttribute('aria-checked', 'true')
  await estado.getByRole('radio', { name: /Terminado/ }).click()
  await expect(estado.getByRole('radio', { name: /Terminado/ })).toHaveAttribute('aria-checked', 'true')

  await page.goto('/')
  await entrar(page, 'Game Boy Advance')
  await expect(page.getByTestId('biblioteca').getByLabel('Terminado')).toHaveCount(1)
  await chips.getByRole('radio', { name: 'Terminado 1' }).click()
  await expect(page.getByTestId('biblioteca').getByRole('button', { name: /Game Boy Advance$/ })).toHaveCount(1)

  // Jugar al otro un momento lo pasa a «jugando» (y hace que haya estadísticas)
  await chips.getByRole('radio', { name: /^Todos/ }).click()
  await page.getByRole('button', { name: 'Otro, Game Boy Advance' }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await pulsar(page, 'A', 1500)
  await page.mouse.up()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await expect(chips.getByRole('radio', { name: 'Jugando 1' })).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: /Estadísticas/ }).click()
  const porEstado = page.getByTestId('por-estado')
  await expect(porEstado).toContainText('1Terminado')
  await expect(porEstado).toContainText('1Jugando')
  await expect(porEstado).toContainText('Terminados: 1 este año')
})

test('seguir jugando: el último juego en grande y los demás recientes a su lado', async ({ page }) => {
  await page.goto('/')
  for (const [fichero, nombre] of [
    ['prueba.sfc', /prueba, Super Nintendo/],
    ['prueba.gba', /prueba.*Game Boy Advance/i],
  ] as const) {
    await page.goto('/')
    await anadir(page, fichero)
    await page.getByRole('button', { name: nombre }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    await page.getByRole('button', { name: 'Menú', exact: true }).click()
    await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  }
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Seguir jugando a prueba' })).toContainText('Game Boy Advance')
  const otros = page.getByTestId('otros-recientes')
  await expect(otros.getByRole('button')).toHaveCount(1)
  await otros.getByRole('button', { name: 'prueba, Super Nintendo: seguir' }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).toHaveAttribute('data-sistema', 'snes')
})

test('filtro de imagen: según la consola, rejilla en GBA y líneas en Super Nintendo, por juego', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('filtro')).toHaveCount(0)
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /^Pantalla/ }).click()
  await page.getByRole('radiogroup', { name: 'Filtro de imagen' }).getByRole('radio', { name: 'Consola' }).click()
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  const filtro = page.getByTestId('filtro')
  await expect(filtro).toHaveClass(/lcd/)
  // La capa cubre la imagen justo y no tapa los toques
  const [f, l] = [(await filtro.boundingBox())!, (await page.getByTestId('pantalla').boundingBox())!]
  expect(Math.abs(f.width - l.width)).toBeLessThan(1)
  expect(Math.abs(f.height - l.height)).toBeLessThan(1)
  expect(await filtro.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none')
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).toEqual([0, 251, 0])
})

test('modo noche: se enciende en el menú, oscurece la pantalla sin tapar los toques y se recuerda', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('modo-noche')).toHaveCount(0)
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('switch', { name: 'Modo noche' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  const capa = page.getByTestId('modo-noche')
  await expect(capa).toBeVisible()
  expect(await capa.evaluate((e) => [getComputedStyle(e).mixBlendMode, getComputedStyle(e).pointerEvents])).toEqual(['multiply', 'none'])
  // Los botones siguen respondiendo a través de la capa
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).toEqual([0, 251, 0])
  await page.mouse.up()
  // Se recuerda en la siguiente partida
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('modo-noche')).toBeVisible()
})

test.describe('pantallas de Nintendo DS', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  /** Color de un punto del lienzo (x e y de 0 a 1). */
  const punto = (page: Page, x: number, y: number) =>
    page.getByTestId('pantalla').evaluate((c: HTMLCanvasElement, [x, y]) => [...((t) => { t.width = c.width; t.height = c.height; const g = t.getContext('2d')!; g.drawImage(c, 0, 0); return g })(document.createElement('canvas')).getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data.slice(0, 3)], [x, y])

  async function elegir(page: Page, disposicion: string, tactil?: string) {
    await page.getByRole('button', { name: 'Menú', exact: true }).click()
    await page.getByRole('button', { name: /^Pantalla/ }).click()
    await page.getByRole('radiogroup', { name: 'Pantallas de Nintendo DS' }).getByRole('radio', { name: disposicion }).click()
    if (tactil) await page.getByRole('radiogroup', { name: 'Pantalla táctil' }).getByRole('radio', { name: tactil }).click()
    await page.getByRole('button', { name: 'Volver al menú' }).click()
    await page.getByRole('button', { name: 'Seguir jugando' }).click()
  }

  test('libro (Hotel Dusk): pantallas giradas lado a lado, táctil a la derecha o a la izquierda, pocos botones', async ({ page }) => {
    await page.goto('/')
    await anadir(page, 'prueba.nds')
    await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    await elegir(page, 'Libro')
    const juego = page.getByTestId('juego')
    await expect(juego).toHaveAttribute('data-disposicion', 'libro-derecha')
    const lienzo = page.getByTestId('pantalla')
    await expect.poll(() => lienzo.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([384, 256])
    // La de arriba (azul en la ROM de prueba) a la izquierda; la táctil a la derecha
    await expect.poll(() => punto(page, 0.25, 0.5)).toEqual([0, 0, 251])
    expect(await punto(page, 0.75, 0.5)).not.toEqual([0, 0, 251])
    // Solo cruceta, A, B y Start; la imagen no queda debajo de ningún botón
    const mando = page.getByTestId('mando')
    for (const n of ['L', 'R', 'X', 'Y', 'Select']) await expect(mando.getByRole('button', { name: n, exact: true })).toBeHidden()
    const caja = (await lienzo.boundingBox())!
    for (const n of ['A', 'B', 'Start']) {
      const b = (await mando.getByRole('button', { name: n, exact: true }).boundingBox())!
      expect(b.x + b.width, n).toBeLessThanOrEqual(caja.x + 1)
    }
    expect(caja.height).toBeGreaterThan(330)
    await pulsar(page, 'A')
    await expect.poll(() => punto(page, 0.25, 0.5)).toEqual([0, 251, 0])
    await page.mouse.up()

    // Táctil a la izquierda: todo al revés
    await elegir(page, 'Libro', 'Táctil a la izquierda')
    await expect(juego).toHaveAttribute('data-disposicion', 'libro-izquierda')
    await expect.poll(() => punto(page, 0.75, 0.5)).toEqual([0, 0, 251])
    expect(await punto(page, 0.25, 0.5)).not.toEqual([0, 0, 251])
  })

  test('lado a lado: las dos pantallas sin girar, la táctil a la derecha, y los botones debajo', async ({ page }) => {
    await page.goto('/')
    await anadir(page, 'prueba.nds')
    await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    await elegir(page, 'Lado a lado')
    const lienzo = page.getByTestId('pantalla')
    await expect.poll(() => lienzo.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([512, 192])
    await expect.poll(() => punto(page, 0.25, 0.5)).toEqual([0, 0, 251])
    expect(await punto(page, 0.75, 0.5)).not.toEqual([0, 0, 251])
    // Los botones, debajo de la imagen
    const caja = (await lienzo.boundingBox())!
    for (const n of ['A', 'B', 'Start']) {
      const b = (await page.getByTestId('mando').getByRole('button', { name: n, exact: true }).boundingBox())!
      expect(b.y, n).toBeGreaterThanOrEqual(caja.y + caja.height - 1)
    }
    expect(caja.width).toBeGreaterThan(600)
  })

  test('grande y pequeña: la miniatura tiene tres tamaños', async ({ page }) => {
    await page.goto('/')
    await anadir(page, 'prueba.nds')
    await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    await elegir(page, 'Grande y pequeña')
    const mini = page.getByTestId('miniatura-ds')
    const mediana = (await mini.boundingBox())!.width
    for (const [tam, cmp] of [
      ['Miniatura pequeña', (w: number) => expect(w).toBeLessThan(mediana * 0.8)],
      ['Grande', (w: number) => expect(w).toBeGreaterThan(mediana * 1.2)],
    ] as const) {
      await page.getByRole('button', { name: 'Menú', exact: true }).click()
      await page.getByRole('button', { name: /^Pantalla/ }).click()
      await page.getByRole('radiogroup', { name: 'Tamaño de la miniatura' }).getByRole('radio', { name: tam }).click()
      await page.getByRole('button', { name: 'Volver al menú' }).click()
      await page.getByRole('button', { name: 'Seguir jugando' }).click()
      await expect.poll(async () => (await mini.boundingBox())!.width).not.toBe(mediana)
      cmp((await mini.boundingBox())!.width)
    }
  })

  test('grande y pequeña: la miniatura se arrastra, un toque intercambia y se recuerda', async ({ page }) => {
    await page.goto('/')
    await anadir(page, 'prueba.nds')
    await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    await elegir(page, 'Grande y pequeña')
    const lienzo = page.getByTestId('pantalla')
    await expect.poll(() => lienzo.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([256, 192])
    const mini = page.getByTestId('miniatura-ds')
    await expect(mini).toBeVisible()
    const colorMini = () => mini.locator('canvas').evaluate((c: HTMLCanvasElement) => [...((t) => { t.width = c.width; t.height = c.height; const g = t.getContext('2d')!; g.drawImage(c, 0, 0); return g })(document.createElement('canvas')).getImageData(128, 96, 1, 1).data.slice(0, 3)])
    // Grande, la táctil; en la miniatura, la de arriba (azul)
    await expect.poll(colorMini).toEqual([0, 0, 251])
    expect(await punto(page, 0.5, 0.5)).not.toEqual([0, 0, 251])
    // Un toque las intercambia
    await mini.click()
    await expect.poll(() => punto(page, 0.5, 0.5)).toEqual([0, 0, 251])
    // Arrastrarla la mueve (y no intercambia)
    const antes = (await mini.boundingBox())!
    await page.mouse.move(antes.x + 20, antes.y + 20)
    await page.mouse.down()
    await page.mouse.move(antes.x - 200, antes.y + 120, { steps: 6 })
    await page.mouse.up()
    await expect.poll(async () => (await mini.boundingBox())!.x).toBeLessThan(antes.x - 150)
    const despues = (await mini.boundingBox())!
    expect(await punto(page, 0.5, 0.5)).toEqual([0, 0, 251])
    // Se recuerda al volver a abrir
    await page.getByRole('button', { name: 'Menú', exact: true }).click()
    await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
    await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    await expect.poll(() => punto(page, 0.5, 0.5)).toEqual([0, 0, 251])
    await expect.poll(async () => Math.abs((await mini.boundingBox())!.x - despues.x)).toBeLessThan(3)
  })
})

test('pantalla, aparte del mando: por juego y con solo las opciones de su consola', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /^Pantalla/ }).click()
  await expect(page.getByText('Pantalla de este juego')).toBeVisible()
  // En GBA: colores como en la consola, sin las opciones de Super Nintendo ni de DS; sin botones
  await expect(page.getByRole('switch', { name: 'Colores como en la consola' })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Imagen de Super Nintendo' })).toHaveCount(0)
  await expect(page.getByRole('radiogroup', { name: 'Pantallas de Nintendo DS' })).toHaveCount(0)
  await expect(page.getByRole('radiogroup', { name: 'Tamaño de los botones' })).toHaveCount(0)
  await page.getByRole('switch', { name: 'Píxeles nítidos' }).click()
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  await expect(page.getByTestId('juego')).toHaveClass(/suave/)
  // El mando ya no tiene ajustes de imagen
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /^Mando/ }).click()
  await expect(page.getByRole('switch', { name: 'Pantalla lo más grande posible' })).toHaveCount(0)
  await expect(page.getByRole('radiogroup', { name: 'Filtro de imagen' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()

  // Otro juego sigue nítido; en Super Nintendo sale su opción y no la de colores
  await page.goto('/')
  await anadir(page, 'prueba.sfc')
  await page.getByRole('button', { name: /prueba, Super Nintendo/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).not.toHaveClass(/suave/)
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /^Pantalla/ }).click()
  await expect(page.getByRole('radiogroup', { name: 'Imagen de Super Nintendo' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Colores como en la consola' })).toHaveCount(0)
})

test('nueve ranuras de estado con nombre', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Estados guardados' }).click()
  for (const r of ['1', '5', '9']) await expect(page.getByRole('button', { name: `Guardar en la ranura ${r}`, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Guardar en la ranura 7', exact: true }).click()
  await expect(page.getByText('Guardado en «Ranura 7»')).toBeVisible()
  page.once('dialog', (d) => void d.accept('Antes del jefe'))
  await page.getByRole('button', { name: 'Poner nombre a la ranura 7' }).click()
  await expect(page.getByText('Antes del jefe')).toBeVisible()
  // Guardar otra vez en la misma ranura conserva el nombre
  await page.getByRole('button', { name: 'Guardar en la ranura 7', exact: true }).click()
  await expect(page.getByText('Guardado en «Antes del jefe»')).toBeVisible()
  await page.getByRole('button', { name: 'Cargar la ranura 7', exact: true }).click()
  await expect(page.getByText('«Antes del jefe» cargado')).toBeVisible()
})

test('turbo: por juego, con su marca, y el botón se pulsa y se suelta solo', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  const a = page.getByTestId('mando').getByRole('button', { name: 'A', exact: true })
  await expect(a).not.toHaveClass(/turbo/)
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /^Mando/ }).click()
  await page.getByRole('switch', { name: 'Turbo en A' }).click()
  await expect(page.getByRole('switch', { name: 'Turbo en A' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  await expect(a).toHaveClass(/turbo/)
  // Manteniendo A, la ROM de prueba alterna entre verde (pulsado) y azul (suelto)
  await pulsar(page, 'A', 50)
  const vistos = new Set<string>()
  for (let i = 0; i < 40 && vistos.size < 2; i++) {
    vistos.add(JSON.stringify(await colorCentral(page)))
    await page.waitForTimeout(25)
  }
  await page.mouse.up()
  expect([...vistos].sort()).toEqual(['[0,0,255]', '[0,251,0]'].sort())
})

test('temporizador de sueño: se elige en el menú y enseña lo que queda', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  const fila = page.getByRole('button', { name: /Temporizador de sueño/ })
  await expect(fila).toContainText('Apagado')
  await fila.click()
  await page.getByRole('radio', { name: '30 minutos' }).click()
  await expect(page.getByRole('button', { name: /Temporizador de sueño/ })).toContainText('Quedan 30 min')
  await page.getByRole('button', { name: /Temporizador de sueño/ }).click()
  await page.getByRole('radio', { name: 'Apagado' }).click()
  await expect(page.getByRole('button', { name: /Temporizador de sueño/ })).toContainText('Apagado')
})

test('al acabar el temporizador de sueño, pausa con todo guardado y «Hora de dormir»', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /Temporizador de sueño/ }).click()
  await page.getByRole('radio', { name: '15 minutos' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  // Diez minutos después, el aviso
  await page.clock.fastForward('10:01')
  await expect(page.getByText('Quedan 5 minutos: busca dónde guardar')).toBeVisible()
  // Y al acabar, la pantalla de dormir
  await page.clock.fastForward('05:01')
  await expect(page.getByTestId('hora-de-dormir')).toBeVisible()
  await page.getByRole('button', { name: 'Seguir 10 minutos más' }).click()
  await expect(page.getByTestId('hora-de-dormir')).toHaveCount(0)
})

test('pausa con guardado si se deja de tocar', async ({ page }) => {
  await page.clock.install()
  await page.addInitScript(() => {
    const a = JSON.parse(localStorage.getItem('puchiemulator-ajustes') ?? '{}')
    localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ ...a, pausaSinTocar: 3 }))
  })
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.clock.fastForward('03:05')
  await expect(page.getByText(/Llevabas 3 minutos sin tocar nada/)).toBeVisible()
})

test('DS con una mano: pantallas a todo lo ancho y los botones juntos encima de la táctil', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.nds')
  await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /^Mando/ }).click()
  await page.getByRole('radiogroup', { name: 'Distribución del mando' }).getByRole('radio', { name: 'Una mano' }).click()
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  await expect(page.getByTestId('juego')).toHaveClass(/una-mano/)
  const ancho = page.viewportSize()!.width
  await expect.poll(async () => (await page.getByTestId('pantalla').boundingBox())!.width).toBeGreaterThan(ancho - 4)
})

test('DS: soplar mientras se mantiene y cerrar la tapa desde el menú', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.nds')
  await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  const soplar = page.getByRole('button', { name: /Soplar al micrófono/ })
  const caja = (await soplar.boundingBox())!
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
  await page.mouse.down()
  await expect(soplar).toHaveClass(/activa/)
  await page.mouse.up()
  await expect(soplar).not.toHaveClass(/activa/)
  // La tapa, desde el menú: se ve cerrada hasta que se toca
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('switch', { name: 'Cerrar la tapa' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  await expect(page.getByTestId('tapa-cerrada')).toBeVisible()
  await page.getByTestId('tapa-cerrada').click()
  await expect(page.getByTestId('tapa-cerrada')).toHaveCount(0)
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Cerrar la tapa' })).toHaveAttribute('aria-checked', 'false')
})

test('mover y cambiar de tamaño los botones: por juego, se recuerda y se restablece', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  const a = page.getByTestId('mando').getByRole('button', { name: 'A', exact: true })
  const original = (await a.boundingBox())!

  const abrirEditor = async () => {
    await page.getByRole('button', { name: 'Menú', exact: true }).click()
    await page.getByRole('button', { name: /^Mando/ }).click()
    await page.getByRole('button', { name: 'Mover y cambiar de tamaño los botones' }).click()
    await expect(page.getByTestId('editor-mando')).toBeVisible()
  }
  await abrirEditor()
  // Arrastrar los botones de acción hacia arriba y a la izquierda, y agrandarlos
  await page.mouse.move(original.x + original.width / 2, original.y + original.height / 2)
  await page.mouse.down()
  await page.mouse.move(original.x - 100, original.y - 150, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('editor-mando')).toHaveAttribute('data-elegida', 'botones')
  await page.getByRole('button', { name: 'Más grande' }).click()
  await page.getByRole('button', { name: 'Más grande' }).click()
  await expect(page.getByText('120 %')).toBeVisible()
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByTestId('editor-mando')).toHaveCount(0)
  const movida = (await a.boundingBox())!
  expect(movida.y).toBeLessThan(original.y - 100)
  expect(movida.width).toBeGreaterThan(original.width * 1.1)
  // A sigue funcionando en su sitio nuevo
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).toEqual([0, 251, 0])
  await page.mouse.up()

  // Se recuerda al volver a abrir el juego
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect.poll(async () => Math.abs((await a.boundingBox())!.y - movida.y)).toBeLessThan(3)

  // Restablecer los devuelve a su sitio
  await abrirEditor()
  await page.getByRole('button', { name: 'Restablecer' }).click()
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect.poll(async () => Math.abs((await a.boundingBox())!.y - original.y)).toBeLessThan(3)

  // Las herramientas también se mueven (v0.35.0): guardar y cargar, hacia arriba, y siguen funcionando
  const guardar = page.getByRole('button', { name: 'Guardar rápido' })
  const antes = (await guardar.boundingBox())!
  await abrirEditor()
  await page.mouse.move(antes.x + antes.width / 2, antes.y + antes.height / 2)
  await page.mouse.down()
  await page.mouse.move(antes.x + 60, antes.y - 120, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('editor-mando')).toHaveAttribute('data-elegida', 'guardar')
  await page.getByRole('button', { name: 'Listo' }).click()
  const despues = (await guardar.boundingBox())!
  expect(despues.y).toBeLessThan(antes.y - 80)
  await guardar.click()
  await expect(page.getByText('Guardado rápido', { exact: true })).toBeVisible()
})

test('girar la pantalla: con el iPhone en vertical, el juego se coloca en horizontal y responde', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('radiogroup', { name: 'Girar la pantalla' }).getByRole('radio', { name: 'A la derecha' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  const giro = page.locator('.giro')
  await expect(giro).toHaveClass(/girada/)
  await expect(giro).toHaveAttribute('data-giro', '90')
  // En la pantalla del iPhone, la imagen de GBA (3:2, apaisada) se ve de pie: más alta que ancha
  const lienzo = (await page.getByTestId('pantalla').boundingBox())!
  expect(lienzo.height).toBeGreaterThan(lienzo.width * 1.3)
  expect(lienzo.height).toBeGreaterThan(500)
  // Y A responde donde se ve
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).toEqual([0, 251, 0])
  await page.mouse.up()
  // Volver a «No»
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('radiogroup', { name: 'Girar la pantalla' }).getByRole('radio', { name: 'No' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  await expect(giro).not.toHaveClass(/girada/)
})

test('volumen del juego en el menú, para todos los juegos', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  const deslizador = page.getByRole('slider', { name: 'Volumen del juego' })
  await expect(deslizador).toHaveValue('100')
  await deslizador.fill('40')
  await expect(page.getByText('40 %')).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('puchiemulator-ajustes')!).volumen)).toBe(0.4)
})

test('NES: tema Ocho bits, A y B, la pantalla responde y la partida se guarda', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.nes')
  await expect(page.getByRole('heading', { name: 'NES' })).toBeVisible()
  await page.getByRole('button', { name: /prueba, NES/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).toHaveAttribute('data-tema', 'ochobits')
  const mando = page.getByTestId('mando')
  for (const n of ['A', 'B', 'Start', 'Select']) await expect(mando.getByRole('button', { name: n, exact: true })).toBeVisible()
  await expect(mando.getByRole('button', { name: 'L', exact: true })).toHaveCount(0)
  // Azul al arrancar; con A, verde y la marca en la memoria de partida
  await expect.poll(() => colorCentral(page)).toEqual([32, 56, 239])
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).toEqual([0, 170, 0])
  await page.mouse.up()
  await page.waitForTimeout(1500)
  // Al volver a abrir el juego desde el principio, la ROM encuentra la marca: rojo
  await page.reload()
  await entrar(page, 'NES')
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: /^(Jugar|Arrancar el juego desde el principio)$/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect.poll(() => colorCentral(page)).toEqual([219, 40, 0])
})

test('Mega Drive: A, B y C en fila, sin Select, la pantalla responde y la partida se guarda', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.md')
  await expect(page.getByRole('heading', { name: 'Mega Drive' })).toBeVisible()
  await page.getByRole('button', { name: /prueba, Mega Drive/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).toHaveAttribute('data-tema', 'negra')
  const mando = page.getByTestId('mando')
  const caja = async (n: string) => (await mando.getByRole('button', { name: n, exact: true }).boundingBox())!
  const [a, b, c] = [await caja('A'), await caja('B'), await caja('C')]
  expect(a.x).toBeLessThan(b.x)
  expect(b.x).toBeLessThan(c.x)
  expect(c.y).toBeLessThan(a.y)
  await expect(mando.getByRole('button', { name: 'Select', exact: true })).toHaveCount(0)
  await expect(mando.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  // Azul al arrancar; con A (la de Mega Drive), verde y la marca en la memoria de partida
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 239])
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).toEqual([0, 239, 0])
  await page.mouse.up()
  await page.waitForTimeout(1500)
  await page.reload()
  await entrar(page, 'Mega Drive')
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: /^(Jugar|Arrancar el juego desde el principio)$/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect.poll(() => colorCentral(page)).toEqual([239, 0, 0])
})

for (const [fichero, nombre, pausa] of [
  ['prueba.sms', 'Master System', 'Pausa'],
  ['prueba.gg', 'Game Gear', 'Start'],
] as const) {
  test(`${nombre}: botones 1 y 2, la pantalla responde y la partida se guarda`, async ({ page }) => {
    await page.goto('/')
    await anadir(page, fichero)
    await expect(page.getByRole('heading', { name: 'Master System y Game Gear' })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`prueba, ${nombre}`) }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    const mando = page.getByTestId('mando')
    for (const n of ['1', '2', pausa]) await expect(mando.getByRole('button', { name: n, exact: true })).toBeVisible()
    await expect(mando.getByRole('button', { name: 'Select', exact: true })).toHaveCount(0)
    await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
    await pulsar(page, '1')
    await expect.poll(() => colorCentral(page)).toEqual([0, 255, 0])
    await page.mouse.up()
    await page.waitForTimeout(1500)
    await page.reload()
    await entrar(page, 'Master System y Game Gear')
    await page.getByRole('button', { name: /Opciones de/ }).click()
    await page.getByRole('button', { name: /^(Jugar|Arrancar el juego desde el principio)$/ }).click()
    await expect(page.getByText('Cargando…')).toBeHidden()
    await expect.poll(() => colorCentral(page)).toEqual([255, 0, 0])
  })
}

/** Desliza desde el borde izquierdo con toques de verdad; `soltar` en false deja el dedo a mitad. */
async function deslizarDesdeBorde(page: Page, hasta: number, soltar = true) {
  const cdp = await page.context().newCDPSession(page)
  const toque = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: 420 }] })
  await toque('touchStart', 5)
  for (let x = 20; x <= hasta; x += 20) await toque('touchMove', x)
  if (soltar) await toque('touchEnd', hasta)
  // Soltar parado (más de 80 ms después del último movimiento): no cuenta como lanzamiento
  return async () => {
    await page.waitForTimeout(150)
    await toque('touchEnd', hasta)
  }
}

test('volver deslizando: debajo se ve la pantalla anterior y al volver está al día (v0.26.1)', async ({ page }) => {
  await page.goto('/')
  await entrar(page, 'NES')
  await selector(page).setInputFiles(rom('prueba.nes'))
  await expect(page.getByText(/Juego añadido/)).toBeVisible()

  // A mitad del gesto, el inicio se ve debajo y se mueve con el dedo (siempre pintado, v0.37.1)
  const fondo = page.locator('.capa.fondo')
  await expect.poll(() => fondo.evaluate((e) => getComputedStyle(e).visibility)).toBe('visible')
  const soltar = await deslizarDesdeBorde(page, 100, false)
  await expect.poll(() => fondo.evaluate((e) => e.style.transform)).toContain('translate3d')
  await soltar()
  // Sin soltar del todo, vuelve a la biblioteca y el inicio queda debajo, en su sitio y sin estilos sueltos
  await expect(page.getByRole('heading', { name: 'NES', exact: true })).toBeVisible()
  await expect.poll(() => fondo.evaluate((e) => e.style.transform + e.style.filter)).toBe('')

  // Pasado un tercio, vuelve al inicio sin pantallazo y con el recuento al día. Fotograma a fotograma
  // (v0.37.2): una vez que el inicio llega a su sitio, no vuelve atrás ni asoma la biblioteca encima
  // (antes, al soltar se quitaban los estilos del gesto un fotograma antes de que React cambiara de
  // pantalla, y la biblioteca reaparecía entera durante un fotograma)
  await page.evaluate(() => {
    const w = window as unknown as { fotogramas: { x: number; encima: string }[] }
    w.fotogramas = []
    const fin = performance.now() + 1500
    const medir = () => {
      const inicio = document.querySelector('[data-testid="consolas"]')?.closest('.capa') as HTMLElement | null
      const encima = document.elementFromPoint(200, 400)?.closest('.capa')
      w.fotogramas.push({ x: inicio ? Math.round(inicio.getBoundingClientRect().left) : -1, encima: encima === inicio ? 'inicio' : 'otra' })
      if (performance.now() < fin) requestAnimationFrame(medir)
    }
    requestAnimationFrame(medir)
  })
  await deslizarDesdeBorde(page, 300)
  await page.waitForTimeout(1600)
  const fotogramas = await page.evaluate(() => (window as unknown as { fotogramas: { x: number; encima: string }[] }).fotogramas)
  const llega = fotogramas.findIndex((f) => f.x === 0 && f.encima === 'inicio')
  expect(llega).toBeGreaterThanOrEqual(0)
  expect(fotogramas.slice(llega).filter((f) => f.x !== 0 || f.encima !== 'inicio')).toEqual([])
  await expect(page.getByTestId('consolas').getByRole('button', { name: 'NES, 1 juego', exact: true })).toBeVisible()
  await expect(page.locator('.capa')).toHaveCount(1)
  await expect.poll(() => page.locator('.capa').evaluate((e) => e.style.transform + e.style.visibility)).toBe('')

  // En Ajustes, deslizar en un apartado deja ver la lista y vuelve a ella
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: /^Sonido/ }).click()
  await expect(page.getByRole('heading', { name: 'Sonido' })).toBeVisible()
  await deslizarDesdeBorde(page, 300)
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Mando/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sonido' })).toHaveCount(0)
})

test('apertura: el núcleo se prepara al abrir la app y el registro anota lo que tarda cada paso (v0.28.0)', async ({ page }) => {
  const registro = () => page.evaluate(() => JSON.parse(localStorage.getItem('puchiemulator-registro') ?? '[]') as { m: string; x?: string }[])
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  // La primera apertura compila el núcleo: no estaba preparado
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect.poll(async () => (await registro()).find((e) => e.m === 'Juego abierto')?.x ?? '').toMatch(/"nucleoPreparado":false/)
  const datos = JSON.parse((await registro()).find((e) => e.m === 'Juego abierto')!.x!)
  for (const k of ['leer', 'nucleo', 'juego', 'estado', 'total']) expect(datos.ms[k]).toBeGreaterThanOrEqual(0)

  // Al volver a abrir la app, se prepara el núcleo de GBA (último juego y consola más jugada)
  await page.reload()
  await expect.poll(async () => (await registro()).some((e) => e.m === 'Núcleo preparado' && /mgba/.test(e.x ?? '')), { timeout: 10_000 }).toBe(true)
  await page.getByRole('button', { name: /Seguir jugando a prueba/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect.poll(async () => (await registro()).filter((e) => e.m === 'Juego abierto').at(-1)?.x ?? '').toMatch(/"nucleoPreparado":true/)
})

test('ahorrar batería: 30 imágenes por segundo con el juego a su velocidad, por juego (v0.28.0)', async ({ page }) => {
  const registro = () => page.evaluate(() => JSON.parse(localStorage.getItem('puchiemulator-registro') ?? '[]') as { m: string; x?: string }[])
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: /^Pantalla/ }).click()
  await page.getByRole('switch', { name: 'Ahorrar batería (30 imágenes por segundo)' }).click()
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  // El juego responde igual: con A cambia el color de la pantalla
  const antes = await colorCentral(page)
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).not.toEqual(antes)
  await page.mouse.up()
  await page.waitForTimeout(6000)
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await expect.poll(async () => (await registro()).filter((e) => e.m === 'Rendimiento').at(-1)?.x ?? '').toMatch(/"limite30":true/)
  const r = JSON.parse((await registro()).filter((e) => e.m === 'Rendimiento').at(-1)!.x!)
  expect(r.imagenesSeg).toBeGreaterThan(24)
  expect(r.imagenesSeg).toBeLessThan(36)
  expect(r.juegoSeg).toBeGreaterThan(54)
  // Es solo de este juego: el ajuste general sigue apagado
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('puchiemulator-ajustes') ?? '{}').limite30 ?? false)).toBe(false)
})

test('buscador del inicio: juegos de todas las consolas y jugar desde el resultado (v0.29.0)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Buscar juegos' })).toHaveCount(0)
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: 'Consolas' }).click()
  await selector(page).setInputFiles(rom('prueba.sfc'))
  await expect(page.getByText(/Juego añadido/)).toBeVisible()

  // El icono abre el campo con el teclado (enfocado en el mismo toque) y oculta el resto
  await page.getByRole('button', { name: 'Buscar juegos' }).click()
  const campo = page.getByRole('searchbox', { name: 'Buscar en todas las consolas' })
  await expect(campo).toBeFocused()
  await expect(page.getByTestId('consolas')).toHaveCount(0)
  const resultados = page.getByTestId('resultados')
  await campo.fill('PRUÉBA')
  await expect(resultados.getByRole('button')).toHaveCount(2)
  await expect(resultados.getByRole('button', { name: 'prueba, Game Boy Advance: jugar' })).toBeVisible()
  await campo.fill('nada parecido')
  await expect(resultados).toContainText('No hay ningún juego')

  // Cancelar vuelve al inicio de siempre
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('consolas')).toBeVisible()
  await expect(campo).toHaveCount(0)

  // Al volver, empieza vacío; desde un resultado se juega directamente
  await page.getByRole('button', { name: 'Buscar juegos' }).click()
  await expect(campo).toHaveValue('')
  await campo.fill('prueba')
  await resultados.getByRole('button', { name: 'prueba, Super Nintendo: jugar' }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).toHaveAttribute('data-sistema', 'snes')
})

test.describe('gestos con animaciones (v0.30.0)', () => {
  test.use({ reducedMotion: 'no-preference' })

  const desplazamiento = (page: Page, selector: string) =>
    page.locator(selector).first().evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41)

  test('en un apartado de Ajustes, la pantalla sigue al dedo y vuelve a su sitio si no se suelta del todo', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Ajustes' }).click()
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /^Sonido/ }).click()
    await page.waitForTimeout(700)
    const cdp = await page.context().newCDPSession(page)
    const toque = (type: 'touchStart' | 'touchMove' | 'touchEnd', puntos: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: puntos })
    await toque('touchStart', [{ x: 5, y: 420 }])
    for (let x = 20; x <= 120; x += 20) await toque('touchMove', [{ x, y: 420 }])
    // Antes, la animación de entrada mandaba sobre la posición y el apartado no se movía
    await expect.poll(() => desplazamiento(page, '.apartado-entra')).toBeGreaterThan(80)
    await page.waitForTimeout(150)
    await toque('touchEnd', [])
    await page.waitForTimeout(700)
    await expect(page.getByRole('heading', { name: 'Sonido' })).toBeVisible()
    expect(await desplazamiento(page, '.apartado-entra')).toBe(0)
  })

  test('un segundo dedo a mitad del gesto lo cancela y no deja nada movido', async ({ page }) => {
    await page.goto('/')
    await entrar(page, 'NES')
    await page.waitForTimeout(700)
    const cdp = await page.context().newCDPSession(page)
    const toque = (type: 'touchStart' | 'touchMove' | 'touchEnd', puntos: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: puntos })
    await toque('touchStart', [{ x: 5, y: 420 }])
    for (let x = 20; x <= 110; x += 20) await toque('touchMove', [{ x, y: 420 }])
    await toque('touchStart', [{ x: 110, y: 420 }, { x: 250, y: 300 }])
    await toque('touchEnd', [])
    await page.waitForTimeout(700)
    // La biblioteca, en su sitio y sin estilos sueltos; el inicio de debajo, también
    await expect(page.getByRole('heading', { name: 'NES', exact: true })).toBeVisible()
    expect(await page.locator('.capa:not(.fondo)').evaluate((e) => e.style.transform + e.style.boxShadow)).toBe('')
    expect(await page.locator('.capa.fondo').evaluate((e) => e.style.transform + e.style.filter)).toBe('')
    // Al volver con el botón, el inicio no queda torcido
    await page.getByRole('button', { name: 'Consolas' }).click()
    await page.waitForTimeout(700)
    expect(await page.locator('.capa').evaluate((e) => e.style.transform)).toBe('')
    expect(await desplazamiento(page, '.capa')).toBe(0)
  })
})

test('motor en un hilo aparte con la tarjeta gráfica, y en el principal si se desactiva (v0.31.0)', async ({ page }) => {
  const abierto = async () => {
    const r = await page.evaluate(() => JSON.parse(localStorage.getItem('puchiemulator-registro') ?? '[]') as { m: string; x?: string }[])
    return JSON.parse(r.filter((e) => e.m === 'Juego abierto').at(-1)?.x ?? '{}')
  }
  await page.goto('/')
  await anadir(page, 'prueba.nds')
  await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  // Elige el pintor midiendo los dos; el registro lo dice
  await expect.poll(abierto).toMatchObject({ hilo: true })
  const datos = await abierto()
  expect(['webgl', '2d']).toContain(datos.pintor)
  expect(datos.pintorMs.webgl).toBeGreaterThan(0)
  expect(datos.pintor).toBe(datos.pintorMs.webgl <= datos.pintorMs['2d'] ? 'webgl' : '2d')
  // La imagen llega del hilo: el lienzo enseña las dos pantallas
  await expect.poll(() => page.getByTestId('pantalla').evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([256, 384])
  await page.getByRole('button', { name: 'Menú', exact: true }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()

  // Con el ajuste apagado, como hasta la v0.30.0: en el hilo principal, y el juego se ve igual
  await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('puchiemulator-ajustes') ?? '{}')
    localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ ...a, emulacionEnHilo: false }))
  })
  await page.reload()
  await entrar(page, 'Nintendo DS')
  await page.getByRole('button', { name: /prueba, Nintendo DS/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect.poll(abierto).toMatchObject({ hilo: false, motivo: 'Desactivado en Ajustes' })
  await expect.poll(() => page.getByTestId('pantalla').evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([256, 384])
})

test('la tarjeta gráfica pinta las disposiciones de DS igual que el 2D, píxel a píxel (v0.31.0)', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await anadir(page, 'prueba.nds')
  const imagen = () =>
    page.getByTestId('pantalla').evaluate((c: HTMLCanvasElement) => {
      const t = document.createElement('canvas')
      t.width = c.width
      t.height = c.height
      const g = t.getContext('2d')!
      g.drawImage(c, 0, 0)
      return `${c.width}x${c.height}:${t.toDataURL()}`
    })
  for (const pantallasDS of ['apiladas', 'lado', 'libro-derecha', 'libro-izquierda', 'grande']) {
    const vistas: Record<string, string> = {}
    for (const pintor of ['2d', 'webgl']) {
      await page.evaluate(
        ([d, p]) => {
          const a = JSON.parse(localStorage.getItem('puchiemulator-ajustes') ?? '{}')
          localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ ...a, pantallasDS: d }))
          localStorage.setItem('puchiemulator-pintor', p)
        },
        [pantallasDS, pintor],
      )
      await page.reload()
      await entrar(page, 'Nintendo DS')
      await page.getByRole('button', { name: /Opciones de/ }).click()
      await page.getByRole('button', { name: /^(Jugar|Arrancar el juego desde el principio)$/ }).click()
      await expect(page.getByText('Cargando…')).toBeHidden()
      // El juego de prueba pinta las dos pantallas en los primeros fotogramas: se espera a que la
      // imagen no cambie y se pausa en el menú, para comparar la misma imagen
      let antes = ''
      await expect.poll(async () => {
        const ahora = await imagen()
        const quieta = ahora === antes
        antes = ahora
        return quieta
      }, { intervals: [400] }).toBe(true)
      await page.getByRole('button', { name: 'Menú', exact: true }).click()
      await page.waitForTimeout(300)
      vistas[pintor] = await imagen()
      await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
      await page.getByRole('button', { name: 'Consolas' }).click()
    }
    expect(vistas.webgl, pantallasDS).toBe(vistas['2d'])
  }
})

/** Color que domina en el centro de la pantalla (Nintendo 64 lo dibuja con WebGL y no da valores exactos). */
async function tono(page: Page): Promise<string> {
  const [r, g, b] = await colorCentral(page)
  const alto = (v: number) => v > 180
  const bajo = (v: number) => v < 70
  if (alto(r) && alto(g) && alto(b)) return 'blanco'
  if (bajo(r) && bajo(g) && bajo(b)) return 'negro'
  if (alto(r) && alto(g) && bajo(b)) return 'amarillo'
  if (bajo(r) && alto(g) && alto(b)) return 'cian'
  if (alto(r) && bajo(g) && alto(b)) return 'magenta'
  if (alto(r) && bajo(g) && bajo(b)) return 'rojo'
  if (bajo(r) && alto(g) && bajo(b)) return 'verde'
  if (bajo(r) && bajo(g) && alto(b)) return 'azul'
  return `otro (${r}, ${g}, ${b})`
}

test('Nintendo 64 (en pruebas): palanca, A, botones C, Z, estados y partida guardada (v0.32.0)', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.z64')
  await expect(page.getByRole('heading', { name: 'Nintendo 64' })).toBeVisible()
  await page.getByRole('button', { name: /PUCHIPRUEBA|prueba, Nintendo 64/ }).first().click()
  await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByTestId('juego')).toHaveAttribute('data-tema', 'carbon')
  // El hilo marca el ritmo de los fotogramas (v0.33.0)
  const abierto = await page.evaluate(() => (JSON.parse(localStorage.getItem('puchiemulator-registro') ?? '[]') as { m: string; x?: string }[]).filter((e) => e.m === 'Juego abierto').pop())
  expect(abierto?.x).toContain('"ritmo":"propio"')
  const mando = page.getByTestId('mando')
  for (const n of ['A', 'B', 'Z', 'L', 'R', 'Start', 'C arriba', 'C abajo', 'C izquierda', 'C derecha']) await expect(mando.getByRole('button', { name: n, exact: true })).toBeVisible()
  await expect(mando.getByRole('button', { name: 'Select', exact: true })).toHaveCount(0)
  await expect(mando.getByLabel('Cruceta')).toHaveCount(0)
  // Sin rebobinado: cada estado pesa 16 MB
  await expect(page.getByRole('button', { name: /Rebobinar/ })).toHaveCount(0)

  // Azul al arrancar; con A, verde y la marca en la EEPROM
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('azul')
  await pulsar(page, 'A')
  await expect.poll(() => tono(page)).toBe('verde')
  await page.mouse.up()
  await page.getByRole('button', { name: 'Guardar rápido' }).click()
  await expect(page.getByText('Guardado rápido', { exact: true })).toBeVisible({ timeout: 15_000 })

  // La palanca a la derecha: amarillo; al soltarla vuelve al centro. Es flotante (v0.33.0): el pulgar
  // se apoya fuera de su dibujo (más abajo y a la izquierda), ese punto hace de centro y el aro va allí
  const palanca = (await page.getByTestId('palanca').boundingBox())!
  const [x0, y0] = [palanca.x + palanca.width * 0.2, palanca.y + palanca.height * 1.1]
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await expect(page.getByTestId('palanca').locator('.aro')).toHaveAttribute('style', /translate/)
  await page.mouse.move(x0 + palanca.width / 2, y0 + 4, { steps: 5 })
  await expect.poll(() => tono(page)).toBe('amarillo')
  await expect(page.getByTestId('palanca').locator('.pomo')).toHaveClass(/pulsado/)
  // Un segundo dedo en la zona de la palanca no se la quita al primero, y al levantarlo sigue (v0.36.0)
  await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y)!
    const datos = { pointerId: 9, clientX: x, clientY: y, bubbles: true, cancelable: true }
    el.dispatchEvent(new PointerEvent('pointerdown', datos))
    el.dispatchEvent(new PointerEvent('pointerup', datos))
  }, [x0 - 10, y0] as [number, number])
  await page.waitForTimeout(200)
  await expect(page.getByTestId('palanca').locator('.pomo')).toHaveClass(/pulsado/)
  await expect.poll(() => tono(page)).toBe('amarillo')
  await page.mouse.up()
  await expect(page.getByTestId('palanca').locator('.pomo')).not.toHaveClass(/pulsado/)
  await expect(page.getByTestId('palanca').locator('.aro')).not.toHaveAttribute('style', /translate\(/)

  // Un botón C: magenta
  await pulsar(page, 'C derecha')
  await expect.poll(() => tono(page)).toBe('magenta')
  await page.mouse.up()
  // Que el «soltar» llegue al núcleo antes de cargar: si no, la ROM vería C aún pulsado al volver
  await page.waitForTimeout(500)

  // Cargar el estado guardado vuelve al verde
  await page.getByRole('button', { name: 'Cargar rápido' }).click()
  await expect(page.getByText('Guardado rápido cargado')).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('verde')
  await page.waitForTimeout(1500)

  // Con B, la ROM dibuja con el RDP (por GLideN64 y la tarjeta gráfica, v0.34.0): un rectángulo rojo y
  // encima un triángulo cian, en el centro
  await pulsar(page, 'B')
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('cian')
  await page.mouse.up()

  // Al volver a abrir el juego desde el principio, la ROM encuentra la marca en la EEPROM: rojo
  await page.reload()
  await entrar(page, 'Nintendo 64')
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: /^(Jugar|Arrancar el juego desde el principio)$/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('rojo')
})

test('Nintendo 64: resolución normal (320 x 240) por juego, y el RDP dibuja igual (v0.34.0)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ bienvenidaVista: true, coloresConsola: false, ultimaCopia: Date.now(), resolucionN64: 'normal' })))
  await page.goto('/')
  await anadir(page, 'prueba.z64')
  await page.getByRole('button', { name: /prueba, Nintendo 64/ }).first().click()
  await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('azul')
  await expect.poll(() => page.getByTestId('pantalla').evaluate((c: HTMLCanvasElement) => `${c.width}x${c.height}`)).toBe('320x240')
  await pulsar(page, 'B')
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('cian')
  await page.mouse.up()
})

test('PlayStation (en pruebas): disco en BIN y CUE, botones, tarjeta de memoria, estados y CHD (v0.37.0)', async ({ page }) => {
  await page.goto('/')
  // El CUE con su BIN, elegidos juntos; el disco se copia a los ficheros de la app, no a la memoria
  await selector(page).setInputFiles([rom('prueba-psx.cue'), rom('prueba-psx.bin')])
  await expect(page.getByText('Juego añadido a PlayStation')).toBeVisible({ timeout: 15_000 })
  await entrar(page, 'PlayStation')
  await expect(page.getByRole('heading', { name: 'PlayStation' })).toBeVisible()
  // El identificador es el SHA-1 del BIN (el de los datos del disco), calculado por trozos
  const sha1 = createHash('sha1').update(readFileSync(rom('prueba-psx.bin'))).digest('hex')
  const juego = await page.evaluate(
    (id) =>
      new Promise<{ disco?: { ficheros: string[] } } | undefined>((resolver) => {
        const r = indexedDB.open('puchiemulator')
        r.onsuccess = () => {
          const g = r.result.transaction('juegos').objectStore('juegos').get(id)
          g.onsuccess = () => resolver(g.result)
        }
      }),
    sha1,
  )
  expect(juego?.disco?.ficheros).toEqual(['pista1.bin', 'disco.cue'])

  await page.getByRole('button', { name: /prueba-psx, PlayStation/ }).first().click()
  await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByTestId('juego')).toHaveAttribute('data-tema', 'plata')
  // Ritmo propio desde el principio, como la N64
  const abierto = await page.evaluate(() => (JSON.parse(localStorage.getItem('puchiemulator-registro') ?? '[]') as { m: string; x?: string }[]).filter((e) => e.m === 'Juego abierto').pop())
  expect(abierto?.x).toContain('"ritmo":"propio"')
  const mando = page.getByTestId('mando')
  for (const n of ['Triángulo', 'Círculo', 'Equis', 'Cuadrado', 'L1', 'L2', 'R1', 'R2', 'Select', 'Start']) await expect(mando.getByRole('button', { name: n, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Rebobinar/ })).toHaveCount(0)

  // Azul al arrancar; con la X, verde y la marca en la tarjeta de memoria
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('azul')
  await pulsar(page, 'Equis')
  await expect.poll(() => tono(page)).toBe('verde')
  await page.mouse.up()
  for (const [boton, color] of [['Triángulo', 'magenta'], ['R2', 'cian']]) {
    await pulsar(page, boton)
    await expect.poll(() => tono(page)).toBe(color)
    await page.mouse.up()
  }
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Guardar rápido' }).click()
  await expect(page.getByText('Guardado rápido', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Cargar rápido' }).click()
  await expect(page.getByText('Guardado rápido cargado')).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('verde')

  // La tarjeta de memoria es la partida del juego: al volver a abrirlo desde el principio, rojo
  await page.waitForTimeout(1500)
  await page.reload()
  await entrar(page, 'PlayStation')
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: /^(Jugar|Arrancar el juego desde el principio)$/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('rojo')
})

test('PlayStation: CHD, BIN suelto y CUE sin su BIN (v0.37.0)', async ({ page }) => {
  await page.goto('/')
  await selector(page).setInputFiles(rom('prueba-psx.cue'))
  await expect(page.getByText(/falta su \.bin/)).toBeVisible()
  // El CHD es el mismo disco, comprimido: es otro juego (otro SHA-1), y arranca igual
  await selector(page).setInputFiles(rom('prueba-psx.chd'))
  await expect(page.getByText('Juego añadido a PlayStation')).toBeVisible({ timeout: 15_000 })
  await entrar(page, 'PlayStation')
  await page.getByRole('button', { name: /prueba-psx, PlayStation/ }).first().click()
  await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('azul')
  await pulsar(page, 'Equis')
  await expect.poll(() => tono(page)).toBe('verde')
  await page.mouse.up()
  // Un BIN suelto (sin su CUE) también vale si es de una sola pista; si ya está, no se repite
  await page.goto('/')
  await selector(page).setInputFiles({ name: 'Otra copia.bin', mimeType: 'application/octet-stream', buffer: readFileSync(rom('prueba-psx.bin')) })
  await expect(page.getByText('Juego añadido a PlayStation')).toBeVisible({ timeout: 15_000 })
  await selector(page).setInputFiles({ name: 'Otra copia.bin', mimeType: 'application/octet-stream', buffer: readFileSync(rom('prueba-psx.bin')) })
  await expect(page.getByText(/ya estaba/)).toBeVisible({ timeout: 15_000 })
})

test('PlayStation: BIOS propia opcional en Ajustes, solo de 512 KB (v0.37.0)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: /BIOS de PlayStation/ }).click()
  await expect(page.getByTestId('bios')).toContainText('La libre del núcleo')
  await page.getByTestId('selector-bios').setInputFiles({ name: 'otra.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(1000) })
  await expect(page.getByText(/ocupa 512 KB/)).toBeVisible()
  // Un fichero inventado del tamaño de una BIOS (en las pruebas no hay BIOS de verdad)
  await page.getByTestId('selector-bios').setInputFiles({ name: 'SCPH1001.BIN', mimeType: 'application/octet-stream', buffer: Buffer.alloc(512 * 1024) })
  await expect(page.getByText(/BIOS añadida/)).toBeVisible()
  await expect(page.getByTestId('bios')).toContainText('SCPH1001.BIN')
  await page.getByRole('button', { name: 'Quitar la BIOS' }).click()
  // La confirmación ignora los toques de sus primeros 450 ms (toques fantasma de iOS)
  await page.waitForTimeout(500)
  await page.getByRole('alertdialog').getByRole('button', { name: 'Quitar', exact: true }).click()
  await expect(page.getByTestId('bios')).toContainText('La libre del núcleo')
})

test('en vertical, L y R no pisan guardar, cargar, el menú, el avance rápido, la cruceta ni los botones (v0.38.0)', async ({ page }) => {
  await page.goto('/')
  for (const [fichero, consola, nombre] of [
    ['prueba.sfc', 'Super Nintendo', /prueba, Super Nintendo/],
    ['prueba-psx.chd', 'PlayStation', /prueba-psx, PlayStation/],
  ] as const) {
    await page.goto('/')
    await selector(page).setInputFiles(rom(fichero))
    await expect(page.getByText(/añadido|ya estaba/i)).toBeVisible({ timeout: 15_000 })
    await entrar(page, consola)
    await page.getByRole('button', { name: nombre }).first().click()
    await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
    const cajas = async (selector: string) => page.locator(selector).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })))
    const hombros = await cajas('.mando .hombro')
    // Ni las herramientas ni la cruceta y los botones
    const herramientas = [...(await cajas('.herramientas .herramienta, .boton-menu')), ...(await cajas('.mando .cruceta, .botones-accion .control'))]
    expect(hombros.length).toBe(2)
    for (const a of hombros)
      for (const b of herramientas) {
        const cruzan = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(cruzan, `${consola}: un hombro pisa otra pieza`).toBe(false)
      }
    await page.getByRole('button', { name: 'Menú' }).click()
    await page.getByRole('button', { name: 'Salir' }).click()
  }
})

test('partida como fichero: importar un .sav, arrancar con ella, exportarla y deshacer (v0.38.0)', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  // Una partida de otro emulador con la marca que busca la ROM de prueba (rojo al arrancar)
  const sav = Buffer.alloc(32 * 1024)
  sav[0] = 0x5a
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await page.getByRole('button', { name: 'Importar una partida desde Archivos' }).click()
  await page.getByTestId('selector-partida').setInputFiles({ name: 'De otro emulador.sav', mimeType: 'application/octet-stream', buffer: sav })
  await page.waitForTimeout(500)
  await page.getByRole('alertdialog').getByRole('button', { name: 'Importar' }).click()
  await expect(page.getByText('Partida importada')).toBeVisible()
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect.poll(() => tono(page), { timeout: 10_000 }).toBe('rojo')
  await page.getByRole('button', { name: 'Guardar rápido' }).click()
  await expect(page.getByText('Guardado rápido', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir' }).click()

  // Exportarla: el mismo contenido, con la extensión de la consola
  await page.getByRole('button', { name: /Opciones de/ }).click()
  const descarga = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar la partida (.sav)' }).click()
  const d = await descarga
  expect(d.suggestedFilename()).toBe('prueba.sav')
  const exportada = readFileSync((await d.path())!)
  expect(exportada[0]).toBe(0x5a)
  expect(exportada.length).toBe(32 * 1024)
})

test('almacenamiento por juego: lo que ocupa, borrar sus estados y deshacer (v0.38.0)', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Guardar rápido' }).click()
  await expect(page.getByText('Guardado rápido', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir' }).click()
  await page.getByRole('button', { name: 'Consolas' }).click()

  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: /^Almacenamiento/ }).click()
  const fila = page.getByTestId('ocupacion').getByRole('button', { name: /^prueba, Game Boy Advance/ })
  await expect(fila).toBeVisible()
  await expect(fila).toContainText(/estado/)
  await fila.click()
  await expect(page.getByTestId('ocupacion-juego')).toContainText('Estados guardados')
  await page.getByRole('button', { name: 'Borrar los estados guardados' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('alertdialog').getByRole('button', { name: 'Borrar estados' }).click()
  await expect(page.getByText(/estados? borrados?/)).toBeVisible()
  await expect(fila).not.toContainText(/estado/)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(fila).toContainText(/estado/)
})

test('PlayStation: un juego de dos discos, juntos por el nombre, y cambio de disco desde el menú (v0.38.0)', async ({ page }) => {
  await page.goto('/')
  await selector(page).setInputFiles([
    { name: 'Varios (Disc 1).bin', mimeType: 'application/octet-stream', buffer: readFileSync(rom('prueba-psx.bin')) },
    { name: 'Varios (Disc 2).bin', mimeType: 'application/octet-stream', buffer: readFileSync(rom('prueba-psx-2.bin')) },
  ])
  await expect(page.getByText('Juego añadido a PlayStation')).toBeVisible({ timeout: 15_000 })
  await entrar(page, 'PlayStation')
  await expect(page.getByRole('button', { name: /^Varios, PlayStation/ })).toHaveCount(1)
  await page.getByRole('button', { name: /^Varios, PlayStation/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
  // Arranca con el disco 1 (azul)
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('azul')
  await page.getByRole('button', { name: 'Menú' }).click()
  await expect(page.getByRole('button', { name: /^Disco 1 de 2/ })).toBeVisible()
  await page.getByRole('button', { name: /^Disco 1 de 2/ }).click()
  await page.getByRole('radio', { name: 'Disco 2' }).click()
  await expect(page.getByText('Disco 2 puesto')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Disco 2 de 2/ })).toBeVisible()
  await page.getByRole('button', { name: 'Salir' }).click()

  // Se recuerda: al arrancar de nuevo desde el principio, la consola arranca con el disco 2 (amarillo)
  await page.getByRole('button', { name: /Opciones de Varios/ }).click()
  await page.getByRole('button', { name: /^(Jugar|Arrancar el juego desde el principio)$/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('amarillo')
})

test('PlayStation: palancas analógicas por juego, con L3 al tocar la palanca (v0.38.0)', async ({ page }) => {
  await page.goto('/')
  await selector(page).setInputFiles(rom('prueba-psx.chd'))
  await expect(page.getByText('Juego añadido a PlayStation')).toBeVisible({ timeout: 15_000 })
  await entrar(page, 'PlayStation')
  await page.getByRole('button', { name: /prueba-psx, PlayStation/ }).first().click()
  await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
  await expect.poll(() => tono(page), { timeout: 15_000 }).toBe('azul')
  await expect(page.getByTestId('palanca-derecha')).toHaveCount(0)

  // Se activan en el apartado Mando del juego, con el juego abierto: el mando pasa a DualShock
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: /^Mando/ }).click()
  await page.getByRole('switch', { name: 'Palancas analógicas' }).click()
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  await expect(page.getByTestId('palanca')).toBeVisible()
  await expect(page.getByTestId('palanca-derecha')).toBeVisible()
  await expect(page.getByTestId('mando').getByLabel('Cruceta')).toHaveCount(0)
  // Como muchos juegos, la ROM de prueba pide el modo analógico al arrancar: se vuelve a abrir el juego
  // (con él abierto, L1, R1 y Select a la vez hacen de botón ANALOG)
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir' }).click()
  await page.getByRole('button', { name: /Opciones de prueba-psx/ }).click()
  await page.getByRole('button', { name: /^(Jugar|Arrancar el juego desde el principio)$/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByTestId('palanca-derecha')).toBeVisible()
  await page.waitForTimeout(1500)

  const arrastrar = async (testid: string, color: string) => {
    const caja = (await page.getByTestId(testid).boundingBox())!
    const [x, y] = [caja.x + caja.width / 2, caja.y + caja.height / 2]
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + caja.width * 0.6, y, { steps: 5 })
    await expect.poll(() => tono(page), { timeout: 10_000 }).toBe(color)
    await page.mouse.up()
    await expect.poll(() => tono(page)).toBe('azul')
  }
  await arrastrar('palanca', 'blanco')
  await arrastrar('palanca-derecha', 'negro')

  // Un toque corto en la palanca izquierda es L3 (rojo un momento)
  const caja = (await page.getByTestId('palanca').boundingBox())!
  await page.evaluate(() => {
    const w = window as unknown as { colores: string[] }
    w.colores = []
    const c = document.querySelector('[data-testid="pantalla"]') as HTMLCanvasElement
    const t = document.createElement('canvas')
    const leer = () => {
      t.width = c.width
      t.height = c.height
      const g = t.getContext('2d')!
      g.drawImage(c, 0, 0)
      const d = g.getImageData(c.width >> 1, c.height >> 1, 1, 1).data
      w.colores.push(`${d[0]},${d[1]},${d[2]}`)
      if (w.colores.length < 90) requestAnimationFrame(leer)
    }
    requestAnimationFrame(leer)
  })
  await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2)
  await page.waitForTimeout(1600)
  const colores = await page.evaluate(() => (window as unknown as { colores: string[] }).colores)
  expect(colores.some((c) => c.startsWith('255,0,0'))).toBe(true)
})
