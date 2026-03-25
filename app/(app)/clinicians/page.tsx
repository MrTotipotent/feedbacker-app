"use client";

import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
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
  clinician_name?: string | null;
}

interface Room {
  id: number;
  room_name: string;
  practice_id: number;
  active_clinician_id: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRACTICE_URL = "https://feedbacker-app-m3re.vercel.app/p/";
const PLATFORMS = [
  { value: "feedbacker", label: "Feedbacker (built-in)" },
  { value: "14fish",     label: "14Fish" },
  { value: "clarity",   label: "Clarity" },
  { value: "nhs_fft",   label: "NHS FFT" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function expiryInfo(start: string | null | undefined, weeks: number | null | undefined) {
  if (!start || !weeks) return null;
  const startDate  = new Date(start);
  const expiryDate = new Date(startDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  const now        = new Date();
  const daysLeft   = Math.round((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const weeksLeft  = Math.round(daysLeft / 7);
  return { expiryDate, daysLeft, weeksLeft };
}

function platformStyle(platform: string | null | undefined): { label: string; bg: string; color: string } {
  switch ((platform ?? "").toLowerCase()) {
    case "14fish":  return { label: "14Fish",     bg: "#E3F2FD", color: "#005EB8" };
    case "clarity": return { label: "Clarity",    bg: "#F3E5F5", color: "#7B2D8B" };
    case "nhs_fft": return { label: "NHS FFT",    bg: "#E8F5E9", color: "#1B5E20" };
    default:        return { label: "Feedbacker", bg: "#E0F7FA", color: "#006064" };
  }
}

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

// ─── QR Preview Modal ─────────────────────────────────────────────────────────

function QrPreviewModal({
  roomId,
  roomName,
  onClose,
}: {
  roomId: number;
  roomName: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, `${PRACTICE_URL}${roomId}`, {
      width: 240,
      margin: 2,
      color: { dark: "#003d7a", light: "#ffffff" },
    }).catch(() => {});
  }, [roomId]);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-xs w-full">
          <h3 className="text-base font-bold text-nhs-blue-dark">{roomName}</h3>
          <canvas ref={canvasRef} className="rounded-lg" />
          <p className="text-xs text-slate-light text-center break-all">{PRACTICE_URL}{roomId}</p>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-nhs-blue text-white text-sm font-semibold hover:bg-nhs-blue-dark transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Download Card ────────────────────────────────────────────────────────────

async function downloadRoomCard(roomId: number, roomName: string) {
  // Business card: 85mm × 55mm at 96dpi → ~322 × 208px
  const W = 322;
  const H = 208;
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Top accent bar
  ctx.fillStyle = "#005EB8";
  ctx.fillRect(0, 0, W, 6);

  // Room name
  ctx.fillStyle = "#003d7a";
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(roomName, W / 2, 30);

  // Generate QR as data URL and draw centred
  const qrDataUrl = await QRCode.toDataURL(`${PRACTICE_URL}${roomId}`, {
    width: 120,
    margin: 1,
    color: { dark: "#003d7a", light: "#ffffff" },
  });
  const img = new Image();
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.src = qrDataUrl;
  });
  ctx.drawImage(img, (W - 120) / 2, 38, 120, 120);

  // "Scan for feedback" caption
  ctx.fillStyle = "#768692";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Scan for feedback", W / 2, 175);

  // Feedbacker wordmark
  ctx.font = "bold 12px serif";
  ctx.fillStyle = "#005EB8";
  ctx.fillText("Feed", W / 2 - 14, 193);
  ctx.fillStyle = "#00A9CE";
  ctx.fillText("backer", W / 2 + 16, 193);

  // Bottom accent bar
  ctx.fillStyle = "#005EB8";
  ctx.fillRect(0, H - 4, W, 4);

  // Trigger download
  const link = document.createElement("a");
  link.download = `feedbacker-qr-${roomName.replace(/\s+/g, "-").toLowerCase()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ─── Room Card ────────────────────────────────────────────────────────────────

function RoomCard({
  room,
  clinicians,
  onSaved,
  onToast,
}: {
  room: Room;
  clinicians: Clinician[];
  onSaved: () => void;
  onToast: (msg: string) => void;
}) {
  const [name, setName]                 = useState(room.room_name);
  const [activeClinId, setActiveClinId] = useState(room.active_clinician_id ?? "");
  const [saving, setSaving]             = useState(false);
  const [showQr, setShowQr]             = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await dashApi.updateRoom(room.id, name.trim(), activeClinId);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      onToast("Room saved!");
      onSaved();
    } catch {
      onToast("Save failed — please try again");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "rounded-lg border border-border bg-off-white px-3 py-2 text-sm text-slate focus:outline-none focus:ring-2 focus:ring-nhs-blue transition";
  const btnSm    = "text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors";

  return (
    <>
      <div
        className="bg-white rounded-[10px] border border-border p-5"
        style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Room name */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputCls} flex-1 font-semibold`}
            placeholder="Room name"
          />

          {/* Clinician dropdown */}
          <select
            value={activeClinId}
            onChange={(e) => setActiveClinId(e.target.value)}
            className={`${inputCls} flex-1`}
          >
            <option value="">— Select clinician —</option>
            {clinicians.map((c) => (
              <option key={c.clinician_id} value={c.clinician_id}>
                {c.name}{c.role ? ` — ${c.role}` : ""}
              </option>
            ))}
          </select>

          {/* Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowQr(true)}
              className={`${btnSm} border-border text-slate hover:border-nhs-blue hover:text-nhs-blue`}
            >
              🔍 Preview QR
            </button>
            <button
              onClick={() => downloadRoomCard(room.id, name || room.room_name)}
              className={`${btnSm} border-nhs-green text-nhs-green hover:bg-nhs-green hover:text-white`}
            >
              ⬇ Download Card
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`${btnSm} border-nhs-blue bg-nhs-blue text-white hover:bg-nhs-blue-dark disabled:opacity-60`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <p className="mt-2 text-[10px] text-slate-light font-mono">
          {PRACTICE_URL}{room.id}
        </p>
      </div>

      {showQr && (
        <QrPreviewModal
          roomId={room.id}
          roomName={name || room.room_name}
          onClose={() => setShowQr(false)}
        />
      )}
    </>
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

  const today        = new Date();
  const expiryDate   = new Date(today.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  const reminderDate = new Date(expiryDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  const fmt          = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

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
  const user        = getUser();
  const practicesId = clinician.practices_id ?? user?.practice_id ?? "";
  const practiceUrl = practicesId ? `${PRACTICE_URL}${practicesId}` : "";
  const plt         = platformStyle(clinician.redirect_platform);
  const info        = expiryInfo(clinician.rotation_start_date, clinician.rotation_duration_weeks);

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
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#005EB8,#00A9CE)" }}>
            {initials(clinician.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="font-semibold text-nhs-blue-dark text-sm">{clinician.name}</p>
                <p className="text-xs text-slate-light mt-0.5">{clinician.role || "—"}</p>
                <p className="text-[10px] text-slate-light font-mono mt-0.5">{clinician.clinician_id}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: plt.bg, color: plt.color }}>
                  {plt.label}
                </span>
                <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: "#E3F2FD", color: "#005EB8" }}>
                  {subCount} submission{subCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
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
  const user = getUser();
  const practiceId = typeof user?.practice_id === "number"
    ? user.practice_id
    : parseInt(String(user?.practice_id ?? "0"), 10);

  const [clinicians,  setClinicians]  = useState<Clinician[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [showModal,   setShowModal]   = useState(false);
  const [toast,       setToast]       = useState("");

  const [rooms,        setRooms]        = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [addingRoom,   setAddingRoom]   = useState(false);

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
        const clist: Clinician[] = Array.isArray(data) ? data : [];
        console.log("[getClinicians] count:", clist.length);
        console.log("[getClinicians] clinician_ids:", clist.map((c) => c.clinician_id));
        if (clist.length > 0) console.log("[getClinicians] first row:", clist[0]);
        setClinicians(clist);
      } else {
        setError(`Failed to load clinicians (${clinRes.status})`);
      }
      if (subRes.ok) {
        const data = await subRes.json();
        const slist: Submission[] = Array.isArray(data) ? data : [];
        console.log("[getReviews] count:", slist.length);
        console.log("[getReviews] clinician_names (first 5):", slist.slice(0, 5).map((s) => s.clinician_name));
        if (slist.length > 0) console.log("[getReviews] first row keys:", Object.keys(slist[0] as object));
        setSubmissions(slist);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function loadRooms() {
    if (!practiceId) return;
    setRoomsLoading(true);
    try {
      const res = await dashApi.getRooms(practiceId);
      if (res.ok) {
        const data = await res.json();
        setRooms(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-fatal — rooms section just stays empty
    } finally {
      setRoomsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    loadRooms();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddRoom() {
    if (!practiceId || addingRoom) return;
    setAddingRoom(true);
    try {
      const defaultName = `Room ${rooms.length + 1}`;
      const res = await dashApi.createRoom(defaultName, practiceId);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      await loadRooms();
      showToast("Room added!");
    } catch {
      showToast("Failed to add room — please try again");
    } finally {
      setAddingRoom(false);
    }
  }

  function subCount(clinicianName: string): number {
    return submissions.filter((s) => s.clinician_name === clinicianName).length;
  }

  const expiringClinicians = clinicians.filter((c) => {
    const info = expiryInfo(c.rotation_start_date, c.rotation_duration_weeks);
    return info && info.daysLeft >= 0 && info.weeksLeft <= 4;
  });

  const cardShadow = { boxShadow: "0 2px 12px rgba(0,94,184,0.08)" };

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

      {/* Clinician list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-[10px] px-6 py-5 text-sm text-red-700 text-center"
          style={cardShadow}>
          <p className="font-semibold mb-1">Failed to load clinicians</p>
          <p>{error}</p>
        </div>
      ) : clinicians.length === 0 ? (
        <div className="bg-white rounded-[10px] border-2 border-dashed border-border p-12 text-center"
          style={cardShadow}>
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
              subCount={subCount(c.name)}
              onCopied={showToast}
            />
          ))}
        </div>
      )}

      {/* ── Rooms section ──────────────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-nhs-blue-dark">Rooms</h2>
            <p className="text-sm text-slate-light mt-0.5">
              Each room has its own QR code — perfect for waiting rooms or consultation rooms
            </p>
          </div>
          <button
            onClick={handleAddRoom}
            disabled={addingRoom || !practiceId}
            className="flex items-center gap-2 bg-nhs-blue text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-50 transition-all shadow-md whitespace-nowrap"
          >
            <span className="text-lg leading-none">+</span>{addingRoom ? "Adding…" : "Add Room"}
          </button>
        </div>

        {roomsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : rooms.length === 0 ? (
          <div className="bg-white rounded-[10px] border-2 border-dashed border-border p-10 text-center"
            style={cardShadow}>
            <div className="text-3xl mb-2">🚪</div>
            <p className="text-sm font-semibold text-nhs-blue-dark mb-1">No rooms yet</p>
            <p className="text-xs text-slate-light">Click + Add Room to create a room-specific QR code</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                clinicians={clinicians}
                onSaved={loadRooms}
                onToast={showToast}
              />
            ))}
          </div>
        )}
      </div>

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
