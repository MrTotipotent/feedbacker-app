"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";
import { getUser, setUser } from "@/app/lib/auth";

// External feedback platforms. "feedbacker" = built-in form (no URL needed).
const PLATFORMS = [
  { value: "feedbacker", label: "No — use Feedbacker's built-in form" },
  { value: "14fish",     label: "14Fish" },
  { value: "clarity",    label: "Clarity" },
  { value: "nhs_fft",   label: "NHS Friends & Family Test (FFT)" },
  { value: "other",      label: "Other" },
];

function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  if (!value) return null;
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&ecc=M&bgcolor=ffffff&color=003d7a&margin=8`;
  return <img src={src} alt="QR Code" width={size} height={size} className="rounded-xl" />;
}

export default function SettingsPage() {
  const localUser = getUser();

  // Feedback platform + redirect URL state
  const [platform, setPlatform]    = useState("feedbacker");
  const [redirectUrl, setRedirect] = useState(localUser?.redirect_url ?? "");
  const [saving, setSaving]        = useState(false);
  const [saveMsg, setSaveMsg]      = useState("");
  const [saveErr, setSaveErr]      = useState("");

  // Practice details state
  const [practiceName, setPracticeName] = useState(localUser?.practice_name ?? "");
  const [odsCode, setOdsCode]           = useState(localUser?.ods_code as string ?? "");
  const [savingPractice, setSavingPractice] = useState(false);
  const [practiceSaveMsg, setPracticeSaveMsg] = useState("");
  const [practiceSaveErr, setPracticeSaveErr] = useState("");

  // QR code URL — prefer permanent practice URL, fall back to direct clinician link
  const clinicianId = localUser?.clinician_id ?? "";
  const practiceId  = localUser?.practice_id  ?? "";
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const surveyUrl = practiceId
    ? `${origin}/p/${practiceId}`
    : clinicianId
    ? `${origin}/survey?id=${clinicianId}`
    : "";

  // Load current settings from server
  useEffect(() => {
    dashApi.getMe().then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      if (data.redirect_url)      setRedirect(data.redirect_url);
      if (data.redirect_platform) setPlatform(data.redirect_platform);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    setSaveErr("");
    try {
      // If "use Feedbacker" is selected, clear the redirect URL
      const urlToSave = platform === "feedbacker" ? "" : redirectUrl.trim();
      const res = await dashApi.updateRedirectUrl(urlToSave, platform);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Failed (${res.status})`);
      }
      setSaveMsg("Saved successfully!");
      if (localUser) setUser({ ...localUser, redirect_url: urlToSave });
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err: unknown) {
      setSaveErr(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handlePracticeSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingPractice(true);
    setPracticeSaveMsg("");
    setPracticeSaveErr("");
    try {
      // TODO: wire up to Xano PATCH endpoint when ready
      // const res = await dashApi.updatePracticeDetails(practiceName.trim(), odsCode.trim());
      // if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body?.message ?? `Failed (${res.status})`); }
      throw new Error("Xano endpoint not yet connected — add it in api.ts then uncomment above.");
    } catch (err: unknown) {
      setPracticeSaveErr(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingPractice(false);
      setTimeout(() => { setPracticeSaveMsg(""); setPracticeSaveErr(""); }, 4000);
    }
  }

  function handleDeskCard() {
    const printWin = window.open("", "_blank");
    if (!printWin) return;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(surveyUrl)}&ecc=H&bgcolor=ffffff&color=003d7a&margin=10`;
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Feedbacker Desk Card</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet">
        <style>
          body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #F0F4F9; font-family: 'DM Sans', sans-serif; }
          .card { background: white; border-radius: 16px; padding: 40px 36px; text-align: center; max-width: 320px; box-shadow: 0 4px 24px rgba(0,62,122,0.12); }
          .logo { font-family: 'DM Serif Display', serif; font-size: 26px; color: #003d7a; margin-bottom: 4px; }
          .logo span { color: #00A9CE; }
          .sub { font-size: 11px; color: #768692; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 24px; }
          .headline { font-size: 18px; font-weight: 700; color: #003d7a; margin-bottom: 8px; line-height: 1.3; }
          .name { font-size: 15px; color: #425563; margin-bottom: 24px; }
          .qr-wrap { background: #F0F4F9; border-radius: 12px; padding: 16px; display: inline-block; margin-bottom: 20px; }
          .cta { font-size: 13px; color: #768692; line-height: 1.5; }
          .divider { border: none; border-top: 1px solid #D8E0E8; margin: 20px 0; }
          @media print { body { background: white; } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">Feed<span>backer</span></div>
          <div class="sub">NHS GP Patient Feedback</div>
          <div class="headline">Please scan to leave<br/>your feedback</div>
          <div class="name">for ${localUser?.name ?? "your clinician"}</div>
          <div class="qr-wrap">
            <img src="${qrSrc}" width="180" height="180" alt="QR Code" />
          </div>
          <hr class="divider" />
          <div class="cta">
            Scan the QR code with your phone camera — it only takes 2 minutes and is completely anonymous.
          </div>
        </div>
        <script>window.onload = () => { window.print(); }</script>
      </body>
      </html>
    `);
    printWin.document.close();
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-nhs-blue-dark">Settings</h1>
        <p className="text-sm text-slate-light mt-0.5">
          Configure your feedback redirect and download resources
        </p>
      </div>

      {/* Feedback Platform */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">
          Feedback Platform
        </h2>
        <p className="text-sm text-slate-light mb-5">
          Do you use an external feedback platform? Patients will be sent here
          after scanning your QR code.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Platform picker */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate">
              Which platform do you use?
            </label>
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                // Clear URL when switching to built-in
                if (e.target.value === "feedbacker") setRedirect("");
              }}
              className="w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate focus:outline-none focus:ring-2 focus:ring-nhs-blue transition"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* URL input — only shown when using an external platform */}
          {platform !== "feedbacker" && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate">
                Paste your feedback form link
              </label>
              <input
                type="url"
                value={redirectUrl}
                onChange={(e) => setRedirect(e.target.value)}
                placeholder="https://your-platform.com/your-form"
                required
                className="w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/60 focus:outline-none focus:ring-2 focus:ring-nhs-blue transition"
              />
              <p className="text-xs text-slate-light">
                Patients are redirected here after leaving a quick comment.
              </p>
            </div>
          )}

          {/* Feedbacker built-in notice */}
          {platform === "feedbacker" && (
            <div className="bg-nhs-blue/5 border border-nhs-blue/20 rounded-xl px-4 py-3 text-sm text-nhs-blue-dark">
              Patients will use Feedbacker&apos;s built-in feedback form.
              No external link needed.
            </div>
          )}

          {saveMsg && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-nhs-green font-medium">
              ✅ {saveMsg}
            </div>
          )}
          {saveErr && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {saveErr}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-nhs-blue text-white font-semibold py-3 rounded-xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </form>
      </div>

      {/* Practice Details */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">Practice Details</h2>
        <p className="text-sm text-slate-light mb-5">
          Enter your GP surgery details. Your ODS code can be found on your NHS contract
          or by asking your Practice Manager.
        </p>

        <form onSubmit={handlePracticeSave} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate">
              Practice Name
            </label>
            <input
              type="text"
              value={practiceName}
              onChange={(e) => setPracticeName(e.target.value)}
              placeholder="e.g. Hockley Farm Surgery"
              className="w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/60 focus:outline-none focus:ring-2 focus:ring-nhs-blue transition"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate">
              Practice Code <span className="text-slate-light font-normal">(ODS code)</span>
            </label>
            <input
              type="text"
              value={odsCode}
              onChange={(e) => setOdsCode(e.target.value.toUpperCase())}
              placeholder="e.g. C82053"
              maxLength={10}
              className="w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/60 font-mono focus:outline-none focus:ring-2 focus:ring-nhs-blue transition"
            />
            <p className="text-xs text-slate-light">
              Your unique NHS ODS code identifies your practice across NHS systems.
            </p>
          </div>

          {practiceSaveMsg && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-nhs-green font-medium">
              ✅ {practiceSaveMsg}
            </div>
          )}
          {practiceSaveErr && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {practiceSaveErr}
            </div>
          )}

          <button
            type="submit"
            disabled={savingPractice}
            className="w-full bg-nhs-blue text-white font-semibold py-3 rounded-xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {savingPractice ? "Saving…" : "Save Practice Details"}
          </button>
        </form>
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">Your Practice QR Code</h2>
        <p className="text-sm text-slate-light mb-2">
          This is your permanent practice QR code — never needs reprinting.
        </p>
        {practiceId && (
          <p className="text-xs text-nhs-green font-medium mb-5">
            ✓ Points to the currently active clinician — automatically updates when your rotation changes.
          </p>
        )}

        {surveyUrl ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="bg-off-white p-3 rounded-xl border border-border">
              <QrCode value={surveyUrl} size={180} />
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <p className="text-xs text-slate-light mb-1">Permanent link:</p>
                <code className="block text-xs bg-off-white border border-border rounded-lg px-3 py-2 text-nhs-blue-dark break-all">
                  {surveyUrl}
                </code>
              </div>
              {!practiceId && clinicianId && (
                <p className="text-xs text-amber-600">
                  ⚠️ No practice ID found — showing your personal clinician link instead.
                  Ask your Practice Manager to link your account.
                </p>
              )}
              {practiceId && (
                <div>
                  <p className="text-xs text-slate-light mb-1">Practice ID:</p>
                  <code className="text-xs font-mono text-nhs-blue-dark bg-off-white border border-border rounded px-2 py-1">
                    {practiceId}
                  </code>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-light py-6 text-center">
            No practice or clinician ID found. Contact your Practice Manager.
          </div>
        )}
      </div>

      {/* Desk Card */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">Desk Card</h2>
        <p className="text-sm text-slate-light mb-5">
          A printable card with your QR code to place on your consulting room desk.
          Patients scan it to leave instant feedback after their appointment.
        </p>

        {/* Preview */}
        <div className="bg-off-white rounded-xl p-6 text-center border border-border mb-5">
          <div className="font-serif text-xl text-nhs-blue-dark mb-0.5">
            Feed<span className="text-nhs-aqua">backer</span>
          </div>
          <div className="text-[10px] text-slate-light uppercase tracking-widest mb-4">NHS GP Patient Feedback</div>
          <p className="text-sm font-semibold text-nhs-blue-dark mb-1">Please scan to leave your feedback</p>
          <p className="text-xs text-slate-light mb-4">for {localUser?.name ?? "your clinician"}</p>
          {surveyUrl && (
            <div className="inline-block bg-white rounded-xl p-3 shadow-sm">
              <QrCode value={surveyUrl} size={120} />
            </div>
          )}
          <p className="text-xs text-slate-light mt-4">Anonymous · Takes 2 minutes</p>
        </div>

        <button
          onClick={handleDeskCard}
          disabled={!surveyUrl}
          className="w-full flex items-center justify-center gap-2 bg-nhs-green text-white font-semibold py-3 rounded-xl hover:bg-green-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          Download Desk Card (PDF)
        </button>
      </div>

      {/* Account info */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-3">Account</h2>
        <dl className="space-y-2 text-sm">
          {[
            { label: "Name",          value: localUser?.name },
            { label: "Email",         value: localUser?.email },
            { label: "Role",          value: localUser?.role?.replace("_", " ") },
            { label: "Clinician ID",  value: localUser?.clinician_id },
            { label: "Practice",      value: localUser?.practice_name },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-4">
              <dt className="text-slate-light w-28 flex-shrink-0">{label}</dt>
              <dd className="text-slate font-medium capitalize">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
