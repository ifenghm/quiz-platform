'use client'

import type { StringConfig } from '@/types'

interface Props {
  config:   StringConfig
  value:    string
  onChange: (v: string) => void
  disabled?: boolean
}

export default function StringQuestion({ config, value, onChange, disabled }: Props) {
  return config.multiline ? (
    <textarea
      className="input resize-none"
      rows={4}
      maxLength={config.maxLength}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      placeholder="Type your answer…"
    />
  ) : (
    <input
      className="input"
      type="text"
      maxLength={config.maxLength}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      placeholder="Type your answer…"
    />
  )
}
