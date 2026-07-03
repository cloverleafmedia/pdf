import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'

export default function PasswordModal() {
  const { t } = useTranslation()
  const { theme, closePassword, passwordCb } = useStore()
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef(null)
  const isDark = theme === 'dark'

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  const submit = async () => {
    if (!pwd) return
    try {
      await passwordCb?.(pwd)
      closePassword()
    } catch (e) {
      setError(true)
      setPwd('')
      inputRef.current?.focus()
    }
  }

  return (
    <Modal isDark={isDark} onClose={closePassword} title={t('password.title')}>
      <div className="p-5 flex flex-col items-center gap-4">
        <Lock size={36} className={isDark ? 'text-clover-400' : 'text-clover-600'} />
        <p className={`text-sm text-center ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
          {t('error.passwordRequired')}
        </p>
        <input
          ref={inputRef}
          type="password"
          placeholder={t('password.placeholder')}
          value={pwd}
          onChange={e => { setPwd(e.target.value); setError(false) }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          className={`w-full px-3 py-2 rounded-lg border text-sm
            ${error ? 'border-red-500' : isDark ? 'border-zinc-700' : 'border-gray-300'}
            ${isDark ? 'bg-zinc-800 text-zinc-100 placeholder-zinc-600' : 'bg-white text-gray-900 placeholder-gray-400'}
            focus:outline-none focus:border-clover-500`}
        />
        {error && <p className="text-red-400 text-xs">{t('error.wrongPassword')}</p>}
      </div>
      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closePassword}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          {t('password.cancel')}
        </button>
        <button onClick={submit}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white">
          {t('password.ok')}
        </button>
      </div>
    </Modal>
  )
}
