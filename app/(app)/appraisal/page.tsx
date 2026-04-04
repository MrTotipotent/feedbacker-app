"use client";

import { useEffect, useState, useCallback } from "react";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";

// ─── Constants ────────────────────────────────────────────────────────────────

const DOMAIN_ROWS: { key: string; label: string }[] = [
  { key: "ease_average",           label: "How good was the clinician at putting you at ease?" },
  { key: "listening_average",      label: "How good was the clinician at listening to what you had to say?" },
  { key: "involving_average",      label: "How good was the clinician at involving you in decisions?" },
  { key: "explaining_average",     label: "How good was the clinician at explaining your condition?" },
  { key: "empathy_average",        label: "How good was the clinician at being empathetic?" },
  { key: "confidence_average",     label: "How much confidence do you have in this clinician's ability?" },
  { key: "trust_average",          label: "Did you feel the clinician was honest and trustworthy?" },
  { key: "futureplan_average",      label: "How well did the clinician explain your next steps?" },
  { key: "escalation_average",     label: "I know what to watch out for and how to seek help." },
  { key: "recommendation_average", label: "Would you be happy to see this clinician again?" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClinicianOption {
  clinician_id: string;
  name: string;
  role?: string;
}

interface XanoAppraisal {
  scores?: Record<string, number | null>;
  total_responses?: number | null;
  top_comments?: (string | null)[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return v.toFixed(1);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AppraisalPage() {
  const user  = getUser();
  const isPM  = user?.role === "practice_manager";

  // ── Practice name (fetched — getUser() only has practices_id) ──────────
  const [practiceName, setPracticeName] = useState<string>("—");

  useEffect(() => {
    dashApi.getPractice()
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        // Response is a flat practice object: { name, practice_name, ... }
        const name = data?.name ?? data?.practice_name ?? data?.practice?.name ?? "";
        if (name) setPracticeName(name);
      })
      .catch(() => {});
  }, []);

  // ── Clinician list (PM only) ────────────────────────────────────────────
  const [clinicians,       setClinicians]       = useState<ClinicianOption[]>([]);
  const [selectedId,       setSelectedId]       = useState<string>("");
  const [cliniciansLoading,setCliniciansLoading] = useState(isPM);

  useEffect(() => {
    if (!isPM) return;
    dashApi.getClinicians()
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        // endpoint may return array directly or wrapped: { clinicians: [...] }
        const list: ClinicianOption[] = Array.isArray(json)
          ? json
          : (json?.clinicians ?? json?.data ?? []);
        setClinicians(list);
        if (list.length > 0) setSelectedId(list[0].clinician_id);
      })
      .catch(() => {})
      .finally(() => setCliniciansLoading(false));
  }, [isPM]);

  // ── Appraisal data ──────────────────────────────────────────────────────
  const [raw,        setRaw]        = useState<XanoAppraisal | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [error,      setError]      = useState("");

  const fetchAppraisal = useCallback((clinicianId?: string) => {
    setScoresLoading(true);
    setError("");
    console.log("[fetchAppraisal] called with clinicianId:", clinicianId);
    dashApi.getAppraisal(clinicianId)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = await res.json();
        // Unwrap Xano envelope — response may be { result: { ... } } or flat
        const data = json?.result ?? json;
        console.log("[fetchAppraisal] raw response:", JSON.stringify(data, null, 2));
        console.log("[fetchAppraisal] scores:", data?.scores ?? data);
        console.log("[fetchAppraisal] total_responses:", data?.total_responses);
        setRaw(data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        setLoading(false);
        setScoresLoading(false);
      });
  }, []);

  // Initial load — for non-PMs, fetch immediately; for PMs, wait until selectedId is set
  useEffect(() => {
    if (!isPM) {
      fetchAppraisal(undefined);
    }
  }, [isPM, fetchAppraisal]);

  // Re-fetch whenever PM changes selection
  useEffect(() => {
    if (isPM && selectedId) {
      fetchAppraisal(selectedId);
    }
  }, [isPM, selectedId, fetchAppraisal]);

  // ── Derived values ──────────────────────────────────────────────────────
  // Scores may be nested under a `scores` key or flat at the top level
  const scores       = raw?.scores ?? (raw as Record<string, number | null> | null) ?? {};
  const totalRaw     = raw?.total_responses;
  const totalLabel   = totalRaw != null ? String(totalRaw) : "—";
  const overallScore = scores["overall_average"];
  const topComments  = (raw?.top_comments ?? []).filter((c): c is string => typeof c === "string" && c.trim().length > 0);

  // For report header: PM shows selected clinician's info; regular user shows own
  const selectedClinician = isPM
    ? clinicians.find((c) => c.clinician_id === selectedId)
    : null;
  const displayName = isPM ? (selectedClinician?.name ?? "—") : (user?.name ?? "—");
  const displayId   = isPM ? (selectedClinician?.clinician_id ?? "—") : (user?.clinician_id ?? "—");

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  // ── Styles ──────────────────────────────────────────────────────────────
  const card       = "bg-white rounded-2xl border border-border p-6 mb-5";
  const cardShadow = { boxShadow: "0 2px 12px rgba(0,94,184,0.08)" };

  const isInitialLoading = loading && !raw;

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

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 no-print">
          <div>
            <h1 className="text-2xl font-bold text-nhs-blue-dark">Appraisal Export</h1>
            <p className="text-sm text-slate-light mt-0.5">
              GMC revalidation-ready patient feedback summary
            </p>
            {/* Data scope disclaimer */}
            <p className="text-xs text-slate-light mt-2">
              Data shown is only available for clinicians who used the Feedbacker native feedback form.
            </p>
          </div>
          <button
            onClick={() => window.print()}
            disabled={isInitialLoading || !!error}
            className="flex items-center gap-2 bg-nhs-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-sm self-start disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-2h8v2H6zm8 2H6v2h8v-2z" clipRule="evenodd" />
            </svg>
            Download PDF
          </button>
        </div>

        {/* ── PM Clinician selector ────────────────────────────────────── */}
        {isPM && (
          <div
            className="no-print mb-6 bg-white rounded-2xl border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            style={cardShadow}
          >
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Person icon */}
              <div className="w-8 h-8 rounded-full bg-nhs-blue/10 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-nhs-blue">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-nhs-blue-dark whitespace-nowrap">
                Viewing report for:
              </span>
            </div>

            {cliniciansLoading ? (
              <div className="h-10 flex-1 rounded-lg bg-border/50 animate-pulse" />
            ) : clinicians.length === 0 ? (
              <p className="text-sm text-slate-light italic">No clinicians found for this practice.</p>
            ) : (
              <div className="relative flex-1">
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-border bg-off-white pl-3.5 pr-9 py-2.5 text-sm text-slate font-medium focus:outline-none focus:ring-2 focus:ring-nhs-blue transition cursor-pointer"
                >
                  {clinicians.map((c) => (
                    <option key={c.clinician_id} value={c.clinician_id}>
                      {c.name}
                      {c.role ? ` — ${c.role.replace(/_/g, " ")}` : ""}
                      {" "}({c.clinician_id})
                    </option>
                  ))}
                </select>
                {/* Chevron */}
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-light"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            )}

            {/* Subtle fetching indicator */}
            {scoresLoading && (
              <div className="flex items-center gap-1.5 text-xs text-slate-light flex-shrink-0">
                <svg className="animate-spin w-3.5 h-3.5 text-nhs-blue" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading…
              </div>
            )}
          </div>
        )}

        {/* ── Main content ─────────────────────────────────────────────── */}
        {isInitialLoading ? (
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
          /* Wrap in relative so the scores-loading overlay can sit on top */
          <div className={`relative transition-opacity duration-200 ${scoresLoading ? "opacity-50 pointer-events-none" : "opacity-100"}`}>

            <div id="appraisal-print">

              {/* ── Cover / Identity card ──────────────────────────────── */}
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
                    <dd className="text-slate font-medium mt-0.5">{displayName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Clinician ID</dt>
                    <dd className="text-slate font-mono text-xs mt-0.5">{displayId}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-light font-semibold uppercase tracking-wide">Practice</dt>
                    <dd className="text-slate font-medium mt-0.5">{practiceName}</dd>
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

              {/* ── Consultation Quality Scores ────────────────────────── */}
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

              {/* ── Top patient comments ───────────────────────────────── */}
              {topComments.length > 0 && (
                <div className={card} style={cardShadow}>
                  <h3 className="text-base font-bold text-nhs-blue-dark mb-1">
                    Supporting Patient Comments
                  </h3>
                  <p className="text-xs text-slate-light mb-4">
                    Highest-rated anonymised patient comments for inclusion in appraisal portfolio.
                  </p>
                  <div className="space-y-3">
                    {topComments.map((text, i) => (
                      <div key={i} className="bg-off-white rounded-xl px-4 py-3 border border-border">
                        <p className="text-sm text-slate italic leading-relaxed">&ldquo;{text}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Declaration ────────────────────────────────────────── */}
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
          </div>
        )}
      </div>
    </>
  );
}
