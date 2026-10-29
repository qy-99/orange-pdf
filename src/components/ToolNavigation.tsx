/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Scissors,
  Layers,
  Minimize2,
  FileImage,
  ImagePlus,
  Stamp,
  Hash,
  Lock,
} from 'lucide-react';
import type { ToolId } from '../types';

interface ToolNavigationProps {
  activeTool: ToolId;
  onSelectTool: (id: ToolId) => void;
}

export const TOOLS: Array<{
  id: ToolId;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isPriority?: boolean;
}> = [
  {
    id: 'split-rename',
    name: 'Split & Rename',
    description: 'Engineering drawing package splitter with automated list naming',
    icon: Scissors,
    isPriority: true,
  },
  {
    id: 'organize',
    name: 'Organize & Pages',
    description: 'Drag and mix pages across PDFs with source colors, rotation, selection, and undo/redo',
    icon: Layers,
  },
  {
    id: 'compress',
    name: 'Compress PDF',
    description: 'Lossless drawing quality preservation & optional high compression',
    icon: Minimize2,
  },
  {
    id: 'pdf-to-images',
    name: 'PDF to Images',
    description: 'Extract every page as crisp PNG or JPEG images',
    icon: FileImage,
  },
  {
    id: 'images-to-pdf',
    name: 'Images to PDF',
    description: 'Convert JPG, PNG, and WebP images to a clean multi-page PDF',
    icon: ImagePlus,
  },
  {
    id: 'watermark',
    name: 'Watermark',
    description: 'Add text or image stamps, custom angles, opacity, and positioning',
    icon: Stamp,
  },
  {
    id: 'page-numbers',
    name: 'Page Numbers',
    description: 'Add headers, footers, formats, margins, and rotation-aware numbers',
    icon: Hash,
  },
  {
    id: 'protect',
    name: 'Password Protect',
    description: 'Genuine client-side AES-256 standard encryption & permissions',
    icon: Lock,
  },
];

export const ToolNavigation: React.FC<ToolNavigationProps> = ({ activeTool, onSelectTool }) => {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          PDF Workspace Tools
        </h3>
        <span className="text-xs text-slate-500">8 tools</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2.5">
        {TOOLS.map((tool) => {
          const isActive = tool.id === activeTool;
          const Icon = tool.icon;

          return (
            <button
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              className={`group relative flex flex-col items-start p-3.5 rounded-2xl border text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                isActive
                  ? 'border-amber-500/80 bg-amber-500/10 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/30'
                  : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/90'
              }`}
            >
              {tool.isPriority && (
                <span className="absolute top-3 right-3 text-[10px] font-medium text-amber-400/90 tracking-wider">
                  Default
                </span>
              )}

              <div
                className={`mb-2.5 flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                    : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700 group-hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>

              <span
                className={`text-xs font-semibold transition-colors ${
                  isActive ? 'text-white' : 'text-slate-200 group-hover:text-white'
                }`}
              >
                {tool.name}
              </span>

              <span className="mt-1 line-clamp-2 text-[11px] text-slate-400 leading-snug">
                {tool.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
