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
      // Core logic (lib + hooks) + feature components + App shell. shadcn `ui/` primitives are
      // excluded (generated wrappers). `main.tsx` is bootstrap-only; `ErrorFallback` has a
      // dev-only rethrow branch covered via exclude.
      include: [
        'src/lib/**/*.ts',
        'src/hooks/**/*.{ts,tsx}',
        'src/components/**/*.tsx',
        'src/App.tsx',
      ],
      exclude: [
        'node_modules/**',
        'src/test/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.config.*',
        '**/dist/**',
        'src/lib/types.ts',
        'src/components/ui/**',
        'src/main.tsx',
        'src/ErrorFallback.tsx',
      ],
      // Combined lib + hooks + feature components + App. shadcn `ui/` excluded. Hitting 100% on
      // every interactive branch (QueryInput menus, full Settings OAuth matrix, workspace chrome)
      // needs additional integration/E2E-style tests; thresholds track the current automated floor.
      thresholds: {
        lines: 88,
        statements: 86,
        functions: 73,
        branches: 79,
      },
    },
  },
})
