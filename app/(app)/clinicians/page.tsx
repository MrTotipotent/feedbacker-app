"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { dashApi } from "@/app/lib/api";
import { getUser } from "@/app/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClinicianRow {
  clinician_id: string;
  name: string;
  role?: string | null;
  redirect_platform?: string | null;
  redirect_url?: string | null;
  total_submissions?: number | null;
  rotation_start_date?: string | number | null;
  rotation_end_date?: string | number | null;
  // allow any extra fields from get_clinician_dashboard
  [key: string]: unknown;
}

interface Room {
  id: number;
  room_name: string;
  practice_id: number;
  active_clinician_id: string;
}

// Event entry from get_event_counts — may be array of raw events or aggregate object
interface EventEntry {
  event_type?: string;
  clinician_id?: string;
  created_at?: string;
  // flat aggregate fields
  qr_scans?: number | null;
  google_clicks?: number | null;
  feedback_clicks?: number | null;
}

type TimeToggle = "month" | "all";

// ─── Constants ────────────────────────────────────────────────────────────────

const QR_BASE = "https://feedbacker-app-m3re.vercel.app/p/";
const ROLES   = ["GP", "GP Trainee", "Nurse", "HCA", "Pharmacist", "Receptionist", "Admin"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function fmtDate(d: string | number | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isDatePast(d: string | number | null | undefined): boolean {
  if (!d) return false;
  return new Date(d) < new Date();
}

/** Converts any ISO/timestamp string or Unix-ms number to YYYY-MM-DD for <input type="date"> */
function toDateInput(d: string | number | null | undefined): string {
  if (!d) return "";
  if (typeof d === "number") return new Date(d).toISOString().slice(0, 10);
  return d.slice(0, 10);
}

// ─── Event count helpers ───────────────────────────────────────────────────────

function countEvents(
  events: EventEntry[],
  clinicianId: string,
  eventType: string,
  toggle: TimeToggle
): number {
  // If events is an array of raw event objects (has event_type field)
  if (events.length > 0 && "event_type" in events[0]) {
    return events.filter(
      (e) =>
        e.clinician_id === clinicianId &&
        e.event_type === eventType &&
        (toggle === "all" || (e.created_at ? isThisMonth(e.created_at) : false))
    ).length;
  }
  // Aggregate shape (no event_type field): per-clinician lookup is handled
  // in the caller via aggRow. Raw per-event rows are handled above.
  return 0;
}

function aggregateCounts(events: EventEntry[], toggle: TimeToggle) {
  if (events.length > 0 && "event_type" in events[0]) {
    const filtered = toggle === "all" ? events : events.filter((e) => e.created_at && isThisMonth(e.created_at));
    return {
      qr_scans:       filtered.filter((e) => e.event_type === "qr_scan").length,
      google_clicks:  filtered.filter((e) => e.event_type === "google_review_click").length,
      feedback_clicks: filtered.filter((e) => e.event_type === "feedback_click").length,
    };
  }
  // Flat aggregate fallback
  const agg = events[0] as EventEntry | undefined;
  return {
    qr_scans:        agg?.qr_scans ?? null,
    google_clicks:   agg?.google_clicks ?? null,
    feedback_clicks: agg?.feedback_clicks ?? null,
  };
}

// ─── QR / download helpers ────────────────────────────────────────────────────

async function generateQrDataUrl(roomId: number, size = 200): Promise<string> {
  return QRCode.toDataURL(`${QR_BASE}${roomId}`, {
    width: size,
    margin: 1,
    color: { dark: "#003d7a", light: "#ffffff" },
  });
}

async function downloadPng(roomId: number, roomName: string) {
  // 85mm × 55mm at 300dpi × 4 = 1004 × 650px canvas
  const DPI = 4;
  const W = Math.round(85 * (96 / 25.4) * DPI);
  const H = Math.round(55 * (96 / 25.4) * DPI);
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Top accent bar
  ctx.fillStyle = "#005EB8";
  ctx.fillRect(0, 0, W, 14);

  // Room name
  ctx.fillStyle = "#003d7a";
  ctx.font = `bold ${32 * DPI / 4}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(roomName, W / 2, 60);

  // QR
  const qrSize = Math.round(120 * (96 / 25.4) * DPI / 4);
  const qrDataUrl = await generateQrDataUrl(roomId, qrSize * 4);
  const img = new Image();
  await new Promise<void>((r) => { img.onload = () => r(); img.src = qrDataUrl; });
  const qrX = (W - qrSize) / 2;
  ctx.drawImage(img, qrX, 72, qrSize, qrSize);

  // Caption
  ctx.fillStyle = "#768692";
  ctx.font = `${22 * DPI / 4}px sans-serif`;
  ctx.fillText("Scan to leave feedback", W / 2, 72 + qrSize + 30);

  // Wordmark
  ctx.font = `bold ${26 * DPI / 4}px serif`;
  ctx.fillStyle = "#005EB8";
  ctx.fillText("Feed", W / 2 - 30, H - 20);
  ctx.fillStyle = "#00A9CE";
  ctx.fillText("backer", W / 2 + 28, H - 20);

  // Bottom bar
  ctx.fillStyle = "#005EB8";
  ctx.fillRect(0, H - 10, W, 10);

  const a = document.createElement("a");
  a.download = `feedbacker-qr-${roomName.replace(/\s+/g, "-").toLowerCase()}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

async function downloadPdf(roomId: number, roomName: string, practiceName: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210;
  const H = 297;

  // NHS blue top block
  doc.setFillColor(0, 94, 184);
  doc.rect(0, 0, W, 70, "F");

  // Practice name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(practiceName, W / 2, 28, { align: "center" });

  // Room name
  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  doc.text(roomName, W / 2, 44, { align: "center" });

  // QR code — 120mm × 120mm
  const qrPx = 1000;
  const qrDataUrl = await generateQrDataUrl(roomId, qrPx);
  const qrMm = 120;
  const qrX  = (W - qrMm) / 2;
  const qrY  = 82;
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrMm, qrMm);

  // Caption below QR
  doc.setTextColor(70, 85, 99);
  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.text("Scan to leave feedback for your clinician", W / 2, qrY + qrMm + 12, { align: "center" });

  // Feedbacker branding at bottom
  doc.setTextColor(0, 94, 184);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Feedbacker", W / 2, H - 20, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(118, 134, 146);
  doc.text("NHS Patient Feedback Platform", W / 2, H - 12, { align: "center" });

  doc.save(`feedbacker-poster-${roomName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

// ─── QR Preview Modal ─────────────────────────────────────────────────────────

function QrModal({ roomId, roomName, onClose }: { roomId: number; roomName: string; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, `${QR_BASE}${roomId}`, {
      width: 260, margin: 2, color: { dark: "#003d7a", light: "#ffffff" },
    }).catch(() => {});
  }, [roomId]);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-xs w-full relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-light hover:text-slate text-2xl leading-none">×</button>
          <h3 className="text-base font-bold text-nhs-blue-dark">{roomName}</h3>
          <canvas ref={ref} className="rounded-lg" />
          <p className="text-[10px] text-slate-light text-center break-all">{QR_BASE}{roomId}</p>
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-nhs-blue text-white text-sm font-semibold hover:bg-nhs-blue-dark transition-colors">
            Close
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Download Popover ─────────────────────────────────────────────────────────

function DownloadPopover({
  roomId, roomName, practiceName, onClose,
}: { roomId: number; roomName: string; practiceName: string; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-40 bg-white rounded-xl shadow-xl border border-border py-1.5 w-48">
        <button
          onClick={() => { downloadPng(roomId, roomName); onClose(); }}
          className="w-full text-left px-4 py-2.5 text-sm text-slate hover:bg-off-white transition-colors"
        >
          🖼 PNG — Business Card
        </button>
        <button
          onClick={() => { downloadPdf(roomId, roomName, practiceName); onClose(); }}
          className="w-full text-left px-4 py-2.5 text-sm text-slate hover:bg-off-white transition-colors"
        >
          📄 PDF — A4 Poster
        </button>
      </div>
    </>
  );
}

// ─── Inline URL Edit ──────────────────────────────────────────────────────────

function InlineUrlEdit({
  clinician, onSaved,
}: { clinician: ClinicianRow; onSaved: () => void }) {
  const [open,     setOpen]     = useState(false);
  const [url,      setUrl]      = useState(clinician.redirect_url ?? "");
  const [platform, setPlatform] = useState(clinician.redirect_platform ?? "feedbacker");
  const [saving,   setSaving]   = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await dashApi.updateRedirectUrl(url.trim(), platform, clinician.clinician_id);
      if (!res.ok) throw new Error();
      onSaved();
      setOpen(false);
    } catch {
      // keep open
    } finally {
      setSaving(false);
    }
  }

  const displayUrl = platform === "feedbacker" || !clinician.redirect_url
    ? "— Default form"
    : truncate(clinician.redirect_url, 30);

  if (!open) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-xs text-slate-light">{displayUrl}</span>
        <button onClick={() => setOpen(true)}
          className="text-slate-light hover:text-nhs-blue transition-colors"
          title="Edit URL">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086zM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.251.251 0 0 0 .108-.064z"/>
          </svg>
        </button>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[220px]">
      <select value={platform} onChange={(e) => setPlatform(e.target.value)}
        className="text-xs rounded border border-border bg-off-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-nhs-blue">
        <option value="feedbacker">Feedbacker</option>
        <option value="14fish">14Fish</option>
        <option value="custom">Custom</option>
      </select>
      {platform !== "feedbacker" && (
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="text-xs rounded border border-border bg-off-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-nhs-blue" />
      )}
      <div className="flex gap-1.5">
        <button onClick={handleSave} disabled={saving}
          className="text-[11px] px-2.5 py-1 rounded bg-nhs-blue text-white font-semibold hover:bg-nhs-blue-dark disabled:opacity-50">
          {saving ? "…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)}
          className="text-[11px] px-2.5 py-1 rounded border border-border text-slate hover:bg-off-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Inline Date Edit ─────────────────────────────────────────────────────────

/**
 * Pencil-icon inline editor for a single rotation date (start or end).
 * Calls PATCH /update_clinician_dates with both dates on every save —
 * otherDate is sent unchanged alongside the edited value.
 */
function InlineDateEdit({
  date,
  otherDate,
  isEnd,
  clinicianId,
  onSaved,
}: {
  date: string | number | null | undefined;
  otherDate: string | number | null | undefined;
  isEnd: boolean;
  clinicianId: string;
  onSaved: () => void;
}) {
  const [open,      setOpen]      = useState(false);
  const [val,       setVal]       = useState(toDateInput(date));
  const [saving,    setSaving]    = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  function handleOpen() {
    setVal(toDateInput(date));
    setOpen(true);
  }

  function handleCancel() {
    setVal(toDateInput(date));
    setOpen(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const startDate = isEnd ? toDateInput(otherDate) || null : val || null;
      const endDate   = isEnd ? val || null               : toDateInput(otherDate) || null;
      const res = await dashApi.updateClinicianDates(clinicianId, startDate, endDate);
      if (!res.ok) throw new Error();
      setOpen(false);
      setJustSaved(true);
      setTimeout(() => { setJustSaved(false); onSaved(); }, 1200);
    } catch {
      // keep open so user can retry
    } finally {
      setSaving(false);
    }
  }

  const pencilIcon = (
    <button
      onClick={handleOpen}
      className="text-slate-light hover:text-nhs-blue transition-colors flex-shrink-0"
      title={`Edit rotation ${isEnd ? "end" : "start"} date`}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
        <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086zM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.251.251 0 0 0 .108-.064z"/>
      </svg>
    </button>
  );

  if (justSaved) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-nhs-green whitespace-nowrap">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
        </svg>
        Saved
      </span>
    );
  }

  if (!open) {
    return (
      <span className="flex items-center gap-1.5">
        {isEnd && date && isDatePast(date) ? (
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-red-600">{fmtDate(date)}</span>
            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 w-fit">Ended</span>
          </span>
        ) : isEnd && !date ? (
          <span className="text-xs text-slate-light italic">Ongoing</span>
        ) : !date ? (
          <span className="text-xs text-slate-light">—</span>
        ) : (
          <span className="text-xs text-slate">{fmtDate(date)}</span>
        )}
        {pencilIcon}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[150px]">
      <input
        type="date"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="text-xs rounded border border-border bg-off-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-nhs-blue"
      />
      {isEnd && (
        <p className="text-[10px] text-slate-light">Leave blank to set as Ongoing</p>
      )}
      <div className="flex gap-1.5">
        <button onClick={handleSave} disabled={saving}
          className="text-[11px] px-2.5 py-1 rounded bg-nhs-blue text-white font-semibold hover:bg-nhs-blue-dark disabled:opacity-50">
          {saving ? "…" : "Save"}
        </button>
        <button onClick={handleCancel}
          className="text-[11px] px-2.5 py-1 rounded border border-border text-slate hover:bg-off-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  message, onConfirm, onCancel,
}: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
          <p className="text-sm text-slate mb-5 leading-relaxed">{message}</p>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-slate hover:bg-off-white transition-colors">
              Cancel
            </button>
            <button onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl bg-nhs-blue text-white text-sm font-semibold hover:bg-nhs-blue-dark transition-colors shadow-md">
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Add Clinician Modal ──────────────────────────────────────────────────────

function AddClinicianModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [role,      setRole]      = useState("GP");
  const [platform,  setPlatform]  = useState("feedbacker");
  const [url,       setUrl]       = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState("");

  const inputCls = "w-full rounded-lg border border-border bg-off-white px-3.5 py-2.5 text-sm text-slate placeholder-slate-light/60 focus:outline-none focus:ring-2 focus:ring-nhs-blue transition";
  const labelCls = "block text-xs font-bold text-slate uppercase tracking-wider mb-1.5";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Frontend validation — catch missing params before hitting Xano
    if (!name.trim())       { setErr("Full name is required.");                          return; }
    if (!email.trim())      { setErr("Email is required.");                              return; }
    if (!startDate)         { setErr("Rotation start date is required.");                return; }
    if (platform !== "feedbacker" && !url.trim()) {
      setErr("A feedback URL is required for non-Feedbacker platforms.");                return;
    }

    const rotation_duration_weeks = endDate && startDate
      ? Math.max(1, Math.round(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) /
          (1000 * 60 * 60 * 24 * 7)
        ))
      : undefined;

    setSaving(true);
    setErr("");
    try {
      const res = await dashApi.addClinician({
        name: name.trim(),
        email: email.trim(),
        role,
        redirect_platform: platform,
        redirect_url: platform === "feedbacker"
          ? "https://feedbacker-app-m3re.vercel.app/survey"
          : url.trim(),
        rotation_start_date: startDate,
        rotation_end_date: endDate || undefined,
        rotation_duration_weeks,
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
                <p className="text-white/60 text-xs mt-0.5">Set up a new clinician profile</p>
              </div>
              <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className={labelCls}>Full Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dr Sarah Johnson" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. sarah.johnson@practice.nhs.uk" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Platform</label>
              <div className="flex gap-2">
                {["feedbacker", "14fish", "custom"].map((p) => (
                  <button key={p} type="button"
                    onClick={() => { setPlatform(p); setUrl(""); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      platform === p
                        ? "bg-nhs-blue text-white border-nhs-blue"
                        : "bg-off-white text-slate border-border hover:border-nhs-blue"
                    }`}>
                    {p === "feedbacker" ? "Feedbacker" : p === "14fish" ? "14Fish" : "Custom"}
                  </button>
                ))}
              </div>
            </div>
            {platform !== "feedbacker" && (
              <div>
                <label className={labelCls}>Custom Feedback URL</label>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..." required className={inputCls} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Rotation Start *</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Rotation End</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className={inputCls} />
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

// ─── Room Row ─────────────────────────────────────────────────────────────────

function RoomRow({
  room, clinicians, practiceName, onSaved, onToast,
}: {
  room: Room;
  clinicians: ClinicianRow[];
  practiceName: string;
  onSaved: () => void;
  onToast: (msg: string) => void;
}) {
  const [name,         setName]         = useState(room.room_name);
  const [activeClinId, setActiveClinId] = useState(room.active_clinician_id ?? "");
  const [saving,       setSaving]       = useState(false);
  const [showQr,       setShowQr]       = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [confirm,      setConfirm]      = useState<string | null>(null);
  const [pendingClinId,setPendingClinId]= useState("");

  const currentClin = clinicians.find((c) => c.clinician_id === room.active_clinician_id);
  const inputCls = "rounded-lg border border-border bg-off-white px-2.5 py-1.5 text-sm text-slate focus:outline-none focus:ring-1 focus:ring-nhs-blue transition";

  function handleClinicianChange(newId: string) {
    if (newId !== activeClinId && room.active_clinician_id) {
      const newClin = clinicians.find((c) => c.clinician_id === newId);
      setConfirm(
        `Reassign ${room.room_name} from ${currentClin?.name ?? "current clinician"} to ${newClin?.name ?? newId}? This will update the active clinician immediately.`
      );
      setPendingClinId(newId);
    } else {
      setActiveClinId(newId);
    }
  }

  async function handleSave() {
    setSaving(true);
    console.log("[updateRoom] sending active_clinician_id:", activeClinId);
    try {
      const res = await dashApi.updateRoom(room.id, name.trim(), activeClinId);
      if (!res.ok) throw new Error();
      onToast("Room saved!");
      onSaved();
    } catch {
      onToast("Save failed — try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmedReassign() {
    setActiveClinId(pendingClinId);
    setConfirm(null);
    // Auto-save immediately after reassignment
    setSaving(true);
    console.log("[updateRoom reassign] sending active_clinician_id:", pendingClinId);
    try {
      const res = await dashApi.updateRoom(room.id, name.trim(), pendingClinId);
      if (!res.ok) throw new Error();
      onToast("Room reassigned!");
      onSaved();
    } catch {
      onToast("Reassignment failed — try again");
    } finally {
      setSaving(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(`${QR_BASE}${room.id}`)
      .then(() => onToast("Link copied!"))
      .catch(() => onToast("Copy failed"));
  }

  const btnIcon = "p-1.5 rounded-lg border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2.5 border-b border-border last:border-0">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          className={`${inputCls} sm:w-44 font-medium`} />
        <select value={activeClinId} onChange={(e) => handleClinicianChange(e.target.value)}
          className={`${inputCls} flex-1 min-w-0`}>
          <option value="">— Select clinician —</option>
          {clinicians.filter((c) => c.clinician_id).map((c) => (
            <option key={c.clinician_id} value={c.clinician_id}>
              {c.name}{c.role ? ` — ${c.role}` : ""}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 relative">
          {/* Preview QR */}
          <button onClick={() => setShowQr(true)} title="Preview QR" className={btnIcon}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 0v3h3V4H4zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm1 0v3h3v-3H4zM13 3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm0 1h3v3h-3V4zM5 5h1v1H5V5zM5 14h1v1H5v-1zM14 5h1v1h-1V5zM10 3h1v2h-1V3zM10 8h1v1h-1V8zM8 10h1v1H8v-1zM10 10h1v2h-1v-2zM12 10h2v1h-1v1h-1v-2zM15 10h1v1h-1v-1zM10 14h1v1h-1v-1zM12 14h1v2h-1v-2zM15 14h1v2h-1v-2zM13 12h1v1h-1v-1zM10 12h1v1h-1v-1z"/>
            </svg>
          </button>

          {/* Download */}
          <div className="relative">
            <button onClick={() => setShowDownload(!showDownload)} title="Download" className={btnIcon}>
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </button>
            {showDownload && (
              <DownloadPopover
                roomId={room.id} roomName={name} practiceName={practiceName}
                onClose={() => setShowDownload(false)}
              />
            )}
          </div>

          {/* Copy link */}
          <button onClick={copyLink} title="Copy link" className={btnIcon}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"/>
            </svg>
          </button>

          <button onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-nhs-blue text-white text-xs font-semibold hover:bg-nhs-blue-dark disabled:opacity-60 transition-colors whitespace-nowrap">
            {saving ? "…" : "Save"}
          </button>
        </div>

        <p className="text-[10px] text-slate-light font-mono sm:hidden">{QR_BASE}{room.id}</p>
      </div>

      {showQr && <QrModal roomId={room.id} roomName={name} onClose={() => setShowQr(false)} />}
      {confirm && (
        <ConfirmDialog message={confirm}
          onConfirm={handleConfirmedReassign}
          onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CliniciansPage() {
  const user       = getUser();
  const practiceId = typeof user?.practice_id === "number"
    ? user.practice_id
    : parseInt(String(user?.practice_id ?? "0"), 10);
  const [practiceName, setPracticeName] = useState("Your Practice");

  const [clinicians,    setClinicians]    = useState<ClinicianRow[]>([]);
  const [rooms,         setRooms]         = useState<Room[]>([]);
  const [events,        setEvents]        = useState<EventEntry[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [roomsLoading,  setRoomsLoading]  = useState(true);
  const [error,         setError]         = useState("");
  const [showModal,     setShowModal]     = useState(false);
  const [toast,         setToast]         = useState("");
  const [copiedId,      setCopiedId]      = useState("");
  const [toggle,        setToggle]        = useState<TimeToggle>("month");
  const [addingRoom,    setAddingRoom]    = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function showCopied(id: string) {
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  }

  const loadClinicians = useCallback(async () => {
    try {
      // Load from both endpoints and merge — getClinicianDashboard may
      // exclude newly added clinicians that don't yet have auth records.
      // getClinicians returns all clinician rows regardless of auth status.
      // getReviews provides live per-clinician submission counts (the
      // total_submissions field on getClinicianDashboard is stale/0).
      const [dashRes, listRes, reviewsRes] = await Promise.all([
        dashApi.getClinicianDashboard(),
        dashApi.getClinicians(),
        dashApi.getReviews(),
      ]);

      const dashData: ClinicianRow[] = dashRes.ok
        ? (await dashRes.json().then((d: unknown) => Array.isArray(d) ? d : []) as ClinicianRow[])
        : [];

      const listData: ClinicianRow[] = listRes.ok
        ? (await listRes.json().then((d: unknown) => Array.isArray(d) ? d : []) as ClinicianRow[])
        : [];

      // Build a live name→count map from reviews (get_reviews has clinician_name, not clinician_id)
      const reviewCounts: Record<string, number> = {};
      if (reviewsRes.ok) {
        const reviews = await reviewsRes.json().then((d: unknown) => Array.isArray(d) ? d : []) as Array<{ clinician_name?: string }>;
        for (const r of reviews) {
          if (r.clinician_name) reviewCounts[r.clinician_name] = (reviewCounts[r.clinician_name] ?? 0) + 1;
        }
      }

      // Merge: keep dashboard rows, append any from /clinicians missing from dashboard.
      const dashIds = new Set(dashData.map((c) => c.clinician_id).filter(Boolean));
      const extras = listData.filter((c) => !c.clinician_id || !dashIds.has(c.clinician_id));
      const merged = [...dashData, ...extras].map((c) => ({
        ...c,
        total_submissions: reviewCounts[c.name] ?? 0,
      }));

      if (merged.length > 0) {
        setClinicians(merged);
      } else if (!dashRes.ok) {
        setError(`Failed to load clinicians (${dashRes.status})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  const loadRooms = useCallback(async () => {
    if (!practiceId) return;
    setRoomsLoading(true);
    try {
      const res = await dashApi.getRooms(practiceId);
      if (res.ok) {
        const data = await res.json();
        setRooms(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-fatal
    } finally {
      setRoomsLoading(false);
    }
  }, [practiceId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadClinicians(),
      loadRooms(),
      practiceId
        ? dashApi.getEventCounts(practiceId).then(async (r) => {
            if (r.ok) {
              const d = await r.json();
              setEvents(Array.isArray(d) ? d : d ? [d] : []);
            }
          }).catch(() => {})
        : Promise.resolve(),
      dashApi.getPractice().then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          const n = d?.practice_name ?? d?.name ?? "";
          if (n) setPracticeName(n);
        }
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddRoom() {
    if (!practiceId || addingRoom) return;
    setAddingRoom(true);
    try {
      const res = await dashApi.createRoom(`Room ${rooms.length + 1}`, practiceId);
      if (!res.ok) throw new Error();
      await loadRooms();
      showToast("Room added!");
    } catch {
      showToast("Failed to add room");
    } finally {
      setAddingRoom(false);
    }
  }

  // ── Skeleton ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 max-w-full">
        <div className="h-10 w-64 rounded-lg bg-border/50 animate-pulse" />
        <div className="h-64 rounded-[10px] bg-border/50 animate-pulse" />
      </div>
    );
  }

  // ── Derived per-clinician room map ─────────────────────────────────────────
  // One room per clinician (first match)
  const roomByClinicianId: Record<string, Room> = {};
  for (const room of rooms) {
    if (room.active_clinician_id && !roomByClinicianId[room.active_clinician_id]) {
      roomByClinicianId[room.active_clinician_id] = room;
    }
  }

  const isEventsRaw = events.length > 0 && "event_type" in events[0];

  const thSm = "px-4 py-3 text-[11px] font-bold text-slate-light uppercase tracking-wider text-left whitespace-nowrap";
  const td   = "px-4 py-3.5 align-top";

  return (
    <div className="p-6 lg:p-8 max-w-full">

      {/* Header */}
      <div className="flex flex-col items-center gap-3 mb-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-nhs-blue-dark">Clinician Profiles</h1>
          <p className="text-sm text-slate-light mt-0.5">Manage your practice clinicians and their feedback setup</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-nhs-blue text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-md whitespace-nowrap">
          <span className="text-lg leading-none">+</span> Add Clinician
        </button>
      </div>

      {/* Time toggle */}
      <div className="flex items-center gap-1.5 mb-5">
        <span className="text-xs text-slate-light mr-1">Activity:</span>
        {(["month", "all"] as TimeToggle[]).map((t) => (
          <button key={t} onClick={() => setToggle(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              toggle === t
                ? "bg-nhs-blue text-white"
                : "bg-white border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue"
            }`}>
            {t === "month" ? "This Month" : "All Time"}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Clinicians table ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-[10px] border border-border overflow-hidden mb-10"
        style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
        {clinicians.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">👨‍⚕️</div>
            <p className="text-base font-semibold text-nhs-blue-dark mb-1">No clinicians yet</p>
            <p className="text-sm text-slate-light mb-4">Add your first clinician to get started</p>
            <button onClick={() => setShowModal(true)}
              className="bg-nhs-blue text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-nhs-blue-dark transition-all shadow-md">
              + Add Clinician
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1250px]">
              <thead>
                <tr className="border-b border-border bg-off-white">
                  <th className={thSm}>Clinician</th>
                  <th className={thSm}>ID</th>
                  <th className={thSm}>Platform</th>
                  <th className={thSm}>Feedback URL</th>
                  <th className={thSm}>Rotation Start</th>
                  <th className={thSm}>Rotation End</th>
                  <th className={thSm}>Room</th>
                  <th className={thSm}>QR Scans</th>
                  <th className={thSm}>Google Reviews</th>
                  <th className={thSm}>Feedbacks Completed</th>
                  <th className={thSm}>Submissions</th>
                  <th className={`${thSm} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clinicians.map((c) => {
                  const room    = roomByClinicianId[c.clinician_id];
                  const hasRoom = !!room;

                  // For aggregate per-clinician shape (no event_type field), look up by clinician_id
                  // and default null fields to 0. For raw per-event rows, count via countEvents.
                  const aggRow = !isEventsRaw && events.length > 0
                    ? events.find((e) => e.clinician_id === c.clinician_id)
                    : undefined;

                  const qrScans       = isEventsRaw
                    ? countEvents(events, c.clinician_id, "qr_scan",             toggle)
                    : aggRow ? (aggRow.qr_scans       ?? 0) : null;
                  const googleReviews = isEventsRaw
                    ? countEvents(events, c.clinician_id, "google_review_click", toggle)
                    : aggRow ? (aggRow.google_clicks   ?? 0) : null;
                  const fbCompleted   = isEventsRaw
                    ? countEvents(events, c.clinician_id, "feedback_click",      toggle)
                    : aggRow ? (aggRow.feedback_clicks ?? 0) : null;

                  const plt = (c.redirect_platform ?? "feedbacker").toLowerCase();
                  const pltLabel = plt === "feedbacker" ? "Feedbacker" : plt === "14fish" ? "14Fish" : "Custom";
                  const pltStyle =
                    plt === "feedbacker" ? { bg: "#E3F2FD", color: "#005EB8" }
                    : plt === "14fish"   ? { bg: "#F0F4F9", color: "#425563" }
                    :                     { bg: "#FFF3E0", color: "#E65C00" };

                  function copyLink() {
                    if (!room) return;
                    navigator.clipboard.writeText(`${QR_BASE}${room.id}`)
                      .then(() => showCopied(c.clinician_id))
                      .catch(() => showToast("Copy failed"));
                  }

                  return (
                    <tr key={c.clinician_id} className="hover:bg-off-white/50 transition-colors">

                      {/* Clinician */}
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#005EB8,#00A9CE)" }}>
                            {initials(c.name)}
                          </div>
                          <div>
                            <p className="font-semibold text-nhs-blue-dark">{c.name}</p>
                            <p className="text-xs text-slate-light mt-0.5">{c.role || "—"}</p>
                          </div>
                        </div>
                      </td>

                      {/* ID */}
                      <td className={td}>
                        <span className="font-mono text-[11px] text-slate-light">{c.clinician_id}</span>
                      </td>

                      {/* Platform */}
                      <td className={td}>
                        <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: pltStyle.bg, color: pltStyle.color }}>
                          {pltLabel}
                        </span>
                      </td>

                      {/* Feedback URL — inline edit */}
                      <td className={td}>
                        <InlineUrlEdit clinician={c} onSaved={loadClinicians} />
                      </td>

                      {/* Rotation Start — inline editable */}
                      <td className={td}>
                        <InlineDateEdit
                          date={c.rotation_start_date}
                          otherDate={c.rotation_end_date}
                          isEnd={false}
                          clinicianId={c.clinician_id}
                          onSaved={loadClinicians}
                        />
                      </td>

                      {/* Rotation End — inline editable; red + Ended badge if past */}
                      <td className={td}>
                        <InlineDateEdit
                          date={c.rotation_end_date}
                          otherDate={c.rotation_start_date}
                          isEnd={true}
                          clinicianId={c.clinician_id}
                          onSaved={loadClinicians}
                        />
                      </td>

                      {/* Room */}
                      <td className={td}>
                        {room
                          ? <span className="text-xs font-medium text-slate">{room.room_name}</span>
                          : <span className="text-xs text-slate-light">—</span>}
                      </td>

                      {/* QR Scans */}
                      <td className={td}>
                        <span className="font-semibold text-slate">{qrScans ?? "—"}</span>
                      </td>

                      {/* Google Reviews */}
                      <td className={td}>
                        <span className="font-semibold text-slate">{googleReviews ?? "—"}</span>
                      </td>

                      {/* Feedbacks Completed */}
                      <td className={td}>
                        <span className="font-semibold text-slate">{fbCompleted ?? "—"}</span>
                      </td>

                      {/* Submissions */}
                      <td className={td}>
                        <span className="font-semibold text-slate">
                          {c.total_submissions != null ? c.total_submissions : "—"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className={`${td} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Preview QR */}
                          {hasRoom && (
                            <button title="Preview QR"
                              onClick={() => {
                                // handled via inline state — wrap in a small component
                                // for simplicity we'll use the toast to indicate it's only on rooms section
                                showToast("Use the Rooms section below to preview QR");
                              }}
                              className="p-1.5 rounded-lg border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue transition-colors">
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                              </svg>
                            </button>
                          )}
                          {/* Copy link — "Unavailable" when no room is assigned */}
                          <button
                            onClick={copyLink}
                            disabled={!hasRoom}
                            title={hasRoom ? "Copy QR link" : "No room assigned"}
                            className="p-1.5 rounded-lg border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            {!hasRoom ? (
                              <span className="text-[11px] font-semibold text-slate-light whitespace-nowrap">Unavailable</span>
                            ) : copiedId === c.clinician_id ? (
                              <span className="flex items-center gap-1 text-[11px] font-semibold text-nhs-green whitespace-nowrap">
                                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                </svg>
                                Copied!
                              </span>
                            ) : (
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"/>
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Rooms section ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold text-nhs-blue-dark">Rooms</h2>
            <p className="text-sm text-slate-light mt-0.5">Each room has its own QR code</p>
          </div>
          <button onClick={handleAddRoom} disabled={addingRoom || !practiceId}
            className="flex items-center gap-1.5 bg-nhs-blue text-white text-sm font-semibold px-3.5 py-2 rounded-xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-50 transition-all shadow-md">
            <span className="text-base leading-none">+</span>
            {addingRoom ? "Adding…" : "Add Room"}
          </button>
        </div>

        <div className="bg-white rounded-[10px] border border-border px-5 py-1"
          style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
          {roomsLoading ? (
            <div className="py-6 space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-border/50 animate-pulse" />)}
            </div>
          ) : rooms.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-3xl mb-2">🚪</div>
              <p className="text-sm font-semibold text-nhs-blue-dark mb-1">No rooms yet</p>
              <p className="text-xs text-slate-light">Click + Add Room to create a room-specific QR code</p>
            </div>
          ) : (
            rooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                clinicians={clinicians}
                practiceName={practiceName}
                onSaved={async () => { await loadRooms(); await loadClinicians(); }}
                onToast={showToast}
              />
            ))
          )}
        </div>
      </div>

      {/* Add Clinician Modal */}
      {showModal && (
        <AddClinicianModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            showToast("Clinician added successfully");
            loadClinicians();
            loadRooms();
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-nhs-blue-dark text-white text-sm font-medium px-5 py-3 rounded-xl shadow-2xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
