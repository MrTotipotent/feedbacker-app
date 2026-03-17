"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";
import { SCORE_KEYS } from "@/app/lib/constants";

interface Clinician {
  id: number;
  name: string;
  clinician_id?: string;
  account_type?: string;
  total_submissions?: number;
  avg_overall?: number;
  scores?: Record<string, number>;
}

interface PracticeData {
  practice_name?: string;
  total_clinicians?: number;
  total_submissions?: number;
  avg_overall?: number;
  clinicians?: Clinician[];
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 4.5 ? "bg-green-100 text-green-700" :
    score >= 3.5 ? "bg-blue-100 text-nhs-blue" :
    score >= 2.5 ? "bg-orange-100 text-orange-700" :
    "bg-red-100 text-red-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      {score > 0 ? score.toFixed(1) : "—"}
    </span>
  );
}

export default function PracticePage() {
  const router = useRouter();
  const [data, setData]     = useState<PracticeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [search, setSearch] = useState("");

  // Role guard
  const user = getUser();
  useEffect(() => {
    if (user && user.role !== "practice_manager") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    dashApi.getPractice()
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        setData(await res.json());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (error)   return <Err msg={error} />;

  const clinicians = (data?.clinicians ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.clinician_id ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const overallAvg = data?.avg_overall ??
    (clinicians.length
      ? clinicians.reduce((s, c) => s + (c.avg_overall ?? 0), 0) / clinicians.length
      : 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-nhs-blue-dark">Practice Overview</h1>
        <p className="text-sm text-slate-light mt-0.5">{data?.practice_name}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Clinicians", value: data?.total_clinicians ?? clinicians.length },
          { label: "Total Responses", value: data?.total_submissions ?? clinicians.reduce((s, c) => s + (c.total_submissions ?? 0), 0) },
          { label: "Practice Average", value: overallAvg > 0 ? `${overallAvg.toFixed(1)}/5` : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-border shadow-card p-5">
            <p className="text-[10px] font-bold text-slate-light uppercase tracking-wide mb-1">{label}</p>
            <p className="font-serif text-3xl text-nhs-blue-dark">{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clinicians…"
          className="w-full max-w-xs rounded-lg border border-border bg-white px-3.5 py-2 text-sm text-slate placeholder-slate-light/60 focus:outline-none focus:ring-2 focus:ring-nhs-blue transition"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-off-white border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-light uppercase tracking-wide">Clinician</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-light uppercase tracking-wide">ID</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-light uppercase tracking-wide">Type</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-slate-light uppercase tracking-wide">Responses</th>
                {SCORE_KEYS.map(({ key, short }) => (
                  <th key={key} className="text-center px-2 py-3 text-xs font-bold text-slate-light uppercase tracking-wide whitespace-nowrap">
                    {short}
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-xs font-bold text-slate-light uppercase tracking-wide">Avg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clinicians.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-12 text-sm text-slate-light">
                    {search ? "No clinicians match your search." : "No clinicians found."}
                  </td>
                </tr>
              ) : (
                clinicians.map((c) => {
                  const avg = c.avg_overall ??
                    (c.scores ? Object.values(c.scores).reduce((a, b) => a + b, 0) / Object.values(c.scores).length : 0);
                  return (
                    <tr key={c.id} className="hover:bg-off-white/60 transition-colors">
                      <td className="px-5 py-3 font-medium text-nhs-blue-dark whitespace-nowrap">{c.name}</td>
                      <td className="px-4 py-3 text-slate-light font-mono text-xs">{c.clinician_id ?? "—"}</td>
                      <td className="px-4 py-3 text-slate capitalize">{c.account_type?.replace("_", " ") ?? "—"}</td>
                      <td className="px-4 py-3 text-center text-slate">{c.total_submissions ?? 0}</td>
                      {SCORE_KEYS.map(({ key }) => (
                        <td key={key} className="px-2 py-3 text-center">
                          <ScorePill score={c.scores?.[key] ?? 0} />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <ScorePill score={avg} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-4 animate-pulse">
      <div className="skeleton h-8 w-56 rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
      </div>
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <div className="p-8 text-center text-sm text-red-600 bg-red-50 m-6 rounded-xl border border-red-200">
      {msg}
    </div>
  );
}
