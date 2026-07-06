import React from 'react'

// Shared preset-angle button row used by StampModal and WatermarkModal for
// their cosmetic overlay rotation (not BatchModal's absolute page rotation,
// which is a different semantic concept with its own styling).
export default function RotationPresetButtons({ options, value, onChange, isDark }) {
  return (
    <div className="flex gap-2">
      {options.map(opt => (
        <button key={opt.v} onClick={() => onChange(opt.v)}
          className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors
            ${value === opt.v
              ? 'bg-clover-600 text-white border-clover-600'
              : isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          {opt.l}
        </button>
      ))}
    </div>
  )
}
