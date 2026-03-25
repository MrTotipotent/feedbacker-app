"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { surveyApi, dashApi } from "@/app/lib/api";
import { getToken } from "@/app/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClinicianInfo {
  clinician_name: string;
  practice_name: string;
  google_review_url?: string;
}

type RatingKey =
  | "ease" | "listening" | "involving" | "explaining" | "empathy"
  | "confidence" | "trust" | "futureplan" | "escalation" | "recommendation";

type Ratings = Record<RatingKey, number>;

const QUESTIONS: { key: RatingKey; label: string }[] = [
  { key: "ease",           label: "How good was the clinician at putting you at ease?" },
  { key: "listening",      label: "How good was the clinician at listening to what you had to say?" },
  { key: "involving",      label: "How good was the clinician at involving you in decisions?" },
  { key: "explaining",     label: "How good was the clinician at explaining your condition?" },
  { key: "empathy",        label: "How good was the clinician at being empathetic?" },
  { key: "confidence",     label: "How much confidence do you have in this clinician's ability?" },
  { key: "trust",          label: "Did you feel the clinician was honest and trustworthy?" },
  { key: "futureplan",     label: "How well did the clinician explain your next steps?" },
  { key: "escalation",     label: "I know what to watch out for and how to seek help." },
  { key: "recommendation", label: "Would you be happy to see this clinician again?" },
];

const EMPTY_RATINGS: Ratings = {
  ease: 0, listening: 0, involving: 0, explaining: 0, empathy: 0,
  confidence: 0, trust: 0, futureplan: 0, escalation: 0, recommendation: 0,
};

// ─── Star icon ────────────────────────────────────────────────────────────────

function StarIcon({ filled, hovered }: { filled: boolean; hovered: boolean }) {
  const color = filled ? "#F59E0B" : hovered ? "#FCD34D" : "#CBD5E1";
  return (
    <svg
      width="28" height="28" viewBox="0 0 24 24"
      fill={filled || hovered ? color : "none"}
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-all duration-100"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// ─── Star rating row ──────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-0.5 flex-shrink-0">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(value === star ? 0 : star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="focus:outline-none active:scale-90 transition-transform"
          aria-label={`Rate ${star} out of 5`}
        >
          <StarIcon filled={star <= value} hovered={star <= hovered && hovered > value} />
        </button>
      ))}
    </div>
  );
}

// ─── Main wrapper ─────────────────────────────────────────────────────────────

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
  // Passed from /p/[practice_id] Step 1 via URL param; empty string when
  // the survey is opened directly (QR code / direct link — no Step 1).
  const sentimentParam = params.get("sentiment") ?? "";

  const [info, setInfo]       = useState<ClinicianInfo | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [ratings,          setRatings]          = useState<Ratings>(EMPTY_RATINGS);
  const [clinicianComment, setClinicianComment] = useState("");

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
      console.log("[get_clinician_info] response:", data);
      if (!res.ok) throw new Error(data?.message ?? "Clinician not found.");
      setInfo(data);
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Could not load clinician info.");
    } finally {
      setLoading(false);
    }
  }, [clinicianId]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  const setRating = (key: RatingKey, val: number) =>
    setRatings((prev) => ({ ...prev, [key]: val }));

  const hasAnyRating = Object.values(ratings).some((v) => v > 0);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!info) return;
    setSubmitErr("");
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        clinician_id:      clinicianId,
        sentiment:         sentimentParam, // Step-1 text from /p/[practice_id]; "" when opened directly
        ...Object.fromEntries(
          Object.entries(ratings).map(([k, v]) => [`score_${k}`, Number(v)])
        ),
        comment_clinician: clinicianComment.trim() || null,
      };
      const res = await surveyApi.createSubmission(payload);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? `Submission failed (${res.status})`);
      }
      setSubmitted(true);

      // Fire-and-forget profile recalculation — only when a clinician/PM
      // is logged in (token present). Never blocks the patient flow.
      if (getToken()) {
        console.log("[recalculate_profile] attempting — token present, firing POST");
        void (async () => {
          try {
            const r = await dashApi.recalculateProfile();
            const body = await r.json().catch(() => "(non-JSON body)");
            console.log("[recalculate_profile] response status:", r.status, r.ok ? "OK" : "FAIL");
            console.log("[recalculate_profile] response body:", body);
          } catch (err) {
            console.error("[recalculate_profile] fetch error:", err);
          }
        })();
      } else {
        console.log("[recalculate_profile] skipped — no auth token in localStorage");
      }
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── States ────────────────────────────────────────────────────────────────
  if (loading) return <FullPageSpinner />;

  if (loadErr || !info) {
    return (
      <PageShell>
        <div className="bg-white rounded-2xl shadow-card p-8 text-center space-y-3">
          <div className="text-4xl">⚠️</div>
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
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white rounded-2xl shadow-card p-8 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <h1 className="text-xl font-bold text-nhs-blue-dark">
              Thank you for your feedback!
            </h1>
            <p className="text-sm text-slate leading-relaxed">
              Your response helps {info.clinician_name} continue to deliver
              excellent care and supports the practice in improving services.
            </p>
          </div>

          {info.google_review_url && (
            <button
              type="button"
              onClick={() =>
                window.open(info.google_review_url, "_blank", "noopener,noreferrer")
              }
              className="w-full flex flex-col items-center gap-1.5 bg-nhs-blue text-white font-semibold py-5 px-6 rounded-2xl hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-md text-center"
            >
              <span className="text-2xl leading-none">⭐</span>
              <span className="text-sm leading-snug">
                Help others — leave a public Google review too
              </span>
            </button>
          )}

          <p className="text-center text-xs text-slate-light pb-4">
            🔒 Submitted securely · Powered by{" "}
            <span className="font-semibold text-nhs-blue">Feedbacker</span>
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Survey form ───────────────────────────────────────────────────────────
  return (
    <PageShell>
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* ── Header card ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-card px-6 pt-7 pb-6 text-center space-y-3">
          {/* Logo */}
          <div className="font-serif text-3xl text-nhs-blue tracking-tight">
            Feed<span className="text-nhs-aqua">backer</span>
          </div>

          {/* Intro text */}
          <p className="text-xs text-slate leading-relaxed max-w-xs mx-auto">
            Your feedback is vital for your clinician&apos;s development and helps our
            practice improve. This survey takes less than 2 minutes and is{" "}
            <span className="font-semibold text-nhs-blue-dark">100% anonymous</span>.
          </p>

          {/* Clinician identifier */}
          <div className="inline-flex items-center gap-2 bg-nhs-blue/6 rounded-xl px-4 py-2.5 text-sm font-medium text-nhs-blue-dark">
            <span className="text-base leading-none">🩺</span>
            <span>
              You are leaving feedback for:{" "}
              <span className="font-bold">{info.clinician_name}</span>
            </span>
          </div>
        </div>

        {/* ── 10 questions ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          {/* Section header */}
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <span className="text-lg leading-none">⭐</span>
            <h2 className="text-sm font-bold text-nhs-blue-dark uppercase tracking-wider">
              Clinician Performance
            </h2>
          </div>

          {/* Questions */}
          <div className="divide-y divide-border">
            {QUESTIONS.map((q, i) => (
              <div
                key={q.key}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                {/* Number + label */}
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-nhs-blue/10 text-nhs-blue text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-slate leading-snug">{q.label}</p>
                </div>

                {/* Stars */}
                <StarRating
                  value={ratings[q.key]}
                  onChange={(v) => setRating(q.key, v)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Comments ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-card p-5 space-y-4">
          <textarea
            value={clinicianComment}
            onChange={(e) => setClinicianComment(e.target.value)}
            placeholder="Share any additional thoughts directly with your clinician (private)..."
            rows={3}
            className="w-full rounded-xl border border-border bg-off-white px-4 py-3 text-sm text-slate placeholder-slate-light/70 resize-none focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:border-transparent transition"
          />

        </div>

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {submitErr && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {submitErr}
          </div>
        )}

        {/* ── Submit ──────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !hasAnyRating}
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
            <>Submit Feedback →</>
          )}
        </button>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="bg-white/70 rounded-2xl border border-border px-5 py-4 flex items-start gap-3">
          <span className="text-lg leading-none flex-shrink-0 mt-0.5">🔒</span>
          <p className="text-xs text-slate-light leading-relaxed">
            Your feedback is submitted securely in accordance with{" "}
            <span className="font-medium text-slate">NHS data protection guidelines</span>.
            Private comments go only to your clinician.
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
