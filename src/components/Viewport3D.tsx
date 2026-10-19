import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Compass,
  RotateCcw,
  Sun,
  Sunset,
  Moon,
  Layers,
  Camera,
  Maximize,
  Eye,
  Sliders,
  ChevronDown,
  ChevronUp,
  Download,
  Building2,
  Undo2,
  Box,
  Loader2,
  FileCode,
  Trash2,
  Code2,
} from 'lucide-react';
import { Node, Wall, WallOpening, ClosedRoom } from '../types';
import { build3DArchitecturalModel } from '../utils/threeConversion';
import { exportSceneToGLB } from '../utils/glbExport';
import { ProceduralScriptModal } from './ProceduralScriptModal';

interface Viewport3DProps {
  active: boolean; // When false, Three.js loop MUST stop to optimize INP & CPU
  nodes: Node[];
  walls: Wall[];
  openings: WallOpening[];
  closedRooms: ClosedRoom[];
  scaleFactor: number;
  onSwitchTo2D: () => void;
}

type LightingPreset = 'noon' | 'sunset' | 'night';
type CameraPreset = 'iso' | 'top' | 'eye' | 'front';

export const Viewport3D: React.FC<Viewport3DProps> = ({
  active,
  nodes,
  walls,
  openings,
  closedRooms,
  scaleFactor,
  onSwitchTo2D,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const currentModelGroupRef = useRef<THREE.Group | null>(null);

  // Lighting refs for dynamic updates
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);

  // Interactive 3D Controls State
  const [wallHeight, setWallHeight] = useState<number>(2.8);
  const [lighting, setLighting] = useState<LightingPreset>('noon');
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [cutawayMode, setCutawayMode] = useState<boolean>(false);
  const [controlsDockCollapsed, setControlsDockCollapsed] = useState<boolean>(false);
  const [activeCamPreset, setActiveCamPreset] = useState<CameraPreset>('iso');
  const [isExportingGLB, setIsExportingGLB] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Procedural Models Pipeline State
  const proceduralGroupRef = useRef<THREE.Group | null>(null);
  const [proceduralModels, setProceduralModels] = useState<
    Array<{ id: string; name: string; vertexCount?: number }>
  >([]);
  const [isProceduralModalOpen, setIsProceduralModalOpen] = useState<boolean>(false);

  // Handle addition of procedural 3D model generated from .ts script
  const handleProceduralModelGenerated = (
    object: THREE.Object3D,
    scriptName: string,
    stats?: { totalVertices: number; totalFaces: number }
  ) => {
    if (!sceneRef.current) return;

    // Ground the object so it sits flush on the architectural floor (Y >= 0)
    const box = new THREE.Box3().setFromObject(object);
    if (box.min.y < 0) {
      object.position.y += Math.abs(box.min.y);
    }

    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    if (proceduralGroupRef.current) {
      proceduralGroupRef.current.add(object);
    } else {
      sceneRef.current.add(object);
    }

    setProceduralModels((prev) => [
      ...prev,
      { id: object.uuid, name: scriptName, vertexCount: stats?.totalVertices },
    ]);

    setIsProceduralModalOpen(false);
  };

  const handleClearProceduralModels = () => {
    if (proceduralGroupRef.current) {
      proceduralGroupRef.current.clear();
      setProceduralModels([]);
    }
  };

  // Rebuild 3D Model when blueprint geometry changes or wall height changes
  const rebuild3DModel = useCallback(() => {
    if (!sceneRef.current) return;

    if (currentModelGroupRef.current) {
      sceneRef.current.remove(currentModelGroupRef.current);
      // Recursively dispose geometries and materials
      currentModelGroupRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });
      currentModelGroupRef.current = null;
    }

    const { rootGroup, bounds } = build3DArchitecturalModel({
      nodes,
      walls,
      openings,
      closedRooms,
      scaleFactor,
      wallHeightMeters: wallHeight,
    });

    currentModelGroupRef.current = rootGroup;
    sceneRef.current.add(rootGroup);

    // Apply cutaway mode opacity if enabled
    if (cutawayMode) {
      rootGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.name.startsWith('Wall_') && mesh.material) {
            const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
            mat.transparent = true;
            mat.opacity = 0.5;
            mesh.material = mat;
          }
        }
      });
    }

    // Auto-frame camera if it's the first build
    if (controlsRef.current && cameraRef.current) {
      controlsRef.current.target.set(0, wallHeight * 0.4, 0);
      const dist = Math.max(bounds.sizeX, bounds.sizeZ) * 1.6 + 4;
      if (activeCamPreset === 'iso') {
        cameraRef.current.position.set(dist * 0.7, dist * 0.8, dist * 0.7);
      }
      controlsRef.current.update();
    }
  }, [nodes, walls, openings, closedRooms, scaleFactor, wallHeight, cutawayMode, activeCamPreset]);

  // Update lighting preset
  useEffect(() => {
    if (!sceneRef.current || !dirLightRef.current || !hemiLightRef.current) return;

    if (lighting === 'noon') {
      sceneRef.current.background = new THREE.Color(0xf1f5f9);
      sceneRef.current.fog = new THREE.Fog(0xf1f5f9, 20, 60);
      dirLightRef.current.color.setHex(0xfff8ee);
      dirLightRef.current.intensity = 1.6;
      dirLightRef.current.position.set(12, 18, 10);
      hemiLightRef.current.color.setHex(0xdbeafe);
      hemiLightRef.current.groundColor.setHex(0x94a3b8);
      hemiLightRef.current.intensity = 0.8;
    } else if (lighting === 'sunset') {
      sceneRef.current.background = new THREE.Color(0xfde68a);
      sceneRef.current.fog = new THREE.Fog(0xfde68a, 15, 50);
      dirLightRef.current.color.setHex(0xf97316);
      dirLightRef.current.intensity = 2.0;
      dirLightRef.current.position.set(18, 8, 14);
      hemiLightRef.current.color.setHex(0xfef08a);
      hemiLightRef.current.groundColor.setHex(0x7c2d12);
      hemiLightRef.current.intensity = 0.9;
    } else {
      // Blueprint Night Glow
      sceneRef.current.background = new THREE.Color(0x0f172a);
      sceneRef.current.fog = new THREE.Fog(0x0f172a, 15, 55);
      dirLightRef.current.color.setHex(0x38bdf8);
      dirLightRef.current.intensity = 1.0;
      dirLightRef.current.position.set(10, 15, 10);
      hemiLightRef.current.color.setHex(0x1e293b);
      hemiLightRef.current.groundColor.setHex(0x020617);
      hemiLightRef.current.intensity = 0.6;
    }
  }, [lighting]);

  // Handle camera presets
  const applyCameraPreset = (preset: CameraPreset) => {
    if (!cameraRef.current || !controlsRef.current) return;
    setActiveCamPreset(preset);

    const target = controlsRef.current.target;
    target.set(0, wallHeight * 0.35, 0);

    const dist = 14;

    if (preset === 'iso') {
      cameraRef.current.position.set(dist * 0.75, dist * 0.8, dist * 0.75);
    } else if (preset === 'top') {
      cameraRef.current.position.set(0.001, dist * 1.5, 0);
    } else if (preset === 'eye') {
      cameraRef.current.position.set(0, 1.65, dist * 0.7); // 1.65m human eye height
      target.set(0, 1.4, 0);
    } else if (preset === 'front') {
      cameraRef.current.position.set(0, wallHeight * 0.5, dist * 1.1);
    }

    cameraRef.current.lookAt(target);
    controlsRef.current.update();
  };

  // Screenshot Capture
  const handleCaptureScreenshot = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `BlueprintStudio3D_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Efficient non-blocking GLB export with geometry merging optimization
  const handleExportGLB = async () => {
    if (!sceneRef.current || isExportingGLB) return;
    setIsExportingGLB(true);
    setExportNotice('Merging geometries & exporting optimized binary .GLB...');
    try {
      const filename = `ArchitecturalPlan_3D_${Date.now()}.glb`;
      await exportSceneToGLB(sceneRef.current, filename);
      setExportNotice('GLB file downloaded successfully!');
      setTimeout(() => setExportNotice(null), 3500);
    } catch (err) {
      console.error('Failed to export GLB model:', err);
      setExportNotice('GLB export failed. See browser console.');
      setTimeout(() => setExportNotice(null), 3500);
    } finally {
      setIsExportingGLB(false);
    }
  };

  // Setup Three.js scene once on mount
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.Fog(0xf1f5f9, 20, 60);
    sceneRef.current = scene;

    // Procedural Models Root Group
    const procGroup = new THREE.Group();
    procGroup.name = 'ProceduralModelsRoot';
    scene.add(procGroup);
    proceduralGroupRef.current = procGroup;

    // Studio Environment reflection map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );
    camera.position.set(10, 12, 10);
    cameraRef.current = camera;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04; // Don't orbit below ground
    controls.minDistance = 2;
    controls.maxDistance = 50;
    controls.target.set(0, 1.2, 0);
    controlsRef.current = controls;

    // 3-Point Studio Lighting Rig
    const dirLight = new THREE.DirectionalLight(0xfff8ee, 1.6);
    dirLight.position.set(12, 18, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -16;
    dirLight.shadow.camera.right = 16;
    dirLight.shadow.camera.top = 16;
    dirLight.shadow.camera.bottom = -16;
    dirLight.shadow.bias = -0.0004;
    dirLight.shadow.normalBias = 0.02;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x94a3b8, 0.8);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    // Window Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = width / height;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Rebuild model when geometry changes
  useEffect(() => {
    rebuild3DModel();
  }, [rebuild3DModel]);

  // CRITICAL REQUIREMENT 4:
  // "Implement a clean 2D/3D toggle mechanism that stops the Three.js render loop when in 2D mode to optimize Lighthouse INP and CPU performance."
  useEffect(() => {
    if (!active) {
      // STOP render loop immediately when not in 3D mode!
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      return;
    }

    // When active is true: start the render loop
    let lastTime = performance.now();

    const animate = (time: number) => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const delta = (time - lastTime) / 1000;
      lastTime = time;

      if (controlsRef.current) {
        if (autoRotate) {
          controlsRef.current.autoRotate = true;
          controlsRef.current.autoRotateSpeed = 1.5;
        } else {
          controlsRef.current.autoRotate = false;
        }
        controlsRef.current.update();
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [active, autoRotate]);

  return (
    <div className={`relative w-full h-full select-none ${active ? 'block' : 'hidden'}`}>
      {/* 3D WebGL Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Header Floating Badge / Back to 2D Button */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <button
          onClick={onSwitchTo2D}
          className="flex items-center gap-2 px-3.5 py-2 bg-white/95 hover:bg-white text-slate-800 rounded-xl shadow-md border border-slate-200/90 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 group"
          title="Return to 2D Blueprint Drafting (Tab)"
        >
          <Undo2 className="w-4 h-4 text-sky-600 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to 2D Blueprint</span>
          <kbd className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-200">
            Tab
          </kbd>
        </button>

        {/* Procedural Script Upload & Execution Button */}
        <button
          onClick={() => setIsProceduralModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/95 hover:bg-white text-slate-800 rounded-xl shadow-md border border-slate-200/90 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 group"
          title="Upload or write procedural Three.js TypeScript (.ts) files in isolated sandbox"
        >
          <FileCode className="w-4 h-4 text-sky-600 transition-transform group-hover:scale-110" />
          <span>Procedural .TS</span>
          {proceduralModels.length > 0 && (
            <span className="bg-sky-100 text-sky-800 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
              {proceduralModels.length}
            </span>
          )}
        </button>

        {proceduralModels.length > 0 && (
          <button
            onClick={handleClearProceduralModels}
            className="p-2 bg-white/95 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-xl shadow-md border border-slate-200/90 text-xs font-semibold transition-all"
            title="Clear procedural 3D models"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-900/90 text-white rounded-xl shadow-md backdrop-blur-md text-xs font-medium border border-slate-700/60">
          <Box className="w-3.5 h-3.5 text-sky-400" />
          <span>3D Architectural Walkthrough</span>
          <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded border border-sky-400/30">
            {walls.length} Walls · {closedRooms.length} Rooms
          </span>
        </div>
      </div>

      {/* Export Notice Banner */}
      {exportNotice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 text-white backdrop-blur-md px-4 py-2 rounded-xl shadow-xl text-xs font-medium border border-slate-700/80 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          {isExportingGLB ? (
            <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
          ) : (
            <Box className="w-4 h-4 text-emerald-400" />
          )}
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Top-Right Quick Screenshot, GLB Export & Reset View */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* Export Binary .GLB Button */}
        <button
          onClick={handleExportGLB}
          disabled={isExportingGLB}
          className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-400 text-white rounded-xl shadow-md border border-sky-500/80 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 shadow-sky-200"
          title="Export optimized binary 3D model (.GLB) with merged geometries"
        >
          {isExportingGLB ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <Box className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export .GLB</span>
              <span className="sm:hidden">.GLB</span>
            </>
          )}
        </button>

        <button
          onClick={handleCaptureScreenshot}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/95 hover:bg-white text-slate-700 rounded-xl shadow-md border border-slate-200/90 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95"
          title="Capture High-Res Architectural 3D Render"
        >
          <Download className="w-3.5 h-3.5 text-slate-600" />
          <span className="hidden sm:inline">PNG</span>
        </button>

        <button
          onClick={() => applyCameraPreset('iso')}
          className="p-2 bg-white/95 hover:bg-white text-slate-700 rounded-xl shadow-md border border-slate-200/90 transition-all hover:scale-[1.02] active:scale-95"
          title="Reset Camera View"
        >
          <RotateCcw className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* Unified Ergonomic Bottom Control Dock (Three.js Skill Directive 5: Zero Viewport Occlusion) */}
      <div
        className={`absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center transition-all duration-300 max-w-[min(940px,95vw)] w-full px-2 ${
          controlsDockCollapsed ? 'translate-y-[calc(100%-32px)]' : 'translate-y-0'
        }`}
      >
        {/* Collapse / Expand Tab */}
        <button
          onClick={() => setControlsDockCollapsed(!controlsDockCollapsed)}
          className="flex items-center gap-1.5 px-3 py-1 bg-white/95 hover:bg-white text-slate-600 hover:text-slate-900 rounded-t-xl border border-b-0 border-slate-200/90 shadow-sm text-[11px] font-medium transition-all"
          title="Toggle 3D Viewport Controls Dock"
        >
          {controlsDockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show 3D Studio Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls Dock</span>
            </>
          )}
        </button>

        {/* Horizontal Control Dock Surface */}
        <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-xl border border-slate-200/90 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Camera Presets */}
          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/70">
            <span className="text-[11px] font-semibold text-slate-400 px-1.5 hidden md:inline">
              Camera:
            </span>
            <button
              onClick={() => applyCameraPreset('iso')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                activeCamPreset === 'iso'
                  ? 'bg-white text-sky-800 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Isometric
            </button>
            <button
              onClick={() => applyCameraPreset('top')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                activeCamPreset === 'top'
                  ? 'bg-white text-sky-800 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Top-Down
            </button>
            <button
              onClick={() => applyCameraPreset('eye')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                activeCamPreset === 'eye'
                  ? 'bg-white text-sky-800 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Eye-Level (1.6m)
            </button>
            <button
              onClick={() => applyCameraPreset('front')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                activeCamPreset === 'front'
                  ? 'bg-white text-sky-800 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Elevation
            </button>
          </div>

          {/* Wall Height Adjustment */}
          <div className="flex items-center gap-2 bg-slate-100/80 px-2.5 py-1.5 rounded-xl border border-slate-200/70">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-600">Wall H:</span>
            <input
              type="range"
              min="2.0"
              max="3.6"
              step="0.1"
              value={wallHeight}
              onChange={(e) => setWallHeight(parseFloat(e.target.value))}
              className="w-20 md:w-24 accent-sky-600 cursor-pointer"
            />
            <span className="font-mono text-slate-800 font-bold min-w-[36px]">
              {wallHeight.toFixed(1)}m
            </span>
          </div>

          {/* Cutaway / Dollhouse Toggle */}
          <button
            onClick={() => setCutawayMode(!cutawayMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold transition-all ${
              cutawayMode
                ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                : 'bg-slate-100/80 text-slate-700 hover:text-slate-900 border-slate-200/70'
            }`}
            title="Toggle Cutaway Dollhouse View (see floor finishes clearly)"
          >
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            <span>Dollhouse Cutaway</span>
          </button>

          {/* Sun / Lighting Presets */}
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/70">
            <button
              onClick={() => setLighting('noon')}
              className={`p-1.5 rounded-lg transition-all ${
                lighting === 'noon'
                  ? 'bg-white text-amber-600 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Daylight Studio"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setLighting('sunset')}
              className={`p-1.5 rounded-lg transition-all ${
                lighting === 'sunset'
                  ? 'bg-white text-orange-600 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Golden Hour Sunset"
            >
              <Sunset className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setLighting('night')}
              className={`p-1.5 rounded-lg transition-all ${
                lighting === 'night'
                  ? 'bg-white text-sky-600 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Blueprint Night Glow"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Auto Rotate Showcase */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold transition-all ${
              autoRotate
                ? 'bg-sky-50 text-sky-800 border-sky-300 shadow-2xs'
                : 'bg-slate-100/80 text-slate-600 hover:text-slate-900 border-slate-200/70'
            }`}
            title="Auto-Rotate Architectural Showcase"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
            <span>Orbit</span>
          </button>

          {/* Quick GLB Export in Dock */}
          <button
            onClick={handleExportGLB}
            disabled={isExportingGLB}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/80 hover:bg-white text-slate-700 hover:text-slate-900 rounded-xl border border-slate-200/70 font-semibold transition-all shadow-2xs"
            title="Download optimized binary .GLB 3D scene"
          >
            {isExportingGLB ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
            ) : (
              <Download className="w-3.5 h-3.5 text-sky-600" />
            )}
            <span>Export GLB</span>
          </button>

          {/* Quick Procedural Script in Dock */}
          <button
            onClick={() => setIsProceduralModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/80 hover:bg-white text-slate-700 hover:text-slate-900 rounded-xl border border-slate-200/70 font-semibold transition-all shadow-2xs"
            title="Upload or write procedural Three.js TypeScript script"
          >
            <Code2 className="w-3.5 h-3.5 text-sky-600" />
            <span>Procedural .TS</span>
          </button>
        </div>
      </div>

      {/* Procedural TypeScript File Upload & Execution Modal */}
      <ProceduralScriptModal
        isOpen={isProceduralModalOpen}
        onClose={() => setIsProceduralModalOpen(false)}
        onModelGenerated={handleProceduralModelGenerated}
        onShowToast={(msg) => {
          setExportNotice(msg);
          setTimeout(() => setExportNotice(null), 4000);
        }}
      />
    </div>
  );
};
