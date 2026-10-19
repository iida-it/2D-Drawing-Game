import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  RotateCcw,
  Sun,
  Sunset,
  Moon,
  Layers,
  ChevronDown,
  ChevronUp,
  Download,
  Building2,
  Undo2,
  Box,
  Loader2,
  Trash2,
  Move,
  RotateCw,
  Maximize2,
  Plus,
  Crosshair,
  Check,
  X,
  Sliders,
} from 'lucide-react';
import { Node, Wall, WallOpening, ClosedRoom } from '../types';
import { build3DArchitecturalModel } from '../utils/threeConversion';
import { exportSceneToGLB } from '../utils/glbExport';
import { GLBModelModal } from './GLBModelModal';

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
type GizmoMode = 'translate' | 'rotate' | 'scale';

interface LoadedModelRecord {
  id: string;
  name: string;
  object: THREE.Object3D;
  vertexCount?: number;
  faceCount?: number;
}

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
  const transformControlsRef = useRef<TransformControls | null>(null);
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
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Native GLB/GLTF Models State
  const modelsGroupRef = useRef<THREE.Group | null>(null);
  const [importedModels, setImportedModels] = useState<LoadedModelRecord[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isGLBModalOpen, setIsGLBModalOpen] = useState<boolean>(false);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [gizmoSpace, setGizmoSpace] = useState<'world' | 'local'>('world');
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);

  // Pointer drag vs click detection
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isGizmoDraggingRef = useRef<boolean>(false);

  // Helper to show transient banner notice
  const showNotification = useCallback((message: string) => {
    setToastNotice(message);
    setTimeout(() => setToastNotice(null), 3800);
  }, []);

  // Update TransformControls mode / space / snap
  useEffect(() => {
    const tc = transformControlsRef.current;
    if (!tc) return;

    tc.setMode(gizmoMode);
    tc.setSpace(gizmoSpace);

    if (snapEnabled) {
      tc.setTranslationSnap(0.1); // 10cm grid snap
      tc.setRotationSnap(THREE.MathUtils.degToRad(15)); // 15 deg snap
      tc.setScaleSnap(0.1);
    } else {
      tc.setTranslationSnap(null);
      tc.setRotationSnap(null);
      tc.setScaleSnap(null);
    }
  }, [gizmoMode, gizmoSpace, snapEnabled]);

  // Select an imported 3D model and attach Gizmo
  const selectModel = useCallback((modelId: string | null) => {
    setSelectedModelId(modelId);
    const tc = transformControlsRef.current;
    if (!tc) return;

    if (!modelId) {
      tc.detach();
      return;
    }

    const item = importedModels.find((m) => m.id === modelId);
    if (item && item.object) {
      tc.attach(item.object);
    } else {
      tc.detach();
    }
  }, [importedModels]);

  // Delete an imported model
  const handleDeleteModel = (modelId: string) => {
    const item = importedModels.find((m) => m.id === modelId);
    if (!item) return;

    if (selectedModelId === modelId) {
      transformControlsRef.current?.detach();
      setSelectedModelId(null);
    }

    if (modelsGroupRef.current && item.object) {
      modelsGroupRef.current.remove(item.object);
      item.object.traverse((child) => {
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
    }

    setImportedModels((prev) => prev.filter((m) => m.id !== modelId));
    showNotification(`Removed "${item.name}".`);
  };

  // Clear all imported models
  const handleClearAllModels = () => {
    transformControlsRef.current?.detach();
    setSelectedModelId(null);

    if (modelsGroupRef.current) {
      modelsGroupRef.current.clear();
      setImportedModels([]);
      showNotification('Cleared all imported 3D models.');
    }
  };

  // Handle addition of normalized .GLB/.GLTF model into active 3D Viewport scene
  const handleModelLoaded = (model: THREE.Group, name: string) => {
    if (!sceneRef.current || !modelsGroupRef.current) return;

    // Add to imported models group
    modelsGroupRef.current.add(model);

    // Record model
    const newRecord: LoadedModelRecord = {
      id: model.uuid,
      name,
      object: model,
    };

    setImportedModels((prev) => [...prev, newRecord]);

    // Attach transform gizmo immediately so user can place it
    transformControlsRef.current?.attach(model);
    setSelectedModelId(model.uuid);

    showNotification(`Added "${name}" with 3D Transform Gizmo active.`);
    setIsGLBModalOpen(false);
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
    showNotification('Merging geometries & exporting optimized binary .GLB...');
    try {
      const filename = `ArchitecturalPlan_3D_${Date.now()}.glb`;
      await exportSceneToGLB(sceneRef.current, filename);
      showNotification('GLB file downloaded successfully!');
    } catch (err) {
      console.error('Failed to export GLB model:', err);
      showNotification('GLB export failed. See browser console.');
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

    // Imported GLB Models Root Group
    const modelsGroup = new THREE.Group();
    modelsGroup.name = 'ImportedGLBModelsRoot';
    scene.add(modelsGroup);
    modelsGroupRef.current = modelsGroup;

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

    // TransformControls Gizmo for 3D imported model positioning
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.size = 0.85;
    transformControls.setTranslationSnap(0.1);
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    scene.add(transformControls.getHelper());
    transformControlsRef.current = transformControls;

    // Disable OrbitControls while actively manipulating Gizmo handles
    transformControls.addEventListener('dragging-changed', (event: any) => {
      controls.enabled = !event.value;
      isGizmoDraggingRef.current = event.value;
    });

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

    // Click in 3D scene to select an imported model or deselect
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (e: MouseEvent) => {
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: MouseEvent) => {
      if (isGizmoDraggingRef.current) return;

      const dx = Math.abs(e.clientX - pointerDownPosRef.current.x);
      const dy = Math.abs(e.clientY - pointerDownPosRef.current.y);
      if (dx > 5 || dy > 5) {
        // Was a camera orbit drag, not a selection click
        return;
      }

      // Check if user clicked on TransformControls gizmo itself
      if (transformControls.axis) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      if (modelsGroupRef.current && modelsGroupRef.current.children.length > 0) {
        const intersects = raycaster.intersectObjects(modelsGroupRef.current.children, true);
        if (intersects.length > 0) {
          // Find root model under modelsGroup
          let topObj: THREE.Object3D | null = intersects[0].object;
          while (topObj && topObj.parent && topObj.parent !== modelsGroupRef.current) {
            topObj = topObj.parent;
          }

          if (topObj) {
            transformControls.attach(topObj);
            setSelectedModelId(topObj.uuid);
            return;
          }
        }
      }

      // If clicked empty area (not a model), detach gizmo
      transformControls.detach();
      setSelectedModelId(null);
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', handlePointerDown);
    dom.addEventListener('mouseup', handlePointerUp);

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
      dom.removeEventListener('mousedown', handlePointerDown);
      dom.removeEventListener('mouseup', handlePointerUp);
      resizeObserver.disconnect();
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      transformControls.dispose();
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

  // Clean 2D/3D toggle mechanism that stops the Three.js render loop when in 2D mode
  useEffect(() => {
    if (!active) {
      // STOP render loop immediately when not in 3D mode to optimize Lighthouse INP and CPU performance
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      return;
    }

    // When active is true: start the render loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

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

  // Keyboard shortcut listener for Gizmo modes
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'w' || e.key === 'W') {
        setGizmoMode('translate');
      } else if (e.key === 'e' || e.key === 'E') {
        setGizmoMode('rotate');
      } else if (e.key === 'r' || e.key === 'R') {
        setGizmoMode('scale');
      } else if (e.key === 'Escape') {
        transformControlsRef.current?.detach();
        setSelectedModelId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  const selectedModel = importedModels.find((m) => m.id === selectedModelId);

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

        {/* Import .GLB / .GLTF 3D Model Button */}
        <button
          onClick={() => setIsGLBModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md border border-sky-500/80 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 group shadow-sky-200"
          title="Import binary 3D model (.glb / .gltf) with automatic ground alignment & transform gizmo"
        >
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
          <span>Import 3D Model</span>
          {importedModels.length > 0 && (
            <span className="bg-white/20 text-white px-1.5 py-0.2 rounded-full text-[10px] font-bold">
              {importedModels.length}
            </span>
          )}
        </button>

        {importedModels.length > 0 && (
          <button
            onClick={handleClearAllModels}
            className="p-2 bg-white/95 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-xl shadow-md border border-slate-200/90 text-xs font-semibold transition-all"
            title="Clear all imported 3D models"
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

      {/* Active Transform Gizmo Floating Control Card (when a model is selected) */}
      {selectedModel && (
        <div className="absolute top-16 left-4 z-20 bg-white/95 backdrop-blur-md p-2.5 rounded-2xl shadow-xl border border-sky-300/80 flex flex-col gap-2 min-w-[240px] animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-sky-100 text-sky-700">
                <Box className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block truncate max-w-[130px]">
                  {selectedModel.name}
                </span>
                <span className="text-[10px] text-sky-600 font-medium">Transform Gizmo Active</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handleDeleteModel(selectedModel.id)}
                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title="Delete this 3D model"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => selectModel(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Deselect model (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Gizmo Mode Switcher: Translate (W), Rotate (E), Scale (R) */}
          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setGizmoMode('translate')}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                gizmoMode === 'translate'
                  ? 'bg-white text-sky-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Move / Translate (Hotkey: W)"
            >
              <Move className="w-3 h-3" />
              <span>Move</span>
            </button>

            <button
              onClick={() => setGizmoMode('rotate')}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                gizmoMode === 'rotate'
                  ? 'bg-white text-sky-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Rotate (Hotkey: E)"
            >
              <RotateCw className="w-3 h-3" />
              <span>Rotate</span>
            </button>

            <button
              onClick={() => setGizmoMode('scale')}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                gizmoMode === 'scale'
                  ? 'bg-white text-sky-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Scale (Hotkey: R)"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Scale</span>
            </button>
          </div>

          {/* Snapping and Coordinate Space */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <button
              onClick={() => setSnapEnabled(!snapEnabled)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border font-medium transition-all ${
                snapEnabled
                  ? 'bg-sky-50 text-sky-800 border-sky-300'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
              title="Toggle 10cm grid & 15° angle snapping"
            >
              <Crosshair className="w-3 h-3" />
              <span>Snap: {snapEnabled ? '10cm / 15°' : 'Free'}</span>
            </button>

            <button
              onClick={() => setGizmoSpace(gizmoSpace === 'world' ? 'local' : 'world')}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 font-mono text-[10px] transition-colors"
              title="Toggle World vs Local coordinate space"
            >
              {gizmoSpace.toUpperCase()}
            </button>
          </div>
        </div>
      )}

      {/* Toast Notice Banner */}
      {toastNotice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 text-white backdrop-blur-md px-4 py-2 rounded-xl shadow-xl text-xs font-medium border border-slate-700/80 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          {isExportingGLB ? (
            <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
          ) : (
            <Box className="w-4 h-4 text-emerald-400" />
          )}
          <span>{toastNotice}</span>
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
        className={`absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center transition-all duration-300 max-w-[min(960px,96vw)] w-full px-2 ${
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
              Eye-Level
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
            <span>Cutaway</span>
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

          {/* Quick Import 3D Model in Dock */}
          <button
            onClick={() => setIsGLBModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 text-sky-800 hover:bg-sky-100 rounded-xl border border-sky-200 font-semibold transition-all shadow-2xs"
            title="Import .glb / .gltf 3D model or architectural props"
          >
            <Plus className="w-3.5 h-3.5 text-sky-600" />
            <span>Add Model</span>
          </button>
        </div>
      </div>

      {/* Native GLB/GLTF Model Import Modal */}
      <GLBModelModal
        isOpen={isGLBModalOpen}
        onClose={() => setIsGLBModalOpen(false)}
        onModelLoaded={handleModelLoaded}
        onShowToast={showNotification}
      />
    </div>
  );
};
