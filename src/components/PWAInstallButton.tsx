/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Share2, X, Smartphone, Monitor, Info } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showBrowserGuide, setShowBrowserGuide] = useState(false);

  if (isInstalled) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        Installed App
      </div>
    );
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white px-3.5 py-1.5 text-xs font-medium shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/50"
        title="Install orange PDF as an offline desktop application"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 px-3 py-1.5 text-xs font-medium transition"
        >
          <Smartphone className="w-3.5 h-3.5 text-orange-400" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-sm">
                    oP
                  </div>
                  <h3 className="text-base font-semibold text-white">Install orange PDF</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs text-slate-300">
                <p className="leading-relaxed">
                  To add orange PDF to your Home Screen on iPhone or iPad:
                </p>
                <div className="space-y-2 rounded-xl bg-slate-800/60 p-3 border border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 font-semibold text-[10px]">
                      1
                    </span>
                    <span>
                      Tap the <Share2 className="inline w-3.5 h-3.5 text-orange-400 mx-0.5" /> <strong>Share</strong> button in Safari toolbar.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 font-semibold text-[10px]">
                      2
                    </span>
                    <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  After your first online visit, the app shell and PDF worker can be available offline once cached. Imported PDFs stay in the current session and are not automatically saved between sessions.
                </p>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-orange-600 py-2 text-xs font-medium text-white hover:bg-orange-500 transition"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowBrowserGuide(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-orange-500/40 hover:bg-slate-800"
        title="Show instructions to install orange PDF as a PWA"
      >
        <Download className="h-3.5 w-3.5 text-orange-400" />
        <span className="hidden sm:inline">Install help</span>
        <span className="sm:hidden">Install</span>
      </button>

      {showBrowserGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-600 text-white"><Monitor className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-base font-semibold text-white">Install orange PDF</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Use it like a desktop or mobile app</p>
                </div>
              </div>
              <button onClick={() => setShowBrowserGuide(false)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label="Close install instructions"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 space-y-3 text-xs leading-relaxed text-slate-300">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="font-semibold text-white">Chrome on Windows</p>
                <p className="mt-1">Look for the install icon at the right side of the address bar. If it is not shown, open the three-dot menu and look for <strong>Save and share → Install page as app</strong> (menu wording can vary by Chrome version).</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="font-semibold text-white">Microsoft Edge</p>
                <p className="mt-1">Open the three-dot menu, choose <strong>Apps</strong>, then <strong>Install this site as an app</strong> when available.</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="font-semibold text-white">Android</p>
                <p className="mt-1">Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
              </div>
              <p className="flex items-start gap-2 text-[11px] text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Installation options appear only when the site is served securely and its PWA requirements are met. Once installed and cached, the app shell and local PDF worker can start offline. OCR also needs its worker and language assets to have been downloaded at least once. Imported files stay in the current browser session and are not automatically stored between sessions.</p>
            </div>
            <button onClick={() => setShowBrowserGuide(false)} className="mt-5 w-full rounded-lg bg-orange-600 py-2.5 text-xs font-semibold text-white transition hover:bg-orange-500">Got it</button>
          </div>
        </div>
      )}
    </>
  );
};
