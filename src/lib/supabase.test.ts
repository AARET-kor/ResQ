import { describe, it, expect } from 'vitest'
import { supabase } from './supabase'

describe('supabase client', () => {
  it('exposes an auth API', () => {
    expect(supabase).toBeDefined()
    expect(typeof supabase.auth.signInWithOAuth).toBe('function')
  })
})
