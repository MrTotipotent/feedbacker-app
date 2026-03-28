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
  clinician_name: string;
  practice_name: string;
  google_review_url?: string;
  redirect_url?: string;
  redirect_platform?: string;
  // Channel rotation fields (returned by get_room after Xano schema update)
  rotation_enabled?: boolean;
  nhs_review_url?: string;
  healthwatch_url?: string;
  fft_url?: string;
}

type Step = 1 | 2;

// ─── Page ─────────────────────────────────────────────────────────────────────

// TODO: REMOVE BEFORE PRODUCTION — debug day override for Smart Rotation testing
// Set to null to use the real current day, or a number to force a specific day:
//   0=Sun  1=Mon  2=Tue  3=Wed  4=Thu  5=Fri  6=Sat
// DEBUG ONLY — remove before production
const DEBUG_DAY_OVERRIDE: number | null = 3;

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
      if (!res.ok) throw new Error(data?.message ?? "Room not found.");
      if (!data?.clinician?.clinician_name) throw new Error("No active clinician set for this room.");
      setRoom(data.room);
      setClinician(data.clinician);
      // Fire-and-forget QR scan event
      surveyApi.logEvent(
        "qr_scan",
        data.room.id,
        data.clinician.clinician_id,
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
    if (clinician?.clinician_id && sentiment.trim()) {
      surveyApi.createQuickFeedback(clinician.clinician_id, sentiment.trim()).catch(() => {});
    }
    setStep(2);
  }

  // ── Button destinations ────────────────────────────────────────────────────
  function handleButton1(url: string) {
    if (!room || !clinician) return;
    surveyApi.logEvent(
      "google_review_click",
      room.id,
      clinician.clinician_id,
      room.practice_id
    ).catch(() => {});
    window.open(url, "_blank", "noopener,noreferrer");
  }

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
    const feedbackUrl =
      clinician.redirect_platform === "feedbacker" || !clinician.redirect_url
        ? `/survey?clinician_id=${encodeURIComponent(clinician.clinician_id)}${sentimentEnc}`
        : clinician.redirect_url;
    window.open(feedbackUrl, "_blank", "noopener,noreferrer");
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

  // ── Button 1: day-based channel rotation (fallback to Google) ────────────
  const googleUrl = clinician.google_review_url?.trim() || null;
  const today     = DEBUG_DAY_OVERRIDE ?? new Date().getDay(); // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat

  let b1Url: string | null  = googleUrl;
  let b1Label               = "Leave us a Google Review ⭐";
  let b1Subtext             = `Let others know about their experience at ${clinician.practice_name}`;

  if (clinician.rotation_enabled) {
    const channels: Record<number, { raw?: string | null; label: string; subtext: string }> = {
      3: {
        raw: clinician.nhs_review_url,
        label: "Review us on the NHS Website 🏥",
        subtext: "Your review helps other patients find the right practice",
      },
      4: {
        raw: clinician.healthwatch_url,
        label: "Share your experience on Healthwatch 💬",
        subtext: "Your feedback helps improve NHS services in your area",
      },
      5: {
        raw: clinician.fft_url,
        label: "Complete our Friends & Family Test 💙",
        subtext: "Quick and anonymous — takes less than a minute",
      },
    };
    const match     = channels[today];
    const targetUrl = match?.raw?.trim();
    if (targetUrl) {
      // Day-specific URL is set — use it
      b1Url    = targetUrl;
      b1Label  = match.label;
      b1Subtext = match.subtext;
    }
    // else: URL missing → silently fall back to Google URL + Google label (already set)
  }

  const hasFeedback = !!clinician.redirect_url?.trim() || !!clinician.clinician_id;

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
              How would you describe your experience with{" "}
              <span className="text-nhs-blue">{clinician.clinician_name}</span> today?
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
        <div className="text-center space-y-1 pt-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-light">
            Thank you! 🎉
          </p>
          <h1 className="text-xl font-bold text-nhs-blue-dark leading-snug">
            Let others know,{" "}
            <span className="text-nhs-blue">{clinician.clinician_name}</span>&apos;s
            patients are talking!
          </h1>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
          {b1Url ? (
            <>
              <button
                type="button"
                onClick={() => handleButton1(b1Url!)}
                className="w-full flex flex-col items-center justify-center gap-1.5 bg-nhs-blue text-white font-semibold py-5 px-6 rounded-2xl hover:bg-nhs-blue-dark active:scale-[0.98] transition-all shadow-md text-center"
              >
                <span className="text-sm leading-snug font-bold">{b1Label}</span>
                <span className="text-xs font-normal opacity-80">
                  for{" "}
                  <span className="font-semibold">{clinician.clinician_name}</span>
                </span>
              </button>
              <p className="text-center text-xs text-slate-light -mt-1">{b1Subtext}</p>
            </>
          ) : (
            <p className="text-center text-xs text-slate-light py-2">
              Google Reviews not set up yet for this practice.
            </p>
          )}

          {b1Url && hasFeedback && (
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-slate-light">then</span>
              <div className="flex-1 border-t border-border" />
            </div>
          )}

          {hasFeedback && (
            <button
              type="button"
              onClick={handleFeedbackForm}
              className="w-full flex flex-col items-center justify-center gap-1.5 border-2 border-nhs-blue text-nhs-blue bg-white font-semibold py-5 px-6 rounded-2xl hover:bg-nhs-blue/5 active:scale-[0.98] transition-all text-center"
            >
              <span className="text-2xl leading-none">📋</span>
              <span className="text-sm leading-snug">
                Complete a feedback form for{" "}
                <span className="font-bold">{clinician.clinician_name}</span> — needed
                for their professional development
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
