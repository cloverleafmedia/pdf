import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './de.json'
import en from './en.json'
import es from './es.json'
import it from './it.json'
import zh from './zh.json'
import pl from './pl.json'
import ja from './ja.json'

i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
    es: { translation: es },
    it: { translation: it },
    zh: { translation: zh },
    pl: { translation: pl },
    ja: { translation: ja },
  },
  lng: 'de',
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
})

export default i18n
