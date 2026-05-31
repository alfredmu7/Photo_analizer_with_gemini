import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Este proxy funcionará en tu máquina local de forma idéntica
      '/api-gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        secure: false, 
        rewrite: (path) => path.replace(/^\/api-gemini/, ''),
      },
    },
  },
})