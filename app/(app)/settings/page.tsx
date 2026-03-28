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
  const [subTier,        setSubTier]     = useState("basic");
  const [subStatus,      setSubStatus]   = useState("basic");
  const [trialExpiresAt, setTrialExpiry] = useState<string | null>(null);

  // ── Channel Rotation ─────────────────────────────────────────────────────
  const [nhsUrl,           setNhsUrl]           = useState("");
  const [healthwatchUrl,   setHealthwatchUrl]   = useState("");
  const [fftUrl,           setFftUrl]           = useState("");
  const [rotationEnabled,  setRotationEnabled]  = useState(false);
  const [rotationSaving,   setRotationSaving]   = useState(false);
  const [practiceId,       setPracticeId]       = useState<string | number | null>(null);

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

      // Subscription fields
      setSubTier(  data?.subscription_tier   ?? data?.practice?.subscription_tier   ?? "basic");
      setSubStatus(data?.subscription_status ?? data?.practice?.subscription_status ?? "basic");
      setTrialExpiry(data?.trial_expires_at  ?? data?.practice?.trial_expires_at    ?? null);

      // Channel rotation fields
      setNhsUrl(        data?.nhs_review_url  ?? data?.practice?.nhs_review_url  ?? "");
      setHealthwatchUrl(data?.healthwatch_url ?? data?.practice?.healthwatch_url ?? "");
      setFftUrl(        data?.fft_url         ?? data?.practice?.fft_url         ?? "");
      setRotationEnabled(
        data?.rotation_enabled ?? data?.practice?.rotation_enabled ?? false
      );

      // Persist practice_id for save calls
      const pid = data?.practice_id ?? data?.practice?.id ?? data?.id ?? localUser?.practice_id;
      if (pid) setPracticeId(pid);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save Practice Details + Channel URLs ─────────────────────────────────
  async function handlePracticeSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingPractice(true);
    setPracticeMsg("");
    setPracticeErr("");
    try {
      const pid = practiceId ?? localUser?.practice_id;
      if (!pid) throw new Error("No practice ID found. Contact support.");

      // Single call — exact allowed fields only.
      // NEVER include subscription_tier, subscription_status, rotation_enabled,
      // subscription_started_at, trial_expires_at — those are admin-only or saved separately.
      const res = await dashApi.updatePractice(pid, {
        practice_name:     practiceName.trim(),
        ods_code:          odsCode.trim(),
        google_review_url: googleUrl.trim(),
        nhs_review_url:    nhsUrl.trim(),
        healthwatch_url:   healthwatchUrl.trim(),
        fft_url:           fftUrl.trim(),
      });

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

  // ── Rotation toggle — saves immediately on change ─────────────────────────
  async function handleRotationToggle() {
    const pid = practiceId ?? localUser?.practice_id;
    if (!pid || rotationSaving) return;
    const next = !rotationEnabled;
    setRotationEnabled(next);
    setRotationSaving(true);
    try {
      const res = await dashApi.updatePractice(pid, { rotation_enabled: next });
      if (!res.ok) setRotationEnabled(!next); // revert on error
    } catch {
      setRotationEnabled(!next);
    } finally {
      setRotationSaving(false);
    }
  }

  // ── CQC Target ──────────────────────────────────────────────────────────
  const [cqcTarget, setCqcTarget] = useState<number>(4.0);
  const [cqcMsg, setCqcMsg]       = useState("");

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

  // ── Subscription derivations ──────────────────────────────────────────────
  const isPremium  = subTier === "premium" && subStatus === "active";
  const isTrialing = subStatus === "trial" && trialExpiresAt !== null && new Date(trialExpiresAt) > new Date();
  const hasAccess  = isPremium || isTrialing;
  const trialDaysLeft = isTrialing && trialExpiresAt
    ? Math.max(0, Math.ceil((new Date(trialExpiresAt).getTime() - Date.now()) / 86_400_000))
    : null;

  // ── Shared styles ──────────────────────────────────────────────────────────
  const card       = "bg-white rounded-[10px] border border-border p-6";
  const cardShadow = { boxShadow: "0 2px 12px rgba(0,94,184,0.08)" };
  const inputCls   = "w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/60 focus:outline-none focus:ring-2 focus:ring-nhs-blue transition";
  const labelCls   = "block text-xs font-bold text-slate uppercase tracking-wider mb-1.5";
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
              href="/settings#subscription"
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

          {/* Google Review URL — standard feature, no gate */}
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

      {/* ── Feedback Channel Rotation (Premium) ──────────────────────── */}
      <div className={card} style={cardShadow}>
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">
          Feedback Channel Rotation
        </h2>
        <p className="text-sm text-slate-light mb-5">
          Automatically rotate where positive patient sentiment is directed — maximising
          your presence across all NHS feedback channels.
        </p>

        <PremiumGate hasAccess={hasAccess}>
          <div className="space-y-6">

            {/* Smart Rotation toggle */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate">Enable Smart Rotation</p>
                <p className="text-xs text-slate-light mt-0.5">
                  Button 1 on the patient journey page will rotate through your NHS
                  feedback channels by day of the week.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={rotationEnabled}
                aria-label="Enable Smart Rotation"
                disabled={rotationSaving}
                onClick={handleRotationToggle}
                className="flex-shrink-0 w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:ring-offset-2 disabled:opacity-50"
                style={{ background: rotationEnabled ? "#005EB8" : "#D1D5DB" }}
              >
                <span
                  className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                  style={{ left: rotationEnabled ? "calc(100% - 20px)" : "4px" }}
                />
              </button>
            </div>

            {/* Channel rows */}
            <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">

              {/* Row header */}
              <div className="grid grid-cols-[80px_1fr_12px] gap-3 items-center px-4 py-2 bg-off-white">
                <span className="text-[10px] font-bold text-slate-light uppercase tracking-wider">Day</span>
                <span className="text-[10px] font-bold text-slate-light uppercase tracking-wider">Channel</span>
                <span />
              </div>

              {/* Row 1 — Google Reviews (Mon/Tue) */}
              <div className="grid grid-cols-[80px_1fr_12px] gap-3 items-center px-4 py-3">
                <span className="text-xs font-semibold text-slate">Mon / Tue</span>
                <div>
                  <p className="text-sm font-medium text-slate">Google Reviews</p>
                  <p className="text-xs text-slate-light mt-0.5">Uses your existing Google Review URL above</p>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-nhs-green flex-shrink-0" title="Configured" />
              </div>

              {/* Row 2 — NHS Website (Wed) */}
              <div className="px-4 py-3 space-y-2">
                <div className="grid grid-cols-[80px_1fr_12px] gap-3 items-center">
                  <span className="text-xs font-semibold text-slate">Wed</span>
                  <p className="text-sm font-medium text-slate">NHS Website</p>
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: nhsUrl.trim() ? "#009639" : "#F59E0B" }}
                    title={nhsUrl.trim() ? "Configured" : "Required for full rotation"}
                  />
                </div>
                <input
                  type="url"
                  value={nhsUrl}
                  onChange={(e) => setNhsUrl(e.target.value)}
                  placeholder="https://www.nhs.uk/services/gp-surgery/..."
                  className={inputCls}
                />
              </div>

              {/* Row 3 — Healthwatch (Thu) */}
              <div className="px-4 py-3 space-y-2">
                <div className="grid grid-cols-[80px_1fr_12px] gap-3 items-center">
                  <span className="text-xs font-semibold text-slate">Thu</span>
                  <p className="text-sm font-medium text-slate">Healthwatch</p>
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: healthwatchUrl.trim() ? "#009639" : "#F59E0B" }}
                    title={healthwatchUrl.trim() ? "Configured" : "Required for full rotation"}
                  />
                </div>
                <input
                  type="url"
                  value={healthwatchUrl}
                  onChange={(e) => setHealthwatchUrl(e.target.value)}
                  placeholder="https://www.healthwatch.co.uk/..."
                  className={inputCls}
                />
              </div>

              {/* Row 4 — Friends & Family Test (Fri) */}
              <div className="px-4 py-3 space-y-2">
                <div className="grid grid-cols-[80px_1fr_12px] gap-3 items-center">
                  <span className="text-xs font-semibold text-slate">Fri</span>
                  <div>
                    <p className="text-sm font-medium text-slate">
                      Friends &amp; Family Test
                      <span className="ml-2 text-[10px] font-normal text-slate-light">Optional</span>
                    </p>
                  </div>
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: fftUrl.trim() ? "#009639" : "#9CA3AF" }}
                    title={fftUrl.trim() ? "Configured" : "Optional"}
                  />
                </div>
                <input
                  type="url"
                  value={fftUrl}
                  onChange={(e) => setFftUrl(e.target.value)}
                  placeholder="https://www.england.nhs.uk/fft/..."
                  className={inputCls}
                />
              </div>

            </div>

            <p className="text-xs text-slate-light">
              Channel URLs are saved with the <strong>Save Practice Details</strong> button above.
              The rotation toggle saves immediately when changed.
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
