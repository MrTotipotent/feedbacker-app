"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/app/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email,       setEmail]       = useState("");
  const [tempPass,    setTempPass]    = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Step 1: exchange email + temp password for a one-time authToken
      const loginRes  = await authApi.tempLogin(email, tempPass);
      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        throw new Error(loginData?.message ?? `Verification failed (${loginRes.status})`);
      }
      const authToken = loginData.authToken ?? loginData.token;
      if (!authToken) throw new Error("No auth token received — check your temporary password");

      // Step 2: use that token to set the new permanent password
      const resetRes  = await authApi.resetPassword(authToken, newPassword);
      const resetData = await resetRes.json();
      if (!resetRes.ok) {
        throw new Error(resetData?.message ?? `Reset failed (${resetRes.status})`);
      }

      // Step 3: back to login with a green success banner
      router.replace("/login?message=Password updated — please sign in");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

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
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">

            {/* Card header */}
            <div
              className="px-6 py-5 border-b border-border"
              style={{ background: "linear-gradient(135deg,#005EB8 0%,#003d7a 100%)" }}
            >
              <h1 className="text-white font-bold text-lg">Set new password</h1>
              <p className="text-white/60 text-xs mt-0.5">
                Enter your email, temporary password, and choose a new password
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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

              <Field label="Temporary password" required>
                <input
                  type="password"
                  value={tempPass}
                  onChange={(e) => setTempPass(e.target.value)}
                  placeholder="From your email"
                  required
                  autoComplete="one-time-code"
                  className={inputCls}
                />
              </Field>

              <Field label="New password" required>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  autoComplete="new-password"
                  className={inputCls}
                />
              </Field>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-nhs-blue text-white font-semibold py-3 rounded-xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {loading ? "Updating password…" : "Set new password"}
              </button>

              <p className="text-center text-xs text-slate-light">
                <a href="/login" className="text-nhs-blue font-semibold hover:underline">
                  ← Back to login
                </a>
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
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate">
        {label}
        {required && <span className="text-nhs-red">*</span>}
      </label>
      {children}
    </div>
  );
}
