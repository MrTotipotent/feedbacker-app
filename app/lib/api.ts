import { getToken, clearAuth } from "./auth";

const AUTH_API =
  process.env.NEXT_PUBLIC_XANO_AUTH_API ??
  "https://xtw2-xdvy-nt5f.e2.xano.io/api:Pmigfx7N";

const DASH_API =
  process.env.NEXT_PUBLIC_XANO_DASH_API ??
  "https://xtw2-xdvy-nt5f.e2.xano.io/api:DLfhPC-k";

const SURVEY_API =
  process.env.NEXT_PUBLIC_XANO_SURVEY_API ??
  "https://xtw2-xdvy-nt5f.e2.xano.io/api:tkq1OGP7";

// Practice management endpoints live in a separate Xano API group
const PRACTICE_API =
  process.env.NEXT_PUBLIC_XANO_PRACTICE_API ??
  "https://xtw2-xdvy-nt5f.e2.xano.io/api:MlgfxZN";

async function apiFetch(
  url: string,
  options: RequestInit = {},
  skipAuthRedirect = false
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Debug: log outgoing request body
  if (options.body) {
    console.log("[apiFetch]", options.method ?? "GET", url, JSON.parse(options.body as string));
  }

  const res = await fetch(url, { ...options, headers });

  // Only redirect to /login on 401 for protected routes, not for auth endpoints themselves
  if (res.status === 401 && !skipAuthRedirect) {
    clearAuth();
    if (typeof window !== "undefined") window.location.href = "/login";
  }

  return res;
}

// ─── Public fetch (no auth header) ───────────────────────────────────────────

async function surveyFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  return fetch(url, { ...options, headers });
}

// ─── Public survey endpoints (no auth) ───────────────────────────────────────

export const surveyApi = {
  /** Used by /survey?id=[clinician_id] — direct clinician link */
  getClinicianInfo: (clinicianId: string) =>
    fetch(
      `${SURVEY_API}/get_clinician_info?clinician_id=${encodeURIComponent(clinicianId)}`
    ),

  /** Used by /p/[practice_id] — permanent practice QR code */
  getActiveClinician: (practiceId: string) =>
    fetch(
      `${SURVEY_API}/get_active_clinician?practice_id=${encodeURIComponent(practiceId)}`
    ),

  /** Fire-and-forget one-liner comment */
  createQuickFeedback: (clinicianId: string, comment: string) =>
    fetch(`${SURVEY_API}/create_quick_feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinician_id: clinicianId, comment }),
    }),

  createSubmission: (data: Record<string, unknown>) =>
    fetch(`${SURVEY_API}/create_submission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  /** Used by /p/[room_id] — room-based QR code landing page */
  getRoom: (room_id: number) =>
    surveyFetch(`${SURVEY_API}/get_room?room_id=${room_id}`),

  /** Fire-and-forget event logger for room analytics */
  logEvent: (event_type: string, room_id: number, clinician_id: string, practice_id: number) =>
    surveyFetch(`${SURVEY_API}/log_event`, {
      method: "POST",
      body: JSON.stringify({ event_type, room_id, clinician_id, practice_id }),
    }),
};

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch(
      `${AUTH_API}/auth/login`,
      { method: "POST", body: JSON.stringify({ email, password }) },
      true  // don't redirect on 401 — let the login page show the error
    ),

  signup: (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    account_type: string;
  }) =>
    apiFetch(
      `${AUTH_API}/auth/signup`,
      { method: "POST", body: JSON.stringify(data) },
      true  // don't redirect on 401 — let the login page show the error
    ),

  /** Fetches the full authenticated user profile from Xano's auth table.
   *  Pass skipRedirect=true in the login flow so a 401 doesn't wipe the
   *  just-stored token before the page can handle it gracefully. */
  getMe: (skipRedirect = false) =>
    apiFetch(`${AUTH_API}/auth/me`, {}, skipRedirect),
};

// ─── Dashboard / protected endpoints ─────────────────────────────────────────

// Path prefix used by dashboard endpoints in Xano.
// If your Xano endpoints are /get_me (no prefix), set this to "".
// If your Xano endpoints are /dashboard/get_me, set this to "/dashboard".
const DASH_PREFIX = ""; // Xano endpoints are at root: /get_me, /get_reviews etc.

export const dashApi = {
  getMe: () => apiFetch(`${DASH_API}${DASH_PREFIX}/get_me`),

  getPractice: () => apiFetch(`${DASH_API}${DASH_PREFIX}/get_practice`),

  getReviews: () => apiFetch(`${DASH_API}${DASH_PREFIX}/get_reviews`),

  getCqc: (params?: { from?: string; to?: string }) => {
    const q = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params ?? {}).filter(([, v]) => v !== undefined)
      ) as Record<string, string>
    ).toString();
    return apiFetch(`${DASH_API}/reports/get_cqc${q ? `?${q}` : ""}`);
  },

  getAppraisal: (clinicianId?: string) => {
    const qs = clinicianId ? `?clinician_id=${encodeURIComponent(clinicianId)}` : "";
    const url = `${DASH_API}${DASH_PREFIX}/get_appraisal${qs}`;
    const token = getToken();
    console.log("[getAppraisal] URL:", url);
    console.log("[getAppraisal] token present:", !!token, "| first 20 chars:", token?.slice(0, 20));
    return apiFetch(url);
  },

  getClinicians: () => apiFetch(`${DASH_API}${DASH_PREFIX}/clinicians`),

  /** Fire-and-forget after a successful create_submission.
   *  Recalculates and persists the profile table averages for the
   *  authenticated clinician / PM.  Requires a valid Bearer token;
   *  callers should skip this if no token is present. */
  recalculateProfile: () =>
    apiFetch(`${DASH_API}${DASH_PREFIX}/update_profile_averages`, { method: "POST" }),

  addClinician: (data: {
    name: string;
    role?: string;
    redirect_platform?: string;
    redirect_url?: string;
    rotation_duration_weeks?: number;
  }) =>
    apiFetch(`${DASH_API}${DASH_PREFIX}/add_clinician`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateRedirectUrl: (redirect_url: string, redirect_platform?: string) =>
    apiFetch(`${DASH_API}${DASH_PREFIX}/update_redirect_url`, {
      method: "PATCH",
      body: JSON.stringify({
        redirect_url,
        ...(redirect_platform ? { redirect_platform } : {}),
      }),
    }),

  updateGoogleReviewUrl: (practice_id: string | number, google_review_url: string) =>
    apiFetch(`${DASH_API}/practice/update_google_review_url`, {
      method: "PATCH",
      body: JSON.stringify({ practice_id, google_review_url }),
    }),

  // ── Rooms ────────────────────────────────────────────────────────────────

  createRoom: (room_name: string, practice_id: number) =>
    apiFetch(`${DASH_API}/create_room`, {
      method: "POST",
      body: JSON.stringify({ room_name, practice_id }),
    }),

  getRooms: (practice_id: number) =>
    apiFetch(`${DASH_API}/get_rooms?practice_id=${practice_id}`),

  updateRoom: (room_id: number, room_name: string, active_clinician_id: string) =>
    apiFetch(`${DASH_API}/update_room`, {
      method: "PATCH",
      body: JSON.stringify({ room_id, room_name, active_clinician_id }),
    }),

  getEventCounts: (practice_id: number) =>
    apiFetch(`${DASH_API}/get_event_counts?practice_id=${practice_id}`),

  /** PM only — sets which clinician is currently active for the practice QR */
  setActiveClinicianRotation: (
    practice_id: string,
    clinician_id: string,
    rotation_end_date: string
  ) =>
    apiFetch(`${PRACTICE_API}/practice/set_active_clinician`, {
      method: "PATCH",
      body: JSON.stringify({ practice_id, clinician_id, rotation_end_date }),
    }),
};
