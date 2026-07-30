'use strict'

function activateWindow(window) {
  if (!window || window.isDestroyed()) return false
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  return true
}

function attemptProtocolRegistration(register) {
  try {
    return {
      ok: register() === true,
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      error,
    }
  }
}

module.exports = {
  activateWindow,
  attemptProtocolRegistration,
}
