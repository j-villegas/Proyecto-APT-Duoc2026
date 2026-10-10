import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // 'server-only' corta la importación fuera de Next; en tests es un módulo vacío.
      'server-only': fileURLToPath(new URL('./tests/support/empty.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Las pruebas de base levantan Postgres en memoria y corren las 28 migraciones.
    testTimeout: 60_000,
  },
})
