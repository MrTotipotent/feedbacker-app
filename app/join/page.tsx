"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { dashApi } from "@/app/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = "Feedbacker" | "14Fish" | "Clarity/Custom";

const ROLES = ["GP", "Practice Nurse", "Pharmacist", "Physiotherapist", "Paramedic", "Other"] as const;

const PLATFORMS: Platform[] = ["Feedbacker", "14Fish", "Clarity/Custom"];

const PLATFORM_VALUE: Record<Platform, string> = {
  Feedbacker:      "feedbacker",
  "14Fish":        "14fish",
  "Clarity/Custom":"custom",
};

// ─── Main wrapper ─────────────────────────────────────────────────────────────

export default function JoinPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <JoinInner />
    </Suspense>
  );
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function JoinInner() {
  const params = useSearchParams();
  const token  = params.get("token") ?? "";

  const [name,         setName]         = useState("");
  const [email,        setEmail]        = useState("");
  const [role,         setRole]         = useState<string>("GP");
  const [platform,     setPlatform]     = useState<Platform>("Feedbacker");
  const [feedbackUrl,  setFeedbackUrl]  = useState("");
  const [rotationStart,setRotationStart]= useState("");
  const [rotationEnd,  setRotationEnd]  = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [error,      setError]      = useState("");

  const inputCls = "w-full rounded-xl border border-border bg-off-white px-4 py-3 text-sm text-slate placeholder-slate-light/70 focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:border-transparent transition";
  const labelCls = "block text-xs font-bold text-slate uppercase tracking-wider mb-1.5";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())  { setError("Full name is required.");  return; }
    if (!email.trim()) { setError("Email is required.");      return; }
    if (platform !== "Feedbacker" && !feedbackUrl.trim()) {
      setError("A feedback URL is required for this platform.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const res = await dashApi.registerClinician({
        token,
        name:                name.trim(),
        email:               email.trim(),
        role,
        platform:            PLATFORM_VALUE[platform],
        custom_feedback_url: platform !== "Feedbacker" ? feedbackUrl.trim() : undefined,
        rotation_start:      rotationStart || undefined,
        rotation_end:        rotationEnd   || undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg  = (body as { message?: string })?.message ?? "";
        // Treat token errors as expired/invalid
        if (res.status === 401 || res.status === 404 || /token|expired|invalid/i.test(msg)) {
          setError("__invalid_token__");
        } else {
          setError(msg || `Submission failed (${res.status})`);
        }
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <PageShell>
        <div className="bg-white rounded-2xl shadow-card p-8 text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold text-nhs-blue-dark">You&apos;re all set!</h1>
          <p className="text-sm text-slate leading-relaxed max-w-xs mx-auto">
            Your profile has been added to your practice. Your practice manager will be in touch.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Invalid token ──────────────────────────────────────────────────────────
  if (error === "__invalid_token__") {
    return (
      <PageShell>
        <div className="bg-white rounded-2xl shadow-card p-8 text-center space-y-3">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-base font-bold text-nhs-blue-dark">Link invalid or expired</h2>
          <p className="text-sm text-slate leading-relaxed">
            This invite link is invalid or has expired. Please ask your practice manager for a new one.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <PageShell>
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-card px-6 pt-7 pb-6 text-center space-y-3">
          <div className="font-serif text-3xl text-nhs-blue tracking-tight">
            Feed<span className="text-nhs-aqua">backer</span>
          </div>
          <h1 className="text-lg font-bold text-nhs-blue-dark">Clinician Registration</h1>
          <p className="text-xs text-slate leading-relaxed max-w-xs mx-auto">
            Complete your profile to get started with patient feedback. This only takes a minute.
          </p>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <span className="text-lg leading-none">🩺</span>
            <h2 className="text-sm font-bold text-nhs-blue-dark uppercase tracking-wider">Your Details</h2>
          </div>

          <div className="p-5 space-y-4">

            {/* Full Name */}
            <div>
              <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Jane Smith"
                required
                className={inputCls}
              />
            </div>

            {/* Email */}
            <div>
              <label className={labelCls}>Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane.smith@gp.nhs.uk"
                required
                className={inputCls}
              />
            </div>

            {/* Role */}
            <div>
              <label className={labelCls}>Role <span className="text-red-500">*</span></label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={inputCls}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Platform */}
            <div>
              <label className={labelCls}>Feedback Platform <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      platform === p
                        ? "bg-nhs-blue text-white border-nhs-blue shadow-sm"
                        : "bg-white text-slate border-border hover:border-nhs-blue hover:text-nhs-blue"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Feedback URL — only shown for non-Feedbacker platforms */}
            {platform !== "Feedbacker" && (
              <div>
                <label className={labelCls}>Feedback URL <span className="text-red-500">*</span></label>
                <input
                  type="url"
                  value={feedbackUrl}
                  onChange={(e) => setFeedbackUrl(e.target.value)}
                  placeholder="https://..."
                  required
                  className={inputCls}
                />
              </div>
            )}

            {/* Rotation dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Rotation Start</label>
                <input
                  type="date"
                  value={rotationStart}
                  onChange={(e) => setRotationStart(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Rotation End</label>
                <input
                  type="date"
                  value={rotationEnd}
                  onChange={(e) => setRotationEnd(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

          </div>
        </form>

        {/* Error */}
        {error && error !== "__invalid_token__" && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          form=""
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-nhs-blue text-white font-semibold py-4 rounded-2xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md text-base flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z" />
              </svg>
              Submitting…
            </>
          ) : (
            <>Complete Registration →</>
          )}
        </button>

        {/* Footer */}
        <div className="bg-white/70 rounded-2xl border border-border px-5 py-4 flex items-start gap-3">
          <span className="text-lg leading-none flex-shrink-0 mt-0.5">🔒</span>
          <p className="text-xs text-slate-light leading-relaxed">
            Your details are stored securely in accordance with{" "}
            <span className="font-medium text-slate">NHS data protection guidelines</span>.
          </p>
        </div>

        <div className="h-2" />
      </div>
    </PageShell>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}

function FullPageSpinner() {
  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center">
      <svg className="w-8 h-8 text-nhs-blue animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z" />
      </svg>
    </div>
  );
}
