/**
 * Recorrido de la app en un iPhone simulado con las ROMs de prueba propias (tests/fixtures):
 * añadir juegos, jugar, botones, estados, salir y seguir, y la distribución en horizontal.
 */
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const rom = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url))

// La hoja de bienvenida se da por vista salvo en su propia prueba
test.beforeEach(async ({ page }, info) => {
  if (info.title.includes('bienvenida')) return
  await page.addInitScript(() => {
    if (!localStorage.getItem('puchiemulator-ajustes')) localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ bienvenidaVista: true }))
  })
})

/** Color del píxel central de la pantalla del juego. */
async function colorCentral(page: Page): Promise<[number, number, number]> {
  return page.getByTestId('pantalla').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(c.width >> 1, c.height >> 1, 1, 1).data
    return [d[0], d[1], d[2]] as [number, number, number]
  })
}

const CONSOLA: Record<string, string> = { 'prueba.gba': 'Game Boy Advance', 'prueba.gb': 'Game Boy y Game Boy Color', 'prueba.sfc': 'Super Nintendo' }

/** Abre la biblioteca de una consola desde el inicio. */
async function entrar(page: Page, consola: string) {
  await page.getByTestId('consolas').getByRole('button', { name: new RegExp(`^${consola},`) }).click()
}

/** Añade una ROM desde el inicio y entra en la biblioteca de su consola. */
async function anadir(page: Page, fichero: string) {
  await page.getByTestId('selector').setInputFiles(rom(fichero))
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
  await expect(page.getByTestId('consolas').getByRole('button', { name: /sin juegos/ })).toHaveCount(3)

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
  await expect(page.getByText('Estado guardado en la ranura 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cargar la ranura 1' })).toBeEnabled()
  await page.getByRole('button', { name: 'Cargar la ranura 1' }).click()
  await expect(page.getByText('Estado de la ranura 1 cargado')).toBeVisible()

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
  await page.mouse.click(200, 30)
  await page.getByRole('button', { name: 'Seguir jugando' }).click()
  await expect.poll(() => colorCentral(page)).toEqual([255, 251, 255])
})

test('un fichero que no es un juego se rechaza', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('selector').setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') })
  await expect(page.getByText(/no es un juego/)).toBeVisible()
  await expect(page.getByTestId('consolas').getByRole('button', { name: /sin juegos/ })).toHaveCount(3)
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
  await page.getByRole('button', { name: /Ver registro/ }).click()
  const registro = page.getByRole('textbox', { name: 'Registro' })
  await expect(registro).toHaveValue(/Inicio v/)
  await expect(registro).toHaveValue(/Juegos añadidos/)
  await expect(registro).toHaveValue(/Juego abierto/)
  // Sin nombres de juegos
  await expect(registro).not.toHaveValue(/prueba/i)
  await page.getByRole('dialog', { name: /Registro/ }).getByRole('button', { name: 'Copiar' }).click()
  await page.mouse.click(200, 60)

  const copias = page.getByTestId('copias')
  await page.getByRole('button', { name: 'Crear copia ahora' }).click()
  await expect(page.getByText('Copia creada: 1 partida')).toBeVisible()
  await copias.getByRole('button', { name: /Manual, 1 partida/ }).click()
  await page.getByRole('button', { name: 'Restaurar esta copia' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restaurar' }).click()
  await expect(page.getByText('Copia restaurada')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  // La restauración deja también una copia previa
  await expect(copias.getByRole('button', { name: /Antes de recuperar/ })).toBeVisible()

  await page.getByRole('button', { name: 'Consolas' }).click()
  await expect(page.getByTestId('consolas')).toBeVisible()
})

test('inicio: cada juego va a su consola, recuentos, seguir jugando y foto de la consola', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gba')
  // Desde la biblioteca de GBA se añade uno de Game Boy: va a su consola y se avisa
  await page.getByTestId('selector').setInputFiles(rom('prueba.gb'))
  await expect(page.getByText('Juego añadido a Game Boy')).toBeVisible()
  await expect(page.getByTestId('biblioteca').getByRole('button', { name: /prueba, Game Boy$/ })).toHaveCount(0)

  await page.getByRole('button', { name: /prueba, Game Boy Advance/ }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await page.getByRole('button', { name: 'Consolas' }).click()

  const consolas = page.getByTestId('consolas')
  await expect(consolas.getByRole('button', { name: 'Game Boy y Game Boy Color, 1 juego', exact: true })).toBeVisible()
  await expect(consolas.getByRole('button', { name: 'Game Boy Advance, 1 juego' })).toBeVisible()

  // Foto propia de una consola y vuelta al dibujo con Deshacer
  await consolas.getByRole('button', { name: 'Opciones de Game Boy y Game Boy Color', exact: true }).click()
  await page.getByTestId('selector-foto-consola').setInputFiles(rom('../../public/icono-512.png'))
  await expect(page.getByText('Foto puesta')).toBeVisible()
  await expect(consolas.locator('img')).toHaveCount(1)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(consolas.locator('img')).toHaveCount(0)

  // Seguir jugando abre el último juego y, al salir, vuelve a la biblioteca de su consola
  await page.getByRole('button', { name: /Seguir jugando a prueba/ }).click()
  await expect(page.getByTestId('juego')).toBeVisible()
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await expect(page.getByRole('heading', { name: 'Game Boy Advance' })).toBeVisible()
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
  await page.getByTestId('selector').setInputFiles({ name: 'Advance Wars (Europe) (En,Fr,De,Es).gba', mimeType: 'application/octet-stream', buffer: readFileSync(rom('prueba.gba')) })
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
  await page.getByRole('switch', { name: 'Poner la carátula al añadir un juego' }).click()
  await page.getByRole('button', { name: 'Consolas' }).click()
  const antes = descargas.length
  await page.getByTestId('selector').setInputFiles({ name: 'Tetris (World) (Rev 1).gb', mimeType: 'application/octet-stream', buffer: readFileSync(rom('prueba.gb')) })
  await expect(page.getByText(/Juego añadido/)).toBeVisible()
  await page.waitForTimeout(1000)
  expect(descargas.length).toBe(antes)

  // «Buscar ahora las que faltan» pone las dos
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: 'Buscar ahora las que faltan' }).click()
  await expect(page.getByText('2 carátulas puestas')).toBeVisible()
  await page.getByRole('button', { name: 'Consolas' }).click()
  await entrar(page, 'Game Boy y Game Boy Color')
  await expect(page.getByTestId('biblioteca').locator('img')).toHaveCount(1)
})

test.describe('una mano en horizontal', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  for (const mano of ['derecha', 'izquierda'] as const) {
    test(`mano ${mano}: la pantalla a un lado a toda la altura y los controles en columna al otro`, async ({ page }) => {
      await page.addInitScript((m) => {
        localStorage.setItem('puchiemulator-ajustes', JSON.stringify({ bienvenidaVista: true, modoMando: 'una-mano', mano: m }))
      }, mano)
      await page.goto('/')
      await anadir(page, 'prueba.gba')
      await page.getByRole('button', { name: /prueba.*Game Boy Advance/i }).click()
      await expect(page.getByText('Cargando…')).toBeHidden()
      // La imagen de GBA a toda la altura (3:2) pegada al lado contrario a la mano
      const lienzo = (await page.getByTestId('pantalla').boundingBox())!
      expect(lienzo.height).toBe(390)
      const posicion = await page.getByTestId('pantalla').evaluate((c) => getComputedStyle(c).objectPosition)
      expect(posicion).toMatch(mano === 'derecha' ? /^0%|left/ : /^100%|right/)
      const finImagen = mano === 'derecha' ? lienzo.x + 390 * 1.5 : lienzo.x + lienzo.width - 390 * 1.5
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
  await page.getByRole('button', { name: /^Mando/ }).click()
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
  await expect(page.getByRole('button', { name: 'Estadísticas' })).toContainText(/Esta semana, \d+ s jugadas/)
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

test('Game Boy y Game Boy Color comparten consola y biblioteca, y cada juego conserva su tema', async ({ page }) => {
  const gb = readFileSync(rom('prueba.gb'))
  const gbc = Buffer.from(gb)
  gbc[0x143] = 0x80 // indicador de Game Boy Color
  gbc[0x134] = 0x51 // otra ROM distinta
  await page.goto('/')
  await page.getByTestId('selector').setInputFiles([
    { name: 'Clasico.gb', mimeType: 'application/octet-stream', buffer: gb },
    { name: 'En color.gbc', mimeType: 'application/octet-stream', buffer: gbc },
  ])
  await expect(page.getByText('2 juegos añadidos')).toBeVisible()
  const consolas = page.getByTestId('consolas')
  await expect(consolas.getByRole('button')).toHaveCount(6) // tres tarjetas con su botón de opciones
  await expect(consolas.getByRole('button', { name: 'Game Boy y Game Boy Color, 2 juegos', exact: true })).toBeVisible()

  await entrar(page, 'Game Boy y Game Boy Color')
  await expect(page.getByRole('heading', { name: 'Game Boy y Color' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clasico, Game Boy', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'En color, Game Boy Color', exact: true })).toBeVisible()

  // El de Color se juega con su tema y, al salir, se vuelve a la biblioteca conjunta
  await page.getByRole('button', { name: 'En color, Game Boy Color', exact: true }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('juego')).toHaveAttribute('data-tema', 'uva')
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir a la biblioteca' }).click()
  await expect(page.getByRole('heading', { name: 'Game Boy y Color' })).toBeVisible()

  // Añadir uno de GBA desde aquí avisa de que va a su consola
  await page.getByTestId('selector').setInputFiles(rom('prueba.gba'))
  await expect(page.getByText('Juego añadido a Game Boy Advance')).toBeVisible()
})
