import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Cada fase usa su propio puerto: así el navegador guarda el progreso de cada una por separado.
  // strictPort hace que Vite avise si el puerto está ocupado en vez de usar otro
  server: { port: 5182, strictPort: true },
  preview: { port: 4182, strictPort: true },
})
