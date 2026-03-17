export const SCORE_KEYS = [
  { key: "ease",           label: "Ease",           short: "Ease"     },
  { key: "listening",      label: "Listening",      short: "Listen."  },
  { key: "involving",      label: "Involving",      short: "Involve"  },
  { key: "explaining",     label: "Explaining",     short: "Explain"  },
  { key: "empathy",        label: "Empathy",        short: "Empathy"  },
  { key: "confidence",     label: "Confidence",     short: "Confid."  },
  { key: "trust",          label: "Trust",          short: "Trust"    },
  { key: "futureplan",     label: "Future Plan",    short: "Future"   },
  { key: "escalation",     label: "Escalation",     short: "Escalat." },
  { key: "recommendation", label: "Recommendation", short: "Recomm."  },
] as const;

export type ScoreKey = typeof SCORE_KEYS[number]["key"];
export type Scores = Record<ScoreKey, number>;

export const CQC_DOMAINS = [
  { key: "safe",      label: "Safe",       color: "#005EB8" },
  { key: "effective", label: "Effective",  color: "#009639" },
  { key: "caring",    label: "Caring",     color: "#00A9CE" },
  { key: "responsive",label: "Responsive", color: "#7C3AED" },
  { key: "well_led",  label: "Well-led",   color: "#E65C00" },
] as const;
