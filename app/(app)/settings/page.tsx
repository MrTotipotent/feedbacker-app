"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";
import PremiumGate from "@/app/components/PremiumGate";

export default function SettingsPage() {
  const localUser = getUser();

  // ── Practice Details ────────────────────────────────────────────────────
  const [practiceName, setPracticeName] = useState(localUser?.practice_name ?? "");
  const [odsCode, setOdsCode]           = useState((localUser?.ods_code as string) ?? "");
  const [googleUrl, setGoogleUrl]       = useState("");
  const [savingPractice, setSavingPractice] = useState(false);
  const [practiceMsg, setPracticeMsg]   = useState("");
  const [practiceErr, setPracticeErr]   = useState("");

  // ── Subscription ─────────────────────────────────────────────────────────
  const [subTier,       setSubTier]      = useState("basic");
  const [subStatus,     setSubStatus]    = useState("basic");
  const [trialExpiresAt, setTrialExpiry] = useState<string | null>(null);

  // Load practice details from API on mount
  useEffect(() => {
    dashApi.getPractice().then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      const url = data?.practice?.google_review_url ?? data?.google_review_url ?? "";
      if (url) setGoogleUrl(url);
      const name = data?.practice_name ?? data?.practice?.name ?? data?.name ?? "";
      if (name) setPracticeName(name);
      const ods = data?.practice?.ods_code ?? data?.ods_code ?? "";
      if (ods) setOdsCode(ods);
      // Subscription fields (returned after Xano schema update)
      const tier   = data?.subscription_tier   ?? data?.practice?.subscription_tier   ?? "basic";
      const status = data?.subscription_status ?? data?.practice?.subscription_status ?? "basic";
      const expiry = data?.trial_expires_at    ?? data?.practice?.trial_expires_at    ?? null;
      setSubTier(tier);
      setSubStatus(status);
      setTrialExpiry(expiry);
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

  // ── Subscription derivations ─────────────────────────────────────────────
  const isPremium  = subTier === "premium" && subStatus === "active";
  const isTrialing = subStatus === "trial" && trialExpiresAt !== null && new Date(trialExpiresAt) > new Date();
  const hasAccess  = isPremium || isTrialing;
  const trialDaysLeft = isTrialing && trialExpiresAt
    ? Math.max(0, Math.ceil((new Date(trialExpiresAt).getTime() - Date.now()) / 86_400_000))
    : null;

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

      {/* ── Subscription Status Banner ─────────────────────────────────── */}
      <div id="subscription">
        {isPremium && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-green-50 border border-green-200">
            <span className="w-2 h-2 rounded-full bg-nhs-green flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Premium — Active</p>
              <p className="text-xs text-green-700">You have full access to all Feedbacker features.</p>
            </div>
          </div>
        )}
        {isTrialing && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-amber-50 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Trial — {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining
              </p>
              <p className="text-xs text-amber-700">Full premium access during your trial period.</p>
            </div>
          </div>
        )}
        {!isPremium && !isTrialing && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-slate-50 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700">Basic Plan</p>
              <p className="text-xs text-slate-500">Upgrade to Premium to unlock advanced features.</p>
            </div>
            <a
              href="mailto:hello@feedbacker.co.uk?subject=Upgrade%20to%20Premium"
              className="text-xs font-semibold text-nhs-blue hover:underline whitespace-nowrap"
            >
              Upgrade
            </a>
          </div>
        )}
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

          <PremiumGate hasAccess={hasAccess}>
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
          </PremiumGate>

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

      {/* ── Smart Rotation (Premium) ──────────────────────────────────── */}
      <div className={card} style={cardShadow}>
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">Smart Rotation</h2>
        <p className="text-sm text-slate-light mb-5">
          Automatically rotate clinicians based on a scheduled calendar — no manual updates needed.
        </p>
        <PremiumGate hasAccess={hasAccess}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate">Enable Smart Rotation</p>
                <p className="text-xs text-slate-light mt-0.5">
                  Clinicians rotate automatically based on their assigned dates.
                </p>
              </div>
              {/* Toggle — visual placeholder; functionality wired in future sprint */}
              <button
                type="button"
                aria-label="Toggle Smart Rotation"
                className="w-11 h-6 rounded-full bg-slate-200 relative transition-colors focus:outline-none focus:ring-2 focus:ring-nhs-blue"
              >
                <span className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow transition-transform" />
              </button>
            </div>
            <p className="text-xs text-slate-light border-t border-border pt-3">
              Rotation schedule is managed in the <a href="/practice" className="text-nhs-blue hover:underline">Practice</a> tab.
            </p>
          </div>
        </PremiumGate>
      </div>

      {/* ── Account (read-only) ───────────────────────────────────────── */}
      <div className={card} style={cardShadow}>
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-4">Account</h2>
        <dl className="space-y-3">
          {[
            { label: "Name",     value: localUser?.name },
            { label: "Email",    value: localUser?.email },
            { label: "Role",     value: localUser?.role?.replace(/_/g, " ") },
            { label: "Practice", value: practiceName || undefined },
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
