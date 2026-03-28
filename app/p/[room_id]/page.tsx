"use client";

import { useEffect, useState, useCallback } from "react";
import { surveyApi } from "@/app/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Room {
  id: number;
  room_name: string;
  practice_id: number;
  active_clinician_id: string;
}

interface RoomClinician {
  clinician_id: string;
  clinician_name: string;   // mapped from API field "name"
  google_review_url: string;
  redirect_url: string;
  redirect_platform: string;
  rotation_enabled: boolean;
  nhs_review_url: string;
  healthwatch_url: string;
  fft_url: string;
}

type Step = 1 | 2;

// ─── Page ─────────────────────────────────────────────────────────────────────

// TODO: REMOVE BEFORE PRODUCTION — debug day override for Smart Rotation testing
// Set to null to use the real current day, or a number to force a specific day:
//   0=Sun  1=Mon  2=Tue  3=Wed  4=Thu  5=Fri  6=Sat
// DEBUG ONLY — remove before production
const DEBUG_DAY_OVERRIDE: number | null = 4; // TODO: remove before production (Thu=4)

export default function RoomLandingPage({
  params,
}: {
  params: { room_id: string };
}) {
  const roomIdNum = parseInt(params.room_id, 10);

  const [room, setRoom]           = useState<Room | null>(null);
  const [clinician, setClinician] = useState<RoomClinician | null>(null);
  const [loadErr, setLoadErr]     = useState("");
  const [loading, setLoading]     = useState(true);

  const [step, setStep]           = useState<Step>(1);
  const [sentiment, setSentiment] = useState("");

  // ── Fetch room + clinician ─────────────────────────────────────────────────
  const fetchRoom = useCallback(async () => {
    if (!roomIdNum || isNaN(roomIdNum)) {
      setLoadErr("Invalid room link.");
      setLoading(false);
      return;
    }
    try {
      const res  = await surveyApi.getRoom(roomIdNum);
      const data = await res.json();

      // DIAGNOSTIC — log complete raw API response before any destructuring
      console.log("[Feedbacker] get_room raw response:", JSON.parse(JSON.stringify(data)));

      if (!res.ok) throw new Error(data?.message ?? "Room not found.");
      if (!data?.clinician) throw new Error("No clinician assigned to this room.");

      setRoom(data.room);

      // Normalise the clinician payload — Xano returns "name" not "clinician_name",
      // and rotation / review fields may live on the practice object or be absent.
      const c = data.clinician;
      const p = data.practice ?? {};   // practice sub-object if Xano returns it
      setClinician({
        clinician_id:       c.clinician_id      ?? "",
        clinician_name:     c.name              ?? c.clinician_name ?? "",
        google_review_url:  c.google_review_url ?? p.google_review_url ?? "",
        redirect_url:       c.redirect_url      ?? "",
        redirect_platform:  c.redirect_platform ?? "",
        rotation_enabled:   c.rotation_enabled  ?? p.rotation_enabled  ?? false,
        nhs_review_url:     c.nhs_review_url    ?? p.nhs_review_url    ?? "",
        healthwatch_url:    c.healthwatch_url   ?? p.healthwatch_url   ?? "",
        fft_url:            c.fft_url           ?? p.fft_url           ?? "",
      });

      // Fire-and-forget QR scan event
      surveyApi.logEvent(
        "qr_scan",
        data.room.id,
        c.clinician_id,
        data.room.practice_id
      ).catch(() => {});
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Could not load room info.");
    } finally {
      setLoading(false);
    }
  }, [roomIdNum]);

  useEffect(() => { fetchRoom(); }, [fetchRoom]);

  // ── Continue from Step 1 → Step 2 ─────────────────────────────────────────
  function handleContinue() {
    // NOTE: createQuickFeedback intentionally removed — the POST was returning
    // 404 and appearing in the browser console while the user was on Step 2,
    // making it appear as if Button 1 was triggering an API call.
    setStep(2);
  }

  // ── Button destinations ────────────────────────────────────────────────────
  // Button 1 is a plain <a> tag — no onClick, no API call, no event tracking.
  // Navigation is handled entirely by the href attribute.

  function handleFeedbackForm() {
    if (!clinician || !room) return;
    surveyApi.logEvent(
      "feedback_click",
      room.id,
      clinician.clinician_id,
      room.practice_id
    ).catch(() => {});
    const sentimentEnc = sentiment.trim()
      ? `&sentiment=${encodeURIComponent(sentiment.trim())}`
      : "";
    if (clinician.redirect_platform === "feedbacker" || !clinician.redirect_url) {
      // Internal Feedbacker survey — navigate same tab so step 2 is always
      // seen before leaving, and popup blockers cannot interfere.
      // Parameter name is "id" to match what /survey reads via params.get("id").
      window.location.href = `/survey?id=${encodeURIComponent(clinician.clinician_id)}${sentimentEnc}`;
    } else {
      // External redirect URL — open in new tab as intended
      window.open(clinician.redirect_url, "_blank", "noopener,noreferrer");
    }
  }

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) return <FullPageSpinner />;

  if (loadErr || !clinician) {
    return (
      <PageShell>
        <div className="bg-white rounded-2xl shadow-card p-8 text-center space-y-3">
          <div className="text-3xl">⚠️</div>
          <p className="text-sm font-semibold text-slate">
            {loadErr || "Room not found."}
          </p>
          <p className="text-xs text-slate-light">
            Please check the QR code or link you used.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const firstName = clinician.clinician_name.split(" ")[0] || "";

  // ── Button 1: day-based channel rotation (fallback to Google → "#") ───────
  const googleUrl = clinician.google_review_url.trim() || null;
  const today     = DEBUG_DAY_OVERRIDE ?? new Date().getDay(); // 0=Sun … 6=Sat

  // Button 1 label is always the same static string — only the URL changes
  const B1_LABEL = "Let others know! Leave them a review on our public page ⭐";

  let b1Url: string = googleUrl ?? "#";

  if (clinician.rotation_enabled) {
    const channels: Record<number, { raw: string }> = {
      3: { raw: clinician.nhs_review_url },
      4: { raw: clinician.healthwatch_url },
      5: { raw: clinician.fft_url },
    };
    const match     = channels[today];
    const targetUrl = match?.raw?.trim();
    if (targetUrl) {
      b1Url = targetUrl;
    }
    // else: URL missing for this day → fall back to googleUrl / "#" (already set)
  }

  const hasFeedback = !!clinician.redirect_url.trim() || !!clinician.clinician_id;

  // Issue 3 — log resolved href for verification
  console.log(
    "[Feedbacker] Button 1 href:", b1Url,
    "| rotation_enabled:", clinician.rotation_enabled,
    "| today (day index):", today,
    "| nhs_review_url:", clinician.nhs_review_url,
    "| google_review_url:", clinician.google_review_url,
  );

  // ── Step 1 — Sentiment ────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <PageShell>
        <div
          key="step1"
          className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6"
        >
          <div className="text-center space-y-2 pt-2">
            <h1 className="text-xl font-bold text-nhs-blue-dark leading-snug">
              {firstName
                ? <>How would you describe your experience with{" "}<span className="text-nhs-blue">{firstName}</span> today?</>
                : "How would you describe your experience today?"
              }
            </h1>
          </div>

          <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
            <textarea
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
              placeholder="Describe in one sentence..."
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-border bg-off-white px-4 py-3 text-sm text-slate placeholder-slate-light/60 resize-none focus:outline-none focus:ring-2 focus:ring-nhs-blue focus:border-transparent transition"
            />

            <button
              type="button"
              onClick={handleContinue}
              disabled={sentiment.trim().length < 3}
              className="w-full bg-nhs-blue text-white font-semibold py-4 rounded-2xl hover:bg-nhs-blue-dark active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md text-base"
            >
              Continue →
            </button>
          </div>

          <p className="text-center text-xs text-slate-light pb-2">
            🔒 Anonymous · Takes 30 seconds
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Step 2 — Two Big Buttons ──────────────────────────────────────────────
  return (
    <PageShell>
      <div
        key="step2"
        className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6"
      >
        <div className="text-center pt-2">
          <h1 className="text-xl font-bold text-nhs-blue-dark leading-snug">
            Let others know! 🎉
          </h1>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
          {/* Button 1 — review destination: plain anchor, no onClick, no API call */}
          <a
            href={b1Url}
            target={b1Url === "#" ? "_self" : "_blank"}
            rel="noopener noreferrer"
            className="w-full flex flex-col items-center justify-center gap-1.5 bg-nhs-blue text-white font-semibold py-5 px-6 rounded-2xl hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-md text-center no-underline"
          >
            <span className="text-sm leading-snug font-bold">{B1_LABEL}</span>
          </a>

          {hasFeedback && (
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-slate-light">then</span>
              <div className="flex-1 border-t border-border" />
            </div>
          )}

          {/* Button 2 — internal feedback form */}
          {hasFeedback && (
            <button
              type="button"
              onClick={handleFeedbackForm}
              className="w-full flex flex-col items-center justify-center gap-1.5 border-2 border-nhs-blue text-nhs-blue bg-white font-semibold py-5 px-6 rounded-2xl hover:bg-nhs-blue/5 active:scale-[0.98] transition-all text-center"
            >
              <span className="text-2xl leading-none">📋</span>
              <span className="text-sm leading-snug">
                {firstName
                  ? <>Complete a feedback form for{" "}<span className="font-bold">{firstName}</span> — needed for their professional development</>
                  : "Complete a feedback form — needed for professional development"
                }
              </span>
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-light pb-2">
          🔒 Anonymous · Powered by{" "}
          <span className="font-semibold text-nhs-blue">Feedbacker</span>
        </p>
      </div>
    </PageShell>
  );
}

// ─── Layout shells ────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <header className="bg-nhs-blue py-4 px-6 shadow-md flex items-center justify-between">
        <div className="font-serif text-xl text-white">
          Feed<span className="text-nhs-aqua">backer</span>
        </div>
        <span className="text-xs text-white/70 font-medium tracking-wide">
          NHS Patient Feedback
        </span>
      </header>
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

function FullPageSpinner() {
  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center">
      <svg className="w-8 h-8 text-nhs-blue animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z" />
      </svg>
    </div>
  );
}
