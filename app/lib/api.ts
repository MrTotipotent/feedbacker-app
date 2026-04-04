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
    practice_name?: string;
    account_type?: string;
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

  /** Sends a one-time temporary password to the given email address */
  requestTempPassword: (email: string) =>
    apiFetch(
      `${AUTH_API}/auth/request-temp-password`,
      { method: "POST", body: JSON.stringify({ email }) },
      true
    ),

  /** Exchanges email + temp password for a short-lived authToken */
  tempLogin: (email: string, temp_password: string) =>
    apiFetch(
      `${AUTH_API}/auth/temp-login`,
      { method: "POST", body: JSON.stringify({ email, temp_password }) },
      true
    ),

  /**
   * Sets a new permanent password.
   * Uses the one-time authToken from tempLogin — NOT the stored session token.
   * Direct fetch (not apiFetch) so it doesn't accidentally read localStorage.
   */
  resetPassword: (authToken: string, password: string) =>
    fetch(`${AUTH_API}/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
      },
      body: JSON.stringify({ password }),
    }),
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

  getClinicianDashboard: () => apiFetch(`${DASH_API}${DASH_PREFIX}/get_clinician_dashboard`),

  /** Fire-and-forget after a successful create_submission.
   *  Recalculates and persists the profile table averages for the
   *  authenticated clinician / PM.  Requires a valid Bearer token;
   *  callers should skip this if no token is present. */
  recalculateProfile: () =>
    apiFetch(`${DASH_API}${DASH_PREFIX}/update_profile_averages`, { method: "POST" }),

  addClinician: (data: {
    name: string;
    email?: string;
    role?: string;
    redirect_platform?: string;
    redirect_url?: string;
    rotation_start_date?: string;
    rotation_end_date?: string;
    rotation_duration_weeks?: number;
  }) =>
    apiFetch(`${DASH_API}${DASH_PREFIX}/add_clinician`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateClinicianDates: (
    clinician_id: string,
    rotation_start_date: string | null,
    rotation_end_date: string | null
  ) =>
    apiFetch(`${DASH_API}${DASH_PREFIX}/update_clinician_dates`, {
      method: "PATCH",
      body: JSON.stringify({ clinician_id, rotation_start_date, rotation_end_date }),
    }),

  updateRedirectUrl: (redirect_url: string, redirect_platform?: string, clinician_id?: string) =>
    apiFetch(`${DASH_API}${DASH_PREFIX}/update_redirect_url`, {
      method: "PATCH",
      body: JSON.stringify({
        redirect_url,
        ...(redirect_platform ? { redirect_platform } : {}),
        ...(clinician_id ? { clinician_id } : {}),
      }),
    }),


  /**
   * Generic practice field update.
   *
   * ALLOWED fields (frontend-safe):
   *   practice_id, subscription_tier, subscription_status, rotation_enabled,
   *   nhs_review_url, healthwatch_url, fft_url, google_review_url,
   *   practice_name, ods_code
   *
   * NEVER include subscription_started_at or trial_expires_at — these are
   * admin-only fields managed exclusively server-side and must not be sent
   * from any frontend action under any circumstances.
   */
  updatePractice: (
    practice_id: string | number,
    fields: {
      subscription_tier?: string;
      subscription_status?: string;
      rotation_enabled?: boolean;
      nhs_review_url?: string;
      healthwatch_url?: string;
      fft_url?: string;
      google_review_url?: string;
      google_place_id?: string;
      practice_name?: string;
      ods_code?: string;
      // subscription_started_at  — FORBIDDEN: admin-only, never send from frontend
      // trial_expires_at         — FORBIDDEN: admin-only, never send from frontend
    }
  ) =>
    apiFetch(`${DASH_API}/practice/update_practice`, {
      method: "PATCH",
      body: JSON.stringify({ practice_id, ...fields }),
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

  getEventCounts: (practice_id: number, clinician_id?: string, month?: number, year?: number) => {
    const p = new URLSearchParams({ practice_id: String(practice_id) });
    if (clinician_id)        p.set("clinician_id", clinician_id);
    if (month !== undefined) p.set("month", String(month));
    if (year  !== undefined) p.set("year",  String(year));
    return apiFetch(`${DASH_API}/get_event_counts?${p}`);
  },

  /** Permanently removes a clinician record from Xano.
   *  Expects the Xano integer primary key (id field), not clinician_id string. */
  deleteClinician: (id: number) =>
    apiFetch(`${DASH_API}${DASH_PREFIX}/delete_clinician`, {
      method: "DELETE",
      body: JSON.stringify({ id }),
    }),

  /** PM only — sets which clinician is currently active for the practice QR */
  /** Looks up a Google Place ID by practice name */
  lookupPlaceId: (practice_name: string) =>
    apiFetch(`${DASH_API}/practice/lookup-place-id`, {
      method: "POST",
      body: JSON.stringify({ practice_name }),
    }),

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
