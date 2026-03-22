import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig, PluginOption } from 'vite'
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
})
