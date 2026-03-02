'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NavbarClient({ username }: { username: string | null }) {
  const [open, setOpen]   = useState(false)
  const supabase          = createClient()
  const router            = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900
                   border border-gray-300 rounded-full px-3 py-1 hover:bg-gray-50 transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700
                         flex items-center justify-center font-semibold text-xs">
          {(username?.[0] ?? '?').toUpperCase()}
        </span>
        <span className="hidden sm:inline max-w-[120px] truncate">{username ?? 'Me'}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200
                          rounded-xl shadow-lg py-1 w-44 text-sm">
            <button
              onClick={signOut}
              className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
