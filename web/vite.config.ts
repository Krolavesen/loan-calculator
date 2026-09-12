import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Port that `python scripts/dev_api.py` listens on. */
const API_PORT = process.env.API_PORT ?? '8000'

export default defineConfig({
  // `compiler: true` runs React Compiler through oxc-transform-react (the Rust port).
  plugins: [react({ compiler: true })],
  server: {
    // In production Vercel routes /api to the Python function; in development
    // the same handler runs behind scripts/dev_api.py.
    proxy: { '/api': `http://127.0.0.1:${API_PORT}` },
  },
})
