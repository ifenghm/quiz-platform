'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { QuestionAnalytics } from '@/types'

const PIE_COLORS = ['#4c6ef5', '#f03e3e']

interface Props {
  analytics:      QuestionAnalytics[]
  totalResponses: number
}

export default function QuizAnalytics({ analytics, totalResponses }: Props) {
  if (analytics.length === 0) {
    return (
      <div className="card text-center py-16 text-gray-400">
        No questions in this quiz yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex gap-4">
        <div className="card flex-1 text-center">
          <p className="text-3xl font-bold text-brand-600">{totalResponses}</p>
          <p className="text-sm text-gray-500 mt-1">Total Respondents</p>
        </div>
        <div className="card flex-1 text-center">
          <p className="text-3xl font-bold text-brand-600">{analytics.length}</p>
          <p className="text-sm text-gray-500 mt-1">Questions</p>
        </div>
      </div>

      {/* Per-question */}
      {analytics.map((qa, idx) => (
        <div key={qa.question.id} className="card">
          <div className="flex items-start justify-between mb-4">
            <h3 className="font-semibold text-gray-800 flex-1">
              <span className="text-brand-600 mr-2">{idx + 1}.</span>
              {qa.question.question_text}
            </h3>
            <div className="flex gap-2 items-center shrink-0 ml-4">
              <span className="badge bg-brand-100 text-brand-700 capitalize">
                {qa.question.question_type}
              </span>
              <span className="text-xs text-gray-400">
                {qa.total} response{qa.total !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {qa.total === 0 && (
            <p className="text-sm text-gray-400">No responses yet.</p>
          )}

          {/* BINARY — pie chart */}
          {qa.question.question_type === 'binary' && qa.total > 0 && (
            <div className="flex items-center gap-8">
              <PieChart width={160} height={160}>
                <Pie
                  data={[
                    { name: 'True',  value: qa.trueCount  ?? 0 },
                    { name: 'False', value: qa.falseCount ?? 0 },
                  ]}
                  cx={75} cy={75} outerRadius={65} dataKey="value"
                >
                  <Cell fill={PIE_COLORS[0]} />
                  <Cell fill={PIE_COLORS[1]} />
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="inline-block w-3 h-3 rounded-full bg-brand-500 mr-2" />
                  True: <strong>{qa.trueCount}</strong> ({pct(qa.trueCount!, qa.total)}%)
                </p>
                <p>
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2" />
                  False: <strong>{qa.falseCount}</strong> ({pct(qa.falseCount!, qa.total)}%)
                </p>
              </div>
            </div>
          )}

          {/* RANK / SCALE — bar chart */}
          {(qa.question.question_type === 'rank' || qa.question.question_type === 'scale')
            && qa.total > 0 && qa.distribution && (
            <div>
              {qa.mean !== undefined && (
                <p className="text-sm text-gray-500 mb-3">
                  Mean: <strong className="text-gray-800">{qa.mean.toFixed(2)}</strong>
                </p>
              )}
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={qa.distribution} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4c6ef5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* STRING — list */}
          {qa.question.question_type === 'string' && qa.total > 0 && qa.strings && (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {qa.strings.map((s, i) => (
                <li key={i}
                  className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

function pct(n: number, total: number) {
  if (total === 0) return 0
  return Math.round((n / total) * 100)
}
