import { describe, it, expect } from 'vitest'
import { formatBytes } from './formatBytes.js'

describe('formatBytes', () => {
  it('returns placeholder for falsy input', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(undefined)).toBe('—')
    expect(formatBytes(null)).toBe('—')
  })

  it('formats bytes below 1024 as B', () => {
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats the 1024-byte boundary as KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 KB')
  })

  it('formats the 1MB boundary as MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB')
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.50 MB')
  })
})
