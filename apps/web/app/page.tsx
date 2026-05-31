"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  Cloud,
  LockKeyhole,
  RadioTower,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchSessionUser } from "@/lib/auth";
import { API_BASE } from "@/lib/config";

const providers = ["Render", "Vercel", "Heroku", "Cloudflare"];

export default function Landing() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const apiAuth = `${API_BASE}/api/auth/google`;

  useEffect(() => {
    let mounted = true;

    fetchSessionUser()
      .then((user) => {
        if (!mounted) return;
        if (user) {
          setHasSession(true);
          router.replace("/dashboard");
          return;
        }
        setHasSession(false);
      })
      .finally(() => {
        if (mounted) {
          setCheckingSession(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <main className="relative min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl flex-col">
        <header className="buttery-fade-up flex items-center justify-between border-b border-white/10 pb-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="buttery-float flex h-9 w-9 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
              <Terminal className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">
                LogForge
              </span>
              <span className="block text-xs text-muted-foreground">
                Nova Devs / Nova Labs
              </span>
            </span>
          </Link>
          <Button
            asChild
            variant="outline"
            className="border-white/10 bg-white/5"
            disabled={checkingSession}
          >
            <a href={apiAuth}>
              <LockKeyhole className="h-4 w-4" />
              {checkingSession
                ? "Checking session..."
                : hasSession
                  ? "Open dashboard"
                  : "Sign in"}
            </a>
          </Button>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <div>
            <Badge
              variant="outline"
              className="mb-4 rounded-md border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
            >
              <RadioTower className="mr-2 h-3.5 w-3.5" />
              Live deployment observability
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl buttery-fade-up">
              LogForge
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              A focused console for watching deployments, provider health, and
              live logs across the cloud services you already use.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/10 bg-white/5"
                disabled={checkingSession}
              >
                <a href={apiAuth}>
                  {checkingSession
                    ? "Checking session..."
                    : "Sign in with Google"}
                  <LockKeyhole className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          <div className="glass-panel rounded-lg border border-white/10 p-4 shadow-2xl shadow-black/30 buttery-fade-up">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">
                  Provider mesh
                </div>
                <div className="text-xs text-muted-foreground">
                  Connection readiness
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs text-emerald-100">
                <Activity className="h-3.5 w-3.5" />
                Ready
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {providers.map((provider) => (
                <div
                  key={provider}
                  className="rounded-md border border-white/10 bg-black/25 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <Cloud className="h-4 w-4 text-primary" />
                      {provider}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Integration
                    </span>
                  </div>
                  <div className="mt-4 text-xs text-muted-foreground">
                    Connect your real {provider} account to load systems and live logs.
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-md border border-white/10 bg-black/30 p-4 font-mono text-xs text-stone-300">
              <div className="text-muted-foreground">
                $ logforge stream --provider all
              </div>
              <div className="mt-2 text-emerald-200">
                sign in and connect providers to load actual service data
              </div>
              <div className="mt-1 text-amber-100">
                sse gateway ready on /api/stream/:provider/:serviceId
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
