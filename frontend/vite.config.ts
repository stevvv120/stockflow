import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const apiUrl = process.env.VITE_API_URL ?? env.VITE_API_URL
    if (!apiUrl?.trim()) {
      throw new Error('VITE_API_URL wajib diisi saat build frontend production')
    }

    let parsedApiUrl: URL
    try {
      parsedApiUrl = new URL(apiUrl)
    } catch {
      throw new Error('VITE_API_URL harus berupa URL yang valid')
    }
    if (parsedApiUrl.protocol !== 'https:') {
      throw new Error('VITE_API_URL harus menggunakan HTTPS saat build frontend production')
    }
  }

  return {
    plugins: [react()],
  }
})
