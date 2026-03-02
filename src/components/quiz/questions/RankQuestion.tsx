'use client'

import type { RankConfig } from '@/types'

interface Props {
  config:   RankConfig
  value:    number | null
  onChange: (v: number) => void
  disabled?: boolean
}

export default function RankQuestion({ config, value, onChange, disabled }: Props) {
  const options = Array.from(
    { length: config.max - config.min + 1 },
    (_, i) => config.min + i
  )

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className={`w-11 h-11 rounded-lg border-2 font-semibold text-sm transition-colors
            ${value === n
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-gray-200 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50'
            }
            disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
