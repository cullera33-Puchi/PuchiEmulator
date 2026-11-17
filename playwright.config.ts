/**
 * Pruebas de navegador (npm run build y después npm run e2e): la app compilada en un iPhone simulado
 * con Chromium, en vertical y en horizontal. En GitHub se ejecutan antes de publicar.
 *
 * Desde la v0.41.0, también con WebKit, el motor de Safari (npm run e2e:webkit; en GitHub, en su propio
 * flujo, `webkit.yml`). Es el WebKit de Linux, no el Safari del iPhone, pero comparte el motor: lo que
 * falla aquí y no en Chromium suele fallar también en el iPhone.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['iPhone 13'],
    baseURL: 'http://localhost:4173',
    trace: 'off',
    // Sin animaciones de navegación (dos pantallas a la vez durante medio segundo); la prueba
    // «transiciones» las activa para comprobarlas
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'chromium',
      // WebGL por software en el navegador sin tarjeta gráfica (Nintendo 64 dibuja con WebGL 2)
      use: { browserName: 'chromium', launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
    },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
})
