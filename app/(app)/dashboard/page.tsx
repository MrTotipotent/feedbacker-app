"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Submission {
  id?: number;
  clinician_id: string;
  clinician_name?: string;
  created_at: string;
  sentiment?: string | null;
  comment_clinician?: string | null;
  redirect_platform?: string | null;
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
  practice_id?: number;
  active_clinician_id?: string;
}

interface EventCounts {
  qr_scans?: number | null;
  google_clicks?: number | null;
  feedback_clicks?: number | null;
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
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() === last.getFullYear() && d.getMonth() === last.getMonth();
}

function monthChangePct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
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

/** KPI card with an optional 3 px accent bar at the bottom */
function KpiCard({
  label,
  value,
  sub,
  accent = "#005EB8",
  progress,       // 0–100
  delta,          // absolute change vs last month; undefined = don't show; null = no prev data
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
  progress?: number;
  delta?: number | null;
}) {
  return (
    <div
      className="bg-white rounded-[10px] border border-border flex flex-col overflow-hidden"
      style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}
    >
      <div className="p-5 flex flex-col gap-1 flex-1">
        <p className="text-[11px] font-semibold text-slate-light uppercase tracking-wider">
          {label}
        </p>
        <p className="font-serif text-3xl leading-tight mt-1" style={{ color: accent }}>
          {value}
        </p>
        {sub && <p className="text-xs text-slate-light mt-0.5">{sub}</p>}
        {delta !== undefined && (
          <p className="text-[11px] mt-0.5">
            {delta === null
              ? <span className="text-slate-light">— no previous data</span>
              : delta >= 0
              ? <span style={{ color: "#009639" }}>↑ {delta} from last month</span>
              : <span style={{ color: "#DA291C" }}>↓ {Math.abs(delta)} from last month</span>
            }
          </p>
        )}
      </div>
      {/* 3 px progress bar */}
      {progress !== undefined && (
        <div className="h-[3px] w-full bg-border">
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              backgroundColor: accent,
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Individual metric card for each of the 10 score dimensions */
function MetricCard({
  label,
  score,
  trend,
}: {
  label: string;
  score: number;
  trend: number | null;
}) {
  const color =
    score >= 4.5 ? "#009639"
    : score >= 3.5 ? "#005EB8"
    : score >= 2.5 ? "#E65C00"
    : "#DA291C";

  return (
    <div
      className="bg-white rounded-[10px] border border-border p-4 flex flex-col gap-2"
      style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}
    >
      <p className="text-[11px] font-semibold text-slate-light uppercase tracking-wider truncate">
        {label}
      </p>
      <div className="flex items-end gap-1">
        <span className="font-serif text-2xl leading-none" style={{ color }}>
          {score > 0 ? score.toFixed(1) : "—"}
        </span>
        <span className="text-xs text-slate-light mb-0.5">/5</span>
      </div>
      <StarBar score={score} />
      {/* Score progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden bg-border">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${(score / 5) * 100}%`, backgroundColor: color }}
        />
      </div>
      {/* Trend badge */}
      {trend !== null ? (
        <span
          className="inline-flex items-center self-start text-[11px] font-semibold px-2 py-0.5 rounded-full mt-0.5"
          style={
            trend >= 0
              ? { background: "#E8F5E9", color: "#009639" }
              : { background: "#FFF3E0", color: "#E65C00" }
          }
        >
          {trend >= 0 ? "↑" : "↓"}&nbsp;
          {trend >= 0 ? "+" : ""}{trend.toFixed(1)} vs last mo
        </span>
      ) : (
        <span className="inline-flex items-center self-start text-[11px] text-slate-light px-2 py-0.5 rounded-full bg-border/50 mt-0.5">
          — no prev data
        </span>
      )}
    </div>
  );
}

function SkeletonCard({ h = "h-24" }: { h?: string }) {
  return <div className={`${h} rounded-[10px] bg-border/50 animate-pulse`} />;
}

/** Slide-in detail panel */
function DetailPanel({
  sub,
  onClose,
}: {
  sub: Submission;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center justify-between border-b border-border"
          style={{ background: "linear-gradient(135deg,#005EB8 0%,#003d7a 100%)" }}
        >
          <div>
            <p className="text-white font-semibold text-base">
              {sub.clinician_name ?? "Unknown Clinician"}
            </p>
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

        <div className="px-6 py-5 flex-1 space-y-6">

          {/* Sentiment (Step-1 text from /p/[practice_id]) */}
          <div>
            <p className="text-xs font-bold text-slate-light uppercase tracking-wider mb-2">
              Patient Sentiment
            </p>
            {sub.sentiment ? (
              <div className="bg-nhs-blue/5 border border-nhs-blue/20 rounded-lg p-4 text-sm text-slate leading-relaxed italic">
                &ldquo;{sub.sentiment}&rdquo;
              </div>
            ) : (
              <p className="text-sm text-slate-light italic">No sentiment recorded.</p>
            )}
          </div>

          {/* 10 dimension scores */}
          <div>
            <p className="text-xs font-bold text-slate-light uppercase tracking-wider mb-3">
              Scores
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DIMENSIONS.map(({ key, label }) => {
                const val = sub[key] ?? 0;
                const color =
                  val >= 4.5 ? "#009639"
                  : val >= 3.5 ? "#005EB8"
                  : val >= 2.5 ? "#E65C00"
                  : "#DA291C";
                return (
                  <div key={key} className="bg-off-white rounded-lg p-3 border border-border">
                    <p className="text-[10px] font-semibold text-slate-light uppercase tracking-wider mb-1">
                      {label}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-xl" style={{ color }}>
                        {val > 0 ? val : "—"}
                      </span>
                      {val > 0 && <StarBar score={val} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Private clinician comment */}
          <div>
            <p className="text-xs font-bold text-slate-light uppercase tracking-wider mb-2">
              Private Comment to Clinician
            </p>
            {sub.comment_clinician ? (
              <div className="bg-off-white rounded-lg p-4 border border-border text-sm text-slate leading-relaxed italic">
                &ldquo;{sub.comment_clinician}&rdquo;
              </div>
            ) : (
              <p className="text-sm text-slate-light italic">No comment left.</p>
            )}
          </div>

        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ActivityToggle = "month" | "all";

export default function DashboardPage() {
  const [submissions,  setSubmissions]  = useState<Submission[]>([]);
  const [practice,     setPractice]     = useState<Practice | null>(null);
  const [eventCounts,          setEventCounts]          = useState<EventCounts | null>(null);
  const [eventCountsMonth,     setEventCountsMonth]     = useState<EventCounts | null>(null);
  const [eventCountsLastMonth, setEventCountsLastMonth] = useState<EventCounts | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [filterClinician, setFilterClinician] = useState("all");
  const [selected,     setSelected]     = useState<Submission | null>(null);
  const [cqcTarget,    setCqcTarget]    = useState<number>(4.0);
  const [activityToggle, setActivityToggle] = useState<ActivityToggle>("month");

  useEffect(() => {
    // Load CQC target from localStorage (set in Settings)
    const stored = localStorage.getItem("cqc_target");
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed)) setCqcTarget(parsed);
    }

    async function load() {
      try {
        const [revRes, pracRes] = await Promise.all([
          dashApi.getReviews(),
          dashApi.getPractice(),
        ]);

        // Fetch event counts after we have the practice_id
        if (pracRes.ok) {
          const pracData = await pracRes.clone().json().catch(() => null);
          const pid = pracData?.practice_id ?? pracData?.id;
          if (pid) {
            const now  = new Date();
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            Promise.all([
              dashApi.getEventCounts(pid),
              dashApi.getEventCounts(pid, now.getMonth() + 1, now.getFullYear()),
              dashApi.getEventCounts(pid, prev.getMonth() + 1, prev.getFullYear()),
            ]).then(async ([allRes, monthRes, lastRes]) => {
              if (allRes.ok)   setEventCounts(await allRes.json());
              if (monthRes.ok) setEventCountsMonth(await monthRes.json());
              if (lastRes.ok)  setEventCountsLastMonth(await lastRes.json());
            }).catch(() => {});
          }
        }

        if (revRes.ok) {
          const raw = await revRes.json();
          const rows: unknown[] = Array.isArray(raw) ? raw : [];
          // Debug: log first row's keys so we can verify field names from Xano
          if (rows.length > 0) {
            console.log("[get_reviews] first row keys:", Object.keys(rows[0] as object));
            console.log("[get_reviews] first row:", rows[0]);
          }
          // Normalise score field names: Xano may return either
          // "ease" (original column) or "score_ease" (renamed/new column).
          // We map the un-prefixed variants onto the score_ keys so the UI
          // always reads score_ease, score_listening, etc.
          const SCORE_KEYS = [
            "ease","listening","involving","explaining","empathy",
            "confidence","trust","futureplan","escalation","recommendation",
          ] as const;
          const normalised = rows.map((r) => {
            const row = { ...(r as Record<string, unknown>) };
            for (const k of SCORE_KEYS) {
              const prefixed = `score_${k}` as const;
              // If the prefixed key is missing or zero, fall back to the un-prefixed key
              if (!row[prefixed] && row[k] !== undefined) {
                row[prefixed] = row[k];
              }
            }
            return row as unknown as Submission;
          });
          setSubmissions(normalised);
        } else {
          setError(`Failed to load submissions (${revRes.status})`);
        }

        if (pracRes.ok) setPractice(await pracRes.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Derived stats ────────────────────────────────────────────────────────

  const thisMonthSubs  = submissions.filter((s) => isThisMonth(s.created_at));
  const lastMonthSubs  = submissions.filter((s) => isLastMonth(s.created_at));

  const totalSubs      = submissions.length;
  const thisMonthCount = thisMonthSubs.length;
  const lastMonthCount = lastMonthSubs.length;

  // Avg Feedbacker Score = mean of all 10 dimensions across all submissions
  const avgFeedbackerScore = (() => {
    if (!submissions.length) return 0;
    const dimAvgs = DIMENSIONS.map(({ key }) => avg(submissions, key));
    return dimAvgs.reduce((a, b) => a + b, 0) / dimAvgs.length;
  })();

  const mthChangePct   = monthChangePct(thisMonthCount, lastMonthCount);
  const mthChangeLabel =
    mthChangePct === null ? "—"
    : mthChangePct >= 0   ? `+${mthChangePct.toFixed(0)}%`
    :                        `${mthChangePct.toFixed(0)}%`;

  const practiceName = practice?.name ?? practice?.practice_name ?? "Your Practice";

  // ── Trend per dimension ─────────────────────────────────────────────────

  function dimTrend(key: DimensionKey): number | null {
    if (!thisMonthSubs.length || !lastMonthSubs.length) return null;
    return avg(thisMonthSubs, key) - avg(lastMonthSubs, key);
  }

  // ── Activity event helpers ───────────────────────────────────────────────

  // Which counts to display depends on the toggle
  const activeEvents = activityToggle === "month" ? eventCountsMonth : eventCounts;

  function eventDelta(key: keyof EventCounts): number | null {
    const curr = eventCountsMonth?.[key] as number | null | undefined;
    const prev = eventCountsLastMonth?.[key] as number | null | undefined;
    if (curr == null || prev == null) return null;
    return curr - prev;
  }

  // ── Clinician filter / table ────────────────────────────────────────────

  // get_reviews does not return clinician_id — use clinician_name as the
  // filter key (it IS present in every submission row)
  const clinicianOptions = Array.from(
    new Map(
      submissions
        .filter((s) => s.clinician_name)
        .map((s) => [s.clinician_name!, s.clinician_name!])
    ).entries()
  );

  const filtered = [...submissions]
    .filter((s) => filterClinician === "all" || s.clinician_name === filterClinician)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Count shown after filter applied
  const filteredCount = filtered.length;

  // ── Loading ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-7xl">
        <div className="h-14 rounded-[10px] bg-border/50 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} h="h-36" />)}
        </div>
        <SkeletonCard h="h-64" />
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────

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

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl">

      {/* ── 1. Info banner ───────────────────────────────────────────────── */}
      <div
        className="mx-6 lg:mx-8 mt-6 mb-6 flex items-center gap-2 text-sm text-nhs-blue-dark font-medium"
        style={{
          background: "linear-gradient(90deg,#E3F2FD 0%,#F0F9FF 100%)",
          border: "1px solid #B3D9F5",
          borderRadius: "8px",
          padding: "11px 16px",
        }}
      >
        <span>ℹ️</span>
        <span>
          Showing all data for <strong>{practiceName}</strong>
          {" "}—{" "}
          <strong>{thisMonthCount}</strong> submission{thisMonthCount !== 1 ? "s" : ""} this month
        </span>
      </div>

      <div className="px-6 lg:px-8 pb-10 space-y-8">

        {/* ── 2. Activity (Room event counts) ───────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-nhs-blue-dark">Activity</h2>
              <p className="text-sm text-slate-light mt-0.5">
                Room QR code engagement across all rooms
              </p>
            </div>
            {/* Time toggle */}
            <div className="flex items-center gap-1 bg-off-white border border-border rounded-xl p-1 flex-shrink-0">
              {(["month", "all"] as ActivityToggle[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setActivityToggle(t)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                    activityToggle === t
                      ? "bg-nhs-blue text-white shadow-sm"
                      : "text-slate-light hover:text-slate"
                  }`}
                >
                  {t === "month" ? "This Month" : "All Time"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="QR Scans"
              value={activeEvents ? (activeEvents.qr_scans ?? 0) : "—"}
              sub={activityToggle === "month" ? "this month" : "total room QR scans"}
              accent="#005EB8"
              delta={activityToggle === "month" ? eventDelta("qr_scans") : undefined}
            />
            <KpiCard
              label="Google Review Clicks"
              value={activeEvents ? (activeEvents.google_clicks ?? 0) : "—"}
              sub={activityToggle === "month" ? "this month" : "patients tapped Google review"}
              accent="#009639"
              delta={activityToggle === "month" ? eventDelta("google_clicks") : undefined}
            />
            <KpiCard
              label="Feedback Form Clicks"
              value={activeEvents ? (activeEvents.feedback_clicks ?? 0) : "—"}
              sub={activityToggle === "month" ? "this month" : "patients tapped feedback form"}
              accent="#00A9CE"
              delta={activityToggle === "month" ? eventDelta("feedback_clicks") : undefined}
            />
          </div>
        </section>

        {/* ── 3. KPI cards (4) ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Submissions"
            value={totalSubs}
            sub="all time"
            accent="#003d7a"
            progress={Math.min(100, (totalSubs / Math.max(totalSubs, 50)) * 100)}
          />
          <KpiCard
            label="Avg Feedbacker Score"
            value={avgFeedbackerScore > 0 ? `${avgFeedbackerScore.toFixed(1)}/5.0 ⭐` : "—"}
            sub="mean across all 10 dimensions"
            accent="#005EB8"
            progress={avgFeedbackerScore > 0 ? (avgFeedbackerScore / 5) * 100 : 0}
          />
          <KpiCard
            label="Submissions This Month"
            value={thisMonthCount}
            sub={mthChangePct !== null
              ? `${mthChangeLabel} vs last month`
              : "no data last month"}
            accent="#003d7a"
            progress={Math.min(100, totalSubs > 0 ? (thisMonthCount / Math.max(totalSubs, 1)) * 300 : 0)}
          />
          <KpiCard
            label={`Internal CQC Target — ${cqcTarget.toFixed(1)}/5.0`}
            value={avgFeedbackerScore >= cqcTarget ? "✅ Met" : avgFeedbackerScore > 0 ? "⚠️ Below Target" : "—"}
            sub={avgFeedbackerScore > 0
              ? `Score: ${avgFeedbackerScore.toFixed(1)} / target: ${cqcTarget.toFixed(1)}`
              : "no data yet"}
            accent={avgFeedbackerScore >= cqcTarget ? "#009639" : avgFeedbackerScore > 0 ? "#E65C00" : "#768692"}
            progress={avgFeedbackerScore > 0 ? Math.min(100, (avgFeedbackerScore / cqcTarget) * 100) : 0}
          />
        </div>

        {/* ── 4. Performance overview ────────────────────────────────────── */}
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

        {/* ── 5. Individual submissions ──────────────────────────────────── */}
        <section>
          <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-nhs-blue-dark">
                Individual Submissions
              </h2>
              <p className="text-sm text-slate-light mt-0.5">
                All responses — click View for full detail
              </p>
            </div>
            {/* Filter bar + live count */}
            <div className="flex items-center gap-3">
              <span
                className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: "#E3F2FD", color: "#005EB8" }}
              >
                {filteredCount} submission{filteredCount !== 1 ? "s" : ""}
              </span>
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
                      {["Date", "Clinician", "Platform", "Overall", "Sentiment", ""].map((h, i) => (
                        <th
                          key={i}
                          className={`px-5 py-3 text-[11px] font-bold text-slate-light uppercase tracking-wider ${i < 5 ? "text-left" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
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
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span
                            className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
                            style={
                              (!s.redirect_platform || s.redirect_platform === "Feedbacker")
                                ? { background: "#E3F2FD", color: "#005EB8" }
                                : { background: "#F0F4F9", color: "#425563" }
                            }
                          >
                            {s.redirect_platform || "Feedbacker"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <StarBar score={s.score_recommendation ?? 0} />
                        </td>
                        <td className="px-5 py-3.5 text-slate-light max-w-xs">
                          {s.sentiment
                            ? (
                              <span className="italic">
                                &ldquo;{s.sentiment.slice(0, 50)}
                                {s.sentiment.length > 50 ? "…" : ""}&rdquo;
                              </span>
                            )
                            : <span className="text-border not-italic">—</span>}
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
