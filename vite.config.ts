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
      chunkSizeWarningLimit: 800,
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
