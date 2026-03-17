"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";
import { SCORE_KEYS } from "@/app/lib/constants";

interface Comment {
  text?: string;
  comment?: string;
  clinician_comment?: string;
  created_at?: string;
  rating?: number;
}

interface AppraisalData {
  clinician_name?: string;
  clinician_id?: string;
  practice_name?: string;
  period?: string;
  total_submissions?: number;
  avg_overall?: number;
  scores?: Record<string, number>;
  top_comments?: Comment[];
}

function ScoreRow({ label, score }: { label: string; score: number }) {
  const pct = (score / 5) * 100;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-slate w-36 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-border rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-nhs-blue transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-bold text-nhs-blue-dark w-10 text-right">
        {score > 0 ? score.toFixed(1) : "—"}
      </span>
      <span className="text-xs text-slate-light w-6">/5</span>
    </div>
  );
}

export default function AppraisalPage() {
  const [data, setData]     = useState<AppraisalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    dashApi.getAppraisal()
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        setData(await res.json());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const scores = data?.scores ?? {};
  const overall = data?.avg_overall ??
    (Object.values(scores).length
      ? Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length
      : 0);

  const topComments = data?.top_comments ?? [];

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nhs-blue-dark">Appraisal Export</h1>
          <p className="text-sm text-slate-light mt-0.5">
            GMC revalidation-ready patient feedback summary
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="no-print flex items-center gap-2 bg-nhs-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-sm self-start"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-2h8v2H6zm8 2H6v2h8v-2z" clipRule="evenodd" />
          </svg>
          Download PDF
        </button>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="skeleton h-32 rounded-2xl" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <div id="appraisal-print">
          {/* Print header */}
          <div className="bg-white rounded-2xl shadow-card p-6 mb-5 border-t-4 border-nhs-blue">
            <div className="print-only hidden print:flex items-center gap-3 mb-4">
              <span className="font-serif text-xl text-nhs-blue-dark">
                Feed<span className="text-nhs-aqua">backer</span>
              </span>
              <span className="text-slate-light text-sm">NHS Patient Feedback Platform</span>
            </div>
            <h2 className="text-lg font-bold text-nhs-blue-dark mb-4">Patient Feedback Summary</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Clinician</dt>
                <dd className="text-slate font-medium mt-0.5">{data?.clinician_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Clinician ID</dt>
                <dd className="text-slate font-mono text-xs mt-0.5">{data?.clinician_id ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Practice</dt>
                <dd className="text-slate font-medium mt-0.5">{data?.practice_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Report Generated</dt>
                <dd className="text-slate mt-0.5">{today}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Total Responses</dt>
                <dd className="text-slate font-medium mt-0.5">{data?.total_submissions ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Overall Average</dt>
                <dd className="font-bold text-nhs-blue mt-0.5">{overall > 0 ? `${overall.toFixed(2)} / 5.00` : "—"}</dd>
              </div>
            </dl>
          </div>

          {/* Scores breakdown */}
          <div className="bg-white rounded-2xl shadow-card p-6 mb-5">
            <h3 className="text-base font-bold text-nhs-blue-dark mb-4">
              Consultation Quality Scores
            </h3>
            <div className="mb-3 text-xs text-slate-light">
              Rated by patients on a scale of 1–5 (1 = poor, 5 = excellent). Based on the GMC Patient Questionnaire domains.
            </div>
            <div>
              {SCORE_KEYS.map(({ key, label }) => (
                <ScoreRow key={key} label={label} score={scores[key] ?? 0} />
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center gap-3">
              <span className="text-sm font-bold text-slate w-36">Overall Average</span>
              <div className="flex-1 bg-border rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-nhs-green"
                  style={{ width: `${(overall / 5) * 100}%` }}
                />
              </div>
              <span className="text-sm font-bold text-nhs-blue-dark w-10 text-right">
                {overall > 0 ? overall.toFixed(1) : "—"}
              </span>
              <span className="text-xs text-slate-light w-6">/5</span>
            </div>
          </div>

          {/* Top comments */}
          {topComments.length > 0 && (
            <div className="bg-white rounded-2xl shadow-card p-6 mb-5">
              <h3 className="text-base font-bold text-nhs-blue-dark mb-1">
                Supporting Patient Comments
              </h3>
              <p className="text-xs text-slate-light mb-4">
                Highest-rated anonymised patient comments for inclusion in appraisal portfolio.
              </p>
              <div className="space-y-3">
                {topComments.map((c, i) => {
                  const text = c.text ?? c.comment ?? c.clinician_comment ?? "";
                  return (
                    <div key={i} className="bg-off-white rounded-xl px-4 py-3 border border-border">
                      <p className="text-sm text-slate italic leading-relaxed">
                        &ldquo;{text}&rdquo;
                      </p>
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

          {/* Declaration */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h3 className="text-base font-bold text-nhs-blue-dark mb-3">Declaration</h3>
            <p className="text-sm text-slate leading-relaxed">
              I confirm that the above patient feedback data has been collected via the Feedbacker platform,
              using anonymised, unsolicited patient responses. The data presented is an accurate reflection
              of patient experience during the stated period and has not been edited or selectively presented.
            </p>
            <div className="mt-6 pt-4 border-t border-border grid grid-cols-2 gap-8">
              <div>
                <div className="h-px bg-slate-light/40 mb-1" />
                <p className="text-xs text-slate-light">Clinician signature</p>
              </div>
              <div>
                <div className="h-px bg-slate-light/40 mb-1" />
                <p className="text-xs text-slate-light">Date</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
