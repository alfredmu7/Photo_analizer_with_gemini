import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// vite.config.js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-ocr': {
        target: 'https://api.ocr.space',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-ocr/, ''),
      },
      '/api-gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        secure: false, 
        // Añadimos headers para que Google no sospeche del proxy
        headers: {
          'Origin': 'https://generativelanguage.googleapis.com'
        },
        rewrite: (path) => path.replace(/^\/api-gemini/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err) => console.log('Error en Proxy Gemini:', err));
        },
      },
    },
  },
})