"use client";

import { useEffect, useState, useCallback } from "react";
import { surveyApi } from "@/app/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveClinician {
  clinician_id: string;
  clinician_name: string;
  practice_name: string;
  google_review_url?: string;
  redirect_url?: string;
}

type Step = 1 | 2;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PracticeLandingPage({
  params,
}: {
  params: { practice_id: string };
}) {
  const { practice_id } = params;

  const [info, setInfo]       = useState<ActiveClinician | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [step, setStep]           = useState<Step>(1);
  const [sentiment, setSentiment] = useState("");

  // ── Fetch active clinician ────────────────────────────────────────────────
  const fetchInfo = useCallback(async () => {
    if (!practice_id) {
      setLoadErr("Invalid practice link.");
      setLoading(false);
      return;
    }
    try {
      const res  = await surveyApi.getActiveClinician(practice_id);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Practice not found.");
      if (!data?.clinician_name) throw new Error("No active clinician set for this practice.");
      setInfo(data);
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Could not load practice info.");
    } finally {
      setLoading(false);
    }
  }, [practice_id]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  // ── Continue from Step 1 → Step 2 ────────────────────────────────────────
  function handleContinue() {
    // Fire-and-forget save the sentiment comment
    if (info?.clinician_id && sentiment.trim()) {
      surveyApi.createQuickFeedback(info.clinician_id, sentiment.trim()).catch(() => {});
    }
    setStep(2);
  }

  // ── Button destinations ───────────────────────────────────────────────────
  function handleGoogle() {
    if (!info?.google_review_url) return;
    window.open(info.google_review_url, "_blank", "noopener,noreferrer");
  }

  function handleFeedbackForm() {
    if (!info) return;
    const dest = info.redirect_url?.trim()
      ? info.redirect_url
      : `/survey?id=${encodeURIComponent(info.clinician_id)}`;
    window.open(dest, "_blank", "noopener,noreferrer");
  }

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return <FullPageSpinner />;

  if (loadErr || !info) {
    return (
      <PageShell>
        <div className="bg-white rounded-2xl shadow-card p-8 text-center space-y-3">
          <div className="text-3xl">⚠️</div>
          <p className="text-sm font-semibold text-slate">
            {loadErr || "Practice not found."}
          </p>
          <p className="text-xs text-slate-light">
            Please check the QR code or link you used.
          </p>
        </div>
      </PageShell>
    );
  }

  const hasGoogle   = !!info.google_review_url?.trim();
  const hasFeedback = !!info.redirect_url?.trim() || !!info.clinician_id;

  // ── Step 1 — Sentiment ────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <PageShell>
        <div
          key="step1"
          className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6"
        >
          {/* Heading */}
          <div className="text-center space-y-2 pt-2">
            <h1 className="text-xl font-bold text-nhs-blue-dark leading-snug">
              How would you describe your experience with{" "}
              <span className="text-nhs-blue">{info.clinician_name}</span> today?
            </h1>
          </div>

          {/* Input card */}
          <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
            <textarea
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
              placeholder="Describe in one sentence..."
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-border bg-off-white px-4 py-3 text-sm text-slate placeholder-slate-light/60 resize-none focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:border-transparent transition"
            />

            <button
              type="button"
              onClick={handleContinue}
              disabled={sentiment.trim().length < 3}
              className="w-full bg-nhs-blue text-white font-semibold py-4 rounded-2xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md text-base"
            >
              Continue →
            </button>
          </div>

          <p className="text-center text-xs text-slate-light pb-2">
            🔒 Anonymous · Takes 30 seconds
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Step 2 — Two Big Buttons ──────────────────────────────────────────────
  return (
    <PageShell>
      <div
        key="step2"
        className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6"
      >
        {/* Heading */}
        <div className="text-center space-y-1 pt-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-light">
            Thank you! 🎉
          </p>
          <h1 className="text-xl font-bold text-nhs-blue-dark leading-snug">
            Let others know,{" "}
            <span className="text-nhs-blue">{info.clinician_name}</span>&apos;s
            patients are talking!
          </h1>
        </div>

        {/* Buttons card */}
        <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
          {/* Button 1 — Google review */}
          {hasGoogle ? (
            <button
              type="button"
              onClick={handleGoogle}
              className="w-full flex flex-col items-center justify-center gap-1.5 bg-nhs-blue text-white font-semibold py-5 px-6 rounded-2xl hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-md text-center"
            >
              <span className="text-2xl leading-none">⭐</span>
              <span className="text-sm leading-snug">
                Let others know! Leave{" "}
                <span className="font-bold">{info.clinician_name}</span> a public
                Google review
              </span>
            </button>
          ) : (
            <p className="text-center text-xs text-slate-light py-2">
              Google Reviews not set up yet for this practice.
            </p>
          )}

          {/* Divider */}
          {hasGoogle && hasFeedback && (
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-slate-light">then</span>
              <div className="flex-1 border-t border-border" />
            </div>
          )}

          {/* Button 2 — Feedback form */}
          {hasFeedback && (
            <button
              type="button"
              onClick={handleFeedbackForm}
              className="w-full flex flex-col items-center justify-center gap-1.5 border-2 border-nhs-blue text-nhs-blue bg-white font-semibold py-5 px-6 rounded-2xl hover:bg-nhs-blue/5 active:scale-[0.98] transition-all text-center"
            >
              <span className="text-2xl leading-none">📋</span>
              <span className="text-sm leading-snug">
                Complete a feedback form for{" "}
                <span className="font-bold">{info.clinician_name}</span> — needed
                for their professional development
              </span>
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-light pb-2">
          🔒 Anonymous · Powered by{" "}
          <span className="font-semibold text-nhs-blue">Feedbacker</span>
        </p>
      </div>
    </PageShell>
  );
}

// ─── Layout shells ────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <header className="bg-nhs-blue py-4 px-6 shadow-md flex items-center justify-between">
        <div className="font-serif text-xl text-white">
          Feed<span className="text-nhs-aqua">backer</span>
        </div>
        <span className="text-xs text-white/70 font-medium tracking-wide">
          NHS Patient Feedback
        </span>
      </header>
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-sm">{children}</div>
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
