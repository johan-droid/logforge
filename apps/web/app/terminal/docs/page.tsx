"use client";

import { Terminal, Cloud, Zap, Activity, Book, ExternalLink, Code, Shield, Clock, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function TerminalDocsPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-black text-stone-100">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-emerald-600/8 blur-[200px]" />
        <div className="absolute right-20 top-40 h-[600px] w-[600px] rounded-full bg-cyan-700/6 blur-[250px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.08] bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/terminal" className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-lg shadow-emerald-500/20">
              <Terminal className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">LogForge Terminal</h1>
              <p className="text-xs text-stone-400">Documentation</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="sm" className="border-white/10 bg-white/5 text-xs hover:bg-white/10">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button asChild size="sm" className="bg-emerald-600 text-xs hover:bg-emerald-500">
              <Link href="/terminal">Open Terminal</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-16">
        <div className="mb-12">
          <div className="flex items-center gap-2 text-emerald-400 mb-4">
            <Book className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Documentation</span>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4">
            Live Tracking & Trail System
          </h2>
          <p className="text-lg text-stone-400 max-w-3xl">
            The LogForge Terminal provides a physical terminal-like experience for monitoring live deployment logs across all your cloud providers, similar to Heroku and Render&apos;s CLI trail systems.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          <FeatureCard
            icon={<Cloud className="h-6 w-6 text-blue-400" />}
            title="Polycloud Support"
            description="Native log streaming for Vercel, Heroku, Cloudflare Pages, Railway, and Render from a single unified interface."
          />
          <FeatureCard
            icon={<Zap className="h-6 w-6 text-amber-400" />}
            title="Real-Time Streaming"
            description="Server-Sent Events (SSE) deliver logs with sub-second latency, giving you instant visibility into deployments."
          />
          <FeatureCard
            icon={<Shield className="h-6 w-6 text-emerald-400" />}
            title="Secure by Design"
            description="Stateless log streaming with encrypted credentials. API tokens stored only in volatile memory and discarded on disconnect."
          />
          <FeatureCard
            icon={<Clock className="h-6 w-6 text-purple-400" />}
            title="Build & App Logs"
            description="Separate concurrent terminals for build logs and runtime application logs with independent stream controls."
          />
          <FeatureCard
            icon={<Server className="h-6 w-6 text-cyan-400" />}
            title="Budget Protection"
            description="Intelligent polling schedules protect provider API quotas while maintaining real-time observability."
          />
          <FeatureCard
            icon={<Code className="h-6 w-6 text-pink-400" />}
            title="CLI-Like Experience"
            description="Physical terminal aesthetic with monospace fonts, timestamped entries, and level-based color coding."
          />
        </div>
      </section>

      {/* Usage Guide */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-16">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-8 backdrop-blur-xl">
          <h3 className="text-2xl font-bold text-white mb-6">Getting Started</h3>
          
          <div className="space-y-8">
            <Step
              number={1}
              title="Configure Cloud Providers"
              description="Navigate to Settings and connect your cloud provider accounts (Vercel, Heroku, Render, etc.) using OAuth or API tokens."
            />
            <Step
              number={2}
              title="Access the Terminal"
              description="Click the Terminal link in the navigation or visit /terminal to open the dedicated terminal interface."
            />
            <Step
              number={3}
              title="Select a Service"
              description="Choose from your connected services in the left sidebar directory. The terminal will automatically connect to the live log stream."
            />
            <Step
              number={4}
              title="Monitor & Filter"
              description="Watch logs stream in real-time. Use the search bar to filter by keywords, toggle between App and Build logs, or pause the stream."
            />
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-black/40 p-8 backdrop-blur-xl">
          <h3 className="text-2xl font-bold text-white mb-6">Terminal Features</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-semibold text-stone-300 mb-3">Stream Controls</h4>
              <ul className="space-y-2 text-sm text-stone-400">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <strong className="text-stone-200">Play/Pause:</strong> Toggle log streaming without disconnecting
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <strong className="text-stone-200">Jump to Live:</strong> Auto-scroll to the latest log entry
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <strong className="text-stone-200">Clear Buffer:</strong> Remove all buffered logs from view
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <strong className="text-stone-200">Export:</strong> Download logs as a .txt file
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-stone-300 mb-3">Filtering</h4>
              <ul className="space-y-2 text-sm text-stone-400">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <strong className="text-stone-200">Search:</strong> Filter logs by keyword or phrase
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <strong className="text-stone-200">Tab Switching:</strong> Separate views for App and Build logs
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <strong className="text-stone-200">Level Badges:</strong> Color-coded ERROR, WARN, INFO, DEBUG
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <strong className="text-stone-200">Timestamps:</strong> Each log entry shows precise timing
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* API Reference */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-black/40 p-8 backdrop-blur-xl">
          <h3 className="text-2xl font-bold text-white mb-6">API Endpoints</h3>
          <div className="space-y-4">
            <EndpointRow
              method="GET"
              path="/api/stream/:provider/:serviceId"
              description="Server-Sent Events stream for live logs. Query param `type=app` or `type=build`."
            />
            <EndpointRow
              method="GET"
              path="/api/providers"
              description="List all configured cloud providers and their connection status."
            />
            <EndpointRow
              method="GET"
              path="/api/services"
              description="Discover all active services across connected providers."
            />
            <EndpointRow
              method="GET"
              path="/api/valve/stream"
              description="Stateless ephemeral SSE stream using single-use tickets (no DB storage)."
            />
          </div>
        </div>

        {/* Supported Providers */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-black/40 p-8 backdrop-blur-xl">
          <h3 className="text-2xl font-bold text-white mb-6">Supported Providers</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <ProviderBadge name="Vercel" color="bg-zinc-700" />
            <ProviderBadge name="Heroku" color="bg-indigo-600" />
            <ProviderBadge name="Render" color="bg-cyan-600" />
            <ProviderBadge name="Cloudflare" color="bg-amber-500" />
            <ProviderBadge name="Railway" color="bg-fuchsia-600" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-black/20 py-8 px-6 mt-auto">
        <div className="mx-auto flex max-w-7xl items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>LogForge Terminal Documentation</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="hover:text-stone-300 transition-colors">Dashboard</Link>
            <Link href="/terminal" className="hover:text-stone-300 transition-colors">Terminal</Link>
            <Link href="/settings" className="hover:text-stone-300 transition-colors">Settings</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-xl transition-all hover:border-emerald-500/30 hover:bg-emerald-500/5">
      <div className="mb-4">{icon}</div>
      <h4 className="text-base font-semibold text-stone-200 mb-2">{title}</h4>
      <p className="text-sm text-stone-400 leading-relaxed">{description}</p>
    </div>
  );
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm">
        {number}
      </div>
      <div>
        <h4 className="text-base font-semibold text-stone-200 mb-1">{title}</h4>
        <p className="text-sm text-stone-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function EndpointRow({ method, path, description }: { method: string; path: string; description: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 p-4 rounded-xl bg-black/30 border border-white/5">
      <div className="flex items-center gap-3 shrink-0">
        <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300">
          {method}
        </span>
        <code className="text-xs text-cyan-300 font-mono">{path}</code>
      </div>
      <p className="text-sm text-stone-400 flex-1">{description}</p>
    </div>
  );
}

function ProviderBadge({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 py-3 px-4">
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-sm font-medium text-stone-300">{name}</span>
    </div>
  );
}
