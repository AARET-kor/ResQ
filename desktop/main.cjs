'use strict'

const { existsSync, statSync } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  shell,
} = require('electron')
const {
  extractDeepLink,
  isResQDeepLink,
  isSafeExternalUrl,
} = require('./url-policy.cjs')

const APP_SCHEME = 'resq-app'
const APP_ORIGIN = `${APP_SCHEME}://app`
const DEEP_LINK_CHANNEL = 'resq:deep-link'
const rendererRoot = path.resolve(__dirname, '../dist/client')

let mainWindow = null
const pendingDeepLinks = []

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true,
    },
  },
])

function registerResQProtocol() {
  if (process.defaultApp && process.argv[1]) {
    return app.setAsDefaultProtocolClient(
      'resq',
      process.execPath,
      [path.resolve(process.argv[1])],
    )
  }
  return app.setAsDefaultProtocolClient('resq')
}

function resolveRendererFile(requestUrl) {
  const url = new URL(requestUrl)
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  const candidate = path.resolve(rendererRoot, relativePath || 'index.html')
  const rootPrefix = `${rendererRoot}${path.sep}`

  if (candidate !== rendererRoot && !candidate.startsWith(rootPrefix)) return null
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  return path.join(rendererRoot, 'index.html')
}

function deliverDeepLink(url) {
  if (!isResQDeepLink(url)) return
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    pendingDeepLinks.push(url)
    return
  }
  mainWindow.webContents.send(DEEP_LINK_CHANNEL, url)
}

function flushDeepLinks() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  while (pendingDeepLinks.length > 0) {
    const url = pendingDeepLinks.shift()
    if (url) mainWindow.webContents.send(DEEP_LINK_CHANNEL, url)
  }
}

async function openExternal(value) {
  if (!isSafeExternalUrl(value)) throw new Error('허용되지 않은 외부 URL입니다.')
  await shell.openExternal(value)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 360,
    minHeight: 640,
    show: false,
    backgroundColor: '#f8f7f4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl.startsWith(APP_ORIGIN)) return
    event.preventDefault()
    void openExternal(targetUrl).catch(() => {})
  })
  mainWindow.webContents.once('did-finish-load', flushDeepLinks)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  void mainWindow.loadURL(`${APP_ORIGIN}/`)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const deepLink = extractDeepLink(commandLine)
    if (deepLink) deliverDeepLink(deepLink)
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    deliverDeepLink(url)
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.resq.medical.desktop')
    registerResQProtocol()

    await protocol.handle(APP_SCHEME, (request) => {
      const filePath = resolveRendererFile(request.url)
      if (!filePath) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(filePath).toString())
    })

    ipcMain.handle('resq:open-external', async (_event, url) => {
      await openExternal(url)
    })

    const initialDeepLink = extractDeepLink(process.argv)
    if (initialDeepLink) pendingDeepLinks.push(initialDeepLink)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
