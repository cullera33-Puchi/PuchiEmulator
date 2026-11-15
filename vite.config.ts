/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// Ruta de publicación: en GitHub Pages, /<repositorio>/ (la pone el flujo de publicación); en local, /
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // La versión nueva espera a que se toque «Actualizar»: así nunca se corta una partida
      registerType: 'prompt',
      manifest: {
        name: 'PuchiEmulator',
        short_name: 'Emulador',
        description: 'Emulador de Game Boy, Game Boy Color, Game Boy Advance y Super Nintendo',
        lang: 'es',
        start_url: base,
        scope: base,
        id: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Toda la app, núcleos incluidos, queda en el iPhone para jugar sin conexión
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,wasm}'],
        globIgnores: ['**/novedades.json'],
        navigateFallbackDenylist: [/novedades\.json$/],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
