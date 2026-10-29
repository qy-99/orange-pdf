/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, Trash2, FileText } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  hasFiles: boolean;
  onClearFiles: () => void;
  fileCount: number;
}

export const Header: React.FC<HeaderProps> = ({ hasFiles, onClearFiles, fileCount }) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-md shadow-orange-500/20">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white">
                orange <span className="text-orange-500">PDF</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-300 border border-slate-700/60">
                <ShieldCheck className="h-3 w-3 text-orange-400" />
                Private & Offline
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden md:block">
              Private, Offline PDF Workspace
            </p>
          </div>
        </div>

        {/* Center / Right actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/50 text-[11px] font-medium text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Your files never leave this device
          </div>

          <PWAInstallButton />

          {hasFiles && (
            <button
              onClick={onClearFiles}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 transition"
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
