'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Route,
  GitMerge,
  Layers,
  GitCompare,
  BarChart3,
  Sliders,
  ShieldCheck,
} from 'lucide-react';

const navigation = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Route Ticket', href: '/inference', icon: Route, badge: 'Live' },
  { name: 'Routing Policy', href: '/routing', icon: GitMerge },
  { name: 'Model Registry', href: '/models', icon: Layers },
  { name: 'A/B Evaluation', href: '/ab-testing', icon: GitCompare },
  { name: 'Analytics & Drift', href: '/analytics', icon: BarChart3 },
  { name: 'Configuration', href: '/settings', icon: Sliders },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between shrink-0 h-screen sticky top-0 transition-all z-30">
      <div>
        {/* Brand Header */}
        <div className="h-14 flex items-center px-5 border-b border-slate-200 dark:border-slate-800 gap-2.5">
          <div className="h-7 w-7 rounded-md bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Route className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white block leading-none">
              IntentRoute AI
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Enterprise Dispatch
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Navigation
          </div>
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Production Benchmark Card */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800">
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Benchmark Accuracy
            </span>
            <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
              94.0%
            </span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
            RoBERTa fine-tuned transformer with calibrated LinearSVC production serving.
          </p>
        </div>
      </div>
    </aside>
  );
}
