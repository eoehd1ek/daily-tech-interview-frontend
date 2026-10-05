import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    env: {
      VITE_API_BASE_URL: 'http://api.test',
      VITE_EVALUATION_TIMEOUT_MS: '180000',
    },
    restoreMocks: true,
    unstubEnvs: true,
  },
}))
