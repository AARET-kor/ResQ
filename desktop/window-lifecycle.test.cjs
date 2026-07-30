'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  activateWindow,
  attemptProtocolRegistration,
} = require('./window-lifecycle.cjs')

test('restores and focuses an existing minimized window', () => {
  const calls = []
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  }

  assert.equal(activateWindow(window), true)
  assert.deepEqual(calls, ['restore', 'show', 'focus'])
})

test('shows and focuses an existing visible window without restoring it', () => {
  const calls = []
  const window = {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  }

  assert.equal(activateWindow(window), true)
  assert.deepEqual(calls, ['show', 'focus'])
})

test('does not activate a missing or destroyed window', () => {
  assert.equal(activateWindow(null), false)
  assert.equal(activateWindow({ isDestroyed: () => true }), false)
})

test('reports protocol registration failure without crashing startup', () => {
  assert.deepEqual(attemptProtocolRegistration(() => true), {
    ok: true,
    error: null,
  })
  assert.deepEqual(attemptProtocolRegistration(() => false), {
    ok: false,
    error: null,
  })

  const failure = new Error('LaunchServices unavailable')
  assert.deepEqual(attemptProtocolRegistration(() => {
    throw failure
  }), {
    ok: false,
    error: failure,
  })
})
