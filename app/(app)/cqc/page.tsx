"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Submission {
  clinician_id: string;
  created_at: string;
  score_ease: number;
  score_listening: number;
  score_involving: number;
  score_explaining: number;
  score_empathy: number;
  score_confidence: number;
  score_trust: number;
  score_futureplan: number;
  score_escalation: number;
  score_recommendation: number;
}

// ─── CQC domain mappings ──────────────────────────────────────────────────────

const CQC_DOMAINS = [
  {
    key:    "communication",
    label:  "Communication",
    color:  "#005EB8",
    fields: ["score_ease", "score_explaining", "score_futureplan"] as const,
    desc:   "How clearly the clinician communicated, explained issues and future plans",
  },
  {
    key:    "safety",
    label:  "Safety",
    color:  "#DA291C",
    fields: ["score_escalation", "score_trust"] as const,
    desc:   "Patient confidence in escalation processes and overall clinical trust",
  },
  {
    key:    "involvement",
    label:  "Involvement",
    color:  "#009639",
    fields: ["score_involving", "score_empathy"] as const,
    desc:   "Degree to which patients were involved in decisions and felt heard",
  },
  {
    key:    "respect",
    label:  "Respect & Dignity",
    color:  "#7C3AED",
    fields: ["score_trust", "score_confidence", "score_recommendation"] as const,
    desc:   "Patient dignity, confidence in clinician and likelihood to recommend",
  },
] as const;

type ScoreKey = keyof Submission;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mean(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function domainScore(subs: Submission[], fields: readonly ScoreKey[]): number {
  if (!subs.length) return 0;
  const vals = subs.flatMap((s) => fields.map((f) => Number(s[f] ?? 0)));
  return mean(vals);
}

function overallScore(subs: Submission[]): number {
  if (!subs.length) return 0;
  const all10: ScoreKey[] = [
    "score_ease","score_listening","score_involving","score_explaining",
    "score_empathy","score_confidence","score_trust","score_futureplan",
    "score_escalation","score_recommendation",
  ];
  return mean(subs.flatMap((s) => all10.map((k) => Number(s[k] ?? 0))));
}

function cqcRating(score: number): { label: string; color: string; bg: string } {
  if (score >= 4.5) return { label: "Outstanding",          color: "#1B5E20", bg: "#E8F5E9" };
  if (score >= 3.5) return { label: "Good",                 color: "#0D47A1", bg: "#E3F2FD" };
  if (score >= 2.5) return { label: "Requires Improvement", color: "#E65C00", bg: "#FFF3E0" };
  return               { label: "Inadequate",             color: "#C62828", bg: "#FFEBEE" };
}

function vsTarget(score: number): { label: string; color: string; bg: string } {
  if (score >= 4.5) return { label: "Exceeds Target", color: "#1B5E20", bg: "#E8F5E9" };
  if (score >= 4.0) return { label: "Meets Target",   color: "#0D47A1", bg: "#E3F2FD" };
  return               { label: "Below Target",   color: "#C62828", bg: "#FFEBEE" };
}

function generateNarrative(
  subs: Submission[],
  practiceName: string,
  period: string,
  overall: number,
  domains: Record<string, number>
): string {
  if (!subs.length) return "No submission data available for this period.";

  const rating = cqcRating(overall);
  const comm   = (domains.communication ?? 0).toFixed(1);
  const safety = (domains.safety ?? 0).toFixed(1);
  const inv    = (domains.involvement ?? 0).toFixed(1);
  const resp   = (domains.respect ?? 0).toFixed(1);

  return `${practiceName} received ${subs.length} patient feedback submission${subs.length !== 1 ? "s" : ""} during ${period}, achieving a mean Feedbacker score of ${overall.toFixed(1)}/5.0 — a ${rating.label} rating under the CQC framework.

Communication (score ${comm}/5) reflects patients' experience of how clearly their clinician explained issues, communicated treatment plans and outlined next steps. Safety (score ${safety}/5) captures patient confidence in escalation pathways and overall clinical trustworthiness. Patient Involvement (score ${inv}/5) measures the degree to which patients were included in clinical decisions and felt listened to. Respect & Dignity (score ${resp}/5) encompasses patient confidence, trust in the clinician, and likelihood to recommend the service to others.

${overall >= 4.0
  ? `These scores demonstrate that ${practiceName} is meeting or exceeding NHS patient experience benchmarks. This data may be submitted as supporting evidence in CQC inspections under the Caring and Responsive domains.`
  : `These scores indicate areas for quality improvement. ${practiceName} should consider targeted training or process review to improve patient experience outcomes ahead of future CQC inspection.`}

Data source: Feedbacker NHS Patient Feedback Platform. All scores are derived from anonymous patient-completed surveys administered at point of care.`;
}

// ─── Domain card ─────────────────────────────────────────────────────────────

function DomainCard({
  label, score, color, desc,
}: {
  label: string; score: number; color: string; desc: string;
}) {
  const target = vsTarget(score);
  const rating = cqcRating(score);
  return (
    <div className="bg-white rounded-[10px] border border-border overflow-hidden"
      style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)", borderTop: `4px solid ${color}` }}>
      <div className="p-5">
        <p className="text-[11px] font-bold text-slate-light uppercase tracking-wider mb-3">{label}</p>
        <div className="flex items-end gap-1 mb-1">
          <span className="font-serif text-4xl" style={{ color: score > 0 ? color : "#D8E0E8" }}>
            {score > 0 ? score.toFixed(1) : "—"}
          </span>
          <span className="text-sm text-slate-light mb-1">/5</span>
        </div>
        <div className="my-3 bg-border rounded-full h-1.5 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${(score / 5) * 100}%`, backgroundColor: color }} />
        </div>
        <div className="flex gap-2 flex-wrap mb-3">
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: target.bg, color: target.color }}>
            {target.label}
          </span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: rating.bg, color: rating.color }}>
            {score > 0 ? rating.label : "No data"}
          </span>
        </div>
        <p className="text-xs text-slate-light leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CqcPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  const user = getUser();

  // Practice name — getUser() only has practices_id, so fetch the real name
  const [practiceName, setPracticeName] = useState<string>("Your Practice");

  useEffect(() => {
    dashApi.getPractice()
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const name = data?.practice?.name ?? data?.name ?? "";
        if (name) setPracticeName(name);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Date range — default: last 12 months
  const today   = new Date();
  const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const [from, setFrom] = useState(yearAgo.toISOString().split("T")[0]);
  const [to,   setTo]   = useState(today.toISOString().split("T")[0]);

  useEffect(() => {
    dashApi.getReviews()
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Filter by date range
  const filtered = submissions.filter((s) => {
    const d = new Date(s.created_at);
    return d >= new Date(from) && d <= new Date(to + "T23:59:59");
  });

  const overall = overallScore(filtered);
  const domains: Record<string, number> = {};
  CQC_DOMAINS.forEach((d) => { domains[d.key] = domainScore(filtered, d.fields); });

  const periodLabel = `${new Date(from).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} – ${new Date(to).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;
  const overallRating = cqcRating(overall);
  const narrative = generateNarrative(filtered, practiceName, periodLabel, overall, domains);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl space-y-6 animate-pulse">
        <div className="h-40 rounded-[10px] bg-border/50" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-44 rounded-[10px] bg-border/50" />)}
        </div>
        <div className="h-48 rounded-[10px] bg-border/50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="bg-red-50 border border-red-200 rounded-[10px] px-6 py-5 text-sm text-red-700 max-w-md text-center"
          style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
          <p className="font-semibold text-base mb-1">Failed to load CQC data</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">

      {/* ── Hero banner ────────────────────────────────────────────── */}
      <div className="rounded-[10px] overflow-hidden"
        style={{ background: "linear-gradient(135deg,#005EB8 0%,#003d7a 100%)", boxShadow: "0 4px 24px rgba(0,62,122,0.2)" }}>
        <div className="px-7 py-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">CQC Evidence Pack</p>
              <h1 className="font-serif text-2xl text-white leading-tight">{practiceName}</h1>
              <p className="text-white/70 text-sm mt-1">
                Automated reports for Care Quality Commission submissions
              </p>
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <span className="text-white/60 text-xs">📅 {periodLabel}</span>
                <span className="text-white/60 text-xs">·</span>
                <span className="text-white/60 text-xs">📊 {filtered.length} submission{filtered.length !== 1 ? "s" : ""}</span>
                {overall > 0 && (
                  <>
                    <span className="text-white/60 text-xs">·</span>
                    <span className="text-white/60 text-xs">⭐ {overall.toFixed(1)}/5.0 mean</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col items-start lg:items-end gap-2">
              <div className="flex items-end gap-1">
                <span className="font-serif text-5xl text-white">{overall > 0 ? overall.toFixed(1) : "—"}</span>
                <span className="text-white/50 text-lg mb-1">/5</span>
              </div>
              {overall > 0 && (
                <span className="text-sm font-semibold px-3 py-1 rounded-full"
                  style={{ background: overallRating.bg, color: overallRating.color }}>
                  {overallRating.label}
                </span>
              )}
              <button
                onClick={() => window.print()}
                className="mt-2 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors border border-white/20"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-2h8v2H6zm8 2H6v2h8v-2z" clipRule="evenodd" />
                </svg>
                Generate CQC PDF
              </button>
            </div>
          </div>
        </div>

        {/* Date filter bar */}
        <div className="px-7 py-3 border-t border-white/10 bg-black/10 flex flex-wrap items-center gap-3">
          <span className="text-white/60 text-xs font-semibold uppercase tracking-wide">Period:</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="text-xs rounded-md border border-white/20 bg-white/10 text-white px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/40" />
          <span className="text-white/40 text-xs">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="text-xs rounded-md border border-white/20 bg-white/10 text-white px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/40" />
        </div>
      </div>

      {/* ── Domain score cards ──────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-nhs-blue-dark">Domain Scores</h2>
          <p className="text-sm text-slate-light mt-0.5">
            Feedbacker dimensions mapped to CQC inspection themes — target 4.0/5.0
          </p>
        </div>
        {filtered.length === 0 ? (
          <div className="bg-white rounded-[10px] border border-border p-10 text-center text-slate-light text-sm"
            style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
            No submissions in this date range
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CQC_DOMAINS.map((d) => (
              <DomainCard
                key={d.key}
                label={d.label}
                score={domains[d.key] ?? 0}
                color={d.color}
                desc={d.desc}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Evidence narrative ──────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-nhs-blue-dark">Evidence Narrative</h2>
          <p className="text-sm text-slate-light mt-0.5">
            Auto-generated CQC-ready summary — copy directly into your evidence pack
          </p>
        </div>
        <div className="bg-white rounded-[10px] border border-border p-6"
          style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-light italic">No data in this date range to generate a narrative.</p>
          ) : (
            <>
              <div className="prose prose-sm max-w-none text-slate text-sm leading-relaxed whitespace-pre-line">
                {narrative}
              </div>
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-slate-light">
                  ⓘ Indicative scores only. Does not constitute an official CQC rating.
                </p>
                <button
                  onClick={() => navigator.clipboard.writeText(narrative)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-nhs-blue text-nhs-blue hover:bg-nhs-blue hover:text-white transition-colors"
                >
                  📋 Copy Narrative
                </button>
              </div>
            </>
          )}
        </div>
      </section>

    </div>
  );
}
