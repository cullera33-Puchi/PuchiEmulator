/**
 * Recorrido de la app en un iPhone simulado con las ROMs de prueba propias (tests/fixtures):
 * añadir juegos, jugar, botones, estados, salir y seguir, y la distribución en horizontal.
 */
import { expect, test, type Page } from '@playwright/test'
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

async function anadir(page: Page, fichero: string) {
  await page.getByTestId('selector').setInputFiles(rom(fichero))
}

async function pulsar(page: Page, etiqueta: string, ms = 300) {
  const caja = (await page.getByTestId('mando').getByRole('button', { name: etiqueta, exact: true }).boundingBox())!
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
}

test('biblioteca vacía, añadir un juego de GBA y jugar con los botones', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Aún no hay juegos')).toBeVisible()

  await anadir(page, 'prueba.gba')
  await expect(page.getByText('Juego añadido')).toBeVisible()
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
  await expect(page.getByText(/Jugado hoy/)).toBeVisible()

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
  await expect(page.getByText('Aún no hay juegos')).toBeVisible()
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
  await expect(page.getByText('Aún no hay juegos')).toBeVisible()
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

  await page.getByRole('button', { name: 'Juegos' }).click()
  await expect(page.getByTestId('biblioteca')).toBeVisible()
})
