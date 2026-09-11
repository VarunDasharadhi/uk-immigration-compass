/**
 * AlertsSignup.tsx
 * Email alert capture for the News tab: double opt-in signup for a daily
 * digest of rule changes and sponsor register movements. The card is
 * self-contained so it can be dropped into any sidebar.
 */

import React, { useState } from 'react';
import { Bell, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '../services/apiClient';

type SignupState = 'idle' | 'busy' | 'done' | 'error';

export const AlertsSignup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SignupState>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || state === 'busy') return;
    setState('busy');
    try {
      const result = await apiClient.subscribeToAlerts(trimmed);
      setMessage(result.message || 'Check your inbox and click the confirm link to finish subscribing.');
      setState('done');
    } catch (err: any) {
      setMessage(err?.message || 'Something went wrong. Please try again.');
      setState('error');
    }
  };

  return (
    <div className="bg-white/70 dark:bg-slate-900/60 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 bg-blue-800 rounded-lg flex items-center justify-center shadow-md shadow-blue-900/30 flex-shrink-0">
          <Bell className="text-white w-5 h-5" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Email alerts</h3>
      </div>

      {state === 'done' ? (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl dark:bg-emerald-950/30 dark:border-emerald-900/40">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-800 dark:text-emerald-300 leading-relaxed">{message}</p>
          </div>
          {/* Typo insurance: the server cannot tell a mistyped address from a
              real one, so the only recovery is signing up again */}
          <button
            type="button"
            onClick={() => { setEmail(''); setMessage(''); setState('idle'); }}
            className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Use a different address
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
            One short email on days when visa rules or the sponsor register
            change. No spam, and you can unsubscribe any time.
          </p>
          <form onSubmit={handleSubmit} noValidate>
            {/* sr-only label keeps the input named for screen readers; the
                placeholder carries the visible hint */}
            <label htmlFor="alerts-email" className="sr-only">Email address</label>
            <input
              id="alerts-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-3"
            />
            <button
              type="submit"
              disabled={state === 'busy' || !email.trim()}
              className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
            >
              {state === 'busy' ? 'Signing you up...' : 'Get email alerts'}
            </button>
          </form>
          {state === 'error' && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-100 p-3 rounded-xl mt-3 dark:bg-red-950/30 dark:border-red-900/40">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">{message}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
