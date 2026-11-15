/**
 * Recorrido de la app en un iPhone simulado con las ROMs de prueba propias (tests/fixtures):
 * añadir juegos, jugar, botones, estados, salir y seguir, y la distribución en horizontal.
 */
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const rom = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url))

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
  await expect(page.getByText(/jugado hoy/)).toBeVisible()

  // Opciones del juego: hay estado «auto» para seguir
  await page.getByRole('button', { name: /Opciones de/ }).click()
  await expect(page.getByRole('button', { name: 'Seguir donde lo dejé' })).toBeVisible()
  await page.getByRole('button', { name: 'Seguir donde lo dejé' }).click()
  await expect(page.getByTestId('juego')).toBeVisible()
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 255])
})

test('Game Boy: sin L ni R y la pantalla responde a A', async ({ page }) => {
  await page.goto('/')
  await anadir(page, 'prueba.gb')
  await page.getByRole('button', { name: /prueba.*Game Boy/i }).click()
  await expect(page.getByText('Cargando…')).toBeHidden()
  await expect(page.getByTestId('mando').getByRole('button', { name: 'L', exact: true })).toHaveCount(0)
  await expect.poll(() => colorCentral(page)).toEqual([255, 251, 255])
  await pulsar(page, 'A')
  await expect.poll(() => colorCentral(page)).toEqual([0, 0, 0])
  await page.mouse.up()
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
