/**
 * Prueba de rendimiento de los núcleos (npm run build y después npm run rendimiento): cada núcleo con
 * su ROM de prueba, en milisegundos por fotograma, frente a los de la versión anterior si están en
 * dist/referencia/nucleos (en GitHub los copia el flujo de publicación). Solo informa, no falla.
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/rendimiento',
  testMatch: '**/*.e2e.ts',
  timeout: 300_000,
  reporter: 'list',
  // WebGL por software en el navegador sin tarjeta gráfica (Nintendo 64 dibuja con WebGL 2)
  use: { browserName: 'chromium', baseURL: 'http://localhost:4173', trace: 'off', launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
})
