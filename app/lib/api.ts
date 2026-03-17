import { getToken, clearAuth } from "./auth";

const AUTH_API =
  process.env.NEXT_PUBLIC_XANO_AUTH_API ??
  "https://xtw2-xdvy-nt5f.e2.xano.io/api:Pmigfx7N";

const DASH_API =
  process.env.NEXT_PUBLIC_XANO_DASH_API ??
  "https://xtw2-xdvy-nt5f.e2.xano.io/api:DLfhPC-k";

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") window.location.href = "/login";
  }

  return res;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch(`${AUTH_API}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  signup: (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    account_type: string;
    practice_id: string;
  }) =>
    apiFetch(`${AUTH_API}/auth/signup`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const dashApi = {
  getMe: () => apiFetch(`${DASH_API}/dashboard/get_me`),

  getPractice: () => apiFetch(`${DASH_API}/dashboard/get_practice`),

  getReviews: () => apiFetch(`${DASH_API}/dashboard/get_reviews`),

  getCqc: (params?: { from?: string; to?: string }) => {
    const q = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params ?? {}).filter(([, v]) => v !== undefined)
      ) as Record<string, string>
    ).toString();
    return apiFetch(`${DASH_API}/reports/get_cqc${q ? `?${q}` : ""}`);
  },

  getAppraisal: () => apiFetch(`${DASH_API}/dashboard/get_appraisal`),

  updateRedirectUrl: (redirect_url: string) =>
    apiFetch(`${DASH_API}/dashboard/update_redirect_url`, {
      method: "PATCH",
      body: JSON.stringify({ redirect_url }),
    }),
};
