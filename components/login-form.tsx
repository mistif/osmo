"use client"

import { type FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const signingUp = mode === "signUp"

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const { data, error } = signingUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // With email confirmation on, sign-up returns no session until the link is clicked.
    if (!data.session) {
      setNotice("Check your email for a confirmation link, then sign in.")
      setMode("signIn")
      return
    }
    router.push("/assistant")
  }

  function switchMode() {
    setMode(signingUp ? "signIn" : "signUp")
    setError(null)
    setNotice(null)
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{signingUp ? "Create an account" : "Sign in"}</CardTitle>
          <CardDescription>
            {signingUp
              ? "Osmo will remember your conversations under this account."
              : "Sign in to pick up where you left off with Osmo."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete={signingUp ? "new-password" : "current-password"}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="text-sm text-emerald-700">
                  {notice}
                </p>
              )}
              <Field>
                <Button type="submit" disabled={busy}>
                  {busy
                    ? signingUp
                      ? "Creating account…"
                      : "Signing in…"
                    : signingUp
                      ? "Create account"
                      : "Sign in"}
                </Button>
                <FieldDescription className="text-center">
                  {signingUp ? "Already have an account? " : "New here? "}
                  <button
                    type="button"
                    onClick={switchMode}
                    className="underline underline-offset-4"
                  >
                    {signingUp ? "Sign in" : "Create an account"}
                  </button>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
