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
  SlidersHorizontal,
  Eye,
  Palette,
  Sparkles,
  Grid,
} from 'lucide-react';
import { Node, Wall, WallOpening, ClosedRoom } from '../types';
import { build3DArchitecturalModel } from '../utils/threeConversion';
import { exportSceneToGLB } from '../utils/glbExport';
import { GLBModelModal } from './GLBModelModal';
import { useLanguage } from '../i18n/LanguageContext';

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
export type ShadingMode = 'material' | 'wireframe' | 'normals' | 'xray' | 'points';

interface LoadedModelRecord {
  id: string;
  name: string;
  object: THREE.Object3D;
  vertexCount?: number;
  faceCount?: number;
}

// 6 Preset background color swatches matching specification
const BG_SWATCHES = [
  { hex: '#1e1e1e', name: 'Studio Dark' },
  { hex: '#2c3440', name: 'Slate Charcoal' },
  { hex: '#1a2233', name: 'Deep Navy' },
  { hex: '#0f172a', name: 'Midnight Slate' },
  { hex: '#000000', name: 'Pitch Black' },
  { hex: '#71717a', name: 'Neutral Gray' },
];

export const Viewport3D: React.FC<Viewport3DProps> = ({
  active,
  nodes,
  walls,
  openings,
  closedRooms,
  scaleFactor,
  onSwitchTo2D,
}) => {
  const { t } = useLanguage();
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

  // Scene Helpers Refs
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const boxHelperRef = useRef<THREE.BoxHelper | null>(null);

  // Shading Materials & Point Cloud Refs
  const originalMaterialsMap = useRef(new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>());
  const normalMaterialRef = useRef<THREE.MeshNormalMaterial | null>(null);
  const xrayMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const pointsMaterialRef = useRef<THREE.PointsMaterial | null>(null);
  const pointsGroupRef = useRef<THREE.Group | null>(null);

  // Viewport Shading & Helpers State
  const [isDisplayMenuOpen, setIsDisplayMenuOpen] = useState<boolean>(false);
  const displayMenuRef = useRef<HTMLDivElement>(null);
  const [shadingMode, setShadingMode] = useState<ShadingMode>('material');
  const [pointCloudSize, setPointCloudSize] = useState<number>(0.05);

  // Helpers State
  const [showGroundGrid, setShowGroundGrid] = useState<boolean>(true);
  const [showAxesHelper, setShowAxesHelper] = useState<boolean>(false);
  const [showSelectionBounds, setShowSelectionBounds] = useState<boolean>(true);

  // Background Color State
  const [currentBgColor, setCurrentBgColor] = useState<string>('#f1f5f9');

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
  const selectedModelIdRef = useRef<string | null>(null);
  selectedModelIdRef.current = selectedModelId;

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

  // Close Display Menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        displayMenuRef.current &&
        !displayMenuRef.current.contains(event.target as HTMLElement)
      ) {
        setIsDisplayMenuOpen(false);
      }
    };

    if (isDisplayMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDisplayMenuOpen]);

  // Traverse all model meshes across architectural and imported groups
  const traverseAllMeshes = useCallback((callback: (mesh: THREE.Mesh) => void) => {
    const processGroup = (group: THREE.Group | null) => {
      if (!group) return;
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.type !== 'Points') {
          callback(child as THREE.Mesh);
        }
      });
    };
    processGroup(currentModelGroupRef.current);
    processGroup(modelsGroupRef.current);
  }, []);

  // Apply Shading Mode (Material, Wireframe, Normals, X-Ray, Point Cloud)
  const applyShading = useCallback(
    (mode: ShadingMode, ptSize?: number) => {
      const activeSize = ptSize ?? pointCloudSize;

      // Ensure shared materials are initialized
      if (!normalMaterialRef.current) {
        normalMaterialRef.current = new THREE.MeshNormalMaterial({
          side: THREE.DoubleSide,
        });
      }
      if (!xrayMaterialRef.current) {
        xrayMaterialRef.current = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          roughness: 0.3,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
      }
      if (!pointsMaterialRef.current) {
        pointsMaterialRef.current = new THREE.PointsMaterial({
          color: 0x38bdf8,
          size: activeSize,
          sizeAttenuation: true,
        });
      } else {
        pointsMaterialRef.current.size = activeSize;
      }

      // Step 1: Cache original materials via WeakMap for any newly discovered meshes
      traverseAllMeshes((mesh) => {
        if (!originalMaterialsMap.current.has(mesh)) {
          originalMaterialsMap.current.set(mesh, mesh.material);
        }
      });

      // Step 2: Handle Point Cloud vs Mesh Shading
      if (mode === 'points') {
        if (pointsGroupRef.current && pointsMaterialRef.current) {
          pointsGroupRef.current.clear();
          pointsGroupRef.current.visible = true;

          traverseAllMeshes((mesh) => {
            mesh.visible = false;
            if (mesh.geometry) {
              const pts = new THREE.Points(mesh.geometry, pointsMaterialRef.current!);
              mesh.updateWorldMatrix(true, false);
              pts.applyMatrix4(mesh.matrixWorld);
              pointsGroupRef.current!.add(pts);
            }
          });
        }
      } else {
        // Hide point cloud group if previously visible
        if (pointsGroupRef.current) {
          pointsGroupRef.current.clear();
          pointsGroupRef.current.visible = false;
        }

        // Apply mesh shading
        traverseAllMeshes((mesh) => {
          mesh.visible = true;
          const orig = originalMaterialsMap.current.get(mesh);

          if (mode === 'material') {
            // Restore original cached PBR material
            if (orig) {
              mesh.material = orig;
              if (Array.isArray(orig)) {
                orig.forEach((m) => {
                  (m as any).wireframe = false;
                });
              } else {
                (orig as any).wireframe = false;
              }
            }
          } else if (mode === 'wireframe') {
            // Set wireframe = true on original material
            if (orig) {
              mesh.material = orig;
              if (Array.isArray(orig)) {
                orig.forEach((m) => {
                  (m as any).wireframe = true;
                });
              } else {
                (orig as any).wireframe = true;
              }
            }
          } else if (mode === 'normals') {
            // Swap to MeshNormalMaterial
            mesh.material = normalMaterialRef.current!;
          } else if (mode === 'xray') {
            // Swap to X-Ray transparent blue blend material
            mesh.material = xrayMaterialRef.current!;
          }
        });
      }
    },
    [pointCloudSize, traverseAllMeshes]
  );

  // Switch shading mode handler
  const handleSetShadingMode = (newMode: ShadingMode) => {
    setShadingMode(newMode);
    applyShading(newMode);
  };

  // Point cloud size slider handler
  const handlePointCloudSizeChange = (newSize: number) => {
    setPointCloudSize(newSize);
    if (pointsMaterialRef.current) {
      pointsMaterialRef.current.size = newSize;
    }
    if (shadingMode === 'points') {
      applyShading('points', newSize);
    }
  };

  // Background Swatch selection
  const handleSelectBgColor = (hex: string) => {
    setCurrentBgColor(hex);
    if (sceneRef.current && rendererRef.current) {
      const col = new THREE.Color(hex);
      sceneRef.current.background = col;
      if (sceneRef.current.fog) {
        sceneRef.current.fog.color = col;
      }
      rendererRef.current.setClearColor(col);
    }
  };

  // Toggle Helpers Visibility
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGroundGrid;
    }
  }, [showGroundGrid]);

  useEffect(() => {
    if (axesHelperRef.current) {
      axesHelperRef.current.visible = showAxesHelper;
    }
  }, [showAxesHelper]);

  // Update Selection Bounds BoxHelper
  useEffect(() => {
    const bh = boxHelperRef.current;
    if (!bh) return;

    if (!showSelectionBounds || !selectedModelId) {
      bh.visible = false;
      return;
    }

    const item = importedModels.find((m) => m.id === selectedModelId);
    if (item && item.object) {
      bh.setFromObject(item.object);
      bh.visible = true;
    } else {
      bh.visible = false;
    }
  }, [selectedModelId, showSelectionBounds, importedModels]);

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

  // Select an imported 3D model and attach Gizmo & BoxHelper
  const selectModel = useCallback(
    (modelId: string | null) => {
      setSelectedModelId(modelId);
      const tc = transformControlsRef.current;
      const bh = boxHelperRef.current;
      if (!tc) return;

      if (!modelId) {
        tc.detach();
        if (bh) bh.visible = false;
        return;
      }

      const item = importedModels.find((m) => m.id === modelId);
      if (item && item.object) {
        tc.attach(item.object);
        if (bh && showSelectionBounds) {
          bh.setFromObject(item.object);
          bh.visible = true;
        }
      } else {
        tc.detach();
        if (bh) bh.visible = false;
      }
    },
    [importedModels, showSelectionBounds]
  );

  // Delete an imported model
  const handleDeleteModel = (modelId: string) => {
    const item = importedModels.find((m) => m.id === modelId);
    if (!item) return;

    if (selectedModelId === modelId) {
      transformControlsRef.current?.detach();
      if (boxHelperRef.current) boxHelperRef.current.visible = false;
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
    if (boxHelperRef.current) boxHelperRef.current.visible = false;
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

    // Attach transform gizmo and update selection
    transformControlsRef.current?.attach(model);
    setSelectedModelId(model.uuid);

    if (boxHelperRef.current && showSelectionBounds) {
      boxHelperRef.current.setFromObject(model);
      boxHelperRef.current.visible = true;
    }

    // Apply active shading mode to new model
    if (shadingMode !== 'material') {
      applyShading(shadingMode);
    }

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

    // Reapply active shading mode if non-default
    if (shadingMode !== 'material') {
      applyShading(shadingMode);
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
  }, [
    nodes,
    walls,
    openings,
    closedRooms,
    scaleFactor,
    wallHeight,
    cutawayMode,
    activeCamPreset,
    shadingMode,
    applyShading,
  ]);

  // Update lighting preset
  useEffect(() => {
    if (!sceneRef.current || !dirLightRef.current || !hemiLightRef.current) return;

    if (lighting === 'noon') {
      sceneRef.current.background = new THREE.Color(currentBgColor || 0xf1f5f9);
      sceneRef.current.fog = new THREE.Fog(currentBgColor || 0xf1f5f9, 20, 60);
      dirLightRef.current.color.setHex(0xfff8ee);
      dirLightRef.current.intensity = 1.6;
      dirLightRef.current.position.set(12, 18, 10);
      hemiLightRef.current.color.setHex(0xdbeafe);
      hemiLightRef.current.groundColor.setHex(0x94a3b8);
      hemiLightRef.current.intensity = 0.8;
    } else if (lighting === 'sunset') {
      sceneRef.current.background = new THREE.Color(currentBgColor || 0xfde68a);
      sceneRef.current.fog = new THREE.Fog(currentBgColor || 0xfde68a, 15, 50);
      dirLightRef.current.color.setHex(0xf97316);
      dirLightRef.current.intensity = 2.0;
      dirLightRef.current.position.set(18, 8, 14);
      hemiLightRef.current.color.setHex(0xfef08a);
      hemiLightRef.current.groundColor.setHex(0x7c2d12);
      hemiLightRef.current.intensity = 0.9;
    } else {
      // Blueprint Night Glow
      sceneRef.current.background = new THREE.Color(currentBgColor || 0x0f172a);
      sceneRef.current.fog = new THREE.Fog(currentBgColor || 0x0f172a, 15, 55);
      dirLightRef.current.color.setHex(0x38bdf8);
      dirLightRef.current.intensity = 1.0;
      dirLightRef.current.position.set(10, 15, 10);
      hemiLightRef.current.color.setHex(0x1e293b);
      hemiLightRef.current.groundColor.setHex(0x020617);
      hemiLightRef.current.intensity = 0.6;
    }
  }, [lighting, currentBgColor]);

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

    // Studio Environment reflection map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Scene Helpers: Ground Grid
    const gridHelper = new THREE.GridHelper(50, 50, 0x0284c7, 0x94a3b8);
    gridHelper.position.y = -0.005;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.6;
    gridHelper.visible = showGroundGrid;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // Scene Helpers: XYZ Axes
    const axesHelper = new THREE.AxesHelper(3.0);
    axesHelper.position.set(0, 0.01, 0);
    axesHelper.visible = showAxesHelper;
    scene.add(axesHelper);
    axesHelperRef.current = axesHelper;

    // Scene Helpers: Selection BoxHelper
    const dummyObj = new THREE.Object3D();
    const boxHelper = new THREE.BoxHelper(dummyObj, 0x0284c7);
    boxHelper.visible = false;
    scene.add(boxHelper);
    boxHelperRef.current = boxHelper;

    // Imported GLB Models Root Group
    const modelsGroup = new THREE.Group();
    modelsGroup.name = 'ImportedGLBModelsRoot';
    scene.add(modelsGroup);
    modelsGroupRef.current = modelsGroup;

    // Point Cloud Root Group
    const pointsGroup = new THREE.Group();
    pointsGroup.name = 'PointCloudRoot';
    pointsGroup.visible = false;
    scene.add(pointsGroup);
    pointsGroupRef.current = pointsGroup;

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

    // Update BoxHelper continuously while transforming
    transformControls.addEventListener('change', () => {
      if (boxHelperRef.current && boxHelperRef.current.visible) {
        boxHelperRef.current.update();
      }
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
            if (boxHelperRef.current) {
              boxHelperRef.current.setFromObject(topObj);
              boxHelperRef.current.visible = true;
            }
            return;
          }
        }
      }

      // If clicked empty area (not a model), detach gizmo
      transformControls.detach();
      if (boxHelperRef.current) boxHelperRef.current.visible = false;
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
      gridHelper.dispose();
      axesHelper.dispose();
      boxHelper.dispose();
      normalMaterialRef.current?.dispose();
      xrayMaterialRef.current?.dispose();
      pointsMaterialRef.current?.dispose();
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

      // Keep selection bounds BoxHelper updated if active
      if (boxHelperRef.current && boxHelperRef.current.visible && selectedModelIdRef.current) {
        boxHelperRef.current.update();
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

  // Keyboard shortcut listener for Gizmo modes & ESC
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
        if (isDisplayMenuOpen) {
          setIsDisplayMenuOpen(false);
          return;
        }
        transformControlsRef.current?.detach();
        if (boxHelperRef.current) boxHelperRef.current.visible = false;
        setSelectedModelId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, isDisplayMenuOpen]);

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
          title={`${t('backTo2D')} (Tab)`}
        >
          <Undo2 className="w-4 h-4 text-sky-600 transition-transform group-hover:-translate-x-0.5" />
          <span>{t('backTo2D')}</span>
          <kbd className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-200">
            Tab
          </kbd>
        </button>

        {/* Import .GLB / .GLTF 3D Model Button */}
        <button
          onClick={() => setIsGLBModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md border border-sky-500/80 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 group shadow-sky-200"
          title={t('import3DModel')}
        >
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
          <span>{t('import3DModel')}</span>
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
          <span>{t('walkthrough3D')}</span>
          <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded border border-sky-400/30">
            {walls.length} {t('wallsCount')} · {closedRooms.length} {t('roomsCount')}
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
                <span className="text-[10px] text-sky-600 font-medium">{t('transformGizmoActive')}</span>
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
              title={`${t('move')} (W)`}
            >
              <Move className="w-3 h-3" />
              <span>{t('move')}</span>
            </button>

            <button
              onClick={() => setGizmoMode('rotate')}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                gizmoMode === 'rotate'
                  ? 'bg-white text-sky-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title={`${t('rotate')} (E)`}
            >
              <RotateCw className="w-3 h-3" />
              <span>{t('rotate')}</span>
            </button>

            <button
              onClick={() => setGizmoMode('scale')}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                gizmoMode === 'scale'
                  ? 'bg-white text-sky-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title={`${t('scale')} (R)`}
            >
              <Maximize2 className="w-3 h-3" />
              <span>{t('scale')}</span>
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
              <span>{t('snap')}: {snapEnabled ? '10cm / 15°' : t('free')}</span>
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

      {/* Top-Right Quick Controls: Display Popover, Screenshot, GLB Export & Reset View */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* VIEWPORT SHADING & HELPERS (DISPLAY DROPDOWN) */}
        <div className="relative" ref={displayMenuRef}>
          <button
            onClick={() => setIsDisplayMenuOpen(!isDisplayMenuOpen)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-md border text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 ${
              isDisplayMenuOpen
                ? 'bg-sky-600 text-white border-sky-500 shadow-sky-200 ring-2 ring-sky-400/30'
                : 'bg-white/95 hover:bg-white text-slate-700 border-slate-200/90'
            }`}
            title="Viewport Shading, Scene Helpers & Background Settings"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{t('display')}</span>
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-200 ${
                isDisplayMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Comprehensive Viewport Shading & Helpers Popover Card */}
          {isDisplayMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 p-3.5 z-40 text-xs animate-in fade-in zoom-in-95 duration-150 select-none">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-sky-100 text-sky-700">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs leading-none">
                      {t('viewportShadingAndHelpers')}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {t('displayPresetsSub')}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsDisplayMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 1. RENDER SHADING SECTION */}
              <div className="mb-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-mono">
                    {t('renderShading')}
                  </span>
                  <span className="text-[10px] font-medium text-sky-700 capitalize">
                    {shadingMode}
                  </span>
                </div>

                {/* 5 Shading Toggle Buttons */}
                <div className="grid grid-cols-3 gap-1 bg-slate-100/80 p-1 rounded-xl mb-2 border border-slate-200/60">
                  <button
                    onClick={() => handleSetShadingMode('material')}
                    className={`py-1.5 px-2 rounded-lg font-medium text-[11px] transition-all flex items-center justify-center gap-1 ${
                      shadingMode === 'material'
                        ? 'bg-white text-sky-800 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Material: Restores original PBR/Texture materials (cached via WeakMap)"
                  >
                    <Palette className="w-3 h-3 text-sky-600" />
                    <span>{t('shadingMaterial')}</span>
                  </button>

                  <button
                    onClick={() => handleSetShadingMode('wireframe')}
                    className={`py-1.5 px-2 rounded-lg font-medium text-[11px] transition-all flex items-center justify-center gap-1 ${
                      shadingMode === 'wireframe'
                        ? 'bg-white text-sky-800 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Wireframe: Sets material.wireframe = true on all meshes"
                  >
                    <Grid className="w-3 h-3 text-indigo-600" />
                    <span>{t('shadingWireframe')}</span>
                  </button>

                  <button
                    onClick={() => handleSetShadingMode('normals')}
                    className={`py-1.5 px-2 rounded-lg font-medium text-[11px] transition-all flex items-center justify-center gap-1 ${
                      shadingMode === 'normals'
                        ? 'bg-white text-sky-800 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Normals: Swaps mesh materials to THREE.MeshNormalMaterial"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>{t('shadingNormals')}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
                  <button
                    onClick={() => handleSetShadingMode('xray')}
                    className={`py-1.5 px-2 rounded-lg font-medium text-[11px] transition-all flex items-center justify-center gap-1.5 ${
                      shadingMode === 'xray'
                        ? 'bg-white text-sky-800 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="X-Ray: Transparent blue blend material (opacity: 0.35, depthWrite: false)"
                  >
                    <Eye className="w-3 h-3 text-cyan-600" />
                    <span>{t('shadingXRay')}</span>
                  </button>

                  <button
                    onClick={() => handleSetShadingMode('points')}
                    className={`py-1.5 px-2 rounded-lg font-medium text-[11px] transition-all flex items-center justify-center gap-1.5 ${
                      shadingMode === 'points'
                        ? 'bg-white text-sky-800 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Point Cloud: Renders scene vertices as THREE.Points"
                  >
                    <Crosshair className="w-3 h-3 text-amber-600" />
                    <span>{t('shadingPointCloud')}</span>
                  </button>
                </div>

                {/* Point Cloud Size Slider (Active when points mode is selected) */}
                {shadingMode === 'points' && (
                  <div className="mt-2.5 p-2 bg-sky-50/70 border border-sky-200/80 rounded-xl animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-[11px] font-medium text-sky-900 mb-1">
                      <span>{t('pointCloudSize')}:</span>
                      <span className="font-mono font-bold">{pointCloudSize.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="0.20"
                      step="0.01"
                      value={pointCloudSize}
                      onChange={(e) => handlePointCloudSizeChange(parseFloat(e.target.value))}
                      className="w-full accent-sky-600 cursor-pointer h-1.5 bg-sky-200 rounded-lg"
                    />
                    <div className="flex justify-between text-[9px] text-sky-600 font-mono mt-0.5">
                      <span>0.01</span>
                      <span>Default 0.05</span>
                      <span>0.20</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. SCENE HELPERS SECTION */}
              <div className="mb-3.5 border-t border-slate-200/80 pt-2.5">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-mono block mb-1.5">
                  {t('sceneHelpers')}
                </span>

                <div className="flex flex-col gap-1.5">
                  {/* Ground Grid Checkbox */}
                  <label className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-100/80 cursor-pointer transition-colors group">
                    <span className="text-[11px] font-medium text-slate-700 group-hover:text-slate-900">
                      {t('groundGrid')}
                    </span>
                    <input
                      type="checkbox"
                      checked={showGroundGrid}
                      onChange={(e) => setShowGroundGrid(e.target.checked)}
                      className="w-4 h-4 rounded text-sky-600 accent-sky-600 cursor-pointer"
                    />
                  </label>

                  {/* XYZ Axes Helper Checkbox */}
                  <label className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-100/80 cursor-pointer transition-colors group">
                    <span className="text-[11px] font-medium text-slate-700 group-hover:text-slate-900">
                      {t('xyzAxesHelper')}
                    </span>
                    <input
                      type="checkbox"
                      checked={showAxesHelper}
                      onChange={(e) => setShowAxesHelper(e.target.checked)}
                      className="w-4 h-4 rounded text-sky-600 accent-sky-600 cursor-pointer"
                    />
                  </label>

                  {/* Selection Bounds Checkbox */}
                  <label className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-100/80 cursor-pointer transition-colors group">
                    <span className="text-[11px] font-medium text-slate-700 group-hover:text-slate-900">
                      {t('selectionBounds')}
                    </span>
                    <input
                      type="checkbox"
                      checked={showSelectionBounds}
                      onChange={(e) => setShowSelectionBounds(e.target.checked)}
                      className="w-4 h-4 rounded text-sky-600 accent-sky-600 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* 3. BACKGROUND COLOR PALETTE SECTION */}
              <div className="border-t border-slate-200/80 pt-2.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-mono">
                    {t('backgroundColor')}
                  </span>
                  <span className="text-[10px] font-mono font-medium text-slate-500 uppercase">
                    {currentBgColor}
                  </span>
                </div>

                {/* 6 Preset Color Swatches */}
                <div className="grid grid-cols-6 gap-1.5">
                  {BG_SWATCHES.map((swatch) => {
                    const isSelected =
                      currentBgColor.toLowerCase() === swatch.hex.toLowerCase();
                    return (
                      <button
                        key={swatch.hex}
                        onClick={() => handleSelectBgColor(swatch.hex)}
                        className={`h-7 w-full rounded-lg transition-transform hover:scale-105 active:scale-95 flex items-center justify-center border relative ${
                          isSelected
                            ? 'ring-2 ring-sky-500 ring-offset-1 border-white/60 shadow-xs'
                            : 'border-slate-300/60'
                        }`}
                        style={{ backgroundColor: swatch.hex }}
                        title={`${swatch.name} (${swatch.hex})`}
                      >
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

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
              <span className="hidden sm:inline">{t('exportGLB')}</span>
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
          <span className="hidden sm:inline">{t('screenshotPNG')}</span>
        </button>

        <button
          onClick={() => applyCameraPreset('iso')}
          className="p-2 bg-white/95 hover:bg-white text-slate-700 rounded-xl shadow-md border border-slate-200/90 transition-all hover:scale-[1.02] active:scale-95"
          title={`${t('resetCamera')} (R)`}
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
              {t('camera')}:
            </span>
            <button
              onClick={() => applyCameraPreset('iso')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                activeCamPreset === 'iso'
                  ? 'bg-white text-sky-800 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('isometric')}
            </button>
            <button
              onClick={() => applyCameraPreset('top')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                activeCamPreset === 'top'
                  ? 'bg-white text-sky-800 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('topDown')}
            </button>
            <button
              onClick={() => applyCameraPreset('eye')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                activeCamPreset === 'eye'
                  ? 'bg-white text-sky-800 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('eyeLevel')}
            </button>
            <button
              onClick={() => applyCameraPreset('front')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                activeCamPreset === 'front'
                  ? 'bg-white text-sky-800 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('elevation')}
            </button>
          </div>

          {/* Wall Height Adjustment */}
          <div className="flex items-center gap-2 bg-slate-100/80 px-2.5 py-1.5 rounded-xl border border-slate-200/70">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-600">{t('wallHeight')}:</span>
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
            <span>{t('cutaway')}</span>
          </button>

          {/* Sun / Lighting Presets */}
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/70">
            <button
              onClick={() => {
                setLighting('noon');
                setCurrentBgColor('#f1f5f9');
              }}
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
              onClick={() => {
                setLighting('sunset');
                setCurrentBgColor('#fde68a');
              }}
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
              onClick={() => {
                setLighting('night');
                setCurrentBgColor('#0f172a');
              }}
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
            <span>{t('orbit')}</span>
          </button>

          {/* Quick Import 3D Model in Dock */}
          <button
            onClick={() => setIsGLBModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 text-sky-800 hover:bg-sky-100 rounded-xl border border-sky-200 font-semibold transition-all shadow-2xs"
            title="Import .glb / .gltf 3D model or architectural props"
          >
            <Plus className="w-3.5 h-3.5 text-sky-600" />
            <span>{t('addModel')}</span>
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
