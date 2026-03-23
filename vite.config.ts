import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vitest/config'
import type { PluginOption } from 'vite'
import { resolve } from 'path'
import { openaiProxyPlugin } from './vite-plugins/openai-proxy'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), openaiProxyPlugin() as PluginOption],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Enforce 100% on **logic** under lib + hooks. UI components use targeted tests and
      // manual/E2E passes; measuring every Radix line is low ROI for this repo.
      include: ['src/lib/**/*.ts', 'src/hooks/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/**',
        'src/test/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.config.*',
        '**/dist/**',
        // Interfaces / types only — no executable statements.
        'src/lib/types.ts',
      ],
      thresholds: {
        lines: 100,
        statements: 99.6,
        functions: 100,
        branches: 96,
      },
    },
  },
})
