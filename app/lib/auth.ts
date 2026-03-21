const TOKEN_KEY = "fb_token";
const USER_KEY  = "fb_user";

// Flexible enough to hold whatever Xano's /auth/me returns,
// while keeping autocomplete for the known fields we use.
export interface StoredUser {
  id?: number;
  name?: string;
  email?: string;
  role?: "clinician" | "practice_manager" | string;
  account_type?: string;
  clinician_id?: string;
  practice_id?: number | string;
  practice_name?: string;
  redirect_url?: string;
  redirect_platform?: string;
  // Allow any extra fields Xano sends back
  [key: string]: unknown;
}

export const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const getUser = (): StoredUser | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setUser = (user: StoredUser): void => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearAuth = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};
