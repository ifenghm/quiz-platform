'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type {
  Quiz, Question, QuizDraft, QuestionDraft, QuestionType, AnswerValue,
  BinaryConfig, RankConfig, ScaleConfig, StringConfig, MultiChoiceConfig,
} from '@/types'

const DEFAULT_CONFIG: Record<QuestionType, object> = {
  binary:      { trueLabel: 'Yes', falseLabel: 'No' }                           as BinaryConfig,
  rank:        { min: 1, max: 5 }                                                as RankConfig,
  scale:       { min: 0, max: 10, step: 0.5, minLabel: 'Low', maxLabel: 'High' } as ScaleConfig,
  string:      { multiline: false, maxLength: 500 }                              as StringConfig,
  multichoice: { subtype: 'multichoicesor', choices: ['Option 1', 'Option 2'] }  as MultiChoiceConfig,
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
    title:                   existingQuiz?.title                   ?? '',
    description:             existingQuiz?.description             ?? '',
    read_access:             existingQuiz?.read_access             ?? 'public',
    write_access:            existingQuiz?.write_access            ?? 'creator_only',
    analyze_access:          existingQuiz?.analyze_access          ?? 'creator_only',
    open_at:                 existingQuiz?.open_at                 ?? '',
    close_at:                existingQuiz?.close_at                ?? '',
    reveal_correct_answers:  existingQuiz?.reveal_correct_answers  ?? false,
    user_can_change_answers: existingQuiz?.user_can_change_answers ?? true,
  })

  const [questions, setQuestions] = useState<QuestionDraft[]>(
    existingQuestions?.map(q => ({
      id:             q.id,
      question_text:  q.question_text,
      question_type:  q.question_type,
      order_index:    q.order_index,
      config:         q.config,
      correct_answer: q.correct_answer ?? null,
      image_url:      q.image_url ?? null,
    })) ?? []
  )

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function addQuestion(type: QuestionType) {
    setQuestions(prev => [
      ...prev,
      {
        question_text:  '',
        question_type:  type,
        order_index:    prev.length,
        config:         DEFAULT_CONFIG[type] as QuizDraft['questions'][0]['config'],
        correct_answer: null,
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
          title:                   meta.title,
          description:             meta.description || null,
          read_access:             meta.read_access,
          write_access:            meta.write_access,
          analyze_access:          meta.analyze_access,
          open_at:                 meta.open_at  || null,
          close_at:                meta.close_at || null,
          reveal_correct_answers:  meta.reveal_correct_answers,
          user_can_change_answers: meta.user_can_change_answers,
        })
        .eq('id', quizId!)
      if (uErr) { setError(uErr.message); setLoading(false); return }
    } else {
      const { data, error: iErr } = await supabase
        .from('quizzes')
        .insert({
          title:                   meta.title,
          description:             meta.description || null,
          creator_id:              userId,
          read_access:             meta.read_access,
          write_access:            meta.write_access,
          analyze_access:          meta.analyze_access,
          open_at:                 meta.open_at  || null,
          close_at:                meta.close_at || null,
          reveal_correct_answers:  meta.reveal_correct_answers,
          user_can_change_answers: meta.user_can_change_answers,
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
          quiz_id:        quizId!,
          question_text:  q.question_text,
          question_type:  q.question_type,
          order_index:    i,
          config:         q.config,
          correct_answer: q.correct_answer ?? null,
          image_url:      q.image_url ?? null,
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

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded"
            checked={meta.reveal_correct_answers}
            onChange={e => setMeta(m => ({ ...m, reveal_correct_answers: e.target.checked }))}
          />
          <span className="text-sm text-gray-700">Reveal correct answers after submission</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded"
            checked={meta.user_can_change_answers}
            onChange={e => setMeta(m => ({ ...m, user_can_change_answers: e.target.checked }))}
          />
          <span className="text-sm text-gray-700">Allow respondents to change their answers</span>
        </label>
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
          {(['binary', 'rank', 'scale', 'string', 'multichoice'] as QuestionType[]).map(t => (
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
  const supabase = createClient()
  const cfg = q.config as unknown as Record<string, unknown>
  const [correctEnabled, setCorrectEnabled] = useState(q.correct_answer != null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`

    const { error } = await supabase.storage.from('question-images').upload(path, file)
    if (error) {
      setUploadError(error.message)
    } else {
      const { data } = supabase.storage.from('question-images').getPublicUrl(path)
      onChange({ image_url: data.publicUrl })
    }
    setUploading(false)
  }

  async function handleImageRemove() {
    if (!q.image_url) return
    // Extract the storage path from the public URL
    const storagePath = q.image_url.split('/question-images/')[1]
    if (storagePath) {
      await supabase.storage.from('question-images').remove([storagePath])
    }
    onChange({ image_url: null })
  }

  function toggleCorrect(enabled: boolean) {
    setCorrectEnabled(enabled)
    if (!enabled) onChange({ correct_answer: null })
  }

  function setCorrectAnswer(val: AnswerValue) {
    onChange({ correct_answer: val })
  }

  // Determine current correct answer value with sensible defaults
  const correctVal = q.correct_answer

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

      {/* Image attachment */}
      <div>
        {q.image_url ? (
          <div className="relative inline-block">
            <img src={q.image_url} alt="" className="max-h-48 rounded-lg border border-gray-200 object-contain" />
            <button
              type="button"
              onClick={handleImageRemove}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600"
            >✕</button>
          </div>
        ) : (
          <label className={`inline-flex items-center gap-1.5 text-xs cursor-pointer text-gray-400 hover:text-brand-600 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            {uploading ? 'Uploading…' : '+ Add image'}
          </label>
        )}
        {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
      </div>

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

      {q.question_type === 'multichoice' && (
        <div className="space-y-3">
          <div>
            <label className="label text-xs">Selection type</label>
            <select
              className="input text-xs"
              value={String(cfg.subtype ?? 'multichoicesor')}
              onChange={e => onConfigChange('subtype', e.target.value)}
            >
              <option value="multichoicesor">Single choice (pick one)</option>
              <option value="multiplechoicesand">Multi-select (pick all that apply)</option>
            </select>
          </div>
          <div>
            <label className="label text-xs">Choices</label>
            <div className="space-y-2">
              {(cfg.choices as string[] ?? []).map((choice: string, ci: number) => (
                <div key={ci} className="flex gap-2">
                  <input
                    className="input text-xs flex-1"
                    value={choice}
                    onChange={e => {
                      const next = [...(cfg.choices as string[])]
                      next[ci] = e.target.value
                      onConfigChange('choices', next)
                    }}
                    placeholder={`Option ${ci + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => onConfigChange('choices', (cfg.choices as string[]).filter((_: string, i: number) => i !== ci))}
                    className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30"
                    disabled={(cfg.choices as string[]).length <= 2}
                  >✕</button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onConfigChange('choices', [...(cfg.choices as string[] ?? []), ''])}
              className="btn-secondary text-xs py-1 mt-2"
            >
              + Add choice
            </button>
          </div>
        </div>
      )}

      {/* Correct answer section */}
      <div className="border-t pt-3 space-y-2">
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded"
            checked={correctEnabled}
            onChange={e => toggleCorrect(e.target.checked)}
          />
          Set correct answer
        </label>

        {correctEnabled && (
          <div className="pl-1">
            {q.question_type === 'binary' && (
              <div className="flex gap-2">
                {[true, false].map(val => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setCorrectAnswer(val)}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      correctVal === val
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                    }`}
                  >
                    {val ? String(cfg.trueLabel ?? 'True') : String(cfg.falseLabel ?? 'False')}
                  </button>
                ))}
              </div>
            )}

            {q.question_type === 'rank' && (
              <input
                className="input text-xs w-32"
                type="number"
                min={Number(cfg.min)}
                max={Number(cfg.max)}
                value={correctVal != null ? Number(correctVal) : ''}
                onChange={e => setCorrectAnswer(Number(e.target.value))}
                placeholder={`${cfg.min}–${cfg.max}`}
              />
            )}

            {q.question_type === 'scale' && (
              <input
                className="input text-xs w-32"
                type="number"
                min={Number(cfg.min)}
                max={Number(cfg.max)}
                step={Number(cfg.step ?? 1)}
                value={correctVal != null ? Number(correctVal) : ''}
                onChange={e => setCorrectAnswer(Number(e.target.value))}
                placeholder={`${cfg.min}–${cfg.max}`}
              />
            )}

            {q.question_type === 'string' && (
              <input
                className="input text-xs"
                value={correctVal != null ? String(correctVal) : ''}
                onChange={e => setCorrectAnswer(e.target.value)}
                placeholder="Correct answer text"
              />
            )}

            {q.question_type === 'multichoice' && String(cfg.subtype) === 'multichoicesor' && (
              <select
                className="input text-xs"
                value={correctVal != null ? String(correctVal) : ''}
                onChange={e => setCorrectAnswer(e.target.value)}
              >
                <option value="">— select correct choice —</option>
                {(cfg.choices as string[] ?? []).map((c: string, ci: number) => (
                  <option key={ci} value={c}>{c}</option>
                ))}
              </select>
            )}

            {q.question_type === 'multichoice' && String(cfg.subtype) === 'multiplechoicesand' && (
              <div className="space-y-1">
                {(cfg.choices as string[] ?? []).map((c: string, ci: number) => {
                  const selected = Array.isArray(correctVal) ? (correctVal as string[]).includes(c) : false
                  return (
                    <label key={ci} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected}
                        onChange={e => {
                          const prev = Array.isArray(correctVal) ? (correctVal as string[]) : []
                          setCorrectAnswer(
                            e.target.checked ? [...prev, c] : prev.filter(x => x !== c)
                          )
                        }}
                      />
                      {c}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
