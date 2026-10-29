/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  Download,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import type { QueuedFile, ProtectConfig } from '../../types';
import { protectPdf } from '../../utils/pdfOperations';
import { downloadFile, formatBytes } from '../../utils/pdfHelper';

interface PasswordProtectToolProps {
  files: QueuedFile[];
  activeFileId: string | null;
}

export const PasswordProtectTool: React.FC<PasswordProtectToolProps> = ({
  files,
  activeFileId,
}) => {
  const pdfFiles = useMemo(() => files.filter((f) => f.type === 'pdf'), [files]);
  const [selectedFileId, setSelectedFileId] = useState<string>(activeFileId || pdfFiles[0]?.id || '');

  const currentFile = useMemo(
    () => pdfFiles.find((f) => f.id === selectedFileId),
    [pdfFiles, selectedFileId]
  );

  const [config, setConfig] = useState<ProtectConfig>({
    userPassword: '',
    confirmPassword: '',
    algorithm: 'AES-256',
    allowPrinting: true,
    allowModifying: false,
    allowCopying: false,
    allowAnnotating: true,
  });

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [verifiedSuccess, setVerifiedSuccess] = useState<boolean>(false);

  // Password strength calculation
  const strength = useMemo(() => {
    const pw = config.userPassword;
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score += 25;
    if (pw.length >= 12) score += 25;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 25;
    if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 25;
    return score;
  }, [config.userPassword]);

  const passwordsMatch = config.userPassword.length > 0 && config.userPassword === config.confirmPassword;

  const handleProtect = async () => {
    if (!currentFile) return;
    if (!config.userPassword) {
      alert('Please enter a password');
      return;
    }
    if (!passwordsMatch) {
      alert('Passwords do not match');
      return;
    }

    setIsProcessing(true);
    setVerifiedSuccess(false);

    try {
      const bytes = currentFile.data || new Uint8Array(await currentFile.file.arrayBuffer());
      // protectPdf runs real AES-256 encryption AND tests decryption in-memory before proceeding
      const encrypted = await protectPdf(bytes, config);

      const cleanBase = currentFile.name.replace(/\.pdf$/i, '');
      downloadFile(encrypted, `${cleanBase}_protected.pdf`);

      setVerifiedSuccess(true);

      // Clear password from memory after operation per security specification
      setTimeout(() => {
        setConfig((prev) => ({ ...prev, userPassword: '', confirmPassword: '' }));
      }, 1000);
    } catch (err: any) {
      alert(`Protection error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!currentFile) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-slate-500 mb-2" />
        <h4 className="text-sm font-semibold text-slate-200">No PDF Loaded</h4>
        <p className="mt-1 text-xs text-slate-400">
          Drop or upload a PDF above to encrypt it with AES-256 standards.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Lock className="h-4 w-4 text-orange-500" />
              Password Protect PDF (AES-256)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Encrypt your PDF with standard-compliant AES-256 cryptography entirely inside your browser.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Target File:</span>
            <select
              value={selectedFileId}
              onChange={(e) => {
                setSelectedFileId(e.target.value);
                setVerifiedSuccess(false);
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {pdfFiles.map((pdf) => (
                <option key={pdf.id} value={pdf.id}>
                  {pdf.name} ({formatBytes(pdf.size)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Security Warning Notice */}
        <div className="rounded-xl bg-orange-500/10 border border-orange-500/25 p-3.5 text-xs text-orange-300 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="text-orange-200">Zero-Knowledge Offline Encryption:</strong>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Your password and documents never leave your browser. Because there is no central server or recovery backdoor, <strong>a forgotten password cannot be recovered by anyone</strong>. Be sure to record your password in a password manager.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Password Inputs */}
          <div className="space-y-3.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Document Password</label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={config.userPassword}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, userPassword: e.target.value }))
                  }
                  placeholder="Enter strong password..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Password strength bar */}
              {config.userPassword && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Password Strength:</span>
                    <span className="font-semibold text-slate-300">
                      {strength <= 25
                        ? 'Weak'
                        : strength <= 50
                        ? 'Fair'
                        : strength <= 75
                        ? 'Good'
                        : 'Strong (AES-256 Ready)'}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full transition-all duration-300 ${
                        strength <= 25
                          ? 'bg-red-500 w-1/4'
                          : strength <= 50
                          ? 'bg-amber-500 w-2/4'
                          : strength <= 75
                          ? 'bg-blue-500 w-3/4'
                          : 'bg-emerald-500 w-full'
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={config.confirmPassword}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, confirmPassword: e.target.value }))
                }
                placeholder="Re-enter password..."
                className={`w-full rounded-xl border bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-1 ${
                  config.confirmPassword && !passwordsMatch
                    ? 'border-red-500/80 focus:ring-red-500'
                    : 'border-slate-700 focus:ring-orange-500'
                }`}
              />
              {config.confirmPassword && !passwordsMatch && (
                <p className="text-[11px] text-red-400">Passwords do not match.</p>
              )}
              {passwordsMatch && (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Passwords match.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Encryption Standard</label>
              <select
                value={config.algorithm}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, algorithm: e.target.value as any }))
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="AES-256">AES-256 (High Security, Modern Standard)</option>
                <option value="RC4">RC4 128-bit (Legacy Acrobat 5+ Compatibility)</option>
              </select>
            </div>
          </div>

          {/* Permissions / Owner controls */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-orange-400" />
              <span>Document Permissions</span>
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Viewer permissions are embedded in the encryption dictionary. Note: Restrictions depend on compatible PDF readers honoring them.
            </p>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={config.allowPrinting}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, allowPrinting: e.target.checked }))
                  }
                  className="rounded border-slate-700 bg-slate-800 text-orange-600 focus:ring-0"
                />
                <span>Allow Printing</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={config.allowCopying}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, allowCopying: e.target.checked }))
                  }
                  className="rounded border-slate-700 bg-slate-800 text-orange-600 focus:ring-0"
                />
                <span>Allow Text & Content Copying</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={config.allowModifying}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, allowModifying: e.target.checked }))
                  }
                  className="rounded border-slate-700 bg-slate-800 text-orange-600 focus:ring-0"
                />
                <span>Allow Page Modifications</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={config.allowAnnotating}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, allowAnnotating: e.target.checked }))
                  }
                  className="rounded border-slate-700 bg-slate-800 text-orange-600 focus:ring-0"
                />
                <span>Allow Comments & Annotations</span>
              </label>
            </div>
          </div>
        </div>

        {/* Verification status */}
        {verifiedSuccess && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 text-xs text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Verified:</strong> Encrypted PDF was successfully generated and verified in-memory. The file requires the password to open.
            </span>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={handleProtect}
            disabled={isProcessing || !passwordsMatch}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:opacity-40 text-white px-5 py-2 text-xs font-semibold shadow-md shadow-orange-600/20 transition"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            <span>{isProcessing ? 'Encrypting & Verifying...' : 'Encrypt & Download Protected PDF'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
