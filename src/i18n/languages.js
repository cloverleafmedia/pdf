// Shared source of truth for selectable UI languages, used by both the
// StatusBar dropdown and the Settings modal so the two pickers can't drift.
export const LANGUAGES = [
  { id: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { id: 'en', flag: '🇬🇧', name: 'English' },
  { id: 'es', flag: '🇪🇸', name: 'Español' },
  { id: 'it', flag: '🇮🇹', name: 'Italiano' },
  { id: 'zh', flag: '🇨🇳', name: '中文' },
  { id: 'pl', flag: '🇵🇱', name: 'Polski' },
  { id: 'ja', flag: '🇯🇵', name: '日本語' },
  { id: 'fr', flag: '🇫🇷', name: 'Français' },
  { id: 'pt', flag: '🇵🇹', name: 'Português' },
  { id: 'ru', flag: '🇷🇺', name: 'Русский' },
  { id: 'ko', flag: '🇰🇷', name: '한국어' },
  { id: 'tr', flag: '🇹🇷', name: 'Türkçe' },
]

// Maps an OS locale string (e.g. Electron's app.getLocale(), "de-DE"/"zh-CN"/
// "pt-BR") to one of our supported language codes by primary subtag only -
// region variants of a supported language (any "zh-*") all map to our single
// "zh" file, and anything we don't ship a translation for falls back to
// English rather than German, since German is just this app's development
// default, not a sensible universal fallback for an unrecognized locale.
export function matchSystemLocale(locale) {
  if (!locale) return 'en'
  const primary = locale.split(/[-_]/)[0].toLowerCase()
  return LANGUAGES.some(l => l.id === primary) ? primary : 'en'
}
