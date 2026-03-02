'use client'

import type { MultiChoiceConfig } from '@/types'

interface Props {
  config:    MultiChoiceConfig
  value:     string | string[] | null
  onChange:  (v: string | string[]) => void
  disabled?: boolean
}

export default function MultiChoiceQuestion({ config, value, onChange, disabled }: Props) {
  const isMulti = config.subtype === 'multiplechoicesand'

  function handleClick(choice: string) {
    if (!isMulti) {
      onChange(choice)
      return
    }
    const current = Array.isArray(value) ? value : []
    onChange(
      current.includes(choice)
        ? current.filter(c => c !== choice)
        : [...current, choice]
    )
  }

  function isSelected(choice: string) {
    if (!isMulti) return value === choice
    return Array.isArray(value) && value.includes(choice)
  }

  return (
    <div className="space-y-2">
      {config.choices.map(choice => {
        const selected = isSelected(choice)
        return (
          <button
            key={choice}
            type="button"
            disabled={disabled}
            onClick={() => handleClick(choice)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-sm font-medium text-left transition-colors
              ${selected
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50'
              }
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {/* Radio / checkbox indicator */}
            <span className={`shrink-0 flex items-center justify-center w-4 h-4 border-2
              ${isMulti ? 'rounded' : 'rounded-full'}
              ${selected ? 'border-brand-600 bg-brand-600' : 'border-gray-300 bg-white'}`}
            >
              {selected && (
                <span className="text-white leading-none" style={{ fontSize: '10px' }}>
                  {isMulti ? '✓' : '●'}
                </span>
              )}
            </span>
            {choice}
          </button>
        )
      })}
      {isMulti && (
        <p className="text-xs text-gray-400 pt-1">Select all that apply</p>
      )}
    </div>
  )
}
