'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
  extractDeepLink,
  isRendererUrl,
  isResQDeepLink,
  isSafeExternalUrl,
} = require('./url-policy.cjs')

test('accepts only ResQ deep links', () => {
  assert.equal(isResQDeepLink('resq://auth/callback?code=abc'), true)
  assert.equal(isResQDeepLink('resq://integration/callback?integration=google'), true)
  assert.equal(isResQDeepLink('resq://other/callback?code=abc'), false)
  assert.equal(isResQDeepLink('resq://auth/callback-elsewhere?code=abc'), false)
  assert.equal(isResQDeepLink('resq://auth@evil.example/callback?code=abc'), false)
  assert.equal(isResQDeepLink('https://example.com'), false)
  assert.equal(isResQDeepLink('not a URL'), false)
})

test('accepts only the bundled renderer origin', () => {
  assert.equal(isRendererUrl('resq-app://app/'), true)
  assert.equal(isRendererUrl('resq-app://app/plan'), true)
  assert.equal(isRendererUrl('resq-app://app.evil.example/plan'), false)
  assert.equal(isRendererUrl('resq-app://app@evil.example/plan'), false)
  assert.equal(isRendererUrl('https://app/plan'), false)
})

test('extracts a ResQ deep link from process arguments', () => {
  assert.equal(
    extractDeepLink(['/Applications/ResQ.app', '--flag', 'resq://auth/callback?code=abc']),
    'resq://auth/callback?code=abc',
  )
  assert.equal(extractDeepLink(['ResQ.exe', 'https://example.com']), null)
})

test('allows browser-safe external links and rejects local schemes', () => {
  assert.equal(isSafeExternalUrl('https://supabase.com'), true)
  assert.equal(isSafeExternalUrl('http://localhost:5173'), true)
  assert.equal(isSafeExternalUrl('http://example.com'), false)
  assert.equal(isSafeExternalUrl('mailto:support@example.com'), true)
  assert.equal(isSafeExternalUrl('file:///etc/passwd'), false)
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false)
  assert.equal(isSafeExternalUrl('resq://auth/callback'), false)
})
