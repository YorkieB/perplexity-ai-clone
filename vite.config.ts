import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig, loadEnv, PluginOption } from 'vite'
import { resolve } from 'path'
import { openaiProxyPlugin } from './vite-plugins/openai-proxy'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const openaiKey = env.OPENAI_API_KEY || ''

  return {
    plugins: [react(), tailwindcss(), openaiProxyPlugin() as PluginOption],
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (/[\\/]react(-dom)?[\\/]/.test(id) || id.includes('react-error-boundary')) return 'vendor-react'
              if (id.includes('@radix-ui')) return 'vendor-radix'
              if (id.includes('@phosphor-icons') || id.includes('lucide-react') || id.includes('@heroicons')) return 'vendor-icons'
              if (id.includes('/marked/') || id.includes('prism-react-renderer')) return 'vendor-markdown'
              if (id.includes('/docx/')) return 'vendor-docx'
              if (id.includes('/jspdf/')) return 'vendor-jspdf'
              if (id.includes('/recharts/') || id.includes('/d3')) return 'vendor-charts'
              if (id.includes('/framer-motion/')) return 'vendor-motion'
              if (id.includes('/three/')) return 'vendor-three'
              if (id.includes('monaco-editor/') || id.includes('@monaco-editor/')) return 'vendor-monaco'
              if (id.includes('@codemirror/lang-') || id.includes('@lezer/lang')) return 'vendor-cm-langs'
              if (id.includes('@codemirror') || id.includes('@uiw/react-codemirror') || id.includes('@lezer')) return 'vendor-codemirror'
              if (id.includes('/pdfjs-dist/')) return 'vendor-pdf'
              if (id.includes('/html2canvas/')) return 'vendor-html2canvas'
              if (id.includes('/sonner/') || id.includes('/cmdk/') || id.includes('class-variance-authority') || id.includes('/clsx/') || id.includes('tailwind-merge')) return 'vendor-ui-utils'
              if (id.includes('crypto-js') || id.includes('oauth-1.0a')) return 'vendor-crypto'
              if (id.includes('react-plaid-link')) return 'vendor-plaid'
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(projectRoot, 'src'),
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        define: { 'process.env.NODE_ENV': '"development"' },
      },
    },
    server: {
      proxy: {
        '/ws/realtime': {
          target: 'wss://api.openai.com',
          ws: true,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ws\/realtime/, '/v1/realtime'),
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'OpenAI-Beta': 'realtime=v1',
          },
        },
      },
    },
  }
})
