import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileUp,
} from 'lucide-react';
import { UploadedFloorPlan } from '../types';
import { processUploadedFile } from '../utils/fileUpload';
import { soundEngine } from '../utils/audio';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFloorPlanLoaded: (plan: UploadedFloorPlan, startCalibration?: boolean) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onFloorPlanLoaded,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewPlan, setPreviewPlan] = useState<UploadedFloorPlan | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setSelectedFile(file);
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const plan = await processUploadedFile(file, 1);
      setPreviewPlan(plan);
      if (plan.totalPages) {
        setTotalPages(plan.totalPages);
        setSelectedPage(1);
      }
      soundEngine.playPencilClick();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Error reading floor plan file.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = async (newPage: number) => {
    if (!selectedFile || newPage < 1 || newPage > totalPages) return;
    setSelectedPage(newPage);
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const plan = await processUploadedFile(selectedFile, newPage);
      setPreviewPlan(plan);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to render PDF page.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleConfirm = (startCalibration: boolean = true) => {
    if (previewPlan) {
      onFloorPlanLoaded(previewPlan, startCalibration);
      soundEngine.playWallComplete();
      onClose();
    }
  };

  // Sample architectural blueprint preset
  const handleLoadSample = () => {
    // Generate a high-contrast architectural floor plan canvas
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1200;
    sampleCanvas.height = 800;
    const ctx = sampleCanvas.getContext('2d');
    if (ctx) {
      // Off-white paper background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 1200, 800);

      // Light blueprint grid
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      for (let x = 0; x < 1200; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 800);
        ctx.stroke();
      }
      for (let y = 0; y < 800; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1200, y);
        ctx.stroke();
      }

      // Exterior Walls (7.5m x 5.0m @ 60px/m = 450px x 300px)
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 10;
      ctx.strokeRect(300, 200, 600, 400);

      // Interior Partitions
      ctx.lineWidth = 6;
      ctx.beginPath();
      // Bedroom divider
      ctx.moveTo(650, 200);
      ctx.lineTo(650, 600);
      // Bath divider
      ctx.moveTo(300, 450);
      ctx.lineTo(500, 450);
      ctx.moveTo(500, 450);
      ctx.lineTo(500, 600);
      ctx.stroke();

      // Standard Door Openings with swings
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      // Entry door: width 60px = 1.0m
      ctx.beginPath();
      ctx.arc(380, 600, 60, Math.PI, Math.PI * 1.5, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(380, 600);
      ctx.lineTo(380, 540);
      ctx.stroke();

      // Door label: "1.00m Standard Door"
      ctx.fillStyle = '#0284c7';
      ctx.font = '600 13px "Fira Code", monospace';
      ctx.fillText('1.00 m Door', 360, 530);

      // Room labels
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('PRIMARY SUITE', 740, 380);
      ctx.fillText('LIVING / DINING', 380, 320);
      ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('BATH', 370, 510);

      // Title Block
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('ARCHITECTURAL SAMPLE FLOOR PLAN · 1:50', 300, 180);
    }

    const dataUrl = sampleCanvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      const plan: UploadedFloorPlan = {
        id: `sample-plan-${Date.now()}`,
        name: 'Architectural_Sample_Suite.png',
        imageElement: img,
        dataUrl,
        width: 1200,
        height: 800,
        position: { x: 140, y: 80 },
        scale: 0.85,
        fileType: 'image',
      };
      onFloorPlanLoaded(plan, true);
      soundEngine.playWallComplete();
      onClose();
    };
    img.src = dataUrl;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">
                Upload 2D Floor Plan Reference
              </h3>
              <p className="text-[11px] text-slate-500">
                Load custom blueprints (PNG, JPG, SVG, or multi-page PDF)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Upload Zone */}
        <div className="py-4 space-y-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.pdf,application/pdf"
            className="hidden"
          />

          {!previewPlan ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-sky-500 bg-sky-50/50'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-sky-600 mb-3">
                <FileUp className="w-6 h-6 stroke-[1.8]" />
              </div>

              <div className="text-xs font-semibold text-slate-800">
                Click to browse or drag and drop blueprint
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                PNG, JPG, SVG, or architectural PDF drawings up to 25MB
              </p>

              <div className="mt-4 flex items-center gap-3">
                <span className="text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded font-mono">
                  PNG / JPG
                </span>
                <span className="text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded font-mono">
                  PDF Drawings
                </span>
                <span className="text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded font-mono">
                  CAD SVG
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
              {/* Preview Thumbnail */}
              <div className="relative h-44 w-full bg-white rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center shadow-inner">
                <img
                  src={previewPlan.dataUrl}
                  alt="Floor Plan Preview"
                  className="max-h-full max-w-full object-contain"
                />

                <span className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] px-2 py-0.5 rounded font-mono">
                  {previewPlan.width} × {previewPlan.height} px
                </span>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute top-2 right-2 bg-white/90 text-slate-700 hover:text-slate-900 text-[10px] font-semibold px-2 py-0.5 rounded shadow-xs border border-slate-200"
                >
                  Change File
                </button>
              </div>

              {/* File Info & Multi-page PDF pagination */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate">
                  {previewPlan.fileType === 'pdf' ? (
                    <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-sky-500 shrink-0" />
                  )}
                  <span className="font-semibold text-slate-800 truncate max-w-xs">
                    {previewPlan.name}
                  </span>
                </div>

                {previewPlan.fileType === 'pdf' && totalPages > 1 && (
                  <div className="flex items-center gap-1.5 shrink-0 bg-white px-2 py-1 rounded-lg border border-slate-200">
                    <button
                      onClick={() => handlePageChange(selectedPage - 1)}
                      disabled={selectedPage <= 1 || isLoading}
                      className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-[11px] text-slate-600">
                      Page {selectedPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(selectedPage + 1)}
                      disabled={selectedPage >= totalPages || isLoading}
                      className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="text-center text-xs text-sky-600 font-medium animate-pulse py-1">
              Rendering architectural page preview...
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Instant Sample Blueprint Preset Option */}
          <div className="flex items-center justify-between p-3 bg-slate-50/80 rounded-xl border border-slate-200/60">
            <div>
              <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                No floor plan file on hand?
              </div>
              <p className="text-[11px] text-slate-500">
                Load a high-resolution architectural apartment blueprint
              </p>
            </div>
            <button
              onClick={handleLoadSample}
              className="px-3 py-1.5 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold rounded-lg border border-slate-200 transition-colors shadow-2xs shrink-0"
            >
              Load Sample
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={() => handleConfirm(true)}
            disabled={!previewPlan || isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl shadow-md shadow-sky-200 disabled:shadow-none transition-all transform active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Load Blueprint & Calibrate Scale</span>
          </button>
        </div>
      </div>
    </div>
  );
};
