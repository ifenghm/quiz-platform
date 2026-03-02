import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import NavbarClient from './NavbarClient'

export default async function Navbar() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let username: string | null = null
  if (user) {
    const { data } = await supabase
      .from('user_accounts')
      .select('username, email')
      .eq('id', user.id)
      .single()
    username = data?.username ?? data?.email ?? null
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg text-brand-700 tracking-tight">
          Quiz<span className="text-gray-900">Platform</span>
        </Link>

        <nav className="flex items-center gap-4">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
            Explore
          </Link>
          {user ? (
            <>
              <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/quizzes/create" className="btn-primary text-sm py-1.5">
                + New Quiz
              </Link>
              <NavbarClient username={username} />
            </>
          ) : (
            <>
              <Link href="/auth/login"    className="btn-secondary text-sm py-1.5">Sign in</Link>
              <Link href="/auth/register" className="btn-primary  text-sm py-1.5">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
