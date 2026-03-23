import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /* happy-dom covers component tests and DOM stubs for OpenAI session bootstrap tests */
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
