'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Inbox, MessageSquareWarning, MoreHorizontal, Search, X } from 'lucide-react';
import { FilterPill, IconButton, Meter, PanelTitle, StatusPill } from '@/components/ui/primitives';
import { REVIEW_QUEUE, intentCode, pct, type TeamQueue, type Ticket } from '@/lib/routing';

type Filter = 'all' | 'routed' | 'review';

function TicketRows({ tickets, onFeedback }: { tickets: Ticket[]; onFeedback: (t: Ticket) => void }) {
  return (
    <div className="inset-panel mt-3 overflow-hidden">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-[10px] text-ink-3">
            <th className="py-2 pl-3 font-normal">Intent</th>
            <th className="py-2 font-normal">Ticket</th>
            <th className="py-2 text-right font-normal">Conf.</th>
            <th className="py-2 pl-3 font-normal">Status</th>
            <th className="py-2 pr-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t, i) => (
            <tr key={`${t.id}-${i}`} className="border-t border-line/60">
              <td className="py-2 pl-3 text-ink-2" title={t.intent}>
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-ink-3 align-middle" />
                {intentCode(t.intent)}
              </td>
              <td className="max-w-[92px] truncate py-2 text-ink-2" title={t.text}>{t.id}</td>
              <td className="py-2 text-right tabular-nums text-ink">{pct(t.confidence, 0)}</td>
              <td className="py-2 pl-3"><StatusPill status={t.needsReview ? 'review' : 'routed'} /></td>
              <td className="py-2 pr-2 text-right">
                <button
                  type="button"
                  onClick={() => onFeedback(t)}
                  className="rounded-md p-1 text-ink-3 hover:bg-track hover:text-ink"
                  aria-label={`Correct the label for ${t.id}`}
                  title="Correct this prediction"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueueCard({
  title,
  subtitle,
  tone,
  confidence,
  tickets,
  open,
  onToggle,
  onFeedback,
  icon,
  cardRef,
}: {
  title: string;
  subtitle: string;
  tone: 'good' | 'bad' | 'idle';
  confidence: number | null;
  tickets: Ticket[];
  open: boolean;
  onToggle: () => void;
  onFeedback: (t: Ticket) => void;
  icon: React.ReactNode;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={cardRef} className={`rounded-2xl border border-line/70 bg-surface/90 p-3.5 ${tone === 'idle' ? 'opacity-70' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-canvas text-ink-2">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">{title}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <span className={`h-1.5 w-1.5 rounded-full ${tone === 'good' ? 'bg-good' : tone === 'bad' ? 'bg-bad' : 'bg-ink-3'}`} />
            {subtitle}
          </span>
        </span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-canvas text-ink-2">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {open && (
        <div className="mt-3">
          {confidence !== null && <Meter label="Avg confidence" value={confidence} tone={tone === 'bad' ? 'bad' : 'good'} />}
          {tickets.length > 0 ? (
            <TicketRows tickets={tickets.slice(0, 6)} onFeedback={onFeedback} />
          ) : (
            <p className="mt-3 text-[11px] text-ink-3">No tickets for this filter.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function QueuePanel({
  queues,
  reviewTickets,
  focusTeam,
  onFeedback,
}: {
  queues: TeamQueue[];
  reviewTickets: Ticket[];
  focusTeam: string | null;
  onFeedback: (t: Ticket) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const matches = (t: Ticket) => {
    const q = query.trim().toLowerCase();
    return !q || t.id.toLowerCase().includes(q) || t.text.toLowerCase().includes(q) || t.intent.toLowerCase().includes(q);
  };

  const cards = useMemo(() => {
    const team = queues.map((q) => {
      const pool = filter === 'routed' ? q.routed : filter === 'review' ? q.review : q.routed.concat(q.review);
      const tickets = pool.filter(matches).sort((a, b) => b.timestamp - a.timestamp);
      return { key: q.team, q, tickets, activity: q.routed.length + q.review.length };
    });
    return team.sort((a, b) => b.tickets.length - a.tickets.length || b.activity - a.activity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queues, filter, query]);

  const review = reviewTickets.filter(matches).sort((a, b) => b.timestamp - a.timestamp);

  // Expand the two busiest queues by default, plus anything the map asks us to focus.
  const isOpen = (key: string, idx: number) => open[key] ?? idx < 2;
  useEffect(() => {
    if (!focusTeam) return;
    setOpen((o) => ({ ...o, [focusTeam]: true }));
    if (focusTeam === REVIEW_QUEUE) setFilter((f) => (f === 'routed' ? 'all' : f));
    const el = refs.current[focusTeam];
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focusTeam]);

  const showReviewCard = filter !== 'routed';

  return (
    <section className="panel flex max-h-[calc(100vh-150px)] min-h-[420px] flex-col p-5" aria-label="Routing queues">
      <PanelTitle
        title="Routing queues"
        subtitle="Latest tickets per team"
        actions={
          <IconButton label={searchOpen ? 'Close search' : 'Search tickets'} active={searchOpen} onClick={() => { setSearchOpen((s) => !s); setQuery(''); }}>
            {searchOpen ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
          </IconButton>
        }
      />
      {searchOpen && (
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ticket id, text or intent"
          className="mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterPill>
        <FilterPill active={filter === 'routed'} onClick={() => setFilter('routed')} dot="good">Auto-routed</FilterPill>
        <FilterPill active={filter === 'review'} onClick={() => setFilter('review')} dot="bad">Review</FilterPill>
      </div>

      <div className="-mr-2 mt-4 flex-1 space-y-3 overflow-y-auto pr-2">
        {showReviewCard && (
          <QueueCard
            cardRef={(el) => { refs.current[REVIEW_QUEUE] = el; }}
            title="Human review queue"
            subtitle={review.length ? `${review.length} below the confidence threshold` : 'Empty'}
            tone={review.length ? 'bad' : 'idle'}
            confidence={null}
            tickets={review}
            open={open[REVIEW_QUEUE] ?? review.length > 0}
            onToggle={() => setOpen((o) => ({ ...o, [REVIEW_QUEUE]: !(o[REVIEW_QUEUE] ?? review.length > 0) }))}
            onFeedback={onFeedback}
            icon={<MessageSquareWarning className="h-4 w-4" />}
          />
        )}
        {cards.map(({ key, q, tickets }, idx) => (
          <QueueCard
            key={key}
            cardRef={(el) => { refs.current[key] = el; }}
            title={q.team}
            subtitle={
              q.routed.length + q.review.length === 0
                ? 'Idle'
                : `${q.routed.length} routed · ${q.review.length} held · SLA ${q.slaHours}h`
            }
            tone={q.routed.length ? 'good' : q.review.length ? 'bad' : 'idle'}
            confidence={q.avgConfidence}
            tickets={tickets}
            open={isOpen(key, idx)}
            onToggle={() => setOpen((o) => ({ ...o, [key]: !isOpen(key, idx) }))}
            onFeedback={onFeedback}
            icon={<Inbox className="h-4 w-4" />}
          />
        ))}
      </div>
    </section>
  );
}
