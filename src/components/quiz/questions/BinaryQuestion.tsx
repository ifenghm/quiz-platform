'use client'

import type { BinaryConfig } from '@/types'

interface Props {
  config:   BinaryConfig
  value:    boolean | null
  onChange: (v: boolean) => void
  disabled?: boolean
}

export default function BinaryQuestion({ config, value, onChange, disabled }: Props) {
  return (
    <div className="flex gap-3">
      {[
        { label: config.trueLabel,  val: true  },
        { label: config.falseLabel, val: false },
      ].map(({ label, val }) => (
        <button
          key={String(val)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(val)}
          className={`flex-1 py-3 rounded-lg border-2 font-medium text-sm transition-colors
            ${value === val
              ? 'border-brand-600 bg-brand-50 text-brand-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50'
            }
            disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
