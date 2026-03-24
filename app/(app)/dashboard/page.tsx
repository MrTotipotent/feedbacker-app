"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Submission {
  id?: number;
  clinician_id: string;
  clinician_name?: string;
  created_at: string;
  comment_clinician?: string;
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

interface Practice {
  name?: string;
  practice_name?: string;
  active_clinician_id?: string;
}

// ─── Dimension config ─────────────────────────────────────────────────────────

const DIMENSIONS = [
  { key: "score_ease",           label: "Communication"  },
  { key: "score_listening",      label: "Listening"      },
  { key: "score_involving",      label: "Involvement"    },
  { key: "score_explaining",     label: "Explanation"    },
  { key: "score_empathy",        label: "Empathy"        },
  { key: "score_confidence",     label: "Confidence"     },
  { key: "score_trust",          label: "Trust"          },
  { key: "score_futureplan",     label: "Future Plan"    },
  { key: "score_escalation",     label: "Escalation"     },
  { key: "score_recommendation", label: "Recommendation" },
] as const;

type DimensionKey = typeof DIMENSIONS[number]["key"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(subs: Submission[], key: DimensionKey): number {
  if (!subs.length) return 0;
  return subs.reduce((s, r) => s + (r[key] ?? 0), 0) / subs.length;
}

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isLastMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() === lastMonth.getFullYear() && d.getMonth() === lastMonth.getMonth();
}

function monthChangePct(thisMonth: number, lastMonth: number): number | null {
  if (lastMonth === 0) return null;
  return ((thisMonth - lastMonth) / lastMonth) * 100;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarBar({ score }: { score: number }) {
  const filled = Math.round(score);
  return (
    <span className="text-base leading-none">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ color: i < filled ? "#f59e0b" : "#D8E0E8" }}>★</span>
      ))}
    </span>
  );
}

function KpiCard({
  label, value, sub, accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="bg-white rounded-[10px] border border-border p-5 flex flex-col gap-1"
      style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}
    >
      <p className="text-[11px] font-semibold text-slate-light uppercase tracking-wider">{label}</p>
      <p
        className="font-serif text-3xl leading-tight mt-1"
        style={{ color: accent ?? "#003d7a" }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-slate-light mt-0.5">{sub}</p>}
    </div>
  );
}

function MetricCard({
  label, score, trend,
}: {
  label: string;
  score: number;
  trend: number | null;
}) {
  const color =
    score >= 4.5 ? "#009639" : score >= 3.5 ? "#005EB8" : score >= 2.5 ? "#E65C00" : "#DA291C";

  return (
    <div
      className="bg-white rounded-[10px] border border-border p-4 flex flex-col gap-2"
      style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}
    >
      <p className="text-[11px] font-semibold text-slate-light uppercase tracking-wider truncate">{label}</p>
      <div className="flex items-end gap-1">
        <span className="font-serif text-2xl leading-none" style={{ color }}>
          {score > 0 ? score.toFixed(1) : "—"}
        </span>
        <span className="text-xs text-slate-light mb-0.5">/5</span>
      </div>
      <StarBar score={score} />
      <div className="mt-1 h-1.5 rounded-full overflow-hidden bg-border">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${(score / 5) * 100}%`, backgroundColor: color }}
        />
      </div>
      {trend !== null && (
        <span
          className="text-[11px] font-semibold mt-0.5"
          style={{ color: trend >= 0 ? "#009639" : "#E65C00" }}
        >
          {trend >= 0 ? "↑" : "↓"} {trend >= 0 ? "+" : ""}{trend.toFixed(1)} vs last month
        </span>
      )}
    </div>
  );
}

function SkeletonCard({ h = "h-24" }: { h?: string }) {
  return (
    <div className={`${h} rounded-[10px] bg-border/50 animate-pulse`} />
  );
}

function DetailPanel({
  sub,
  onClose,
}: {
  sub: Submission;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center justify-between border-b border-border"
          style={{ background: "linear-gradient(135deg,#005EB8 0%,#003d7a 100%)" }}
        >
          <div>
            <p className="text-white font-semibold text-base">{sub.clinician_name ?? "Unknown Clinician"}</p>
            <p className="text-white/60 text-xs mt-0.5">
              {new Date(sub.created_at).toLocaleDateString("en-GB", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-2xl leading-none font-light transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Scores */}
        <div className="px-6 py-5 flex-1">
          <p className="text-xs font-bold text-slate-light uppercase tracking-wider mb-4">Scores</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {DIMENSIONS.map(({ key, label }) => {
              const val = sub[key] ?? 0;
              const color =
                val >= 4.5 ? "#009639" : val >= 3.5 ? "#005EB8" : val >= 2.5 ? "#E65C00" : "#DA291C";
              return (
                <div
                  key={key}
                  className="bg-off-white rounded-lg p-3 border border-border"
                >
                  <p className="text-[10px] font-semibold text-slate-light uppercase tracking-wider mb-1">{label}</p>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-xl" style={{ color }}>{val}</span>
                    <StarBar score={val} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comment */}
          {sub.comment_clinician && (
            <div>
              <p className="text-xs font-bold text-slate-light uppercase tracking-wider mb-2">Patient Comment</p>
              <div
                className="bg-off-white rounded-lg p-4 border border-border text-sm text-slate leading-relaxed italic"
              >
                &ldquo;{sub.comment_clinician}&rdquo;
              </div>
            </div>
          )}

          {!sub.comment_clinician && (
            <p className="text-sm text-slate-light italic">No comment left.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [practice, setPractice]       = useState<Practice | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [filterClinician, setFilterClinician] = useState("all");
  const [selected, setSelected]       = useState<Submission | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [revRes, pracRes] = await Promise.all([
          dashApi.getReviews(),
          dashApi.getPractice(),
        ]);

        if (revRes.ok) {
          const data = await revRes.json();
          setSubmissions(Array.isArray(data) ? data : []);
        } else {
          setError(`Failed to load submissions (${revRes.status})`);
        }

        if (pracRes.ok) {
          setPractice(await pracRes.json());
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const thisMonthSubs = submissions.filter((s) => isThisMonth(s.created_at));
  const lastMonthSubs = submissions.filter((s) => isLastMonth(s.created_at));

  const totalSubs     = submissions.length;
  const thisMonthCount = thisMonthSubs.length;
  const lastMonthCount = lastMonthSubs.length;

  const avgOverall    = avg(submissions, "score_recommendation");

  const uniqueClinicians = new Set(submissions.map((s) => s.clinician_id)).size;

  const mthChangePct = monthChangePct(thisMonthCount, lastMonthCount);
  const mthChangeStr =
    mthChangePct === null ? "no data last month"
    : mthChangePct >= 0  ? `+${mthChangePct.toFixed(0)}% vs last month`
    :                       `${mthChangePct.toFixed(0)}% vs last month`;

  const practiceName = practice?.name ?? practice?.practice_name ?? "Your Practice";

  // ── Metric card trends ─────────────────────────────────────────────────────

  function dimTrend(key: DimensionKey): number | null {
    const curr = avg(thisMonthSubs, key);
    const prev = avg(lastMonthSubs, key);
    if (!thisMonthSubs.length || !lastMonthSubs.length) return null;
    return curr - prev;
  }

  // ── Filter / table ─────────────────────────────────────────────────────────

  const clinicianOptions = Array.from(
    new Map(submissions.map((s) => [s.clinician_id, s.clinician_name ?? s.clinician_id])).entries()
  );

  const filtered = [...submissions]
    .filter((s) => filterClinician === "all" || s.clinician_id === filterClinician)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-7xl">
        <div className="h-12 rounded-[10px] bg-border/50 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} h="h-32" />)}
        </div>
        <SkeletonCard h="h-64" />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div
          className="bg-red-50 border border-red-200 rounded-[10px] px-6 py-5 text-sm text-red-700 max-w-md text-center"
          style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}
        >
          <p className="font-semibold text-base mb-1">Failed to load dashboard</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl">

      {/* 1. Topbar info banner */}
      <div
        className="px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-6"
        style={{
          background: "linear-gradient(135deg,#005EB8 0%,#003d7a 100%)",
          borderRadius: "0 0 12px 12px",
        }}
      >
        <p className="text-white text-sm font-medium">
          Showing all data for <span className="font-bold">{practiceName}</span>
        </p>
        <p className="text-white/70 text-sm">
          <span className="text-white font-semibold">{thisMonthCount}</span> submissions this month
          <span className="mx-2 text-white/40">·</span>
          <span
            className="font-semibold"
            style={{ color: mthChangePct !== null && mthChangePct >= 0 ? "#6EE7B7" : "#FCD34D" }}
          >
            {mthChangePct !== null
              ? (mthChangePct >= 0 ? `+${mthChangePct.toFixed(0)}%` : `${mthChangePct.toFixed(0)}%`)
              : "—"}
          </span>
          {" "}vs last month
        </p>
      </div>

      <div className="px-6 lg:px-8 pb-10 space-y-8">

        {/* 2. KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            label="Total Submissions"
            value={totalSubs}
            sub="all time"
          />
          <KpiCard
            label="Avg Overall Score"
            value={avgOverall > 0 ? avgOverall.toFixed(1) : "—"}
            sub={avgOverall > 0 ? `out of 5.0 ⭐` : "no data yet"}
            accent="#005EB8"
          />
          <KpiCard
            label="Active Clinicians"
            value={uniqueClinicians}
            sub="unique in submissions"
          />
          <KpiCard
            label="CQC Threshold"
            value={avgOverall >= 4.0 ? "✅ Met" : avgOverall > 0 ? "⚠️ Below" : "—"}
            sub={`Target: 4.0 / 5.0`}
            accent={avgOverall >= 4.0 ? "#009639" : "#E65C00"}
          />
          <KpiCard
            label="This Month"
            value={thisMonthCount}
            sub={mthChangeStr}
          />
        </div>

        {/* 3. Performance overview */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-nhs-blue-dark">
              Average Ratings — Performance Overview
            </h2>
            <p className="text-sm text-slate-light mt-0.5">
              Mean scores across all 10 feedback dimensions
            </p>
          </div>

          {submissions.length === 0 ? (
            <div
              className="bg-white rounded-[10px] border border-border p-10 text-center text-slate-light text-sm"
              style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}
            >
              No submissions yet — share your QR code to get started
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {DIMENSIONS.map(({ key, label }) => (
                <MetricCard
                  key={key}
                  label={label}
                  score={avg(submissions, key)}
                  trend={dimTrend(key)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 4. Individual submissions */}
        <section>
          <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-nhs-blue-dark">Individual Submissions</h2>
              <p className="text-sm text-slate-light mt-0.5">
                All responses — click View for full detail
              </p>
            </div>
            {/* Filter */}
            <select
              value={filterClinician}
              onChange={(e) => setFilterClinician(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-white text-slate focus:outline-none focus:ring-2 focus:ring-nhs-blue/30 focus:border-nhs-blue"
              style={{ minWidth: 180 }}
            >
              <option value="all">All Clinicians</option>
              {clinicianOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          <div
            className="bg-white rounded-[10px] border border-border overflow-hidden"
            style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}
          >
            {filtered.length === 0 ? (
              <div className="p-10 text-center text-slate-light text-sm">
                No submissions yet — share your QR code to get started
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-off-white">
                      <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-light uppercase tracking-wider">Date</th>
                      <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-light uppercase tracking-wider">Clinician</th>
                      <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-light uppercase tracking-wider">Overall</th>
                      <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-light uppercase tracking-wider">Comment</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((s, i) => (
                      <tr key={s.id ?? i} className="hover:bg-off-white/60 transition-colors">
                        <td className="px-5 py-3.5 text-slate whitespace-nowrap">
                          {new Date(s.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit", month: "short", year: "numeric",
                          })}
                        </td>
                        <td className="px-5 py-3.5 text-slate font-medium whitespace-nowrap">
                          {s.clinician_name ?? s.clinician_id}
                        </td>
                        <td className="px-5 py-3.5">
                          <StarBar score={s.score_recommendation ?? 0} />
                        </td>
                        <td className="px-5 py-3.5 text-slate-light max-w-xs truncate">
                          {s.comment_clinician
                            ? s.comment_clinician.slice(0, 40) + (s.comment_clinician.length > 40 ? "…" : "")
                            : <span className="italic text-border">No comment</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => setSelected(s)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-nhs-blue text-nhs-blue hover:bg-nhs-blue hover:text-white transition-colors"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

      </div>

      {/* Slide-in detail panel */}
      {selected && (
        <DetailPanel sub={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
