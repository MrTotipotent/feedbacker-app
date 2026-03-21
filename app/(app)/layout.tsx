"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser, setUser, clearAuth } from "@/app/lib/auth";
import type { StoredUser } from "@/app/lib/auth";
import { authApi } from "@/app/lib/api";
import Sidebar from "@/app/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok">("loading");
  const [user, setLocalUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    // Show cached user immediately — no flash, no wait.
    const cached = getUser();
    setLocalUser(cached);
    setStatus("ok");

    // Refresh full profile from /auth/me in the background on every page load.
    authApi.getMe()
      .then(async (res) => {
        if (res.status === 401) {
          // Token expired or invalid — log out.
          clearAuth();
          router.replace("/login");
          return;
        }
        if (res.ok) {
          const profile: StoredUser = await res.json();
          setUser(profile);       // persist to localStorage
          setLocalUser(profile);  // update sidebar/layout state
        }
        // Any other error (404, 500): keep using cached user — don't log out.
      })
      .catch(() => {
        // Network error — keep using cached user.
      });
  }, [router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center">
        <div className="font-serif text-2xl text-nhs-blue animate-pulse">
          Feed<span className="text-nhs-aqua">backer</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-off-white">
      <Sidebar user={user} />
      {/* offset for desktop sidebar + mobile top bar */}
      <main className="flex-1 lg:ml-60 pt-14 lg:pt-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
