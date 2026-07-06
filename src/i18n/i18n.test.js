import { describe, it, expect } from 'vitest'
import de from './de.json'
import en from './en.json'
import es from './es.json'
import itLocale from './it.json'
import zh from './zh.json'
import pl from './pl.json'
import ja from './ja.json'
import fr from './fr.json'
import pt from './pt.json'
import ru from './ru.json'
import ko from './ko.json'
import tr from './tr.json'

function leafKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' && !Array.isArray(v) ? leafKeys(v, path) : [path]
  }).sort()
}

const locales = { en, es, it: itLocale, zh, pl, ja, fr, pt, ru, ko, tr }
const deKeys = leafKeys(de)

describe('i18n locale key parity', () => {
  it('de.json has the expected number of leaf keys', () => {
    expect(deKeys.length).toBeGreaterThan(0)
  })

  for (const [code, resource] of Object.entries(locales)) {
    it(`${code}.json has exactly the same leaf keys as de.json`, () => {
      expect(leafKeys(resource)).toEqual(deKeys)
    })
  }
})
