import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import {
  Box,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  Layers,
  Maximize2,
  Armchair,
  Table,
  Flower2,
  Lamp,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { loadGLBFromFile, createArchitecturalProp } from '../utils/glbLoader';

interface GLBModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModelLoaded: (model: THREE.Group, name: string) => void;
  onShowToast: (message: string) => void;
}

export const GLBModelModal: React.FC<GLBModelModalProps> = ({
  isOpen,
  onClose,
  onModelLoaded,
  onShowToast,
}) => {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadedModel, setLoadedModel] = useState<THREE.Group | null>(null);
  const [modelStats, setModelStats] = useState<{
    name: string;
    vertices: number;
    faces: number;
    size: THREE.Vector3;
    fileSizeMb?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle uploaded .glb / .gltf file
  const handleProcessFile = async (file: File) => {
    if (!file) return;
    setIsLoading(true);
    setErrorMessage(null);
    setLoadedModel(null);

    try {
      const result = await loadGLBFromFile(file);
      setLoadedModel(result.model);
      setModelStats({
        name: result.stats.originalName,
        vertices: result.stats.totalVertices,
        faces: result.stats.totalFaces,
        size: result.stats.size,
        fileSizeMb: (file.size / (1024 * 1024)).toFixed(2),
      });
      onShowToast(`Loaded "${file.name}" successfully.`);
    } catch (err: any) {
      console.error('Error loading 3D model:', err);
      setErrorMessage(err.message || 'Failed to parse 3D file.');
      onShowToast(`Load failed: ${err.message || 'Invalid GLTF file'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Drag and Drop
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
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  // Preset Architectural Props
  const handleSelectPreset = (type: 'armchair' | 'table' | 'plant' | 'lamp', name: string) => {
    setErrorMessage(null);
    const { container, stats } = createArchitecturalProp(type);
    setLoadedModel(container);
    setModelStats({
      name,
      vertices: stats.totalVertices,
      faces: stats.totalFaces,
      size: stats.size,
      fileSizeMb: '< 0.1',
    });
    onShowToast(`Selected preset: ${name}`);
  };

  // Confirm addition to 3D Scene
  const handleConfirmAddToScene = () => {
    if (!loadedModel || !modelStats) return;
    onModelLoaded(loadedModel, modelStats.name);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 max-w-2xl w-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-600 text-white shadow-xs">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900 text-sm">
                  Import 3D Model (.GLB / .GLTF)
                </h3>
                <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                  Native GLTFLoader
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Load binary 3D models with automatic ground alignment & transform gizmo
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
        <div className="p-5 space-y-4">
          {/* Drag & Drop Upload Zone */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleProcessFile(e.target.files[0]);
              }
            }}
          />

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-sky-500 bg-sky-50/70 scale-[0.99]'
                : 'border-slate-200 hover:border-sky-400 hover:bg-sky-50/30 bg-slate-50/60'
            }`}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
                <span className="text-xs font-semibold text-slate-700">
                  Parsing & Normalizing 3D Model...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-sky-600">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Click to browse or Drag & Drop <span className="text-sky-600 font-mono">.glb / .gltf</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Standard binary glTF 2.0 3D models (furniture, fixtures, decor)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Architectural Presets */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Or Choose an Architectural Prop Preset:</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPreset('armchair', 'Modern Lounge Armchair')}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-sky-50/60 hover:border-sky-300 transition-all text-center group"
              >
                <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-sky-100 group-hover:text-sky-700 transition-colors">
                  <Armchair className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-slate-800">Armchair</span>
                <span className="text-[10px] text-slate-400">0.8m x 0.7m</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset('table', 'Oak Dining Table')}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-sky-50/60 hover:border-sky-300 transition-all text-center group"
              >
                <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-sky-100 group-hover:text-sky-700 transition-colors">
                  <Table className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-slate-800">Dining Table</span>
                <span className="text-[10px] text-slate-400">1.6m x 0.9m</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset('plant', 'Potted Fiddle Leaf')}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-sky-50/60 hover:border-sky-300 transition-all text-center group"
              >
                <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-sky-100 group-hover:text-sky-700 transition-colors">
                  <Flower2 className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-slate-800">Fiddle Leaf</span>
                <span className="text-[10px] text-slate-400">0.5m x 1.2m</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset('lamp', 'Designer Arc Floor Lamp')}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-sky-50/60 hover:border-sky-300 transition-all text-center group"
              >
                <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-sky-100 group-hover:text-sky-700 transition-colors">
                  <Lamp className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-slate-800">Floor Lamp</span>
                <span className="text-[10px] text-slate-400">0.4m x 1.8m</span>
              </button>
            </div>
          </div>

          {/* Model Inspection & Normalization Readout */}
          {modelStats && (
            <div className="bg-sky-50/80 border border-sky-200 rounded-xl p-3.5 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-900 truncate max-w-[260px]">
                    {modelStats.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {modelStats.fileSizeMb} MB
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-white/80 p-2 rounded-lg border border-sky-100">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Bounding Box</div>
                  <div className="font-mono font-bold text-sky-800 text-xs">
                    {modelStats.size.x.toFixed(2)}m × {modelStats.size.y.toFixed(2)}m × {modelStats.size.z.toFixed(2)}m
                  </div>
                </div>
                <div className="bg-white/80 p-2 rounded-lg border border-sky-100">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Vertices</div>
                  <div className="font-mono font-bold text-slate-700 text-xs">
                    {modelStats.vertices.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white/80 p-2 rounded-lg border border-sky-100">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Faces</div>
                  <div className="font-mono font-bold text-slate-700 text-xs">
                    {modelStats.faces.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-sky-700 flex items-center gap-1.5 pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>Centered at origin and placed flush on ground level (y = 0) with shadows enabled.</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200/80 bg-slate-50/70">
          <span className="text-[11px] text-slate-400">
            Interactive 3D transform gizmo will activate on placement
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleConfirmAddToScene}
              disabled={!loadedModel}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-semibold shadow-md shadow-sky-200 transition-all hover:scale-[1.02] active:scale-95 disabled:hover:scale-100 disabled:shadow-none"
            >
              <span>Add to 3D Scene</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
