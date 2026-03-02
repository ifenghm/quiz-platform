'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { QuizPermission, PermissionType } from '@/types'

interface Props {
  quizId:             string
  currentPermissions: QuizPermission[]
}

const PERMISSION_LABELS: Record<PermissionType, string> = {
  read:    'Take (read)',
  write:   'Edit (write)',
  analyze: 'Analyze',
}

export default function PermissionsEditor({ quizId, currentPermissions }: Props) {
  const supabase = createClient()

  const [perms,   setPerms]   = useState<QuizPermission[]>(currentPermissions)
  const [email,   setEmail]   = useState('')
  const [permType, setPermType] = useState<PermissionType>('read')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function grant(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Look up user by email
    const { data: userRow } = await supabase
      .from('user_accounts')
      .select('id, email, username')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (!userRow) {
      setError(`No account found for ${email}`)
      setLoading(false)
      return
    }

    const { data, error: iErr } = await supabase
      .from('quiz_permissions')
      .insert({ quiz_id: quizId, user_id: userRow.id, permission: permType })
      .select('*, user:user_accounts(id, email, username)')
      .single()

    if (iErr) {
      setError(iErr.code === '23505' ? 'That permission already exists.' : iErr.message)
      setLoading(false)
      return
    }

    setPerms(prev => [...prev, data as QuizPermission])
    setEmail('')
    setLoading(false)
  }

  async function revoke(permId: string) {
    const { error } = await supabase
      .from('quiz_permissions')
      .delete()
      .eq('id', permId)
    if (!error) {
      setPerms(prev => prev.filter(p => p.id !== permId))
    }
  }

  return (
    <div className="card space-y-4">
      {/* Grant form */}
      <form onSubmit={grant} className="flex gap-2 flex-wrap">
        <input
          className="input flex-1 min-w-[180px]"
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <select
          className="input w-40"
          value={permType}
          onChange={e => setPermType(e.target.value as PermissionType)}
        >
          {(Object.entries(PERMISSION_LABELS) as [PermissionType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Granting…' : 'Grant'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Permission list */}
      {perms.length === 0 ? (
        <p className="text-sm text-gray-400">No explicit permissions yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 font-medium">User</th>
              <th className="pb-2 font-medium">Permission</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {perms.map(p => (
              <tr key={p.id}>
                <td className="py-2 text-gray-700">
                  {p.user?.username ?? p.user?.email ?? p.user_id}
                </td>
                <td className="py-2">
                  <span className="badge bg-brand-100 text-brand-700">
                    {PERMISSION_LABELS[p.permission]}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => revoke(p.id)}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
