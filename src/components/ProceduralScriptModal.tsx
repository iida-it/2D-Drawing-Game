import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import {
  FileCode,
  Upload,
  Play,
  CheckCircle2,
  AlertTriangle,
  X,
  ShieldCheck,
  Zap,
  Layers,
  Sparkles,
  Download,
  Copy,
  Check,
  Code2,
} from 'lucide-react';
import {
  executeProceduralScript,
  PROCEDURAL_PRESETS,
  ExecutionResult,
} from '../utils/proceduralPipeline';

interface ProceduralScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModelGenerated: (object: THREE.Object3D, scriptName: string, stats?: { totalVertices: number; totalFaces: number }) => void;
  onShowToast: (message: string) => void;
}

export const ProceduralScriptModal: React.FC<ProceduralScriptModalProps> = ({
  isOpen,
  onClose,
  onModelGenerated,
  onShowToast,
}) => {
  const [activePresetId, setActivePresetId] = useState<string>(PROCEDURAL_PRESETS[0].id);
  const [scriptCode, setScriptCode] = useState<string>(PROCEDURAL_PRESETS[0].code);
  const [scriptName, setScriptName] = useState<string>(PROCEDURAL_PRESETS[0].name);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Switch presets
  const handleSelectPreset = (preset: typeof PROCEDURAL_PRESETS[0]) => {
    setActivePresetId(preset.id);
    setScriptCode(preset.code);
    setScriptName(preset.name);
    setExecutionResult(null);
  };

  // Handle file upload (.ts file)
  const handleFileUpload = (file: File) => {
    if (!file) return;
    if (!file.name.endsWith('.ts') && !file.name.endsWith('.js') && !file.name.endsWith('.tsx')) {
      onShowToast('Please upload a TypeScript (.ts) procedural model file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        setScriptCode(content);
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setScriptName(cleanName);
        setActivePresetId('custom');
        setExecutionResult(null);
        onShowToast(`Uploaded "${file.name}" ready for transpilation.`);
      }
    };
    reader.readAsText(file);
  };

  // Drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Copy code to clipboard
  const handleCopyCode = () => {
    navigator.clipboard.writeText(scriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download code as .ts file
  const handleDownloadTs = () => {
    const blob = new Blob([scriptCode], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scriptName.toLowerCase().replace(/\s+/g, '_')}.ts`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Execute Pipeline: Transpile with Sucrase & Run in Sandboxed Worker
  const handleRunPipeline = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const result = await executeProceduralScript(scriptCode, 4500);
      setExecutionResult(result);

      if (result.success && result.object) {
        onModelGenerated(result.object, scriptName, result.stats);
        onShowToast(
          `Procedural 3D model generated! (Transpiled in ${result.transpileTimeMs}ms, ${result.stats?.totalVertices.toLocaleString()} vertices)`
        );
      } else {
        onShowToast(`Transpilation or execution error: ${result.error || 'Failed to execute script.'}`);
      }
    } catch (err: any) {
      setExecutionResult({
        success: false,
        error: err.message || String(err),
        transpileTimeMs: 0,
        executionTimeMs: 0,
      });
      onShowToast(`Error: ${err.message || 'Script failed in sandbox.'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-600 text-white shadow-xs">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900 text-sm">
                  Procedural Three.js TypeScript Engine
                </h3>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <ShieldCheck className="w-3 h-3" />
                  Isolated Sandbox
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                In-browser Sucrase transpiler & sandboxed worker execution (Zero DOM, Cookie & Storage access)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Top Actions: Presets & Upload */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Presets Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Templates:
              </span>
              {PROCEDURAL_PRESETS.map((p) => {
                const isActive = activePresetId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPreset(p)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-xs font-semibold'
                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                    }`}
                    title={p.description}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>

            {/* Upload .TS File Button */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".ts,.js,.tsx"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-2xs transition-all hover:scale-[1.01]"
              >
                <Upload className="w-3.5 h-3.5 text-sky-600" />
                <span>Upload .TS File</span>
              </button>

              <button
                onClick={handleDownloadTs}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                title="Download code as .ts file"
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleCopyCode}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                title="Copy code to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Drag & Drop Zone (collapsible) */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-3 text-center transition-all ${
              dragActive
                ? 'border-sky-500 bg-sky-50/70 scale-[0.99]'
                : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
            }`}
          >
            <p className="text-xs text-slate-600 font-medium">
              Drag & Drop your procedural <span className="font-mono text-sky-700 font-bold">.ts</span> file here,
              or edit the TypeScript code directly below
            </p>
          </div>

          {/* Code Editor Area */}
          <div className="relative rounded-xl border border-slate-200/90 overflow-hidden bg-slate-950 shadow-inner">
            <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
              <span className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
                <span>{scriptName}.ts</span>
              </span>
              <span>TypeScript · In-Browser Transpilation</span>
            </div>

            <textarea
              value={scriptCode}
              onChange={(e) => {
                setScriptCode(e.target.value);
                setExecutionResult(null);
              }}
              rows={14}
              className="w-full p-4 font-mono text-xs text-emerald-300 bg-slate-950 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-y leading-relaxed selection:bg-sky-700/60"
              spellCheck={false}
              placeholder="// Write your procedural Three.js TypeScript code here..."
            />
          </div>

          {/* Status & Error Display Callouts */}
          {executionResult && (
            <div className="animate-in fade-in duration-200">
              {executionResult.success ? (
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 flex items-start gap-3 shadow-2xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold text-emerald-950">
                      Successfully Transpiled & Executed in Isolated Sandbox
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-emerald-700 text-[11px]">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        Transpiled in <strong className="font-mono">{executionResult.transpileTimeMs}ms</strong>
                      </span>
                      <span>
                        Execution: <strong className="font-mono">{executionResult.executionTimeMs}ms</strong>
                      </span>
                      {executionResult.stats && (
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" />
                          Vertices: <strong className="font-mono">{executionResult.stats.totalVertices.toLocaleString()}</strong> ·
                          Faces: <strong className="font-mono">{executionResult.stats.totalFaces.toLocaleString()}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-50/90 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900 flex items-start gap-3 shadow-2xs">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 overflow-hidden w-full">
                    <div className="font-semibold text-rose-950">
                      Transpilation or Execution Error
                    </div>
                    <p className="font-mono text-[11px] text-rose-700 whitespace-pre-wrap break-words">
                      {executionResult.error}
                    </p>

                    {executionResult.error?.includes('No 3D model produced') && (
                      <div className="mt-2 bg-amber-50 text-amber-900 border border-amber-200/90 rounded-lg p-2.5 text-[11px] space-y-1">
                        <div className="font-semibold flex items-center gap-1.5 text-amber-950">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                          <span>Supported 3D Output Patterns:</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-amber-800 font-mono text-[10px]">
                          <li>return myGroup; (or return new THREE.Mesh(...);)</li>
                          <li>scene.add(myMesh); (or scene.add(myGroup);)</li>
                          <li>export default function(THREE, scene) &#123; return myGroup; &#125;</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200/80 bg-slate-50/70">
          <div className="flex items-center gap-2 text-slate-500 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Sandbox guarantees 0 access to cookies, localStorage, or parent DOM.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              Close
            </button>

            <button
              onClick={handleRunPipeline}
              disabled={isExecuting || !scriptCode.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white rounded-xl text-xs font-semibold shadow-md shadow-sky-200 transition-all hover:scale-[1.02] active:scale-95 disabled:hover:scale-100 disabled:shadow-none"
            >
              <Play className={`w-3.5 h-3.5 ${isExecuting ? 'animate-spin' : ''}`} />
              <span>{isExecuting ? 'Transpiling & Running...' : 'Transpile & Add to 3D View'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
