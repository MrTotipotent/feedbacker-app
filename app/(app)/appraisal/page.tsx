"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";

// Maps Xano `dashboard_data.scores.*_average` keys → display labels
const DOMAIN_ROWS: { key: string; label: string }[] = [
  { key: "ease_average",           label: "Ease of Getting Appointment" },
  { key: "listening_average",      label: "Listening" },
  { key: "involving_average",      label: "Involving You in Decisions" },
  { key: "explaining_average",     label: "Explaining Tests & Treatment" },
  { key: "empathy_average",        label: "Empathy & Understanding" },
  { key: "confidence_average",     label: "Confidence in Clinician" },
  { key: "trust_average",          label: "Trust" },
  { key: "futureplan_average",     label: "Future Plan" },
  { key: "escalation_average",     label: "Safety-Netting / Escalation" },
  { key: "recommendation_average", label: "Likelihood to Recommend" },
];

function fmt(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return v.toFixed(1);
}

function ScoreRow({ label, score }: { label: string; score: number | null | undefined }) {
  const valid = score != null && score > 0;
  const pct   = valid ? (score! / 5) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-slate w-52 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-border rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-nhs-blue transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-bold text-nhs-blue-dark w-10 text-right font-serif">
        {fmt(score)}
      </span>
      <span className="text-xs text-slate-light w-6">/5</span>
    </div>
  );
}

interface Comment {
  clinician_comment?: string;
  comment?: string;
  text?: string;
  created_at?: string;
}

interface XanoAppraisal {
  profile?: Array<{
    total_responses?: number;
    response_count?: number;
  }>;
  dashboard_data?: {
    scores?: Record<string, number | null>;
  };
  top_comments?: Comment[];
}

export default function AppraisalPage() {
  const user = getUser();

  const [raw,     setRaw]     = useState<XanoAppraisal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    dashApi.getAppraisal()
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        setRaw(await res.json());
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────
  const scores       = raw?.dashboard_data?.scores ?? {};
  const profile0     = raw?.profile?.[0];
  const totalRaw     = profile0?.total_responses ?? profile0?.response_count;
  const totalLabel   = totalRaw != null ? String(totalRaw) : "—";
  const overallScore = scores["overall_average"];
  const topComments  = raw?.top_comments ?? [];

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  // ── Styles ───────────────────────────────────────────────────────────────
  const card = "bg-white rounded-2xl border border-border p-6 mb-5";
  const cardShadow = { boxShadow: "0 2px 12px rgba(0,94,184,0.08)" };

  return (
    <>
      {/* Print stylesheet */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #appraisal-print, #appraisal-print * { visibility: visible; }
          #appraisal-print { position: absolute; inset: 0; padding: 24px; }
          .no-print { display: none !important; }
          .print-logo { display: flex !important; }
        }
      `}</style>

      <div className="p-6 lg:p-8 max-w-3xl">
        {/* Page header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 no-print">
          <div>
            <h1 className="text-2xl font-bold text-nhs-blue-dark">Appraisal Export</h1>
            <p className="text-sm text-slate-light mt-0.5">
              GMC revalidation-ready patient feedback summary
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-nhs-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-sm self-start"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-2h8v2H6zm8 2H6v2h8v-2z" clipRule="evenodd" />
            </svg>
            Download PDF
          </button>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-border/50" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-8 text-center">
            <p className="text-sm font-semibold text-red-700 mb-1">Unable to load appraisal data</p>
            <p className="text-xs text-red-500">{error}</p>
          </div>
        ) : (
          <div id="appraisal-print">

            {/* ── Cover / Identity card ─────────────────────────────────── */}
            <div className={card} style={{ ...cardShadow, borderTopWidth: 4, borderTopColor: "#005EB8" }}>
              {/* Print-only logo */}
              <div className="print-logo hidden items-center gap-3 mb-5">
                <span className="font-serif text-xl text-nhs-blue-dark">
                  Feed<span className="text-[#00A9CE]">backer</span>
                </span>
                <span className="text-slate-light text-sm">NHS Patient Feedback Platform</span>
              </div>

              <h2 className="text-lg font-bold text-nhs-blue-dark mb-4">Patient Feedback Summary</h2>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Clinician</dt>
                  <dd className="text-slate font-medium mt-0.5">{user?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Clinician ID</dt>
                  <dd className="text-slate font-mono text-xs mt-0.5">{user?.clinician_id ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Practice</dt>
                  <dd className="text-slate font-medium mt-0.5">{user?.practice_name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Report Generated</dt>
                  <dd className="text-slate mt-0.5">{today}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Total Responses</dt>
                  <dd className="text-slate font-medium mt-0.5">{totalLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Overall Average</dt>
                  <dd className="font-bold text-nhs-blue mt-0.5 font-serif">
                    {overallScore != null && overallScore > 0
                      ? `${overallScore.toFixed(2)} / 5.00`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* ── Consultation Quality Scores ───────────────────────────── */}
            <div className={card} style={cardShadow}>
              <h3 className="text-base font-bold text-nhs-blue-dark mb-1">
                Consultation Quality Scores
              </h3>
              <p className="text-xs text-slate-light mb-4">
                Rated by patients on a scale of 1–5 (1 = poor, 5 = excellent). Based on the GMC Patient Questionnaire domains.
              </p>

              {DOMAIN_ROWS.map(({ key, label }) => (
                <ScoreRow key={key} label={label} score={scores[key]} />
              ))}

              {/* Overall row */}
              <div className="flex items-center gap-3 pt-3 mt-1 border-t-2 border-nhs-blue/20">
                <span className="text-sm font-bold text-slate w-52 flex-shrink-0">Overall Average</span>
                <div className="flex-1 bg-border rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-nhs-green transition-all duration-700"
                    style={{ width: `${overallScore != null && overallScore > 0 ? (overallScore / 5) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-nhs-blue-dark w-10 text-right font-serif">
                  {fmt(overallScore)}
                </span>
                <span className="text-xs text-slate-light w-6">/5</span>
              </div>
            </div>

            {/* ── Top patient comments ──────────────────────────────────── */}
            {topComments.length > 0 && (
              <div className={card} style={cardShadow}>
                <h3 className="text-base font-bold text-nhs-blue-dark mb-1">
                  Supporting Patient Comments
                </h3>
                <p className="text-xs text-slate-light mb-4">
                  Highest-rated anonymised patient comments for inclusion in appraisal portfolio.
                </p>
                <div className="space-y-3">
                  {topComments.map((c, i) => {
                    const text = c.clinician_comment ?? c.comment ?? c.text ?? "";
                    if (!text) return null;
                    return (
                      <div key={i} className="bg-off-white rounded-xl px-4 py-3 border border-border">
                        <p className="text-sm text-slate italic leading-relaxed">&ldquo;{text}&rdquo;</p>
                        {c.created_at && (
                          <p className="text-xs text-slate-light mt-1.5">
                            {new Date(c.created_at).toLocaleDateString("en-GB")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Declaration ───────────────────────────────────────────── */}
            <div className={card} style={cardShadow}>
              <h3 className="text-base font-bold text-nhs-blue-dark mb-3">Declaration</h3>
              <p className="text-sm text-slate leading-relaxed">
                I confirm that the above patient feedback data has been collected via the Feedbacker platform,
                using anonymised, unsolicited patient responses. The data presented is an accurate reflection
                of patient experience during the stated period and has not been edited or selectively presented.
              </p>
              <div className="mt-6 pt-4 border-t border-border grid grid-cols-2 gap-8">
                <div>
                  <div className="h-px bg-slate-light/40 mb-1.5" />
                  <p className="text-xs text-slate-light">Clinician signature</p>
                </div>
                <div>
                  <div className="h-px bg-slate-light/40 mb-1.5" />
                  <p className="text-xs text-slate-light">Date</p>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </>
  );
}
