"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { surveyApi } from "@/app/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClinicianInfo {
  clinician_name: string;
  practice_name: string;
  google_review_url?: string;
}

type Ratings = {
  ease: number;
  listening: number;
  involving: number;
  explaining: number;
  empathy: number;
  confidence: number;
  trust: number;
  futureplan: number;
  escalation: number;
  recommendation: number;
};

const QUESTIONS: { key: keyof Ratings; label: string }[] = [
  { key: "ease",           label: "Getting an appointment was easy" },
  { key: "listening",      label: "The clinician listened to me" },
  { key: "involving",      label: "I was involved in decisions about my care" },
  { key: "explaining",     label: "Things were explained clearly" },
  { key: "empathy",        label: "I felt understood and cared for" },
  { key: "confidence",     label: "I have confidence in this clinician" },
  { key: "trust",          label: "I trust this clinician with my health" },
  { key: "futureplan",     label: "I have a clear plan for what to do next" },
  { key: "escalation",     label: "I know when to seek urgent help" },
  { key: "recommendation", label: "I would recommend this clinician" },
];

// ─── Main wrapper (Suspense required for useSearchParams) ─────────────────────

export default function SurveyPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <SurveyInner />
    </Suspense>
  );
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function SurveyInner() {
  const params      = useSearchParams();
  const clinicianId = params.get("id") ?? "";

  const [info, setInfo]       = useState<ClinicianInfo | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  // Ratings — 0 = unanswered
  const [ratings, setRatings] = useState<Ratings>({
    ease: 0, listening: 0, involving: 0, explaining: 0, empathy: 0,
    confidence: 0, trust: 0, futureplan: 0, escalation: 0, recommendation: 0,
  });

  const [clinicianComment, setClinicianComment] = useState("");
  const [googleConsent,    setGoogleConsent]    = useState(false);
  const [practiceRating,   setPracticeRating]   = useState(0);
  const [practiceComment,  setPracticeComment]  = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [submitErr,  setSubmitErr]  = useState("");

  // ── Fetch clinician info ──────────────────────────────────────────────────
  const fetchInfo = useCallback(async () => {
    if (!clinicianId) {
      setLoadErr("No clinician ID provided.");
      setLoading(false);
      return;
    }
    try {
      const res  = await surveyApi.getClinicianInfo(clinicianId);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Clinician not found.");
      setInfo(data);
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Could not load clinician info.");
    } finally {
      setLoading(false);
    }
  }, [clinicianId]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const unanswered = QUESTIONS.filter((q) => ratings[q.key] === 0);
    if (unanswered.length > 0) {
      setSubmitErr("Please answer all questions before submitting.");
      return;
    }
    setSubmitErr("");
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        clinician_id:      clinicianId,
        ...ratings,
        clinician_comment: clinicianComment.trim() || null,
        google_consent:    googleConsent,
        practice_rating:   practiceRating || null,
        practice_comment:  practiceComment.trim() || null,
      };
      const res = await surveyApi.createSubmission(payload);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? `Submission failed (${res.status})`);
      }
      setSubmitted(true);
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return <FullPageSpinner />;

  if (loadErr || !info) {
    return (
      <PageShell>
        <div className="bg-white rounded-2xl shadow-card p-8 text-center space-y-3">
          <div className="text-3xl">⚠️</div>
          <p className="text-sm font-semibold text-slate">
            {loadErr || "Clinician not found."}
          </p>
          <p className="text-xs text-slate-light">
            Please check the QR code or link you used.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Thank-you screen ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <PageShell>
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-5">
          <div className="bg-white rounded-2xl shadow-card p-8 text-center space-y-3">
            <div className="text-4xl">🎉</div>
            <h1 className="text-xl font-bold text-nhs-blue-dark">
              Thank you for your feedback!
            </h1>
            <p className="text-sm text-slate-light">
              Your response helps {info.clinician_name} improve patient care.
            </p>
          </div>

          {info.google_review_url && (
            <button
              type="button"
              onClick={() => window.open(info.google_review_url, "_blank", "noopener,noreferrer")}
              className="w-full flex flex-col items-center justify-center gap-1.5 bg-nhs-blue text-white font-semibold py-5 px-6 rounded-2xl hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-md text-center"
            >
              <span className="text-2xl leading-none">⭐</span>
              <span className="text-sm leading-snug">
                Help others — leave a public Google review too
              </span>
            </button>
          )}

          <p className="text-center text-xs text-slate-light pb-2">
            🔒 Anonymous · Powered by{" "}
            <span className="font-semibold text-nhs-blue">Feedbacker</span>
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Survey form ───────────────────────────────────────────────────────────
  const allAnswered = QUESTIONS.every((q) => ratings[q.key] > 0);

  return (
    <PageShell>
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-5">

        {/* Clinician card */}
        <div className="bg-white rounded-2xl shadow-card p-5 text-center space-y-1">
          <div className="w-12 h-12 rounded-full bg-nhs-blue/10 flex items-center justify-center mx-auto mb-2">
            <span className="text-2xl">🩺</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-light">
            Feedback for
          </p>
          <h1 className="text-lg font-bold text-nhs-blue-dark">{info.clinician_name}</h1>
          <p className="text-xs text-slate-light">{info.practice_name}</p>
        </div>

        {/* 10 rating questions */}
        <div className="bg-white rounded-2xl shadow-card p-5 space-y-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-light">
            Rate your experience · 1 = Poor, 5 = Excellent
          </p>

          {QUESTIONS.map((q) => (
            <div key={q.key} className="space-y-2">
              <p className="text-sm font-medium text-slate leading-snug">{q.label}</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatings((r) => ({ ...r, [q.key]: star }))}
                    className={`flex-1 h-10 rounded-xl text-sm font-bold border-2 transition-all active:scale-95 ${
                      ratings[q.key] === star
                        ? "bg-nhs-blue border-nhs-blue text-white shadow-md"
                        : ratings[q.key] > 0 && star <= ratings[q.key]
                        ? "bg-nhs-blue/10 border-nhs-blue/30 text-nhs-blue"
                        : "bg-off-white border-border text-slate-light hover:border-nhs-blue/40"
                    }`}
                  >
                    {star}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Optional: clinician comment */}
        <div className="bg-white rounded-2xl shadow-card p-5 space-y-3">
          <p className="text-sm font-semibold text-nhs-blue-dark">
            Any other comments? <span className="text-slate-light font-normal">(optional)</span>
          </p>
          <textarea
            value={clinicianComment}
            onChange={(e) => setClinicianComment(e.target.value)}
            placeholder="e.g. Very thorough and reassuring"
            rows={3}
            className="w-full rounded-xl border border-border bg-off-white px-4 py-3 text-sm text-slate placeholder-slate-light/60 resize-none focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:border-transparent transition"
          />
        </div>

        {/* Optional: practice rating */}
        <div className="bg-white rounded-2xl shadow-card p-5 space-y-3">
          <p className="text-sm font-semibold text-nhs-blue-dark">
            Overall practice rating <span className="text-slate-light font-normal">(optional)</span>
          </p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setPracticeRating((prev) => (prev === star ? 0 : star))}
                className={`flex-1 h-10 rounded-xl text-sm font-bold border-2 transition-all active:scale-95 ${
                  practiceRating === star
                    ? "bg-nhs-blue border-nhs-blue text-white shadow-md"
                    : practiceRating > 0 && star <= practiceRating
                    ? "bg-nhs-blue/10 border-nhs-blue/30 text-nhs-blue"
                    : "bg-off-white border-border text-slate-light hover:border-nhs-blue/40"
                }`}
              >
                {star}
              </button>
            ))}
          </div>
          <textarea
            value={practiceComment}
            onChange={(e) => setPracticeComment(e.target.value)}
            placeholder="Comments about the practice..."
            rows={2}
            className="w-full rounded-xl border border-border bg-off-white px-4 py-3 text-sm text-slate placeholder-slate-light/60 resize-none focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:border-transparent transition"
          />
        </div>

        {/* Google consent */}
        {info.google_review_url && (
          <label className="flex items-start gap-3 cursor-pointer bg-white rounded-2xl shadow-card p-5">
            <input
              type="checkbox"
              checked={googleConsent}
              onChange={(e) => setGoogleConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-nhs-blue focus:ring-nhs-blue"
            />
            <span className="text-sm text-slate leading-snug">
              I&apos;m happy for my feedback to be used as a basis for a public Google review
            </span>
          </label>
        )}

        {/* Error */}
        {submitErr && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {submitErr}
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !allAnswered}
          className="w-full bg-nhs-blue text-white font-semibold py-4 rounded-2xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md text-base"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z" />
              </svg>
              Submitting…
            </span>
          ) : "Submit Feedback"}
        </button>

        <p className="text-center text-xs text-slate-light pb-4">
          🔒 Anonymous · Takes 30 seconds · Powered by{" "}
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
