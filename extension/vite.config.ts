import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

const promptBuildMode = process.env.PROMPTGOD_PROMPT_MODE === 'debug'
  ? 'debug'
  : 'production'

export default defineConfig({
  plugins: [
    crx({ manifest }),
  ],
  define: {
    __PROMPTGOD_PROMPT_MODE__: JSON.stringify(promptBuildMode),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
