'use client'

import type { ScaleConfig } from '@/types'

interface Props {
  config:   ScaleConfig
  value:    number | null
  onChange: (v: number) => void
  disabled?: boolean
}

export default function ScaleQuestion({ config, value, onChange, disabled }: Props) {
  const pct = value !== null
    ? ((value - config.min) / (config.max - config.min)) * 100
    : null

  return (
    <div className="space-y-2">
      <input
        type="range"
        min={config.min}
        max={config.max}
        step={config.step}
        value={value ?? config.min}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
                   accent-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{config.minLabel || String(config.min)}</span>
        {value !== null && (
          <span className="font-semibold text-brand-600">
            {value} ({pct?.toFixed(0)}%)
          </span>
        )}
        <span>{config.maxLabel || String(config.max)}</span>
      </div>
    </div>
  )
}
