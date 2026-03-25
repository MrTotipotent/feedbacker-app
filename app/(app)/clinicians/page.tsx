"use client";

import { useEffect, useState } from "react";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Clinician {
  id?: number;
  clinician_id: string;
  name: string;
  role?: string;
  redirect_platform?: string | null;
  redirect_url?: string | null;
  rotation_start_date?: string | null;
  rotation_duration_weeks?: number | null;
  practices_id?: number | string | null;
}

interface Submission {
  clinician_id: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function expiryInfo(start: string | null | undefined, weeks: number | null | undefined) {
  if (!start || !weeks) return null;
  const startDate = new Date(start);
  const expiryDate = new Date(startDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysLeft = Math.round((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const weeksLeft = Math.round(daysLeft / 7);
  return { expiryDate, daysLeft, weeksLeft };
}

function platformStyle(platform: string | null | undefined): { label: string; bg: string; color: string } {
  switch ((platform ?? "").toLowerCase()) {
    case "14fish":    return { label: "14Fish",      bg: "#E3F2FD", color: "#005EB8" };
    case "clarity":   return { label: "Clarity",     bg: "#F3E5F5", color: "#7B2D8B" };
    case "nhs_fft":   return { label: "NHS FFT",     bg: "#E8F5E9", color: "#1B5E20" };
    default:          return { label: "Feedbacker",  bg: "#E0F7FA", color: "#006064" };
  }
}

const PRACTICE_URL = "https://feedbacker-app-m3re.vercel.app/p/";
const PLATFORMS = [
  { value: "feedbacker", label: "Feedbacker (built-in)" },
  { value: "14fish",     label: "14Fish" },
  { value: "clarity",   label: "Clarity" },
  { value: "nhs_fft",   label: "NHS FFT" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExpiryBadge({ start, weeks }: { start?: string | null; weeks?: number | null }) {
  const info = expiryInfo(start, weeks);
  if (!info) return <span className="text-xs text-slate-light italic">No rotation set</span>;

  const { weeksLeft, daysLeft } = info;
  if (daysLeft < 0) {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: "#FFEBEE", color: "#C62828" }}>
        ❌ Expired {Math.abs(weeksLeft)}w ago
      </span>
    );
  }
  if (weeksLeft <= 4) {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: "#FFF3E0", color: "#E65C00" }}>
        ⚠️ {weeksLeft}w remaining
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: "#E8F5E9", color: "#1B5E20" }}>
      ✅ {weeksLeft}w remaining
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="bg-white rounded-[10px] border border-border p-5 animate-pulse"
      style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-border/70" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 rounded bg-border/70" />
          <div className="h-3 w-24 rounded bg-border/50" />
        </div>
      </div>
    </div>
  );
}

// ─── Add Clinician Modal ──────────────────────────────────────────────────────

function AddClinicianModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName]         = useState("");
  const [role, setRole]         = useState("");
  const [platform, setPlatform] = useState("feedbacker");
  const [url, setUrl]           = useState("");
  const [weeks, setWeeks]       = useState<number>(4);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  const today = new Date();
  const expiryDate = new Date(today.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  const reminderDate = new Date(expiryDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const res = await dashApi.addClinician({
        name: name.trim(),
        role: role.trim(),
        redirect_platform: platform,
        redirect_url: platform === "feedbacker" ? "" : url.trim(),
        rotation_duration_weeks: weeks,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string })?.message ?? `Failed (${res.status})`);
      }
      onSuccess();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/60 focus:outline-none focus:ring-2 focus:ring-nhs-blue transition";
  const labelCls = "block text-xs font-bold text-slate uppercase tracking-wider mb-1.5";

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-[14px] w-full max-w-lg shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border"
            style={{ background: "linear-gradient(135deg,#005EB8 0%,#003d7a 100%)" }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold text-lg">Add Clinician</h2>
                <p className="text-white/60 text-xs mt-0.5">Set up a new clinician profile for your practice</p>
              </div>
              <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none transition-colors">×</button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className={labelCls}>Full Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dr Sarah Johnson" required className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Role</label>
              <input type="text" value={role} onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. GP, Practice Nurse, HCA, Pharmacist, Receptionist"
                className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Feedback Platform</label>
              <select value={platform} onChange={(e) => { setPlatform(e.target.value); setUrl(""); }}
                className={inputCls}>
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {platform !== "feedbacker" && (
              <div>
                <label className={labelCls}>Redirect URL</label>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder={`Paste your ${platform} / form URL`}
                  required className={inputCls} />
              </div>
            )}

            <div>
              <label className={labelCls}>Rotation Duration (weeks) *</label>
              <input type="number" min={1} max={52} value={weeks}
                onChange={(e) => setWeeks(parseInt(e.target.value) || 1)}
                required className={`${inputCls} w-32`} />
              <div className="mt-2 bg-off-white rounded-lg p-3 border border-border text-xs text-slate-light space-y-1">
                <p>📅 Rotation expires: <strong className="text-slate">{fmt(expiryDate)}</strong></p>
                <p>🔔 Reminder triggers: <strong className="text-slate">{fmt(reminderDate)}</strong></p>
              </div>
            </div>

            {err && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-slate hover:bg-off-white transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-nhs-blue text-white text-sm font-semibold hover:bg-nhs-blue-dark disabled:opacity-60 transition-colors shadow-md">
                {saving ? "Adding…" : "Add Clinician"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Clinician Card ───────────────────────────────────────────────────────────

function ClinicianCard({
  clinician,
  subCount,
  onCopied,
}: {
  clinician: Clinician;
  subCount: number;
  onCopied: (msg: string) => void;
}) {
  const user       = getUser();
  const practicesId = clinician.practices_id ?? user?.practice_id ?? "";
  const practiceUrl = practicesId ? `${PRACTICE_URL}${practicesId}` : "";
  const plt        = platformStyle(clinician.redirect_platform);
  const info       = expiryInfo(clinician.rotation_start_date, clinician.rotation_duration_weeks);

  function copyLink() {
    if (!practiceUrl) { onCopied("No practice URL found"); return; }
    navigator.clipboard.writeText(practiceUrl)
      .then(() => onCopied("Link copied!"))
      .catch(() => onCopied("Copy failed"));
  }

  const btnSm = "text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors";

  return (
    <div className="bg-white rounded-[10px] border border-border overflow-hidden"
      style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#005EB8,#00A9CE)" }}>
            {initials(clinician.name)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="font-semibold text-nhs-blue-dark text-sm">{clinician.name}</p>
                <p className="text-xs text-slate-light mt-0.5">{clinician.role || "—"}</p>
                <p className="text-[10px] text-slate-light font-mono mt-0.5">{clinician.clinician_id}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Platform badge */}
                <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: plt.bg, color: plt.color }}>
                  {plt.label}
                </span>
                {/* Submission count */}
                <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: "#E3F2FD", color: "#005EB8" }}>
                  {subCount} submission{subCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Expiry */}
            <div className="mt-3">
              <ExpiryBadge start={clinician.rotation_start_date} weeks={clinician.rotation_duration_weeks} />
              {info && (
                <span className="ml-2 text-[10px] text-slate-light">
                  (expires {info.expiryDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex items-center gap-2 flex-wrap border-t border-border pt-3">
          <button onClick={copyLink}
            className={`${btnSm} border-nhs-blue text-nhs-blue hover:bg-nhs-blue hover:text-white`}>
            📋 Copy Link
          </button>
          <button
            onClick={() => practiceUrl && window.open(practiceUrl, "_blank")}
            disabled={!practiceUrl}
            className={`${btnSm} border-border text-slate hover:border-nhs-blue hover:text-nhs-blue disabled:opacity-40`}>
            👁 Preview
          </button>
          <button
            onClick={() => practiceUrl && window.open(practiceUrl, "_blank")}
            disabled={!practiceUrl}
            className={`${btnSm} border-nhs-green text-nhs-green hover:bg-nhs-green hover:text-white disabled:opacity-40`}>
            ⬇ Download Card
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CliniciansPage() {
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [showModal, setShowModal]   = useState(false);
  const [toast, setToast]           = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [clinRes, subRes] = await Promise.all([
        dashApi.getClinicians(),
        dashApi.getReviews(),
      ]);
      if (clinRes.ok) {
        const data = await clinRes.json();
        setClinicians(Array.isArray(data) ? data : []);
      } else {
        setError(`Failed to load clinicians (${clinRes.status})`);
      }
      if (subRes.ok) {
        const data = await subRes.json();
        setSubmissions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // Submission count per clinician
  function subCount(clinicianId: string): number {
    return submissions.filter((s) => s.clinician_id === clinicianId).length;
  }

  // Expiry warning — any clinician expiring within 4 weeks
  const expiringClinicians = clinicians.filter((c) => {
    const info = expiryInfo(c.rotation_start_date, c.rotation_duration_weeks);
    return info && info.daysLeft >= 0 && info.weeksLeft <= 4;
  });

  return (
    <div className="p-6 lg:p-8 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-nhs-blue-dark">Clinician Profiles</h1>
          <p className="text-sm text-slate-light mt-0.5">
            Manage your practice clinicians and their feedback setup
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-nhs-blue text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-md whitespace-nowrap"
        >
          <span className="text-lg leading-none">+</span> Add Clinician
        </button>
      </div>

      {/* Expiry warning banner */}
      {expiringClinicians.length > 0 && (
        <div className="mb-5 flex items-start gap-2 text-sm font-medium rounded-[8px] px-4 py-3"
          style={{ background: "#FFF3E0", border: "1px solid #FFB74D", color: "#E65C00" }}>
          <span className="text-base">⚠️</span>
          <span>
            {expiringClinicians.map((c, i) => {
              const info = expiryInfo(c.rotation_start_date, c.rotation_duration_weeks)!;
              return (
                <span key={c.clinician_id}>
                  {i > 0 && " · "}
                  <strong>{c.name}</strong>&apos;s rotation expires in{" "}
                  <strong>{info.weeksLeft} week{info.weeksLeft !== 1 ? "s" : ""}</strong> — time to review
                </span>
              );
            })}
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-[10px] px-6 py-5 text-sm text-red-700 text-center"
          style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
          <p className="font-semibold mb-1">Failed to load clinicians</p>
          <p>{error}</p>
        </div>
      ) : clinicians.length === 0 ? (
        <div className="bg-white rounded-[10px] border-2 border-dashed border-border p-12 text-center"
          style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
          <div className="text-4xl mb-3">👨‍⚕️</div>
          <p className="text-base font-semibold text-nhs-blue-dark mb-1">No clinicians added yet</p>
          <p className="text-sm text-slate-light mb-4">Click + Add Clinician to get started</p>
          <button onClick={() => setShowModal(true)}
            className="bg-nhs-blue text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-nhs-blue-dark transition-all shadow-md">
            + Add Clinician
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {clinicians.map((c) => (
            <ClinicianCard
              key={c.clinician_id}
              clinician={c}
              subCount={subCount(c.clinician_id)}
              onCopied={showToast}
            />
          ))}
        </div>
      )}

      {/* Add Clinician Modal */}
      {showModal && (
        <AddClinicianModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            showToast("Clinician added successfully!");
            loadData();
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-nhs-blue-dark text-white text-sm font-medium px-5 py-3 rounded-xl shadow-2xl z-50 transition-all">
          {toast}
        </div>
      )}
    </div>
  );
}
