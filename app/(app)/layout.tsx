"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/app/lib/auth";
import type { StoredUser } from "@/app/lib/auth";
import Sidebar from "@/app/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok">("loading");
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    setStatus("ok");
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
