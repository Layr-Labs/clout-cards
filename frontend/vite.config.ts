import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env vars (including CLOUTCARDS_CONTRACT_ADDRESS)
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    define: {
      // Map CLOUTCARDS_CONTRACT_ADDRESS to import.meta.env.CLOUTCARDS_CONTRACT_ADDRESS
      // This allows using CLOUTCARDS_CONTRACT_ADDRESS instead of VITE_CLOUTCARDS_CONTRACT_ADDRESS
      'import.meta.env.CLOUTCARDS_CONTRACT_ADDRESS': JSON.stringify(env.CLOUTCARDS_CONTRACT_ADDRESS),
    },
  }
})
