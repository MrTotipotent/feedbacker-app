"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/app/lib/auth";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? "/dashboard" : "/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center">
      <div className="font-serif text-2xl text-nhs-blue animate-pulse">
        Feed<span className="text-nhs-aqua">backer</span>
      </div>
    </div>
  );
}
