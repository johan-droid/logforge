"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Gauge,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCircle2,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSessionUser, logoutSession, type SessionUser } from "@/lib/auth";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetchSessionUser()
      .then((sessionUser) => {
        if (!mounted) return;
        if (!sessionUser) {
          router.replace("/");
          return;
        }
        setUser(sessionUser);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    await logoutSession();
    setLoggingOut(false);
    window.location.href = "/";
  }

  const displayName = useMemo(() => {
    if (!user) return "Loading user";
    return user.name || user.email || user.id;
  }, [user]);

  return (
    <div className="relative min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 buttery-fade-up">
        <section className="glass-panel rounded-2xl border border-white/10 p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
                <Sparkles className="h-3.5 w-3.5" />
                Authenticated user menu
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Your workspace menu
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Manage your session and jump quickly into dashboard operations.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <UserCircle2 className="h-8 w-8 text-primary" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="glass-panel border-white/10">
              <CardHeader>
                <CardTitle className="text-base">Signed-in identity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium text-foreground">
                  {loading ? "Loading..." : displayName}
                </p>
                <p className="text-muted-foreground">{user?.email || "No email available"}</p>
                <p className="text-xs text-muted-foreground">Session role: {user?.role || "user"}</p>
              </CardContent>
            </Card>

            <Card className="glass-panel border-white/10">
              <CardHeader>
                <CardTitle className="text-base">Quick actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button asChild className="justify-between">
                  <Link href="/dashboard">
                    Open dashboard
                    <Gauge className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-between border-white/10 bg-white/5">
                  <Link href="/settings">
                    Provider settings
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between border-red-300/20 bg-red-400/10 text-red-100 hover:bg-red-400/20"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  {loggingOut ? "Signing out..." : "Sign out"}
                  <LogOut className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-panel border-white/10 md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  Route protection status
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Protected routes are active for dashboard, settings, and this account menu.
                If the session cookie is missing, navigation is redirected to sign-in.
                <div className="mt-3">
                  <Button asChild variant="ghost" className="px-0 text-emerald-200 hover:text-emerald-100">
                    <Link href="/dashboard">
                      Continue to live logs
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
