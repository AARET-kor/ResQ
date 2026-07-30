'use strict'

const DEEP_LINK_PROTOCOL = 'resq:'
const APP_PROTOCOL = 'resq-app:'
const APP_HOST = 'app'
const ALLOWED_DEEP_LINK_ROUTES = new Set([
  'auth/callback',
  'integration/callback',
])
const EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:'])
const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function parseUrl(value) {
  if (typeof value !== 'string' || value.length > 8_192) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isResQDeepLink(value) {
  const parsed = parseUrl(value)
  if (!parsed || parsed.protocol !== DEEP_LINK_PROTOCOL) return false
  if (parsed.username || parsed.password || parsed.port) return false
  return ALLOWED_DEEP_LINK_ROUTES.has(
    `${parsed.hostname.toLowerCase()}${parsed.pathname}`,
  )
}

function isRendererUrl(value) {
  const parsed = parseUrl(value)
  if (!parsed || parsed.protocol !== APP_PROTOCOL) return false
  return parsed.hostname === APP_HOST
    && !parsed.username
    && !parsed.password
    && !parsed.port
}

function extractDeepLink(argv) {
  if (!Array.isArray(argv)) return null
  return argv.find(isResQDeepLink) ?? null
}

function isSafeExternalUrl(value) {
  const parsed = parseUrl(value)
  if (!parsed) return false
  if (EXTERNAL_PROTOCOLS.has(parsed.protocol)) return true
  return parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname)
}

module.exports = {
  extractDeepLink,
  isRendererUrl,
  isResQDeepLink,
  isSafeExternalUrl,
}
