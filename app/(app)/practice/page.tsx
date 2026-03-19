"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";
import { SCORE_KEYS } from "@/app/lib/constants";

// ── Rotation helpers ──────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const end = new Date(dateStr);
  end.setHours(23, 59, 59, 999);
  return Math.ceil((end.getTime() - Date.now()) / 86_400_000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

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
  practice_id?: string;
  total_clinicians?: number;
  total_submissions?: number;
  avg_overall?: number;
  clinicians?: Clinician[];
  // Rotation fields
  active_clinician_id?: string;
  active_clinician_name?: string;
  rotation_end_date?: string; // ISO date string
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
  const [data, setData]       = useState<PracticeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [search, setSearch]   = useState("");

  // Rotation change form state
  const [showRotationForm, setShowRotationForm] = useState(false);
  const [rotClinicianId, setRotClinicianId]     = useState("");
  const [rotEndDate, setRotEndDate]             = useState("");
  const [rotSaving, setRotSaving]               = useState(false);
  const [rotMsg, setRotMsg]                     = useState("");

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

  async function handleRotationSave(e: React.FormEvent) {
    e.preventDefault();
    if (!data?.practice_id || !rotClinicianId || !rotEndDate) return;
    setRotSaving(true);
    setRotMsg("");
    try {
      const res = await dashApi.setActiveClinicianRotation(
        data.practice_id, rotClinicianId, rotEndDate
      );
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      // Optimistically update local state
      const chosen = data.clinicians?.find((c) => c.clinician_id === rotClinicianId);
      setData((d) => d ? {
        ...d,
        active_clinician_id:   rotClinicianId,
        active_clinician_name: chosen?.name ?? d.active_clinician_name,
        rotation_end_date:     rotEndDate,
      } : d);
      setRotMsg("Rotation updated!");
      setShowRotationForm(false);
      setTimeout(() => setRotMsg(""), 3000);
    } catch {
      setRotMsg("Failed to save — check your Xano endpoint.");
    } finally {
      setRotSaving(false);
    }
  }

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

      {/* ── Current Rotation ─────────────────────────────────────── */}
      {(() => {
        const days = data?.rotation_end_date ? daysUntil(data.rotation_end_date) : null;
        const warn = days !== null && days <= 7;
        const expired = days !== null && days < 0;
        return (
          <div className={`rounded-2xl border shadow-card p-5 mb-6 ${
            warn ? "bg-amber-50 border-amber-200" : "bg-white border-border"
          }`}>
            {/* Warning banner */}
            {warn && !expired && (
              <div className="flex items-center gap-2 text-sm text-amber-700 font-semibold mb-3">
                <span>⚠️</span>
                <span>
                  {data?.active_clinician_name}&apos;s rotation ends soon — update your active clinician
                </span>
              </div>
            )}
            {expired && (
              <div className="flex items-center gap-2 text-sm text-red-700 font-semibold mb-3">
                <span>🔴</span>
                <span>Rotation has ended — please set a new active clinician</span>
              </div>
            )}

            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-bold text-slate-light uppercase tracking-wide mb-1">
                  Current Rotation
                </p>
                {data?.active_clinician_name ? (
                  <>
                    <p className="text-base font-bold text-nhs-blue-dark">
                      {data.active_clinician_name}
                    </p>
                    {data.rotation_end_date && (
                      <p className={`text-xs mt-0.5 ${warn ? "text-amber-700 font-semibold" : "text-slate-light"}`}>
                        {expired
                          ? `Ended ${fmtDate(data.rotation_end_date)}`
                          : `Ends ${fmtDate(data.rotation_end_date)} · ${days} day${days === 1 ? "" : "s"} remaining`
                        }
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-light italic">No active clinician set</p>
                )}
                {rotMsg && (
                  <p className="text-xs text-nhs-green font-semibold mt-1">✅ {rotMsg}</p>
                )}
              </div>

              <button
                onClick={() => {
                  setShowRotationForm((v) => !v);
                  setRotClinicianId(data?.active_clinician_id ?? "");
                  setRotEndDate(data?.rotation_end_date?.slice(0, 10) ?? "");
                }}
                className="text-sm font-semibold text-nhs-blue border border-nhs-blue rounded-xl px-4 py-2 hover:bg-nhs-blue hover:text-white transition-colors whitespace-nowrap"
              >
                {showRotationForm ? "Cancel" : "Change Active Clinician"}
              </button>
            </div>

            {/* Inline change form */}
            {showRotationForm && (
              <form onSubmit={handleRotationSave} className="mt-4 pt-4 border-t border-border space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate">
                    Active clinician
                  </label>
                  <select
                    value={rotClinicianId}
                    onChange={(e) => setRotClinicianId(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-slate focus:outline-none focus:ring-2 focus:ring-nhs-blue transition"
                  >
                    <option value="">Select clinician…</option>
                    {(data?.clinicians ?? []).map((c) => (
                      <option key={c.clinician_id ?? c.id} value={c.clinician_id ?? ""}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate">
                    Rotation end date
                  </label>
                  <input
                    type="date"
                    value={rotEndDate}
                    onChange={(e) => setRotEndDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    required
                    className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-slate focus:outline-none focus:ring-2 focus:ring-nhs-blue transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={rotSaving}
                  className="w-full bg-nhs-blue text-white font-semibold py-2.5 rounded-xl hover:bg-nhs-blue-dark disabled:opacity-60 transition-all text-sm"
                >
                  {rotSaving ? "Saving…" : "Save Rotation"}
                </button>
              </form>
            )}
          </div>
        );
      })()}

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
