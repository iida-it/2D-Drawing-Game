import React, { useEffect } from 'react';
import {
  Star,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowRight,
  RotateCcw,
  Download,
  X,
  Trophy,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ValidationResult, BlueprintLevel } from '../types';
import { soundEngine } from '../utils/audio';

interface SubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: ValidationResult;
  currentLevel: BlueprintLevel;
  hasNextLevel: boolean;
  onNextLevel: () => void;
  onRetry: () => void;
  onExportPng: () => void;
}

export const SubmitModal: React.FC<SubmitModalProps> = ({
  isOpen,
  onClose,
  result,
  currentLevel,
  hasNextLevel,
  onNextLevel,
  onRetry,
  onExportPng,
}) => {
  useEffect(() => {
    if (isOpen) {
      if (result.stars >= 2) {
        soundEngine.playVictorySound();
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#0284c7', '#38bdf8', '#10b981', '#f59e0b'],
          });
        } catch {
          // Confetti fallback
        }
      } else {
        soundEngine.playWallComplete();
      }
    }
  }, [isOpen, result.stars]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header with Client Identity */}
        <div className="relative bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 pb-8">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <img
              src={currentLevel.client.avatar}
              alt={currentLevel.client.name}
              className="w-14 h-14 rounded-xl object-cover ring-2 ring-sky-400 shadow-md"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-semibold text-sky-400">
                  Client Review
                </span>
                <span className="text-[11px] bg-white/15 px-2 py-0.5 rounded text-slate-200">
                  Level {currentLevel.levelNumber}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight mt-0.5">
                {currentLevel.title}
              </h2>
              <p className="text-xs text-slate-300">
                {currentLevel.client.name} · {currentLevel.client.role}
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 -mt-4 bg-white rounded-t-2xl space-y-5">
          {/* Stars & Score Hero */}
          <div className="flex flex-col items-center justify-center text-center pb-2">
            {/* 3 Stars Animation */}
            <div className="flex items-center gap-2 mb-2">
              {[1, 2, 3].map((starIdx) => {
                const filled = starIdx <= result.stars;
                return (
                  <div
                    key={starIdx}
                    className={`transform transition-all duration-300 ${
                      filled ? 'scale-110' : 'scale-90 opacity-30'
                    }`}
                  >
                    <Star
                      className={`w-9 h-9 ${
                        filled
                          ? 'fill-amber-400 text-amber-500 drop-shadow-md'
                          : 'text-slate-300'
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-4xl font-extrabold text-slate-900 tracking-tight font-mono">
                {result.scorePercent}%
              </span>
              <span className="text-sm font-semibold text-slate-500">
                Accuracy Match
              </span>
            </div>

            {/* Client Reaction Quote */}
            <p className="text-xs text-slate-600 italic mt-2.5 max-w-md bg-slate-50 p-3 rounded-xl border border-slate-100">
              {result.clientReaction}
            </p>
          </div>

          {/* Metric Breakdown Table */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Dimensional Evaluation
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {result.checklist.map((item, idx) => {
                const isPass = item.status === 'pass';
                const isPartial = item.status === 'partial';
                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl border border-slate-100 bg-slate-50 flex items-start justify-between"
                  >
                    <div>
                      <span className="text-slate-500 text-[11px] block">
                        {item.label}
                      </span>
                      <div className="font-semibold text-slate-800 font-mono mt-0.5">
                        {item.actualValue}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        Target: {item.targetValue}
                      </span>
                    </div>

                    <div>
                      {isPass ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : isPartial ? (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between gap-2">
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Refine Draft</span>
            </button>

            <button
              onClick={onExportPng}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              title="Save blueprint drawing as PNG image"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PNG</span>
            </button>

            {hasNextLevel && result.passed ? (
              <button
                onClick={onNextLevel}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-md shadow-sky-200 transition-all transform active:scale-95 ml-auto"
              >
                <span>Next Client</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-md transition-all ml-auto"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Continue Studio</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
