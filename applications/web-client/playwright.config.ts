import {defineConfig} from '@playwright/test'
import {readdirSync} from 'fs'
import {resolve} from 'path'
import {fileURLToPath} from 'url'

const dir = fileURLToPath(new URL('.', import.meta.url))
const libsDir = resolve(dir, '../../applications/signaling-server/build/libs')
const bootJar = readdirSync(libsDir)
  .filter(f => f.startsWith('signaling-server') && f.endsWith('.jar') && !f.endsWith('-plain.jar'))
  .map(f => resolve(libsDir, f))[0]

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: [
    {
      command: `java -jar ${bootJar}`,
      url: 'http://localhost:8081/health',
      reuseExistingServer: false,
      timeout: 30000,
      env: {SERVER_PORT: '8081'},
    },
    {
      command: 'npm run preview',
      url: 'http://localhost:4173/battleship/',
      reuseExistingServer: false,
    },
  ],
})
