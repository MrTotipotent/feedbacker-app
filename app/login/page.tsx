"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/app/lib/api";
import { setToken, setUser } from "@/app/lib/auth";

type Mode = "login" | "signup";

const ACCOUNT_TYPES = [
  { value: "gp",                  label: "GP" },
  { value: "nurse_practitioner",  label: "Nurse Practitioner" },
  { value: "pharmacist",          label: "Clinical Pharmacist" },
  { value: "physiotherapist",     label: "Physiotherapist" },
  { value: "practice_manager",    label: "Practice Manager" },
  { value: "other",               label: "Other" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");

  // Login fields
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");

  // Signup extra fields
  const [name, setName]               = useState("");
  const [role, setRole]               = useState<"clinician" | "practice_manager">("clinician");
  const [accountType, setAccountType] = useState("gp");
  const [practiceId, setPracticeId]   = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let res: Response;

      if (mode === "login") {
        res = await authApi.login(email, password);
      } else {
        res = await authApi.signup({
          name,
          email,
          password,
          role,
          account_type: accountType,
          // Only include practice_id if the user entered one.
          // Solo GPs with no practice manager leave this blank.
          ...(practiceId.trim() ? { practice_id: practiceId.trim() } : {}),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message ?? `Request failed (${res.status})`);
      }

      // Xano returns { authToken, user }
      const token = data.authToken ?? data.token;
      const user  = data.user ?? data;

      if (!token) throw new Error("No auth token received");

      setToken(token);
      setUser(user);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const toggle = () => {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setError("");
  };

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      {/* Header */}
      <header className="bg-nhs-blue py-4 px-6 shadow-md">
        <div className="font-serif text-xl text-white">
          Feed<span className="text-nhs-aqua">backer</span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            {/* Tab toggle */}
            <div className="flex border-b border-border">
              {(["login", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(""); }}
                  className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                    mode === m
                      ? "text-nhs-blue border-b-2 border-nhs-blue bg-white"
                      : "text-slate-light hover:text-slate"
                  }`}
                >
                  {m === "login" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Signup-only fields */}
              {mode === "signup" && (
                <>
                  <Field label="Full name" required>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Dr Sarah Mitchell"
                      required
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Role">
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as "clinician" | "practice_manager")}
                      className={inputCls}
                    >
                      <option value="clinician">Clinician</option>
                      <option value="practice_manager">Practice Manager</option>
                    </select>
                  </Field>

                  <Field label="Account type">
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value)}
                      className={inputCls}
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Practice ID"
                    hint="Optional — leave blank if you're a solo GP. Your Practice Manager can provide this later."
                    optional
                  >
                    <input
                      type="text"
                      value={practiceId}
                      onChange={(e) => setPracticeId(e.target.value)}
                      placeholder="e.g. PRAC-001 (optional)"
                      className={inputCls}
                    />
                  </Field>
                </>
              )}

              {/* Common fields */}
              <Field label="Email address" required>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@practice.nhs.uk"
                  required
                  autoComplete="email"
                  className={inputCls}
                />
              </Field>

              <Field label="Password" required>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "login" ? "••••••••" : "Min. 8 characters"}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className={inputCls}
                />
              </Field>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-nhs-blue text-white font-semibold py-3 rounded-xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z" />
                    </svg>
                    {mode === "login" ? "Signing in…" : "Creating account…"}
                  </span>
                ) : mode === "login" ? "Sign In" : "Create Account"}
              </button>

              {/* Toggle link */}
              <p className="text-center text-xs text-slate-light">
                {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={toggle}
                  className="text-nhs-blue font-semibold hover:underline"
                >
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </p>
            </form>
          </div>

          <p className="text-center text-xs text-slate-light mt-6">
            Powered by{" "}
            <span className="font-semibold text-nhs-blue">
              Feed<span className="text-nhs-aqua">backer</span>
            </span>{" "}
            · NHS GP Feedback Platform
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/60 focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:border-transparent transition";

function Field({
  label,
  hint,
  required,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate">
        {label}
        {required && <span className="text-nhs-red">*</span>}
        {optional && (
          <span className="text-[10px] font-normal text-slate-light bg-slate-100 px-1.5 py-0.5 rounded-full">
            optional
          </span>
        )}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-light">{hint}</p>}
    </div>
  );
}
