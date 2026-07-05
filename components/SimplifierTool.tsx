import React, { useState } from 'react';
import { apiClient } from '../services/apiClient';
import { stripMarkdown } from '../utils/text';
import { BookOpen, ArrowRight, Wand2, Copy, Check, FileText } from 'lucide-react';

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
    <div className="max-w-[1600px] mx-auto p-4 md:p-8">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-3 bg-pink-50 dark:bg-pink-950/40 rounded-2xl mb-6">
            <BookOpen className="w-8 h-8 text-pink-600 dark:text-pink-400" />
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-4">
          Legal Jargon Buster
        </h2>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Received a confusing letter from the Home Office? Paste the text below, and our AI will
          translate the "Legalese" into plain, human English.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 items-stretch min-h-[60vh] lg:min-h-[70vh]">
        {/* Input */}
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-3xl shadow-lg shadow-slate-200/50 dark:shadow-black/30 border border-slate-200 dark:border-slate-700 overflow-hidden group focus-within:ring-2 focus-within:ring-pink-100 dark:focus-within:ring-pink-900/40 transition-all">
          <div className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Official Text
            </label>
          </div>
          <textarea
            className="flex-grow w-full p-6 text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none text-base leading-relaxed bg-transparent dark:text-slate-200 dark:placeholder:text-slate-600"
            placeholder="Paste text like: 'The leave to remain is granted pursuant to paragraph 276B of the Immigration Rules...'"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end dark:border-slate-700 dark:bg-slate-800/50">
             <span className="text-xs text-slate-400 font-medium dark:text-slate-500">{input.length} characters</span>
          </div>
        </div>

        {/* Mobile translate button — a normal block between the stacked
            panels (not absolutely positioned over the output), so it never
            overlaps translated text no matter how long the output gets. */}
        <div className="lg:hidden flex justify-center">
            <button
                onClick={handleSimplify}
                disabled={loading || !input}
                className="bg-pink-600 hover:bg-pink-500 disabled:bg-slate-700 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all"
            >
                {loading ? <Wand2 className="w-6 h-6 animate-spin" /> : <ArrowRight className="w-6 h-6 rotate-90" />}
            </button>
        </div>

        {/* Output Wrapper — the button lives in this outer `relative` div,
            NOT inside the rounded/`overflow-hidden` card below it. That card
            clips to its rounded corners, and the button sits right at the
            top-left corner (anchored to the header row), so if it were a
            child of the clipped card its own corner curve would chop the
            button unevenly instead of the clean straight-edge cut it got
            back when the button sat at the panel's vertical center. */}
        <div className="relative flex flex-col h-full">
             {/* Action Button Centered on Desktop between cols — anchored to
                 the header row's height (fixed), not the whole panel's
                 height (which stays constant while output text grows), so
                 it can never end up overlapping long translated output.
                 -left-10 centers the button's own center (not its edge) in
                 the 32px (gap-8) column gap: the button is 48px wide, wider
                 than the gap, so it necessarily pokes ~8px into each
                 panel's padding either side — harmless empty space — rather
                 than the previous offset, which put the button's *left*
                 edge at the gap's center and pushed it 24px further right,
                 straight into the "Plain English" label. */}
             <div className="absolute top-6 -left-10 -translate-y-1/2 z-10 hidden lg:block">
                 <button
                    onClick={handleSimplify}
                    disabled={loading || !input}
                    className="bg-pink-600 hover:bg-pink-500 disabled:bg-slate-700 text-white w-12 h-12 rounded-full shadow-lg shadow-pink-900/50 flex items-center justify-center transition-all hover:scale-110 active:scale-95 border-4 border-white"
                >
                    {loading ? <Wand2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                </button>
             </div>

            <div className="flex flex-col h-full bg-slate-900 rounded-3xl shadow-xl overflow-hidden">
                <div className="bg-slate-800/50 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-pink-400 flex items-center gap-2">
                        <Wand2 className="w-4 h-4" /> Plain English
                    </label>
                    {output && (
                        <button
                            onClick={handleCopy}
                            className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs font-medium"
                        >
                            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    )}
                </div>

                <div className="flex-grow p-8 overflow-y-auto custom-scrollbar">
                    {output ? (
                        <div className="prose prose-invert max-w-none">
                            <p className="text-slate-200 text-lg leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-500">
                                {output}
                            </p>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4 opacity-50">
                            <Wand2 className="w-12 h-12" />
                            <p className="text-sm">Translation will appear here...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};