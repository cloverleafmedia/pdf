import { describe, it, expect } from 'vitest'
import { dedupeFilename } from './dedupeFilename.js'

describe('dedupeFilename', () => {
  it('returns the base name unchanged for the first occurrence', () => {
    const used = new Map()
    const result = dedupeFilename(used, 'Max Mustermann')
    expect(result).toEqual({ name: 'Max Mustermann', wasDuplicate: false })
  })

  it('appends a numeric suffix from the second occurrence onward', () => {
    const used = new Map()
    dedupeFilename(used, 'Max Mustermann')
    const second = dedupeFilename(used, 'Max Mustermann')
    const third  = dedupeFilename(used, 'Max Mustermann')
    expect(second).toEqual({ name: 'Max Mustermann_2', wasDuplicate: true })
    expect(third).toEqual({ name: 'Max Mustermann_3', wasDuplicate: true })
  })

  it('tracks distinct base names independently', () => {
    const used = new Map()
    dedupeFilename(used, 'Alice')
    const bob = dedupeFilename(used, 'Bob')
    expect(bob).toEqual({ name: 'Bob', wasDuplicate: false })
  })
})
