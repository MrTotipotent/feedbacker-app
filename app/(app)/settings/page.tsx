"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";

export default function SettingsPage() {
  const localUser = getUser();

  // ── Practice Details ────────────────────────────────────────────────────
  const [practiceName, setPracticeName] = useState(localUser?.practice_name ?? "");
  const [odsCode, setOdsCode]           = useState((localUser?.ods_code as string) ?? "");
  const [googleUrl, setGoogleUrl]       = useState("");
  const [savingPractice, setSavingPractice] = useState(false);
  const [practiceMsg, setPracticeMsg]   = useState("");
  const [practiceErr, setPracticeErr]   = useState("");

  // Load google_review_url from practice record on mount
  useEffect(() => {
    dashApi.getPractice().then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      console.log("[getPractice] raw response:", JSON.stringify(data, null, 2));
      const url = data?.practice?.google_review_url ?? data?.google_review_url ?? "";
      if (url) setGoogleUrl(url);
      if (data?.practice?.name ?? data?.name) {
        setPracticeName(data?.practice?.name ?? data?.name ?? practiceName);
      }
      if (data?.practice?.ods_code ?? data?.ods_code) {
        setOdsCode(data?.practice?.ods_code ?? data?.ods_code ?? odsCode);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePracticeSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingPractice(true);
    setPracticeMsg("");
    setPracticeErr("");
    try {
      const pid = localUser?.practice_id;
      if (!pid) throw new Error("No practice ID found. Contact support.");

      // Save Google Review URL
      const res = await dashApi.updateGoogleReviewUrl(pid, googleUrl.trim());
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string })?.message ?? `Failed (${res.status})`);
      }
      setPracticeMsg("Saved successfully!");
      setTimeout(() => setPracticeMsg(""), 3000);
    } catch (err: unknown) {
      setPracticeErr(err instanceof Error ? err.message : "Something went wrong");
      setTimeout(() => setPracticeErr(""), 4000);
    } finally {
      setSavingPractice(false);
    }
  }

  // ── CQC Target ──────────────────────────────────────────────────────────
  const [cqcTarget, setCqcTarget]   = useState<number>(4.0);
  const [cqcMsg, setCqcMsg]         = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("cqc_target");
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed)) setCqcTarget(parsed);
    }
  }, []);

  function handleCqcSave(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("cqc_target", String(cqcTarget));
    setCqcMsg("Saved!");
    setTimeout(() => setCqcMsg(""), 3000);
  }

  // ── Shared card style ───────────────────────────────────────────────────
  const card = "bg-white rounded-[10px] border border-border p-6";
  const cardShadow = { boxShadow: "0 2px 12px rgba(0,94,184,0.08)" };
  const inputCls = "w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/60 focus:outline-none focus:ring-2 focus:ring-nhs-blue transition";
  const labelCls = "block text-xs font-bold text-slate uppercase tracking-wider mb-1.5";
  const btnPrimary = "w-full bg-nhs-blue text-white font-semibold py-3 rounded-xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md";

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-nhs-blue-dark">Settings</h1>
        <p className="text-sm text-slate-light mt-0.5">
          Manage your practice configuration
        </p>
      </div>

      {/* ── Practice Details ──────────────────────────────────────────── */}
      <div className={card} style={cardShadow}>
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">Practice Details</h2>
        <p className="text-sm text-slate-light mb-5">
          Your GP surgery information and Google Review link.
        </p>

        <form onSubmit={handlePracticeSave} className="space-y-4">
          <div>
            <label className={labelCls}>Practice Name</label>
            <input
              type="text"
              value={practiceName}
              onChange={(e) => setPracticeName(e.target.value)}
              placeholder="e.g. Hockley Farm Surgery"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>
              ODS Code <span className="text-slate-light font-normal normal-case">(NHS identifier)</span>
            </label>
            <input
              type="text"
              value={odsCode}
              onChange={(e) => setOdsCode(e.target.value.toUpperCase())}
              placeholder="e.g. C82053"
              maxLength={10}
              className={`${inputCls} font-mono`}
            />
          </div>

          <div>
            <label className={labelCls}>Google Review URL</label>
            <input
              type="url"
              value={googleUrl}
              onChange={(e) => setGoogleUrl(e.target.value)}
              placeholder="https://g.page/r/your-practice-review-link"
              className={inputCls}
            />
            <p className="text-xs text-slate-light mt-1">
              Patients will be directed here after completing their feedback.
            </p>
          </div>

          {practiceMsg && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-nhs-green font-medium">
              ✅ {practiceMsg}
            </div>
          )}
          {practiceErr && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {practiceErr}
            </div>
          )}

          <button type="submit" disabled={savingPractice} className={btnPrimary}>
            {savingPractice ? "Saving…" : "Save Practice Details"}
          </button>
        </form>
      </div>

      {/* ── CQC Target ───────────────────────────────────────────────── */}
      <div className={card} style={cardShadow}>
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">Internal CQC Target</h2>
        <p className="text-sm text-slate-light mb-5">
          Set your minimum acceptable Feedbacker score for CQC target tracking.
        </p>

        <form onSubmit={handleCqcSave} className="space-y-4">
          <div>
            <label className={labelCls}>Target score (out of 5.0)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={5}
                step={0.1}
                value={cqcTarget}
                onChange={(e) => setCqcTarget(parseFloat(e.target.value))}
                className="w-28 rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate font-semibold focus:outline-none focus:ring-2 focus:ring-nhs-blue transition"
              />
              <span className="text-sm text-slate-light">/ 5.0</span>
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full ml-auto"
                style={
                  cqcTarget <= 4.0
                    ? { background: "#E8F5E9", color: "#009639" }
                    : { background: "#FFF3E0", color: "#E65C00" }
                }
              >
                {cqcTarget <= 3.0 ? "⚠️ Low target"
                  : cqcTarget <= 4.5 ? "✅ Reasonable"
                  : "⭐ High target"}
              </span>
            </div>
            <p className="text-xs text-slate-light mt-1.5">
              NHS average is typically 4.0. The dashboard CQC card updates to reflect this target.
            </p>
          </div>

          {cqcMsg && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-nhs-green font-medium">
              ✅ {cqcMsg}
            </div>
          )}

          <button type="submit" className={btnPrimary}>
            Save CQC Target
          </button>
        </form>
      </div>

      {/* ── Account (read-only) ───────────────────────────────────────── */}
      {console.log("[Account] localUser from getUser():", JSON.stringify(localUser, null, 2)) as unknown as null}
      <div className={card} style={cardShadow}>
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-4">Account</h2>
        <dl className="space-y-3">
          {[
            { label: "Name",     value: localUser?.name },
            { label: "Email",    value: localUser?.email },
            { label: "Role",     value: localUser?.role?.replace(/_/g, " ") },
            { label: "Practice", value: localUser?.practice_name },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start gap-4">
              <dt className="text-xs font-bold text-slate-light uppercase tracking-wider w-24 flex-shrink-0 pt-0.5">
                {label}
              </dt>
              <dd className="text-sm text-slate font-medium capitalize">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

    </div>
  );
}
