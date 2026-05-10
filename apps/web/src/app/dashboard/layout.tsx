"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Microscope, LayoutDashboard, LogOut, User } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (!mounted || loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-200 bg-white flex flex-col">
        <div className="p-4 border-b border-zinc-200">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 font-bold text-lg hover:text-emerald-600 transition-colors"
          >
            <Microscope className="h-5 w-5 text-emerald-600" />
            LitMine
          </button>
          <p className="text-xs text-zinc-400 mt-0.5">{user.tier === "free" ? "Free" : "Pro"} plan</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => router.push("/dashboard")}
          >
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Button>
        </nav>
        <div className="p-3 border-t border-zinc-200">
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-zinc-500" />
            <span className="text-sm text-zinc-700 truncate">{user.name}</span>
          </div>
          <Button variant="ghost" className="w-full justify-start gap-2 text-zinc-500" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-zinc-50">{children}</main>
    </div>
  );
}
