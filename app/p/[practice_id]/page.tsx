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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PracticeLandingPage({
  params,
}: {
  params: { practice_id: string };
}) {
  const { practice_id } = params;

  const [info, setInfo]               = useState<ActiveClinician | null>(null);
  const [loadErr, setLoadErr]         = useState("");
  const [loading, setLoading]         = useState(true);
  const [comment, setComment]         = useState("");
  const [showButtons, setShowButtons] = useState(false);

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

  // Show buttons as soon as they type
  useEffect(() => {
    if (comment.trim().length > 0) setShowButtons(true);
  }, [comment]);

  // ── Navigation + fire-and-forget POST ────────────────────────────────────
  function navigate(url: string, newTab: boolean) {
    if (info?.clinician_id && comment.trim()) {
      surveyApi.createQuickFeedback(info.clinician_id, comment.trim()).catch(() => {});
    }
    if (newTab) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = url;
    }
  }

  function handleGoogle() {
    if (!info?.google_review_url) return;
    navigate(info.google_review_url, true);
  }

  function handleFeedbackForm() {
    if (!info) return;
    const dest = info.redirect_url?.trim()
      ? info.redirect_url
      : `/feedback?id=${encodeURIComponent(info.clinician_id)}`;
    navigate(dest, !!info.redirect_url?.trim());
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

  const hasGoogle = !!info.google_review_url;

  return (
    <PageShell>
      {/* ── Clinician card ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-card p-6 text-center space-y-1">
        <div className="w-14 h-14 rounded-full bg-nhs-blue/10 flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">🩺</span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-light">
          You saw
        </p>
        <h1 className="text-xl font-bold text-nhs-blue-dark">
          {info.clinician_name}
        </h1>
        <p className="text-sm text-slate-light">{info.practice_name}</p>
      </div>

      {/* ── One-liner input ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-card p-6 space-y-3">
        <label className="block text-sm font-semibold text-nhs-blue-dark">
          How was your appointment in one sentence?
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="e.g. Very thorough and reassuring"
          rows={2}
          className="w-full rounded-xl border border-border bg-off-white px-4 py-3 text-sm text-slate placeholder-slate-light/60 resize-none focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:border-transparent transition"
        />

        {!showButtons && (
          <button
            type="button"
            onClick={() => setShowButtons(true)}
            className="text-xs text-slate-light hover:text-nhs-blue transition underline underline-offset-2"
          >
            Skip this step →
          </button>
        )}

        {showButtons && comment.trim() && (
          <p className="text-xs text-nhs-green font-medium">
            ✓ Your comment has been saved
          </p>
        )}
      </div>

      {/* ── Action buttons ───────────────────────────────────────────── */}
      {showButtons && (
        <div className="space-y-3">
          {hasGoogle && (
            <button
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-3 bg-nhs-blue text-white font-semibold py-4 px-6 rounded-2xl hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-md text-sm"
            >
              <span className="text-lg leading-none">⭐</span>
              Review {info.clinician_name} on Google
            </button>
          )}

          <button
            onClick={handleFeedbackForm}
            className={`w-full flex items-center justify-center gap-3 font-semibold py-4 px-6 rounded-2xl active:scale-[0.98] transition-all text-sm ${
              hasGoogle
                ? "border-2 border-nhs-blue text-nhs-blue bg-white hover:bg-nhs-blue/5 shadow-sm"
                : "bg-nhs-blue text-white hover:bg-nhs-blue-dark shadow-md"
            }`}
          >
            <span className="text-lg leading-none">📋</span>
            Complete {info.clinician_name}&apos;s Feedback Form
          </button>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <p className="text-center text-xs text-slate-light pb-4">
        🔒 Anonymous · Takes 30 seconds · Powered by{" "}
        <span className="font-semibold text-nhs-blue">Feedbacker</span>
      </p>
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
      <main className="flex-1 flex flex-col items-center px-4 py-6">
        <div className="w-full max-w-sm space-y-4">{children}</div>
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
