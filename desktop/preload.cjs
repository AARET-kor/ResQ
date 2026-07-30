'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const deepLinkCallbacks = new Set()
const queuedDeepLinks = []

ipcRenderer.on('resq:deep-link', (_event, url) => {
  if (typeof url !== 'string') return
  if (deepLinkCallbacks.size === 0) {
    queuedDeepLinks.push(url)
    return
  }
  for (const callback of deepLinkCallbacks) callback(url)
})

contextBridge.exposeInMainWorld('resqDesktop', Object.freeze({
  isDesktop: true,
  openExternal: async (url) => {
    await ipcRenderer.invoke('resq:open-external', url)
  },
  onDeepLink: (callback) => {
    if (typeof callback !== 'function') return () => {}
    deepLinkCallbacks.add(callback)
    while (queuedDeepLinks.length > 0) {
      const url = queuedDeepLinks.shift()
      if (url) callback(url)
    }
    return () => {
      deepLinkCallbacks.delete(callback)
    }
  },
}))
