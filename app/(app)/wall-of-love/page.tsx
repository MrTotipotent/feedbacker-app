"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { dashApi } from "@/app/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Submission {
  clinician_name?: string;
  created_at: string;
  sentiment?: string | null;
}

interface CardData {
  id: string;
  quote: string;
  clinicianName: string;
  colorIdx: number;
  rotation: number;
  dx: number;
  dy: number;
  dismissing: boolean;
}

// ─── Palette — pastel sticky-note colours ─────────────────────────────────────

const PALETTE = [
  { bg: "#FFFDE7", pin: "#EF5350", label: "#7B5E00" },  // warm yellow
  { bg: "#F1F8E9", pin: "#E53935", label: "#2E7D32" },  // mint green
  { bg: "#FCE4EC", pin: "#C62828", label: "#880E4F" },  // soft pink
  { bg: "#EDE7F6", pin: "#7B1FA2", label: "#4527A0" },  // lilac
  { bg: "#E1F5FE", pin: "#0277BD", label: "#01579B" },  // sky blue
  { bg: "#FFF3E0", pin: "#E64A19", label: "#BF360C" },  // peach
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randRot(): number {
  return (Math.random() - 0.5) * 10; // –5 … +5 degrees
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WallOfLovePage() {
  const [cards, setCards]               = useState<CardData[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [clinicianFilter, setFilter]    = useState("all");
  const [allClinicians, setAllClinicians] = useState<string[]>([]);
  const [practiceName, setPracticeName] = useState("Your Practice");
  const [isShuffling, setIsShuffling]   = useState(false);
  const [draggingId, setDraggingId]     = useState<string | null>(null);
  const [timeRange, setTimeRange]       = useState<"week" | "month" | "all">("month");

  // drag tracking ref — avoids stale closure issues in mousemove handler
  const dragRef = useRef<{
    id: string; startX: number; startY: number; baseX: number; baseY: number;
  } | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    setError("");
    async function load() {
      try {
        const [revRes, pracRes] = await Promise.all([
          dashApi.getSentimentEvents(timeRange),
          dashApi.getPractice(),
        ]);

        if (pracRes.ok) {
          const p = await pracRes.json();
          setPracticeName(p?.practice_name ?? p?.name ?? "Your Practice");
        }

        if (!revRes.ok) {
          setError(`Could not load feedback (${revRes.status})`);
          return;
        }

        const raw = await revRes.json();
        console.log('[WOL] raw response:', JSON.stringify(raw));
        console.log('[WOL] is array:', Array.isArray(raw));
        console.log('[WOL] length:', Array.isArray(raw) ? raw.length : 'N/A');
        const subs: Submission[] = Array.isArray(raw) ? raw : [];

        // Client-side date filter
        const now = Date.now();
        const cutoff =
          timeRange === "week"  ? now - 7  * 24 * 60 * 60 * 1000 :
          timeRange === "month" ? now - 30 * 24 * 60 * 60 * 1000 : 0;

        // Keep events with meaningful sentiment (≥3 chars) within the time window
        const valid = subs.filter(
          (s) =>
            s.sentiment &&
            s.sentiment.trim().length >= 3 &&
            (cutoff === 0 || new Date(s.created_at).getTime() >= cutoff)
        );

        // Shuffle order randomly so the board always looks fresh
        const shuffled = [...valid].sort(() => Math.random() - 0.5);

        const built: CardData[] = shuffled.map((s, i) => ({
          id: `${s.created_at ?? i}-wol`,
          quote: s.sentiment!.trim(),
          clinicianName: s.clinician_name ?? "Your Clinician",
          colorIdx: i % PALETTE.length,
          rotation: randRot(),
          dx: 0,
          dy: 0,
          dismissing: false,
        }));

        setCards(built);
        setAllClinicians(
          Array.from(new Set(built.map((c) => c.clinicianName))).sort()
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [timeRange]);

  // ── Shuffle ─────────────────────────────────────────────────────────────────

  const handleShuffle = useCallback(() => {
    if (isShuffling) return;
    setIsShuffling(true);
    setCards((prev) =>
      [...prev]
        .sort(() => Math.random() - 0.5)
        .map((c) => ({ ...c, rotation: randRot(), dx: 0, dy: 0 }))
    );
    setTimeout(() => setIsShuffling(false), 600);
  }, [isShuffling]);

  // ── Dismiss (fade-out, no DB delete) ────────────────────────────────────────

  const handleDismiss = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, dismissing: true } : c))
    );
    setTimeout(() => setCards((prev) => prev.filter((c) => c.id !== id)), 360);
  }, []);

  // ── Drag ────────────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      // Don't start drag when clicking the dismiss button
      if ((e.target as HTMLElement).closest("[data-dismiss]")) return;
      e.preventDefault();
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      dragRef.current = { id, startX: e.clientX, startY: e.clientY, baseX: card.dx, baseY: card.dy };
      setDraggingId(id);
    },
    [cards]
  );

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const { id, startX, startY, baseX, baseY } = dragRef.current;
      setCards((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, dx: baseX + (e.clientX - startX), dy: baseY + (e.clientY - startY) }
            : c
        )
      );
    }
    function onUp() {
      dragRef.current = null;
      setDraggingId(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Filtered view ───────────────────────────────────────────────────────────

  const visible = cards.filter(
    (c) => clinicianFilter === "all" || c.clinicianName === clinicianFilter
  );

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg,#c8a96e,#b8956a)" }}
      >
        <p className="text-white/80 text-base font-serif animate-pulse">
          Loading your Wall of Love…
        </p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className="min-h-screen"
        style={{
          backgroundColor: "#c4a065",
          // subtle cork/linen weave texture using repeating gradients
          backgroundImage: [
            "repeating-linear-gradient(0deg,   transparent, transparent 21px, rgba(0,0,0,0.028) 21px, rgba(0,0,0,0.028) 22px)",
            "repeating-linear-gradient(90deg,  transparent, transparent 21px, rgba(0,0,0,0.022) 21px, rgba(0,0,0,0.022) 22px)",
            "repeating-linear-gradient(45deg,  rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 6px)",
            "repeating-linear-gradient(-45deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 1px, transparent 1px, transparent 6px)",
          ].join(", "),
        }}
      >

        {/* ── Header bar ──────────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-30 no-print"
          style={{
            background: "rgba(255,255,255,0.93)",
            backdropFilter: "blur(10px)",
            borderBottom: "1px solid rgba(180,140,80,0.25)",
          }}
        >
          <div className="px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-nhs-blue-dark leading-tight">Wall of Love</h1>
              <p className="text-xs text-slate-light">
                Kind words from your patients — updated in real time
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">

              {/* Time range toggle */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {(["week", "month", "all"] as const).map((r) => {
                  const label = r === "week" ? "1 Week" : r === "month" ? "1 Month" : "All Time";
                  const active = timeRange === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setTimeRange(r)}
                      className={`text-sm font-semibold px-3 py-1.5 transition-colors
                        ${active
                          ? "bg-nhs-blue text-white"
                          : "bg-white text-slate hover:bg-nhs-blue/5 hover:text-nhs-blue"
                        }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Clinician filter */}
              <select
                value={clinicianFilter}
                onChange={(e) => setFilter(e.target.value)}
                className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white text-slate
                           focus:outline-none focus:ring-2 focus:ring-nhs-blue/30 focus:border-nhs-blue"
                style={{ minWidth: 165 }}
              >
                <option value="all">All Clinicians</option>
                {allClinicians.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>

              {/* Shuffle */}
              <button
                onClick={handleShuffle}
                disabled={isShuffling}
                className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg
                           border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue
                           transition-colors disabled:opacity-50"
              >
                <svg viewBox="0 0 20 20" fill="currentColor"
                  className={`w-3.5 h-3.5 ${isShuffling ? "animate-spin" : ""}`}>
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
                </svg>
                Shuffle Wall
              </button>

              {/* Print / Save PDF */}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg
                           border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue
                           transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-2h8v2H6zm8 2H6v2h8v-2z" clipRule="evenodd"/>
                </svg>
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3 text-sm text-red-700 no-print">
            {error}
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {!error && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <div className="text-6xl mb-4">💌</div>
            <p className="text-white text-lg font-serif mb-1">No patient quotes yet</p>
            <p className="text-white/70 text-sm">
              Sentiments from Feedbacker submissions will appear here automatically.
            </p>
          </div>
        )}

        {/* ── Print-only title block ───────────────────────────────────────── */}
        <div className="print-header" style={{ display: "none" }}>
          <div style={{
            textAlign: "center", padding: "28px 0 18px",
            borderBottom: "2px solid #e5e7eb", marginBottom: 28,
          }}>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, color: "#003d7a", margin: "0 0 6px" }}>
              Wall of Love
            </h1>
            <p style={{ fontSize: 14, color: "#555", margin: "0 0 4px" }}>{practiceName}</p>
            <p style={{ fontSize: 12, color: "#999", margin: 0 }}>{today}</p>
          </div>
        </div>

        {/* ── Cork board ──────────────────────────────────────────────────── */}
        <div
          className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4"
          style={{ columnGap: 20, padding: "28px 24px 60px" }}
        >
          {visible.map((card, i) => {
            const p         = PALETTE[card.colorIdx];
            const isDragging = draggingId === card.id;

            return (
              /* Outer wrapper handles stagger fade-in; inner div holds rotation + drag */
              <div
                key={card.id}
                className="wol-card break-inside-avoid"
                style={{
                  animationDelay: `${Math.min(i * 70, 1400)}ms`,
                  marginBottom: 22,
                  position: "relative",
                  zIndex: isDragging ? 100 : 1,
                  opacity: card.dismissing ? 0 : undefined,
                  transform: card.dismissing ? "scale(0.9)" : undefined,
                  transition: card.dismissing ? "opacity 0.35s ease, transform 0.35s ease" : undefined,
                }}
              >
                {/* Card */}
                <div
                  onMouseDown={(e) => handleMouseDown(e, card.id)}
                  style={{
                    background: p.bg,
                    borderRadius: 3,
                    padding: "22px 18px 16px",
                    position: "relative",
                    cursor: isDragging ? "grabbing" : "grab",
                    userSelect: "none",
                    transform: `rotate(${card.rotation}deg) translate(${card.dx}px,${card.dy}px)`,
                    transition: isShuffling
                      ? "transform 0.55s cubic-bezier(0.34,1.56,0.64,1)"
                      : "none",
                    boxShadow: isDragging
                      ? "8px 14px 32px rgba(0,0,0,0.38), 0 2px 8px rgba(0,0,0,0.18)"
                      : "3px 6px 18px rgba(0,0,0,0.26), 0 1px 4px rgba(0,0,0,0.1)",
                  }}
                >
                  {/* Drawing-pin dot */}
                  <div style={{
                    width: 11, height: 11, borderRadius: "50%",
                    background: p.pin,
                    position: "absolute", top: -5, left: "50%",
                    transform: "translateX(-50%)",
                    boxShadow: "0 2px 5px rgba(0,0,0,0.4)",
                    zIndex: 2,
                  }} />

                  {/* Dismiss ✕ — subtle, top-right corner */}
                  <button
                    data-dismiss="true"
                    onClick={() => handleDismiss(card.id)}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Remove from wall"
                    style={{
                      position: "absolute", top: 5, right: 7,
                      color: "rgba(0,0,0,0.22)", fontSize: 11, lineHeight: 1,
                      background: "none", border: "none",
                      cursor: "pointer", padding: "3px 4px", borderRadius: 3,
                      transition: "color 0.15s",
                      fontFamily: "system-ui, sans-serif",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(0,0,0,0.55)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(0,0,0,0.22)"; }}
                  >
                    ✕
                  </button>

                  {/* Quote text */}
                  <p style={{
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontStyle: "italic",
                    fontSize: "0.86rem",
                    lineHeight: 1.6,
                    color: "#2A2A2A",
                    marginTop: 6,
                    marginBottom: 14,
                  }}>
                    &ldquo;{card.quote}&rdquo;
                  </p>

                  {/* Clinician attribution */}
                  <p style={{
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: p.label,
                    marginBottom: 3,
                  }}>
                    About {card.clinicianName}
                  </p>

                  {/* Patient tag */}
                  <p style={{
                    fontSize: "0.6rem",
                    color: "rgba(0,0,0,0.38)",
                    fontStyle: "italic",
                  }}>
                    — Patient
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Global styles: card animation + print ─────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `

        /* Staggered fade-in for cards on load */
        @keyframes wolCardIn {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .wol-card {
          animation: wolCardIn 0.48s ease both;
        }

        /* Print layout */
        @media print {
          /* Hide interactive chrome */
          .no-print,
          aside,
          .lg\\:ml-60 > div:first-child { display: none !important; }

          /* Remove sidebar offset */
          main { margin-left: 0 !important; padding-top: 0 !important; }

          /* Show print title */
          .print-header { display: block !important; }

          /* Board: white background, no texture */
          .min-h-screen {
            background: #ffffff !important;
            background-image: none !important;
            min-height: unset !important;
          }

          /* Cards: no rotation, clean grid shadow */
          .wol-card > div {
            transform: none !important;
            box-shadow: 0 1px 5px rgba(0,0,0,0.14) !important;
            cursor: default !important;
          }

          /* Hide pin and dismiss in print */
          [data-dismiss] { display: none !important; }
          .wol-card > div > div:first-child { display: none !important; /* pin */ }

          /* Columns: 3 across for print */
          .columns-1 {
            column-count: 3 !important;
            column-gap: 16px !important;
          }

          /* Kill animation fill-mode so cards show at full opacity */
          .wol-card {
            animation: none !important;
            opacity: 1 !important;
          }
        }
      ` }} />
    </>
  );
}
