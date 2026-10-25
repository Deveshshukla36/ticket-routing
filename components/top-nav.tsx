'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { api } from '@/lib/api';
import type { HealthStatus } from '@/types';

const tabs = [
  { name: 'Overview', href: '/' },
  { name: 'Route Ticket', href: '/inference' },
  { name: 'Routing Policy', href: '/routing' },
  { name: 'Models', href: '/models' },
  { name: 'A/B Evaluation', href: '/ab-testing' },
  { name: 'Analytics', href: '/analytics' },
  { name: 'Settings', href: '/settings' },
];

/** Three slanted bars, after the reference's logo mark. */
function LogoMark() {
  return (
    <svg viewBox="0 0 40 22" className="h-5 w-9" aria-hidden="true">
      {[0, 12, 24].map((x, i) => (
        <path key={x} d={`M${x + 6} 1h9l-6 20h-9z`} className="fill-accent" opacity={1 - i * 0.18} />
      ))}
    </svg>
  );
}

function HealthDot() {
  const [health, setHealth] = React.useState<HealthStatus | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const load = () =>
      api.getHealth()
        .then((h) => { if (alive) { setHealth(h); setFailed(false); } })
        .catch(() => { if (alive) setFailed(true); });
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const label = failed ? 'API unreachable' : health ? `API ${health.status} · ${health.backend}` : 'Checking API…';
  const tone = failed || health?.status === 'error' ? 'bg-bad' : health?.status === 'degraded' ? 'bg-amber-500' : health ? 'bg-good' : 'bg-ink-3';

  return (
    <div className="hidden lg:flex items-center gap-2 rounded-full bg-surface/80 px-3 h-9 text-xs text-ink-2 shadow-pill" title={label}>
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      <span>{label}</span>
    </div>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-30 bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:flex-nowrap">
        <Link href="/" className="mr-auto flex shrink-0 items-center gap-2.5 lg:mr-0">
          <LogoMark />
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-ink">IntentRoute</span>
            <span className="block text-[10px] text-ink-3">Ticket routing</span>
          </span>
        </Link>

        {/* Below lg the tabs take their own full-width row (scrollable), so every tab stays visible. */}
        <nav className="no-scrollbar order-last flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-track/70 p-1 lg:order-none lg:mx-auto lg:w-auto">
          {tabs.map((tab) => {
            const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs transition-all ${
                  active ? 'bg-surface text-ink shadow-pill' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <HealthDot />
          {mounted && (
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface/80 text-ink-2 shadow-pill transition-colors hover:text-ink"
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
