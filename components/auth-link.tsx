"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { navigationMenuTriggerStyle } from "@/components/ui/navigation-menu"
import { supabase } from "@/lib/supabase"

// "Sign in" when signed out; the account's email and "Sign out" when signed in.
export function AuthLink() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Still checking: render nothing rather than flash the wrong link.
  if (email === undefined) return null

  if (email === null) {
    return (
      <Link href="/login" className={navigationMenuTriggerStyle()}>
        Sign in
      </Link>
    )
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
      <button type="button" onClick={signOut} className={navigationMenuTriggerStyle()}>
        Sign out
      </button>
    </div>
  )
}
