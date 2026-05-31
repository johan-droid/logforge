"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, Gauge, Settings, Terminal, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchSessionUser, logoutSession, type SessionUser } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/account", label: "Account", icon: UserCircle2 },
];

export function AppHeader() {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetchSessionUser()
      .then((sessionUser) => {
        if (mounted) {
          setUser(sessionUser);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingUser(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await logoutSession();
    setLoggingOut(false);
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/65 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="buttery-float flex h-9 w-9 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
            <Terminal className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-wide text-foreground">
              LogForge
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              Deployment observability
            </span>
          </span>
        </Link>

        <nav className="glass-panel hidden items-center rounded-md border border-white/10 p-1 sm:flex">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-muted-foreground transition-all duration-200",
                  active && "bg-white/10 text-foreground shadow-inner shadow-white/10",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200 md:flex">
            <Activity className="h-3.5 w-3.5" />
            Console online
          </div>
          {user ? (
            <>
              <Link
                href="/account"
                className="hidden max-w-44 truncate text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline"
              >
                {user.email || user.name || "Signed in"}
              </Link>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-white/10 bg-white/5"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Signing out..." : "Sign out"}
              </Button>
            </>
          ) : (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-white/10 bg-white/5"
              disabled={loadingUser}
            >
              <Link href="/">{loadingUser ? "Checking..." : "Sign in"}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
