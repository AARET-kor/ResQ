/// <reference types="vitest/config" />
import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function sitesStaticOutput(): Plugin {
  return {
    name: 'sites-static-output',
    apply: 'build',
    async buildStart() {
      await rm(resolve('dist'), { recursive: true, force: true })
    },
    async closeBundle() {
      const serverDirectory = resolve('dist/server')
      await mkdir(serverDirectory, { recursive: true })
      await cp(resolve('worker/index.js'), resolve(serverDirectory, 'index.js'))
    },
  }
}

function restartWhenThemeConfigChanges(): Plugin {
  const themeConfig = resolve('tailwind.config.js')

  return {
    name: 'restart-when-theme-config-changes',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(themeConfig)
      server.watcher.on('change', async (changedPath) => {
        if (resolve(changedPath) === themeConfig) {
          await server.restart()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'icons.svg',
        'og.png',
        'pwa-192.png',
        'pwa-512.png',
      ],
      manifest: {
        id: '/',
        name: 'ResQ — 의료 연구 워크스페이스',
        short_name: 'ResQ',
        description: '일정, 할 일, 팀, 논문과 외부 연동을 한곳에서 관리하는 의료 연구 워크스페이스.',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f8f7f4',
        theme_color: '#0b8f55',
        categories: ['productivity', 'medical', 'education'],
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/functions\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'resq-google-font-styles',
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'resq-google-font-files',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
    restartWhenThemeConfigChanges(),
    sitesStaticOutput(),
  ],
  build: {
    outDir: 'dist/client',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
      'desktop/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/release/**',
    ],
  },
})
