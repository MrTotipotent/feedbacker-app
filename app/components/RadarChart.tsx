"use client";

import { SCORE_KEYS } from "@/app/lib/constants";

const N       = SCORE_KEYS.length; // 10
const SIZE    = 320;
const CX      = SIZE / 2;
const CY      = SIZE / 2;
const R       = 108; // grid polygon radius
const LABEL_R = 138; // label distance from centre
const LEVELS  = 5;

function rad(i: number) {
  return (2 * Math.PI * i) / N - Math.PI / 2;
}

function pt(r: number, i: number) {
  const a = rad(i);
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function textAnchor(i: number) {
  const x = Math.cos(rad(i));
  if (x < -0.25) return "end";
  if (x > 0.25)  return "start";
  return "middle";
}

function dominantBaseline(i: number) {
  const y = Math.sin(rad(i));
  if (y < -0.25) return "auto";
  if (y > 0.25)  return "hanging";
  return "middle";
}

export default function RadarChart({
  scores,
  size = SIZE,
}: {
  scores: Record<string, number>;
  size?: number;
}) {
  const scale = size / SIZE;

  // Grid rings
  const rings = Array.from({ length: LEVELS }, (_, l) => {
    const r = ((l + 1) / LEVELS) * R;
    const pts = SCORE_KEYS.map((_, i) => {
      const p = pt(r, i);
      return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
    });
    return pts.join(" ") + "Z";
  });

  // Data polygon
  const dataPath = SCORE_KEYS.map(({ key }, i) => {
    const val = Math.max(0, Math.min(5, scores[key] ?? 0));
    const r   = (val / 5) * R;
    const p   = pt(r, i);
    return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
  }).join(" ") + "Z";

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={size}
      height={size}
      className="overflow-visible"
      aria-label="Radar chart of clinician scores"
    >
      {/* Grid rings */}
      {rings.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#D8E0E8" strokeWidth="1" />
      ))}

      {/* Axis spokes */}
      {SCORE_KEYS.map((_, i) => {
        const p = pt(R, i);
        return (
          <line
            key={i}
            x1={CX} y1={CY}
            x2={p.x} y2={p.y}
            stroke="#D8E0E8"
            strokeWidth="1"
          />
        );
      })}

      {/* Score level labels (1–5 on one spoke) */}
      {Array.from({ length: LEVELS }, (_, l) => {
        const r = ((l + 1) / LEVELS) * R;
        const p = pt(r, 0); // label on the top spoke
        return (
          <text
            key={l}
            x={p.x + 4}
            y={p.y}
            fontSize="8"
            fill="#768692"
            dominantBaseline="middle"
          >
            {l + 1}
          </text>
        );
      })}

      {/* Data polygon */}
      <path d={dataPath} fill="rgba(0,94,184,0.15)" stroke="#005EB8" strokeWidth="2.5" strokeLinejoin="round" />

      {/* Data point dots */}
      {SCORE_KEYS.map(({ key }, i) => {
        const val = Math.max(0, Math.min(5, scores[key] ?? 0));
        const r   = (val / 5) * R;
        const p   = pt(r, i);
        return (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#005EB8" stroke="white" strokeWidth="1.5" />
        );
      })}

      {/* Labels */}
      {SCORE_KEYS.map(({ short }, i) => {
        const p = pt(LABEL_R, i);
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor={textAnchor(i)}
            dominantBaseline={dominantBaseline(i)}
            fontSize="10"
            fontWeight="600"
            fill="#425563"
          >
            {short}
          </text>
        );
      })}
    </svg>
  );
}
