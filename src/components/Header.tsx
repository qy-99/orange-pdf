/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  hasFiles: boolean;
  onClearFiles: () => void;
  fileCount: number;
}

export const Header: React.FC<HeaderProps> = ({ hasFiles, onClearFiles, fileCount }) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-1.5 shadow-md shadow-amber-500/20">
            <svg viewBox="0 0 512 512" fill="none" className="w-full h-full">
              <path
                d="M172 260 L248 184 H332 C345.255 184 356 194.745 356 208 V384 C356 397.255 345.255 408 332 408 H196 C182.745 408 172 397.255 172 384 V260 Z"
                fill="#ffffff"
                fillOpacity="0.9"
              />
              <path
                d="M156 104 C156 90.745 166.745 80 180 80 H284 L340 136 V240 L234 346 H180 C166.745 346 156 335.255 156 322 V104 Z"
                fill="#0f172a"
              />
              <path d="M284 80 V124 C284 130.627 289.373 136 296 136 H340 Z" fill="#475569" />
              <line x1="140" y1="272" x2="276" y2="136" stroke="#fb923c" strokeWidth="12" strokeLinecap="round" strokeDasharray="16 12" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight text-white">
            orange <span className="text-amber-500 font-extrabold">PDF</span>
          </span>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <PWAInstallButton />

          {hasFiles && (
            <button
              onClick={onClearFiles}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 transition"
              title="Clear all loaded files"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear Queue ({fileCount})</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
