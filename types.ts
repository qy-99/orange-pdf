export type ToolId =
  | 'split-rename'
  | 'organize'
  | 'compress'
  | 'pdf-to-images'
  | 'images-to-pdf'
  | 'watermark'
  | 'page-numbers'
  | 'protect';

export interface QueuedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: 'pdf' | 'image';
  pageCount?: number;
  previewUrl?: string;
  data?: Uint8Array;
}

export interface DrawingRow {
  id: string;
  listNo: string;
  drawingNo: string;
  revision: string;
  title: string;
  sourcePage: number;
  isIncluded: boolean;
  isManuallyEdited: boolean;
  manualFilename?: string;
  matchStatus: 'matched' | 'unmatched' | 'page-missing' | 'warning';
  warnings: string[];
}

export interface WatermarkConfig {
  type: 'text' | 'image';
  text: string;
  imageUrl?: string;
  fontSize: number;
  opacity: number;
  rotation: number;
  color: string;
  position: 'center' | 'diagonal' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'repeat';
  pages: 'all' | 'first' | 'odd' | 'even' | 'custom';
  customPages?: string;
}

export interface PageNumberConfig {
  format: 'number' | 'page-x' | 'page-x-of-y' | 'x-slash-y' | 'dash-x-dash';
  startNumber: number;
  skipFirstPage: boolean;
  position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
  fontSize: number;
  color: string;
  margin: number;
  pages: 'all' | 'odd' | 'even' | 'custom';
  customPages?: string;
}

export interface CompressionConfig {
  mode: 'lossless' | 'rasterize';
  dpi: number;
  quality: number;
}

export interface ImagesToPdfConfig {
  pageSize: 'fit' | 'a4' | 'letter';
  orientation: 'auto' | 'portrait' | 'landscape';
  fit: 'contain' | 'cover';
  margin: 'none' | 'small' | 'normal' | 'large';
  bgColor: 'white' | 'black';
}

export interface PdfToImagesConfig {
  format: 'png' | 'jpeg';
  scale: number;
  quality: number;
}

export interface ProtectConfig {
  userPassword: string;
  confirmPassword: string;
  ownerPassword?: string;
  algorithm: 'AES-256' | 'RC4';
  allowPrinting: boolean;
  allowModifying: boolean;
  allowCopying: boolean;
  allowAnnotating: boolean;
}
