import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
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
    },
    resolve: {
      alias: {
        '@': resolve(projectRoot, 'src'),
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
