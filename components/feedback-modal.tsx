'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { CheckCircle2, MessageSquare, X } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId?: string;
  ticketText: string;
  predictedIntent: string;
  onSuccess?: () => void;
}

const AVAILABLE_INTENTS = [
  'Billing',
  'Technical Issue',
  'Account Access',
  'Feature Request',
  'Bug Report',
  'General Inquiry',
  'Cancellation',
  'Complaint',
];

export function FeedbackModal({
  isOpen,
  onClose,
  ticketId,
  ticketText,
  predictedIntent,
  onSuccess,
}: FeedbackModalProps) {
  const [correctIntent, setCorrectIntent] = useState(predictedIntent);
  const [reviewer, setReviewer] = useState('Senior Support Agent');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.submitFeedback({
        ticket_id: ticketId,
        text: ticketText,
        predicted_intent: predictedIntent,
        correct_intent: correctIntent,
        notes: notes || undefined,
        reviewer,
      });
      toast.success(res.message || 'Feedback recorded successfully!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-lg shadow-xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-3 hover:text-ink-2 p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-2xl bg-accent-soft text-accent">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink">
              Human Review & Feedback
            </h3>
            <p className="text-xs text-ink-3">
              Submit ground truth to improve model retraining & accuracy
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">
              Ticket Text Snippet
            </label>
            <div className="text-xs p-2.5 rounded-lg bg-canvas/60 border border-line text-ink-2 max-h-24 overflow-y-auto italic">
              "{ticketText}"
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">
                Model Predicted Intent
              </label>
              <input
                type="text"
                disabled
                value={predictedIntent}
                className="w-full text-xs px-3 py-2 rounded-lg bg-track/70 text-ink-3 border border-line font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">
                Correct Intent
              </label>
              <select
                value={correctIntent}
                onChange={(e) => setCorrectIntent(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg bg-surface text-ink border border-line focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                {AVAILABLE_INTENTS.map((intent) => (
                  <option key={intent} value={intent}>
                    {intent}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">
              Reviewer Name / Role
            </label>
            <input
              type="text"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg bg-surface text-ink border border-line focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="e.g. Senior Support Lead"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">
              Correction Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-xs px-3 py-2 rounded-lg bg-surface text-ink border border-line focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="Provide reason for reclassification..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-ink-2 hover:bg-track rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold bg-ink text-surface hover:opacity-90 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {submitting ? 'Submitting...' : 'Confirm Ground Truth'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
