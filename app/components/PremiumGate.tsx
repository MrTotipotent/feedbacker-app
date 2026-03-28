"use client";

interface PremiumGateProps {
  hasAccess: boolean;
  children: React.ReactNode;
}

/**
 * Wraps any premium-only UI section.
 * - If hasAccess is true (premium or trialing): renders children normally.
 * - If hasAccess is false: renders a locked overlay with upgrade prompt.
 */
export default function PremiumGate({ hasAccess, children }: PremiumGateProps) {
  if (hasAccess) return <>{children}</>;

  return (
    <div className="relative rounded-xl">
      {/* Dimmed, non-interactive preview of the feature */}
      <div aria-hidden className="pointer-events-none select-none opacity-25 blur-sm">
        {children}
      </div>

      {/* Lock overlay — z-10 so it sits above the blurred preview */}
      <div
        className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/85"
        style={{ zIndex: 10 }}
      >
        <div className="flex flex-col items-center gap-3 text-center p-6">
          {/* Lock icon */}
          <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-slate-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <p className="text-sm font-semibold text-slate-600">
            This is a Premium feature
          </p>

          {/* Styled NHS blue button — pointer-events explicitly auto to ensure clickability */}
          <a
            href="/settings#subscription"
            style={{ pointerEvents: "auto" }}
            className="inline-block bg-nhs-blue text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-nhs-blue-dark transition-colors"
          >
            Upgrade to unlock
          </a>
        </div>
      </div>
    </div>
  );
}
