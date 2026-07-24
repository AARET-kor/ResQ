/// <reference types="vitest/config" />
import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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

export default defineConfig({
  plugins: [react(), sitesStaticOutput()],
  build: {
    outDir: 'dist/client',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
