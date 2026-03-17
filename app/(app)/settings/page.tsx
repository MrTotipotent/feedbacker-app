"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";
import { getUser, setUser } from "@/app/lib/auth";

const PLATFORMS = [
  { value: "google",   label: "Google Business Profile", prefix: "https://g.page/r/" },
  { value: "nhs",      label: "NHS Website",              prefix: "https://www.nhs.uk/" },
  { value: "practice", label: "Practice Website",         prefix: "https://" },
  { value: "custom",   label: "Custom URL",               prefix: "https://" },
];

function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  if (!value) return null;
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&ecc=M&bgcolor=ffffff&color=003d7a&margin=8`;
  return <img src={src} alt="QR Code" width={size} height={size} className="rounded-xl" />;
}

export default function SettingsPage() {
  const localUser = getUser();

  // Redirect URL state
  const [platform, setPlatform]   = useState("google");
  const [redirectUrl, setRedirect] = useState(localUser?.redirect_url ?? "");
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState("");
  const [saveErr, setSaveErr]     = useState("");

  // Survey URL for QR code
  const clinicianId = localUser?.clinician_id ?? "";
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const surveyUrl = clinicianId ? `${origin}/survey?id=${clinicianId}` : "";

  // Load current settings from server
  useEffect(() => {
    dashApi.getMe().then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      if (data.redirect_url) setRedirect(data.redirect_url);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    setSaveErr("");
    try {
      const res = await dashApi.updateRedirectUrl(redirectUrl);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Failed (${res.status})`);
      }
      setSaveMsg("Saved successfully!");
      // Update local user cache
      if (localUser) setUser({ ...localUser, redirect_url: redirectUrl });
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err: unknown) {
      setSaveErr(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
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

      {/* Redirect URL */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">Post-Survey Redirect</h2>
        <p className="text-sm text-slate-light mb-5">
          Where patients are sent after submitting their feedback.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate">Platform</label>
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                const p = PLATFORMS.find((p) => p.value === e.target.value);
                if (p && !redirectUrl.startsWith(p.prefix)) {
                  setRedirect(p.prefix);
                }
              }}
              className="w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate focus:outline-none focus:ring-2 focus:ring-nhs-blue transition"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate">
              Redirect URL <span className="text-nhs-red">*</span>
            </label>
            <input
              type="url"
              value={redirectUrl}
              onChange={(e) => setRedirect(e.target.value)}
              placeholder="https://g.page/r/your-google-review-link"
              required
              className="w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/60 focus:outline-none focus:ring-2 focus:ring-nhs-blue transition"
            />
            {platform === "google" && (
              <p className="text-xs text-slate-light">
                Find your Google review link in Google Business Profile → Get more reviews.
              </p>
            )}
          </div>

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
            {saving ? "Saving…" : "Save Redirect URL"}
          </button>
        </form>
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="text-base font-semibold text-nhs-blue-dark mb-1">Your Survey QR Code</h2>
        <p className="text-sm text-slate-light mb-5">
          This QR code links patients directly to your personalised feedback form.
        </p>

        {surveyUrl ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="bg-off-white p-3 rounded-xl border border-border">
              <QrCode value={surveyUrl} size={180} />
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <p className="text-xs text-slate-light mb-1">Survey link:</p>
                <code className="block text-xs bg-off-white border border-border rounded-lg px-3 py-2 text-nhs-blue-dark break-all">
                  {surveyUrl}
                </code>
              </div>
              <div>
                <p className="text-xs text-slate-light mb-1">Your clinician ID:</p>
                <code className="text-xs font-mono text-nhs-blue-dark bg-off-white border border-border rounded px-2 py-1">
                  {clinicianId}
                </code>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-light py-6 text-center">
            Clinician ID not set. Contact your practice manager.
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
