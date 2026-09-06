import React, { useState } from 'react';
import { apiClient } from '../services/apiClient';
import { stripMarkdown } from '../utils/text';
import { BookOpen, Wand2, Copy, Check, FileText, Languages } from 'lucide-react';
import { PageHero } from './PageHero';
import { Reveal } from './Reveal';

export const SimplifierTool: React.FC = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSimplify = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const result = await apiClient.simplifyText(input);
      setOutput(stripMarkdown(result?.simplified || "Sorry, something went wrong. Please try again."));
    } catch (e) {
      setOutput("Sorry, something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <PageHero
        icon={BookOpen}
        title="Legal Jargon Buster"
        description="Received a confusing Home Office letter, or stuck on a clause you can't unpick? Paste it below and our AI will turn the legalese into plain, human English."
      />

      <div className="max-w-3xl mx-auto p-4 md:p-8">
      <Reveal>
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Official text */}
          <div className="p-6 md:p-8">
            <div className="flex items-center justify-between mb-3">
              <label
                htmlFor="jargon-input"
                className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2"
              >
                <FileText className="w-4 h-4" /> Official text
              </label>
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                {input.length} characters
              </span>
            </div>
            <textarea
              id="jargon-input"
              className="w-full h-40 md:h-48 p-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:ring-sky-900/40 dark:focus:border-sky-500 transition-all text-base leading-relaxed"
              placeholder="Paste text like: 'The leave to remain is granted pursuant to paragraph 276B of the Immigration Rules...'"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              onClick={handleSimplify}
              disabled={loading || !input.trim()}
              className="mt-4 w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-700 dark:disabled:to-slate-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Wand2 className="w-5 h-5 animate-spin" /> Translating…
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" /> Translate to Plain English
                </>
              )}
            </button>
          </div>

          {/* Plain English result */}
          <div className="border-t border-slate-100 dark:border-slate-800 bg-sky-50/60 dark:bg-slate-950/40 p-6 md:p-8">
            <div className="flex items-center justify-between mb-4">
              <label className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-2">
                <Languages className="w-4 h-4" /> Plain English
              </label>
              {output && (
                <button
                  onClick={handleCopy}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            {output ? (
              <p className="text-slate-800 dark:text-slate-100 text-lg leading-relaxed">{output}</p>
            ) : (
              <div className="min-h-[7rem] flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-2">
                <Languages className="w-8 h-8" />
                <p className="text-sm">Your plain-English version will appear here…</p>
              </div>
            )}
          </div>
        </div>
      </Reveal>
      </div>
    </div>
  );
};
