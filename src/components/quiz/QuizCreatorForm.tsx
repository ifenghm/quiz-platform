'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type {
  Quiz, Question, QuizDraft, QuestionDraft, QuestionType,
  BinaryConfig, RankConfig, ScaleConfig, StringConfig,
} from '@/types'

const DEFAULT_CONFIG: Record<QuestionType, object> = {
  binary: { trueLabel: 'Yes', falseLabel: 'No' } as BinaryConfig,
  rank:   { min: 1, max: 5 }                    as RankConfig,
  scale:  { min: 0, max: 10, step: 0.5, minLabel: 'Low', maxLabel: 'High' } as ScaleConfig,
  string: { multiline: false, maxLength: 500 }   as StringConfig,
}

interface Props {
  userId:            string
  existingQuiz?:     Quiz
  existingQuestions?: Question[]
}

export default function QuizCreatorForm({ userId, existingQuiz, existingQuestions }: Props) {
  const supabase = createClient()
  const router   = useRouter()
  const isEdit   = !!existingQuiz

  const [meta, setMeta] = useState<Omit<QuizDraft, 'questions'>>({
    title:          existingQuiz?.title          ?? '',
    description:    existingQuiz?.description    ?? '',
    read_access:    existingQuiz?.read_access    ?? 'public',
    write_access:   existingQuiz?.write_access   ?? 'creator_only',
    analyze_access: existingQuiz?.analyze_access ?? 'creator_only',
    open_at:        existingQuiz?.open_at        ?? '',
    close_at:       existingQuiz?.close_at       ?? '',
  })

  const [questions, setQuestions] = useState<QuestionDraft[]>(
    existingQuestions?.map(q => ({
      id:            q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      order_index:   q.order_index,
      config:        q.config,
    })) ?? []
  )

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function addQuestion(type: QuestionType) {
    setQuestions(prev => [
      ...prev,
      {
        question_text: '',
        question_type: type,
        order_index:   prev.length,
        config:        DEFAULT_CONFIG[type] as QuizDraft['questions'][0]['config'],
      },
    ])
  }

  function updateQuestion(idx: number, patch: Partial<QuestionDraft>) {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q))
  }

  function updateConfig(idx: number, key: string, val: unknown) {
    setQuestions(prev =>
      prev.map((q, i) =>
        i === idx ? { ...q, config: { ...q.config, [key]: val } } : q
      )
    )
  }

  function removeQuestion(idx: number) {
    setQuestions(prev =>
      prev.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order_index: i }))
    )
  }

  function moveQuestion(idx: number, dir: -1 | 1) {
    const next = idx + dir
    if (next < 0 || next >= questions.length) return
    setQuestions(prev => {
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr.map((q, i) => ({ ...q, order_index: i }))
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!meta.title.trim()) { setError('Title is required.'); return }
    if (questions.some(q => !q.question_text.trim())) {
      setError('All questions must have text.')
      return
    }

    setLoading(true)
    setError(null)

    let quizId = existingQuiz?.id

    if (isEdit) {
      const { error: uErr } = await supabase
        .from('quizzes')
        .update({
          title:          meta.title,
          description:    meta.description || null,
          read_access:    meta.read_access,
          write_access:   meta.write_access,
          analyze_access: meta.analyze_access,
          open_at:        meta.open_at  || null,
          close_at:       meta.close_at || null,
        })
        .eq('id', quizId!)
      if (uErr) { setError(uErr.message); setLoading(false); return }
    } else {
      const { data, error: iErr } = await supabase
        .from('quizzes')
        .insert({
          title:          meta.title,
          description:    meta.description || null,
          creator_id:     userId,
          read_access:    meta.read_access,
          write_access:   meta.write_access,
          analyze_access: meta.analyze_access,
          open_at:        meta.open_at  || null,
          close_at:       meta.close_at || null,
        })
        .select('id')
        .single()
      if (iErr || !data) { setError(iErr?.message ?? 'Failed to create quiz.'); setLoading(false); return }
      quizId = data.id
    }

    // Sync questions: delete all existing, re-insert in order
    if (isEdit) {
      await supabase.from('questions').delete().eq('quiz_id', quizId!)
    }

    if (questions.length > 0) {
      const { error: qErr } = await supabase.from('questions').insert(
        questions.map((q, i) => ({
          quiz_id:       quizId!,
          question_text: q.question_text,
          question_type: q.question_type,
          order_index:   i,
          config:        q.config,
        }))
      )
      if (qErr) { setError(qErr.message); setLoading(false); return }
    }

    setLoading(false)
    router.push(`/quizzes/${quizId}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Quiz meta */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-800">Quiz Details</h2>

        <div>
          <label className="label">Title *</label>
          <input className="input" value={meta.title}
            onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
            placeholder="My awesome quiz" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input resize-none" rows={2}
            value={meta.description}
            onChange={e => setMeta(m => ({ ...m, description: e.target.value }))}
            placeholder="Optional description" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Read access</label>
            <select className="input" value={meta.read_access}
              onChange={e => setMeta(m => ({ ...m, read_access: e.target.value as QuizDraft['read_access'] }))}>
              <option value="public">Public</option>
              <option value="restricted">Restricted</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div>
            <label className="label">Write access</label>
            <select className="input" value={meta.write_access}
              onChange={e => setMeta(m => ({ ...m, write_access: e.target.value as QuizDraft['write_access'] }))}>
              <option value="creator_only">Creator only</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
          <div>
            <label className="label">Analyze access</label>
            <select className="input" value={meta.analyze_access}
              onChange={e => setMeta(m => ({ ...m, analyze_access: e.target.value as QuizDraft['analyze_access'] }))}>
              <option value="creator_only">Creator only</option>
              <option value="restricted">Restricted</option>
              <option value="public">Public</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Opens at (optional)</label>
            <input className="input" type="datetime-local" value={meta.open_at}
              onChange={e => setMeta(m => ({ ...m, open_at: e.target.value }))} />
          </div>
          <div>
            <label className="label">Closes at (optional)</label>
            <input className="input" type="datetime-local" value={meta.close_at}
              onChange={e => setMeta(m => ({ ...m, close_at: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-800">Questions ({questions.length})</h2>

        {questions.map((q, idx) => (
          <QuestionEditor
            key={idx}
            idx={idx}
            total={questions.length}
            q={q}
            onChange={patch  => updateQuestion(idx, patch)}
            onConfigChange={(k, v) => updateConfig(idx, k, v)}
            onRemove={() => removeQuestion(idx)}
            onMove={dir => moveQuestion(idx, dir)}
          />
        ))}

        {/* Add question buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="text-xs text-gray-400 self-center mr-1">Add question:</span>
          {(['binary', 'rank', 'scale', 'string'] as QuestionType[]).map(t => (
            <button key={t} type="button" onClick={() => addQuestion(t)}
              className="btn-secondary text-xs py-1.5">
              + {t}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
        {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Quiz'}
      </button>
    </form>
  )
}

// ─── Inline question editor ───────────────────────────────────────────────────
function QuestionEditor({
  idx, total, q, onChange, onConfigChange, onRemove, onMove,
}: Readonly<{
  idx:            number
  total:          number
  q:              QuestionDraft
  onChange:       (p: Partial<QuestionDraft>) => void
  onConfigChange: (k: string, v: unknown) => void
  onRemove:       () => void
  onMove:         (d: -1 | 1) => void
}>) {
  const cfg = q.config as unknown as Record<string, unknown>

  return (
    <div className="card border-l-4 border-brand-400 space-y-3">
      {/* Row: index, type badge, move, remove */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-brand-600 w-5">{idx + 1}</span>
        <span className="badge bg-brand-100 text-brand-700 capitalize">{q.question_type}</span>
        <div className="ml-auto flex gap-1">
          <button type="button" disabled={idx === 0} onClick={() => onMove(-1)}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">↑</button>
          <button type="button" disabled={idx === total - 1} onClick={() => onMove(1)}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">↓</button>
          <button type="button" onClick={onRemove}
            className="p-1 text-red-400 hover:text-red-600">✕</button>
        </div>
      </div>

      {/* Question text */}
      <input
        className="input text-sm"
        value={q.question_text}
        onChange={e => onChange({ question_text: e.target.value })}
        placeholder="Question text…"
      />

      {/* Config section */}
      {q.question_type === 'binary' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label text-xs">True label</label>
            <input className="input text-xs" value={String(cfg.trueLabel ?? '')}
              onChange={e => onConfigChange('trueLabel', e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">False label</label>
            <input className="input text-xs" value={String(cfg.falseLabel ?? '')}
              onChange={e => onConfigChange('falseLabel', e.target.value)} />
          </div>
        </div>
      )}

      {q.question_type === 'rank' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label text-xs">Min</label>
            <input className="input text-xs" type="number" value={Number(cfg.min)}
              onChange={e => onConfigChange('min', Number(e.target.value))} />
          </div>
          <div>
            <label className="label text-xs">Max</label>
            <input className="input text-xs" type="number" value={Number(cfg.max)}
              onChange={e => onConfigChange('max', Number(e.target.value))} />
          </div>
        </div>
      )}

      {q.question_type === 'scale' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['min', 'Min', 'number'], ['max', 'Max', 'number'],
            ['minLabel', 'Min label', 'text'], ['maxLabel', 'Max label', 'text'],
          ].map(([k, label, type]) => (
            <div key={k}>
              <label className="label text-xs">{label}</label>
              <input className="input text-xs" type={type}
                value={String(cfg[k] ?? '')}
                onChange={e => onConfigChange(k, type === 'number' ? Number(e.target.value) : e.target.value)} />
            </div>
          ))}
        </div>
      )}

      {q.question_type === 'string' && (
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={Boolean(cfg.multiline)}
              onChange={e => onConfigChange('multiline', e.target.checked)}
              className="rounded" />
            Multi-line
          </label>
          <div className="flex items-center gap-2">
            <label className="label text-xs mb-0">Max length</label>
            <input className="input text-xs w-24" type="number"
              value={Number(cfg.maxLength ?? 500)}
              onChange={e => onConfigChange('maxLength', Number(e.target.value))} />
          </div>
        </div>
      )}
    </div>
  )
}
