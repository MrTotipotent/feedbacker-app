"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";
import { CQC_DOMAINS } from "@/app/lib/constants";

interface CqcData {
  total_submissions?: number;
  overall?: number;
  avg_overall?: number;
  domains?: Record<string, number>;
  date_from?: string;
  date_to?: string;
}

function DomainCard({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = (score / 5) * 100;
  const rating =
    score >= 4.5 ? "Outstanding" :
    score >= 3.5 ? "Good" :
    score >= 2.5 ? "Requires Improvement" :
    "Inadequate";
  const ratingColor =
    score >= 4.5 ? "text-nhs-green bg-green-50" :
    score >= 3.5 ? "text-nhs-blue bg-blue-50" :
    score >= 2.5 ? "text-orange-700 bg-orange-50" :
    "text-red-700 bg-red-50";

  return (
    <div className="bg-white rounded-2xl shadow-card p-5 border-t-4" style={{ borderTopColor: color }}>
      <p className="text-xs font-bold text-slate-light uppercase tracking-wide mb-3">{label}</p>
      <div className="flex items-end gap-1 mb-1">
        <span className="font-serif text-4xl text-nhs-blue-dark">{score > 0 ? score.toFixed(1) : "—"}</span>
        <span className="text-sm text-slate-light mb-1">/5</span>
      </div>
      <div className="my-3 bg-border rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ratingColor}`}>
        {score > 0 ? rating : "No data"}
      </span>
    </div>
  );
}

export default function CqcPage() {
  const router  = useRouter();
  const [data, setData]     = useState<CqcData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  // Date range — default: last 12 months
  const today = new Date();
  const yearAgo = new Date(today);
  yearAgo.setFullYear(today.getFullYear() - 1);
  const [from, setFrom] = useState(yearAgo.toISOString().split("T")[0]);
  const [to,   setTo]   = useState(today.toISOString().split("T")[0]);

  // Role guard
  const user = getUser();
  useEffect(() => {
    if (user && user.role !== "practice_manager") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  function fetchData() {
    setLoading(true);
    setError("");
    dashApi.getCqc({ from, to })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        setData(await res.json());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const domains = data?.domains ?? {};
  const overall = data?.overall ?? data?.avg_overall ?? 0;

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nhs-blue-dark">CQC Report</h1>
          <p className="text-sm text-slate-light mt-0.5">
            Care Quality Commission domain scores for your practice
          </p>
        </div>
        {/* Print button */}
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

      {/* Date range filter */}
      <div className="no-print bg-white rounded-2xl shadow-card p-5 mb-6 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-slate focus:outline-none focus:ring-2 focus:ring-nhs-blue"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-slate focus:outline-none focus:ring-2 focus:ring-nhs-blue"
          />
        </div>
        <button
          onClick={fetchData}
          className="bg-nhs-blue text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-nhs-blue-dark transition-colors"
        >
          Apply
        </button>
        <p className="text-xs text-slate-light ml-auto self-center">
          {data?.total_submissions ?? 0} responses in range
        </p>
      </div>

      {/* Print header (hidden on screen) */}
      <div className="print-only hidden print:block mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-serif text-2xl text-nhs-blue-dark">
            Feed<span className="text-nhs-aqua">backer</span>
          </span>
        </div>
        <h2 className="text-xl font-bold text-nhs-blue-dark">CQC Report</h2>
        <p className="text-sm text-slate-light">
          Period: {from} to {to} · {data?.total_submissions ?? 0} responses
        </p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-44 rounded-2xl" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <>
          {/* Overall badge */}
          <div className="bg-nhs-blue rounded-2xl p-6 text-white mb-6 shadow-md flex items-center gap-6">
            <div>
              <p className="text-sm text-white/70 font-medium">Overall Practice Score</p>
              <div className="flex items-end gap-1 mt-1">
                <span className="font-serif text-5xl">{overall > 0 ? overall.toFixed(1) : "—"}</span>
                <span className="text-lg text-white/60 mb-1">/5</span>
              </div>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-white/60">Equivalent CQC Rating</p>
              <p className="text-lg font-bold mt-1">
                {overall >= 4.5 ? "⭐ Outstanding" :
                 overall >= 3.5 ? "✅ Good" :
                 overall >= 2.5 ? "⚠️ Requires Improvement" :
                 overall > 0 ? "❌ Inadequate" : "—"}
              </p>
            </div>
          </div>

          {/* Domain cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {CQC_DOMAINS.map(({ key, label, color }) => (
              <DomainCard
                key={key}
                label={label}
                score={domains[key] ?? 0}
                color={color}
              />
            ))}
          </div>

          {/* CQC note */}
          <div className="no-print bg-off-white border border-border rounded-xl px-4 py-3 text-xs text-slate-light">
            <strong className="text-slate">Note:</strong> Scores are derived from patient feedback and mapped to CQC inspection themes.
            These are indicative scores only and do not constitute an official CQC rating.
          </div>
        </>
      )}
    </div>
  );
}
