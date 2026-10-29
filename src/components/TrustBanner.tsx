/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Lock, Cpu, Globe, CheckCircle2 } from 'lucide-react';

export const TrustBanner: React.FC = () => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900/80 to-slate-950/60 p-5 shadow-sm backdrop-blur-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Lock className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>Private, Offline PDF Workspace</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Zero Server Uploads
              </span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              <strong className="text-slate-300 font-medium">Your files never leave this device.</strong> Install from your browser's address bar to use as a standalone desktop app. All document processing, rendering, encryption, and drawing list parsing run 100% locally in your browser's WebAssembly and JavaScript engines.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0 border-t md:border-t-0 md:border-l border-slate-800/80 pt-3 md:pt-0 md:pl-5">
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-amber-400" />
            <span>Local WASM / JS</span>
          </div>
          <span className="text-slate-700" aria-hidden="true">·</span>
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-amber-400" />
            <span>Works 100% Offline</span>
          </div>
        </div>
      </div>
    </div>
  );
};
