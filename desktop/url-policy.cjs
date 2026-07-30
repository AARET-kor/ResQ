'use strict'

const DEEP_LINK_PROTOCOL = 'resq:'
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
  return parseUrl(value)?.protocol === DEEP_LINK_PROTOCOL
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
  isResQDeepLink,
  isSafeExternalUrl,
}
