import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Moon, Sun, Monitor, Globe, Sliders, Shield } from 'lucide-react'
import { useStore } from '../../store/useStore'

export default function SettingsModal() {
  const { t } = useTranslation()
  const { theme, language, defaultZoom, closeSettings, setTheme, setLanguage, setDefaultZoom } = useStore()
  const [localTheme, setLocalTheme]   = useState(theme)
  const [localLang,  setLocalLang]    = useState(language)
  const [localZoom,  setLocalZoom]    = useState(defaultZoom)
  const [tab, setTab] = useState('appearance')
  const isDark = theme === 'dark'

  const save = async () => {
    setTheme(localTheme)
    setLanguage(localLang)
    setDefaultZoom(localZoom)
    await window.api?.saveSettings({ theme: localTheme, language: localLang, defaultZoom: localZoom })
    closeSettings()
  }

  const tabs = [
    { id: 'appearance', label: t('settings.appearance'), icon: <Moon size={14}/> },
    { id: 'general',    label: t('settings.general'),    icon: <Sliders size={14}/> },
    { id: 'system',     label: t('settings.system'),     icon: <Shield size={14}/> },
  ]

  return (
    <Modal isDark={isDark} onClose={closeSettings} title={t('settings.title')}>
      <div className="flex h-80">
        {/* Tab list */}
        <div className={`w-36 border-r flex flex-col gap-0.5 p-2
          ${isDark ? 'border-zinc-700 bg-zinc-850' : 'border-gray-200 bg-gray-50'}`}>
          {tabs.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors
                ${tab === tb.id
                  ? isDark ? 'bg-clover-600/20 text-clover-400' : 'bg-clover-50 text-clover-700'
                  : isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-600 hover:bg-gray-100'
                }`}>
              {tb.icon} {tb.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'appearance' && (
            <div className="space-y-5">
              {/* Theme */}
              <Field label={t('settings.theme')} isDark={isDark}>
                <div className="flex gap-2">
                  {[
                    { id: 'dark',   icon: <Moon size={14}/>,    label: t('settings.themeDark') },
                    { id: 'light',  icon: <Sun size={14}/>,     label: t('settings.themeLight') },
                  ].map(opt => (
                    <button key={opt.id} onClick={() => setLocalTheme(opt.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors
                        ${localTheme === opt.id
                          ? 'border-clover-500 bg-clover-600 text-white'
                          : isDark ? 'border-zinc-700 text-zinc-300 hover:border-zinc-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}>
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Language */}
              <Field label={t('settings.language')} isDark={isDark}>
                <div className="flex gap-2">
                  {[
                    { id: 'de', label: '🇩🇪  Deutsch' },
                    { id: 'en', label: '🇬🇧  English' },
                  ].map(opt => (
                    <button key={opt.id} onClick={() => setLocalLang(opt.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors
                        ${localLang === opt.id
                          ? 'border-clover-500 bg-clover-600 text-white'
                          : isDark ? 'border-zinc-700 text-zinc-300 hover:border-zinc-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {tab === 'general' && (
            <div className="space-y-5">
              <Field label={t('settings.defaultZoom')} isDark={isDark}>
                <div className="flex items-center gap-2">
                  <input type="range" min={25} max={300} step={5} value={localZoom}
                    onChange={e => setLocalZoom(Number(e.target.value))}
                    className="flex-1 accent-clover-500" />
                  <span className={`w-12 text-sm text-right ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                    {localZoom}%
                  </span>
                </div>
              </Field>
            </div>
          )}

          {tab === 'system' && (
            <div className="space-y-5">
              <Field label={t('settings.defaultApp')} isDark={isDark}>
                <p className={`text-xs mb-3 leading-relaxed ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                  {t('settings.defaultAppHint')}
                </p>
                <button
                  onClick={() => window.api?.setAsDefault?.()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors">
                  <Shield size={14}/>
                  {t('settings.setAsDefault')}
                </button>
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeSettings}
          className={`px-4 py-1.5 rounded-lg text-sm transition-colors
            ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          {t('settings.cancel')}
        </button>
        <button onClick={save}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors">
          {t('settings.save')}
        </button>
      </div>
    </Modal>
  )
}

function Field({ label, children, isDark }) {
  return (
    <div>
      <div className={`text-xs font-medium mb-2 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{label}</div>
      {children}
    </div>
  )
}

export function Modal({ isDark, onClose, title, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`rounded-xl shadow-2xl w-full max-w-lg overflow-hidden
        ${isDark ? 'bg-zinc-900 border border-zinc-700' : 'bg-white border border-gray-200'}`}>
        <div className={`flex items-center justify-between px-5 py-3.5 border-b
          ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
          <span className={`font-semibold text-sm ${isDark ? 'text-zinc-100' : 'text-gray-800'}`}>{title}</span>
          <button onClick={onClose}
            className={`p-1 rounded transition-colors ${isDark ? 'text-zinc-500 hover:bg-zinc-700' : 'text-gray-400 hover:bg-gray-100'}`}>
            <X size={16}/>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
