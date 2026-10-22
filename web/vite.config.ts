import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Where `hatch api` listens during development (its default PORT is 8080).
const apiTarget = process.env.HATCH_API_URL ?? 'http://localhost:8080'
const distDir = path.resolve(import.meta.dirname, 'dist')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // web/embed.go embeds dist/, which must contain at least one file for
      // `go build` to work before the first web build. Vite empties dist/ on
      // every build, so put the placeholder back afterwards.
      name: 'keep-dist-placeholder',
      apply: 'build',
      closeBundle() {
        mkdirSync(distDir, { recursive: true })
        writeFileSync(path.join(distDir, '.gitkeep'), '')
      },
    },
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    // Keep every asset a separate file instead of a data: URI, so the
    // Content-Security-Policy served with the UI can forbid data: fonts.
    assetsInlineLimit: 0,
  },
  server: {
    // Matches the default FRONTEND_URL and CORS_ALLOWED_ORIGINS in .env.example.
    port: 3000,
    strictPort: true,
    // The browser talks to one origin; the dev server forwards API traffic to
    // the Go server, as `hatch api` serves both in production.
    proxy: {
      '/api': apiTarget,
      '^/auth/(github|install|callback|logout)$': apiTarget,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
