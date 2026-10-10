import { errorCode, errorMessage } from "../../lib/errors"
import { useState, useEffect, useRef } from "react"
import { signInWithGoogle, signInWithEmailAndPassword } from "@/lib/auth"
import { browserClient } from "@/lib/supabase/client"
import { useNavigate } from "@/features/workshare/lib/navigation"
import { auth } from "../../lib/backend"
import { useAuth } from "../../contexts/auth"
import { Button } from "../ui/Button"
import { Input } from "../ui/Input"
import { Card } from "../ui/Card"
import { VSLogo } from "../ui/VSLogo"
import { Mail, ArrowLeft, CheckCircle2, KeyRound } from "lucide-react"

export function Login() {
  const [email, setEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [usePasswordFallback, setUsePasswordFallback] = useState(false)
  const [password, setPassword] = useState("")
  
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const otpInputRef = useRef<HTMLInputElement>(null)
  const { user, isAdmin, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user && !authLoading) {
      if (isAdmin) {
        navigate("/admin/families")
      } else {
        navigate("/")
      }
    }
  }, [user, isAdmin, authLoading, navigate])

  useEffect(() => {
    if (step === "code" && otpInputRef.current) {
      otpInputRef.current.focus()
    }
  }, [step])

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!email.trim()) return

    setError("")
    setSuccessMessage("")
    setLoading(true)

    try {
      const {error} = await browserClient().auth.signInWithOtp({email:email.trim()});
      if(error)throw error;
      setStep("code")
      setCountdown(60)
      setSuccessMessage(`We sent a 8-digit code to ${email.trim()}`)
    } catch (err: unknown) {
      console.error("OTP send error:", err)
      if (errorCode(err) === "functions/not-found" || errorCode(err) === "not-found") {
        setError("Email sign-in is temporarily unavailable. Please try again shortly.")
      } else {
        setError(errorMessage(err) || "Failed to send verification code. Please check your email.")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCode = otpCode.replace(/\D/g, "")
    if (cleanCode.length !== 8) {
      setError("Please enter all 8 digits of your verification code.")
      return
    }

    setError("")
    setLoading(true)

    try {
      const {error}=await browserClient().auth.verifyOtp({email:email.trim(),token:cleanCode,type:'email'});
      if(error)throw error;
    } catch (err: unknown) {
      console.error("OTP verify error:", err)
      setError(errorMessage(err) || "Invalid or expired code. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err: unknown) {
      setError(errorMessage(err) || "Failed to log in with password.")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleAdminLogin = async () => {
    setError("")
    setSuccessMessage("")
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (err: unknown) {
      console.error("Google sign in error:", err)
      if (errorCode(err) === "auth/operation-not-allowed" || errorCode(err) === "auth/configuration-not-found") {
        setError("Google sign-in is temporarily unavailable. Please use your email code.")
      } else if (errorCode(err) === "auth/unauthorized-domain") {
        setError("Google sign-in is unavailable on this address. Please use your email code.")
      } else if (errorCode(err) === "auth/popup-blocked") {
        setError("Sign-in popup was blocked by your browser. Please allow popups for this site and try again.")
      } else if (errorCode(err) === "auth/popup-closed-by-user") {
        setError("Sign-in window was closed. Please try again.")
      } else {
        setError(errorMessage(err) || "Google sign-in could not be completed.")
      }
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleOtpChange = (val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 8)
    setOtpCode(cleaned)
    setError("")
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Brand Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <VSLogo size="lg" showBadge={false} className="mb-2" />
          <p className="text-sm text-slate-500 font-medium">Family and coaching tools</p>
        </div>

        <Card className="w-full bg-surface shadow-sm border border-slate-200 p-6 sm:p-8">
          <h2 className="text-2xl font-bold mb-1 text-text-primary text-center">
            {step === "code" ? "Enter Verification Code" : "Sign In to Portal"}
          </h2>
          <p className="text-xs text-slate-500 text-center mb-6">
            {step === "code" ? "Check your email for the 8-digit code" : "Instant passwordless sign-in with your email"}
          </p>

          {error && (
            <div role="alert" className="p-3.5 mb-5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl">
              {error}
            </div>
          )}

          {successMessage && step === "code" && (
            <div className="p-3.5 mb-5 text-sm font-medium text-accent bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Passwordless OTP Flow */}
          {!usePasswordFallback && (
            <>
              {step === "email" ? (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <div>
                    <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Input 
                        id="login-email"
                        type="email" 
                        required 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="family@example.com"
                        autoComplete="email"
                        className="pl-10"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    variant="primary" 
                    size="lg" 
                    className="w-full mt-2" 
                    disabled={loading || googleLoading || !email.trim()}
                  >
                    {loading ? "Sending Code..." : "Send 8-Digit Code"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="login-code" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                        8-Digit Code
                      </label>
                      <button
                        type="button"
                        onClick={() => { setStep("email"); setOtpCode(""); setError(""); }}
                        className="text-xs text-brand-accent hover:text-brand-accent-hover font-medium inline-flex items-center gap-1"
                      >
                        <ArrowLeft className="w-3 h-3" /> Change email
                      </button>
                    </div>

                    <Input 
                      id="login-code"
                      ref={otpInputRef}
                      type="text" 
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      required 
                      value={otpCode}
                      onChange={(e) => handleOtpChange(e.target.value)}
                      placeholder="12345678"
                      className="text-center font-mono text-2xl tracking-[0.4em] h-14 bg-bg font-bold"
                      autoComplete="one-time-code"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    variant="primary" 
                    size="lg" 
                    className="w-full" 
                    disabled={loading || otpCode.length !== 8}
                  >
                    {loading ? "Verifying..." : "Verify & Sign In"}
                  </Button>

                  <div className="text-center pt-1">
                    {countdown > 0 ? (
                      <p className="text-xs text-slate-400">
                        Resend code in <span className="font-semibold text-slate-600">{countdown}s</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendCode()}
                        disabled={loading}
                        className="text-xs font-semibold text-brand-accent hover:text-brand-accent-hover transition-colors"
                      >
                        Didn&apos;t get a code? Resend
                      </button>
                    )}
                  </div>
                </form>
              )}
            </>
          )}

          {/* Password Fallback Form */}
          {usePasswordFallback && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Email Address
                </label>
                <Input 
                  type="email" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="family@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Password
                </label>
                <Input 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" variant="primary" size="lg" className="w-full mt-2" disabled={loading || googleLoading}>
                {loading ? "Signing in..." : "Sign In with Password"}
              </Button>
            </form>
          )}

          {/* Password Fallback Toggle */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => { setUsePasswordFallback(!usePasswordFallback); setError(""); }}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors inline-flex items-center gap-1"
            >
              <KeyRound className="w-3 h-3" />
              {usePasswordFallback ? "Use 8-digit email code instead" : "Sign in with password instead"}
            </button>
          </div>

          {/* Show OAuth only after the provider is configured in Supabase. */}
          {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" && <div className="mt-6 pt-6 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={handleGoogleAdminLogin}
              disabled={loading || googleLoading}
              className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 hover:text-accent transition-colors py-2 px-3 rounded-lg hover:bg-bg cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{googleLoading ? "Connecting to Google..." : "Sign in with Google"}</span>
            </button>
          </div>}
        </Card>
        <p className="mt-4 text-center text-sm text-slate-500"><a href="/tools" className="hover:underline">← Back to Tools</a></p>
      </div>
    </div>
  )
}
