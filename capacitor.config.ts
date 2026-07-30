import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.resq.medical',
  appName: 'ResQ',
  webDir: 'dist/client',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
