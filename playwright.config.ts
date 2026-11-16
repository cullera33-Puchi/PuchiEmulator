/**
 * Pruebas de navegador (npm run build y después npm run e2e): la app compilada en un iPhone simulado
 * con Chromium, en vertical y en horizontal. En GitHub se ejecutan antes de publicar.
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
    browserName: 'chromium',
    baseURL: 'http://localhost:4173',
    trace: 'off',
    // Sin animaciones de navegación (dos pantallas a la vez durante medio segundo); la prueba
    // «transiciones» las activa para comprobarlas
    reducedMotion: 'reduce',
    // WebGL por software en el navegador sin tarjeta gráfica (Nintendo 64 dibuja con WebGL 2)
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
})
