"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";
import { SCORE_KEYS } from "@/app/lib/constants";
import RadarChart from "@/app/components/RadarChart";

interface MeData {
  name: string;
  role: string;
  clinician_id?: string;
  practice_name?: string;
  scores?: Record<string, number>;
  total_submissions?: number;
  avg_overall?: number;
}

interface Review {
  id: number;
  clinician_name?: string;
  clinician_comment?: string;
  practice_comment?: string;
  practice_rating?: number;
  created_at?: string;
  google_consent?: boolean;
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  const pct = (score / 5) * 100;
  const color =
    score >= 4.5 ? "#009639" : score >= 3.5 ? "#005EB8" : score >= 2.5 ? "#E65C00" : "#DA291C";

  return (
    <div className="bg-white rounded-xl border border-border p-4 shadow-card hover:shadow-card-hover transition-shadow">
      <p className="text-[10px] font-bold text-slate-light uppercase tracking-wide mb-2">{label}</p>
      <div className="flex items-end gap-1">
        <span className="font-serif text-3xl leading-none" style={{ color }}>
          {score > 0 ? score.toFixed(1) : "—"}
        </span>
        <span className="text-xs text-slate-light mb-0.5">/5</span>
      </div>
      <div className="mt-2.5 bg-border rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="text-yellow-400 text-sm">
      {"⭐".repeat(Math.min(5, Math.round(n)))}
      {"☆".repeat(Math.max(0, 5 - Math.round(n)))}
    </span>
  );
}

function QrCode({ value }: { value: string }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(value)}&ecc=M&bgcolor=ffffff&color=003d7a&margin=6`;
  return <img src={src} alt="Survey QR code" width={180} height={180} className="rounded-lg" />;
}

export default function DashboardPage() {
  const [me, setMe]           = useState<MeData | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const user = getUser();
  const surveyUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/survey?id=${me?.clinician_id ?? user?.clinician_id ?? ""}`
      : "";

  useEffect(() => {
    async function load() {
      try {
        const [meRes, revRes] = await Promise.all([
          dashApi.getMe(),
          dashApi.getReviews(),
        ]);
        if (meRes.ok)  setMe(await meRes.json());
        if (revRes.ok) setReviews(await revRes.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <PageSkeleton />;
  if (error)   return <ErrorMsg msg={error} />;

  const scores = me?.scores ?? {};
  const overallAvg =
    me?.avg_overall ??
    (Object.values(scores).length
      ? Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length
      : 0);

  // Wall of Love: consented comments only, most recent 6
  const wallOfLove = reviews
    .filter((r) => r.google_consent && (r.clinician_comment || r.practice_comment))
    .slice(0, 6);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-nhs-blue-dark">Dashboard</h1>
        <p className="text-sm text-slate-light mt-0.5">
          Welcome back, {me?.name ?? user?.name ?? "—"} · {me?.practice_name ?? user?.practice_name}
        </p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-nhs-blue rounded-xl p-5 text-white shadow-md col-span-1">
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Total Responses</p>
          <p className="font-serif text-4xl mt-1">{me?.total_submissions ?? "—"}</p>
        </div>
        <div className="bg-nhs-green rounded-xl p-5 text-white shadow-md col-span-1">
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Overall Average</p>
          <p className="font-serif text-4xl mt-1">{overallAvg > 0 ? overallAvg.toFixed(1) : "—"}</p>
          <p className="text-xs text-white/60">out of 5</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-border shadow-card col-span-2 sm:col-span-1 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-light uppercase tracking-wide">Wall of Love</p>
            <p className="font-serif text-4xl text-nhs-blue-dark mt-1">{wallOfLove.length}</p>
            <p className="text-xs text-slate-light">consented reviews</p>
          </div>
          <span className="text-4xl">❤️</span>
        </div>
      </div>

      {/* 10 score cards */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-3">Your Scores</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {SCORE_KEYS.map(({ key, label }) => (
            <ScoreCard key={key} label={label} score={scores[key] ?? 0} />
          ))}
        </div>
      </div>

      {/* Radar + Wall of Love */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Radar chart */}
        <div className="bg-white rounded-2xl shadow-card p-6">
          <h2 className="text-base font-semibold text-nhs-blue-dark mb-4">Score Profile</h2>
          <div className="flex justify-center">
            <RadarChart scores={scores} size={280} />
          </div>
        </div>

        {/* Wall of Love */}
        <div className="bg-white rounded-2xl shadow-card p-6 flex flex-col">
          <h2 className="text-base font-semibold text-nhs-blue-dark mb-4">Wall of Love ❤️</h2>
          {wallOfLove.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-light text-center py-10">
              No consented comments yet.
              <br />Reviews will appear here as patients consent to Google sharing.
            </div>
          ) : (
            <div className="space-y-3 flex-1 overflow-y-auto max-h-72">
              {wallOfLove.map((r) => (
                <div key={r.id} className="bg-off-white rounded-xl p-3 border border-border">
                  <p className="text-sm text-slate italic leading-relaxed line-clamp-3">
                    &ldquo;{r.clinician_comment || r.practice_comment}&rdquo;
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    {r.practice_rating ? <Stars n={r.practice_rating} /> : <span />}
                    <span className="text-xs text-slate-light">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">Your Feedback QR Code</h2>
        <p className="text-sm text-slate-light mb-5">
          Display or share this QR code so patients can quickly leave you feedback.
        </p>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {me?.clinician_id || user?.clinician_id ? (
            <QrCode value={surveyUrl} />
          ) : (
            <div className="w-[180px] h-[180px] rounded-lg bg-off-white border border-border flex items-center justify-center text-xs text-slate-light text-center p-4">
              Clinician ID not found
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs text-slate-light">Survey link:</p>
            <code className="block text-xs bg-off-white border border-border rounded-lg px-3 py-2 text-nhs-blue-dark break-all max-w-xs">
              {surveyUrl || "—"}
            </code>
            <p className="text-xs text-slate-light">
              Clinician ID: <strong className="text-slate">{me?.clinician_id ?? user?.clinician_id ?? "—"}</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-6 animate-pulse">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
      </div>
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="p-8 flex items-center justify-center min-h-64">
      <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-4 text-sm text-red-700 max-w-md text-center">
        {msg}
      </div>
    </div>
  );
}
