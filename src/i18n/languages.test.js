import { describe, it, expect } from 'vitest'
import { matchSystemLocale, LANGUAGES } from './languages.js'

describe('matchSystemLocale', () => {
  it('matches a plain supported language code', () => {
    expect(matchSystemLocale('de')).toBe('de')
  })

  it('matches by primary subtag, ignoring the region', () => {
    expect(matchSystemLocale('de-DE')).toBe('de')
    expect(matchSystemLocale('zh-CN')).toBe('zh')
    expect(matchSystemLocale('zh-TW')).toBe('zh')
    expect(matchSystemLocale('ja-JP')).toBe('ja')
    expect(matchSystemLocale('fr-FR')).toBe('fr')
    expect(matchSystemLocale('fr-CA')).toBe('fr')
    expect(matchSystemLocale('pt-BR')).toBe('pt')
    expect(matchSystemLocale('pt-PT')).toBe('pt')
    expect(matchSystemLocale('ru-RU')).toBe('ru')
    expect(matchSystemLocale('ko-KR')).toBe('ko')
    expect(matchSystemLocale('tr-TR')).toBe('tr')
  })

  it('is case-insensitive', () => {
    expect(matchSystemLocale('DE-de')).toBe('de')
  })

  it('handles underscore-separated locales too', () => {
    expect(matchSystemLocale('pl_PL')).toBe('pl')
  })

  it('falls back to English for an unsupported language, not German', () => {
    expect(matchSystemLocale('ar-SA')).toBe('en')
    expect(matchSystemLocale('th-TH')).toBe('en')
  })

  it('falls back to English when no locale is given', () => {
    expect(matchSystemLocale(undefined)).toBe('en')
    expect(matchSystemLocale('')).toBe('en')
  })

  it('every supported language id matches itself', () => {
    for (const lang of LANGUAGES) {
      expect(matchSystemLocale(lang.id)).toBe(lang.id)
    }
  })
})
