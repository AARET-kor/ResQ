'use strict'

const { existsSync, statSync } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  shell,
} = require('electron')
const {
  extractDeepLink,
  isRendererUrl,
  isResQDeepLink,
  isSafeExternalUrl,
} = require('./url-policy.cjs')
const {
  activateWindow,
  attemptProtocolRegistration,
} = require('./window-lifecycle.cjs')

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
  if (!isRendererUrl(requestUrl)) return null
  const url = new URL(requestUrl)
  let relativePath
  try {
    relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  } catch {
    return null
  }
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
    if (isRendererUrl(targetUrl)) return
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

function activateMainWindow() {
  if (mainWindow?.isDestroyed()) mainWindow = null
  if (!mainWindow && app.isReady()) createWindow()
  activateWindow(mainWindow)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const deepLink = extractDeepLink(commandLine)
    if (deepLink) deliverDeepLink(deepLink)
    activateMainWindow()
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    deliverDeepLink(url)
    activateMainWindow()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.resq.medical.desktop')
    const protocolRegistration = attemptProtocolRegistration(
      registerResQProtocol,
    )
    if (!protocolRegistration.ok) {
      const detail = protocolRegistration.error instanceof Error
        ? `\n\n${protocolRegistration.error.message}`
        : ''
      dialog.showErrorBox(
        'ResQ 로그인 링크 등록 실패',
        `운영체제에 ResQ 로그인 반환 링크를 등록하지 못했습니다. 앱을 Applications 폴더에 설치한 뒤 다시 실행해주세요.${detail}`,
      )
    }

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
      activateMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
