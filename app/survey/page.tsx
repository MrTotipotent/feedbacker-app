"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ClinicianInfo {
  clinician_name: string;
  practice_name: string;
  redirect_url: string;
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

// ─── Constants ─────────────────────────────────────────────────────────────

const SURVEY_API =
  process.env.NEXT_PUBLIC_XANO_SURVEY_API ??
  "https://xtw2-xdvy-nt5f.e2.xano.io/api:tkq1OGP7";

const CLINICIAN_QUESTIONS: { key: keyof Ratings; label: string; question: string }[] = [
  { key: "ease",           label: "Ease",           question: "How good was the clinician at putting you at ease?" },
  { key: "listening",      label: "Listening",      question: "How good was the clinician at listening to what you had to say?" },
  { key: "involving",      label: "Involving You",  question: "How good was the clinician at involving you in decisions about your care?" },
  { key: "explaining",     label: "Explaining",     question: "How good was the clinician at explaining your condition and treatment?" },
  { key: "empathy",        label: "Empathy",        question: "How good was the clinician at being empathetic and considering your feelings?" },
  { key: "confidence",     label: "Confidence",     question: "How much confidence do you have in this clinician's ability to care for you?" },
  { key: "trust",          label: "Trust",          question: "Did you feel the clinician was honest and trustworthy?" },
  { key: "futureplan",     label: "Future Plan",    question: "How well did the clinician help you understand the next steps in your care?" },
  { key: "escalation",     label: "Escalation",     question: "I know what to watch out for and how to seek help if my condition worsens." },
  { key: "recommendation", label: "Recommendation", question: "Would you be happy to see this clinician again?" },
];

const EMPTY_RATINGS: Ratings = {
  ease: 0, listening: 0, involving: 0, explaining: 0, empathy: 0,
  confidence: 0, trust: 0, futureplan: 0, escalation: 0, recommendation: 0,
};

// ─── Star Component ─────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  max = 5,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  size?: "sm" | "md" | "lg";
}) {
  const [hovered, setHovered] = useState(0);

  const sizeClass = size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl";
  const gapClass  = size === "sm" ? "gap-0.5" : size === "lg" ? "gap-2" : "gap-1";

  return (
    <div
      className={`flex ${gapClass} items-center`}
      onMouseLeave={() => setHovered(0)}
      role="group"
      aria-label={`Rating out of ${max}`}
    >
      {Array.from({ length: max }, (_, i) => {
        const star = i + 1;
        const filled = star <= (hovered || value);
        return (
          <button
            key={star}
            type="button"
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            className={`${sizeClass} leading-none cursor-pointer select-none transition-transform duration-100 hover:scale-110 active:scale-95 focus:outline-none focus-visible:outline-2 focus-visible:outline-nhs-blue`}
            style={{ filter: filled ? "none" : "grayscale(1) opacity(0.3)" }}
          >
            ⭐
          </button>
        );
      })}
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function SurveySkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* header skeleton */}
      <div className="bg-white rounded-2xl p-5 shadow-card space-y-3">
        <div className="skeleton h-5 w-2/3 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
      </div>
      {/* questions skeleton */}
      <div className="bg-white rounded-2xl p-5 shadow-card space-y-5">
        <div className="skeleton h-5 w-1/3 rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton h-7 w-36 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Survey Component ──────────────────────────────────────────────────

function SurveyForm() {
  const searchParams = useSearchParams();
  const clinicianId = searchParams.get("id") ?? "";

  // Fetch state
  const [info, setInfo]       = useState<ClinicianInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");

  // Form state
  const [ratings, setRatings]             = useState<Ratings>(EMPTY_RATINGS);
  const [clinComment, setClinicianComment]       = useState("");
  const [googleConsent, setGoogleConsent] = useState(false);
  const [practiceRating, setPracticeRating] = useState(0);
  const [practiceComment, setPracticeComment] = useState("");

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr]   = useState("");
  const [submitted, setSubmitted]   = useState(false);

  // Validation errors
  const [showValidation, setShowValidation] = useState(false);

  // ── Fetch clinician info ──────────────────────────────────────────────────
  const fetchClinicianInfo = useCallback(async () => {
    if (!clinicianId) {
      setFetchErr("No clinician ID provided. Please use the link given to you by your practice.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `${SURVEY_API}/get_clinician_info?clinician_id=${encodeURIComponent(clinicianId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Clinician not found (${res.status})`);
      }
      const data = await res.json();
      setInfo(data);
    } catch (err: unknown) {
      setFetchErr(
        err instanceof Error
          ? err.message
          : "Could not load clinician details. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [clinicianId]);

  useEffect(() => {
    fetchClinicianInfo();
  }, [fetchClinicianInfo]);

  // ── Validation ────────────────────────────────────────────────────────────
  const unanswered = CLINICIAN_QUESTIONS.filter((q) => ratings[q.key] === 0).map((q) => q.label);
  const practiceRatingMissing = practiceRating === 0;
  const isValid = unanswered.length === 0 && !practiceRatingMissing;

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowValidation(true);

    if (!isValid) return;

    setSubmitting(true);
    setSubmitErr("");

    const payload = {
      clinician_id: clinicianId,
      ...ratings,
      clinician_comment: clinComment,
      google_consent: googleConsent,
      practice_rating: practiceRating,
      practice_comment: practiceComment,
    };

    try {
      const res = await fetch(`${SURVEY_API}/create_submission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Submission failed (${res.status})`);
      }

      setSubmitted(true);

      // Redirect after short delay so patient sees success screen
      if (info?.redirect_url) {
        setTimeout(() => {
          window.location.href = info.redirect_url;
        }, 2500);
      }
    } catch (err: unknown) {
      setSubmitErr(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const setRating = (key: keyof Ratings) => (val: number) =>
    setRatings((prev) => ({ ...prev, [key]: val }));

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-off-white">
        {/* Top bar */}
        <header className="bg-nhs-blue px-4 py-3 flex items-center justify-between">
          <span className="font-serif text-xl text-white">
            Feed<span className="text-nhs-aqua">backer</span>
          </span>
          <span className="text-xs text-white/60 uppercase tracking-widest font-medium">NHS GP Feedback</span>
        </header>
        <div className="max-w-lg mx-auto px-4 pt-6">
          <SurveySkeleton />
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (fetchErr) {
    return (
      <div className="min-h-screen bg-off-white">
        <header className="bg-nhs-blue px-4 py-3 flex items-center justify-between">
          <span className="font-serif text-xl text-white">
            Feed<span className="text-nhs-aqua">backer</span>
          </span>
          <span className="text-xs text-white/60 uppercase tracking-widest font-medium">NHS GP Feedback</span>
        </header>
        <div className="max-w-lg mx-auto px-4 pt-10">
          <div className="bg-white rounded-2xl shadow-card p-6 text-center space-y-4">
            <div className="text-5xl">⚠️</div>
            <h2 className="text-lg font-semibold text-nhs-blue-dark">Link not recognised</h2>
            <p className="text-sm text-slate-light leading-relaxed">{fetchErr}</p>
            <p className="text-xs text-slate-light">
              Please contact your GP practice for a valid feedback link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-off-white">
        <header className="bg-nhs-blue px-4 py-3 flex items-center justify-between">
          <span className="font-serif text-xl text-white">
            Feed<span className="text-nhs-aqua">backer</span>
          </span>
          <span className="text-xs text-white/60 uppercase tracking-widest font-medium">NHS GP Feedback</span>
        </header>
        <div className="max-w-lg mx-auto px-4 pt-16">
          <div className="bg-white rounded-2xl shadow-card p-8 text-center space-y-5">
            <div
              className="text-6xl"
              style={{ animation: "starPop 0.4s ease" }}
            >
              ✅
            </div>
            <div>
              <h2 className="text-xl font-bold text-nhs-blue-dark">Thank you for your feedback!</h2>
              <p className="text-sm text-slate-light mt-2 leading-relaxed">
                Your response has been recorded. It helps improve care for everyone at your practice.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 bg-nhs-green/10 text-nhs-green text-sm font-medium px-4 py-2 rounded-full">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z"/>
              </svg>
              Redirecting you now…
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Survey Form ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-off-white pb-20">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="bg-nhs-blue shadow-md">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-serif text-xl text-white">
            Feed<span className="text-nhs-aqua">backer</span>
          </span>
          <span className="text-xs text-white/60 uppercase tracking-widest font-medium">NHS GP Feedback</span>
        </div>
      </header>

      {/* ── Clinician Banner ──────────────────────────────────────────────── */}
      <div className="bg-nhs-blue-dark">
        <div className="max-w-lg mx-auto px-4 py-4">
          <p className="text-white font-medium text-sm leading-snug">
            🩺 You are leaving feedback for:{" "}
            <span className="font-bold text-nhs-aqua">{info?.clinician_name}</span>
          </p>
          <p className="text-white/60 text-xs mt-0.5">{info?.practice_name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">

          {/* ── Intro card ───────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-card px-5 py-4 border-l-4 border-nhs-blue">
            <p className="text-sm text-slate leading-relaxed">
              Your feedback is <strong>100% anonymous</strong> and helps your practice improve care.
              Please rate your clinician across the following areas — it only takes 2 minutes.
            </p>
          </div>

          {/* ── Clinician ratings card ────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-border">
              <h2 className="font-semibold text-nhs-blue-dark text-base">
                About your clinician
              </h2>
              <p className="text-xs text-slate-light mt-0.5">
                Rate each area from 1 (poor) to 5 (excellent)
              </p>
            </div>

            <div className="divide-y divide-border">
              {CLINICIAN_QUESTIONS.map((q) => {
                const missing = showValidation && ratings[q.key] === 0;
                return (
                  <div
                    key={q.key}
                    className={`px-5 py-4 ${missing ? "bg-red-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-nhs-blue uppercase tracking-wide">
                          {q.label}
                        </span>
                        <p className="text-sm text-slate mt-0.5 leading-snug">{q.question}</p>
                        {missing && (
                          <p className="text-xs text-red-500 mt-1">Please select a rating</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 pt-1">
                        <StarRating
                          value={ratings[q.key]}
                          onChange={setRating(q.key)}
                          size="md"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Clinician comment ─────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-card px-5 py-5 space-y-3">
            <div>
              <h2 className="font-semibold text-nhs-blue-dark text-base">
                Private comment for your clinician
              </h2>
              <p className="text-xs text-slate-light mt-0.5">
                Optional. Only your clinician will see this — it is never shared publicly.
              </p>
            </div>
            <textarea
              value={clinComment}
              onChange={(e) => setClinicianComment(e.target.value)}
              placeholder="Share anything you'd like your clinician to know…"
              rows={4}
              className="w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/70 resize-none focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:border-transparent transition"
            />

            {/* Google consent */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={googleConsent}
                onChange={(e) => setGoogleConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border accent-nhs-green flex-shrink-0 cursor-pointer"
              />
              <span className="text-xs text-slate leading-relaxed group-hover:text-nhs-blue-dark transition-colors">
                I consent to my anonymised comment being shared publicly as a Google review
              </span>
            </label>
          </div>

          {/* ── Practice rating ───────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-card px-5 py-5 space-y-4">
            <div>
              <h2 className="font-semibold text-nhs-blue-dark text-base">
                About your practice overall
              </h2>
              <p className="text-xs text-slate-light mt-0.5">
                How would you rate your overall experience at {info?.practice_name}?
              </p>
            </div>

            <div>
              <StarRating
                value={practiceRating}
                onChange={setPracticeRating}
                max={5}
                size="lg"
              />
              {showValidation && practiceRatingMissing && (
                <p className="text-xs text-red-500 mt-1.5">Please rate your practice</p>
              )}
            </div>

            <textarea
              value={practiceComment}
              onChange={(e) => setPracticeComment(e.target.value)}
              placeholder="Any comments about the practice, staff, or your experience…"
              rows={3}
              className="w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/70 resize-none focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:border-transparent transition"
            />
          </div>

          {/* ── Validation summary ────────────────────────────────────────── */}
          {showValidation && !isValid && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <strong>Please complete all required fields:</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs">
                {unanswered.map((label) => (
                  <li key={label}>{label}</li>
                ))}
                {practiceRatingMissing && <li>Practice overall rating</li>}
              </ul>
            </div>
          )}

          {/* ── Submit error ──────────────────────────────────────────────── */}
          {submitErr && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {submitErr}
            </div>
          )}

          {/* ── Submit button ─────────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-nhs-blue text-white font-semibold text-base rounded-xl py-4 shadow-md hover:bg-nhs-blue-dark hover:shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z"/>
                </svg>
                Submitting…
              </span>
            ) : (
              "Submit Feedback"
            )}
          </button>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <p className="text-center text-xs text-slate-light pb-4">
            Your responses are anonymous and used only to improve patient care.
            <br />
            Powered by{" "}
            <span className="font-semibold text-nhs-blue">
              Feed<span className="text-nhs-aqua">backer</span>
            </span>
          </p>
        </div>
      </form>
    </div>
  );
}

// ─── Page (wrapped in Suspense for useSearchParams) ─────────────────────────

export default function SurveyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-off-white">
          <header className="bg-nhs-blue px-4 py-3">
            <span className="font-serif text-xl text-white">
              Feed<span className="text-nhs-aqua">backer</span>
            </span>
          </header>
          <div className="max-w-lg mx-auto px-4 pt-6">
            <SurveySkeleton />
          </div>
        </div>
      }
    >
      <SurveyForm />
    </Suspense>
  );
}
