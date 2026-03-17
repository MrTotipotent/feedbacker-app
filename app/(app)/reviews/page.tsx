"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";

interface Review {
  id: number;
  clinician_name?: string;
  clinician_comment?: string;
  practice_comment?: string;
  practice_rating?: number;
  google_consent?: boolean;
  created_at?: string;
}

function Stars({ n }: { n: number }) {
  const filled = Math.min(5, Math.round(n));
  return (
    <span className="text-yellow-400 text-base" aria-label={`${n} stars`}>
      {"⭐".repeat(filled)}{"☆".repeat(5 - filled)}
    </span>
  );
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [filter, setFilter]   = useState<"all" | "5" | "4">("all");
  const [copied, setCopied]   = useState<number | null>(null);

  useEffect(() => {
    dashApi.getReviews()
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        setReviews(await res.json());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function copyToClipboard(text: string, id: number) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <Skeleton />;
  if (error)   return <Err msg={error} />;

  const consented = reviews.filter((r) => r.google_consent);
  const filtered  = consented.filter((r) => {
    if (filter === "5") return (r.practice_rating ?? 0) >= 5;
    if (filter === "4") return (r.practice_rating ?? 0) >= 4;
    return true;
  });

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nhs-blue-dark">Wall of Love ❤️</h1>
          <p className="text-sm text-slate-light mt-0.5">
            {consented.length} consented Google review{consented.length !== 1 ? "s" : ""} ready to copy
          </p>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {(["all", "5", "4"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === f
                  ? "bg-nhs-blue text-white shadow-sm"
                  : "bg-white text-slate border border-border hover:border-nhs-blue hover:text-nhs-blue"
              }`}
            >
              {f === "all" ? "All" : `${f}★+`}
            </button>
          ))}
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-nhs-blue/5 border border-nhs-blue/20 rounded-xl px-4 py-3 text-sm text-nhs-blue-dark mb-6 flex items-start gap-3">
        <span className="text-base mt-0.5">💡</span>
        <span>
          These are comments where patients consented to public sharing. Copy them to paste directly as Google reviews.
          Never edit a patient comment before posting.
        </span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card p-12 text-center">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-slate-light text-sm">
            {consented.length === 0
              ? "No consented reviews yet — they'll appear here once patients consent."
              : "No reviews match this filter."}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((r) => {
            const text = r.clinician_comment || r.practice_comment || "";
            return (
              <div
                key={r.id}
                className="bg-white rounded-2xl shadow-card border border-border p-5 flex flex-col gap-3 hover:shadow-card-hover transition-shadow"
              >
                {/* Stars */}
                <div className="flex items-center justify-between">
                  {r.practice_rating ? <Stars n={r.practice_rating} /> : <span />}
                  <span className="text-[11px] text-slate-light">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : ""}
                  </span>
                </div>

                {/* Comment */}
                <p className="text-sm text-slate italic leading-relaxed flex-1">
                  &ldquo;{text}&rdquo;
                </p>

                {/* Clinician */}
                {r.clinician_name && (
                  <p className="text-xs text-slate-light">
                    For: <span className="font-medium text-slate">{r.clinician_name}</span>
                  </p>
                )}

                {/* Copy button */}
                <button
                  onClick={() => copyToClipboard(text, r.id)}
                  className={`mt-1 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    copied === r.id
                      ? "bg-nhs-green text-white"
                      : "bg-nhs-blue text-white hover:bg-nhs-blue-dark active:scale-[0.98]"
                  }`}
                >
                  {copied === r.id ? (
                    <>
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                      </svg>
                      Copy for Google Review
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-4 animate-pulse">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="grid sm:grid-cols-2 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="skeleton h-48 rounded-2xl" />)}
      </div>
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
