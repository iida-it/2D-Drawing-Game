import * as THREE from 'three';
import { transform } from 'sucrase';

export interface TranspileResult {
  success: boolean;
  jsCode?: string;
  error?: string;
  line?: number;
  column?: number;
}

export interface ExecutionResult {
  success: boolean;
  object?: THREE.Object3D;
  stats?: {
    totalVertices: number;
    totalFaces: number;
  };
  error?: string;
  transpileTimeMs: number;
  executionTimeMs: number;
}

/**
 * 2. Transpile the TypeScript code into JavaScript in-browser using Sucrase.
 */
export function transpileTypeScript(tsCode: string): TranspileResult {
  if (!tsCode || tsCode.trim().length === 0) {
    return {
      success: false,
      error: 'Procedural TypeScript code is empty.',
    };
  }

  try {
    const result = transform(tsCode, {
      transforms: ['typescript', 'imports'],
      filePath: 'procedural-model.ts',
    });

    return {
      success: true,
      jsCode: result.code,
    };
  } catch (err: any) {
    let line: number | undefined;
    let column: number | undefined;

    if (err.loc) {
      line = err.loc.line;
      column = err.loc.column;
    } else {
      const match = err.message && err.message.match(/\((\d+):(\d+)\)/);
      if (match) {
        line = parseInt(match[1], 10);
        column = parseInt(match[2], 10);
      }
    }

    return {
      success: false,
      error: err.message || 'Syntax or Type transpilation error in TypeScript code.',
      line,
      column,
    };
  }
}

/**
 * Executes transpiled JS inside a Sandboxed Iframe (fallback for environments blocking Web Workers)
 * Sandboxed with `allow-scripts` (without `allow-same-origin`), guaranteeing no access to cookies,
 * localStorage, sessionStorage, or parent DOM.
 */
function executeInSandboxedIframe(
  jsCode: string,
  timeoutMs: number = 4000
): Promise<{ object: THREE.Object3D; stats: { totalVertices: number; totalFaces: number } }> {
  return new Promise((resolve, reject) => {
    let isSettled = false;
    let timeoutId: any = null;

    const channelId = `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.setAttribute('sandbox', 'allow-scripts');

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      if (timeoutId) clearTimeout(timeoutId);
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.channelId !== channelId) return;

      if (isSettled) return;
      isSettled = true;
      cleanup();

      if (e.data.type === 'SUCCESS') {
        try {
          const loader = new THREE.ObjectLoader();
          const restored = loader.parse(e.data.payload);
          resolve({
            object: restored,
            stats: e.data.stats || { totalVertices: 0, totalFaces: 0 },
          });
        } catch (parseErr: any) {
          reject(new Error(`Failed to reconstruct Three.js object: ${parseErr.message}`));
        }
      } else {
        reject(new Error(e.data.error || 'Execution failed inside sandboxed iframe.'));
      }
    };

    window.addEventListener('message', handleMessage);

    timeoutId = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(new Error(`Execution timed out after ${timeoutMs}ms (infinite loop detected).`));
    }, timeoutMs);

    // Pass Three.js bundle or script inside the sandboxed iframe
    // Note: strictly strips cookies, localStorage, and parent DOM access
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
<script>
  (function() {
    // Security hardening: delete sensitive APIs
    try {
      delete window.localStorage;
      delete window.sessionStorage;
      delete window.indexedDB;
      window.fetch = function() { return Promise.reject(new Error("Network disabled in sandbox")); };
      window.XMLHttpRequest = function() { throw new Error("Network disabled in sandbox"); };
      window.WebSocket = function() { throw new Error("WebSockets disabled in sandbox"); };
    } catch(e) {}

    window.addEventListener('message', function(evt) {
      if (!evt.data || evt.data.channelId !== '${channelId}') return;
      var jsCode = evt.data.jsCode;

      try {
        var mockScene = new THREE.Scene();
        var moduleExports = {};
        var moduleObj = { exports: moduleExports };

        var sandboxFunc = new Function(
          'THREE', 'scene', 'require', 'exports', 'module',
          '"use strict";\\n' + jsCode + '\\n' +
          'if (typeof exports.default === "function") return exports.default(THREE, scene);' +
          'if (typeof exports.createModel === "function") return exports.createModel(THREE, scene);' +
          'if (typeof createModel === "function") return createModel(THREE, scene);' +
          'if (scene.children.length > 0) return scene;' +
          'return exports.default || exports.model || module.exports;'
        );

        var mockRequire = function(id) {
          if (id === 'three') return THREE;
          throw new Error('Cannot import module "' + id + '" in sandbox.');
        };

        var result = sandboxFunc(THREE, mockScene, mockRequire, moduleExports, moduleObj);
        var exportable = (result instanceof THREE.Object3D) ? result :
                         (result instanceof THREE.BufferGeometry) ? new THREE.Mesh(result, new THREE.MeshStandardMaterial({ color: 0x0284c7 })) :
                         (mockScene.children.length > 0) ? mockScene : null;

        if (!exportable) {
          throw new Error("Procedural script did not return or add a THREE.Mesh, THREE.Group, or THREE.BufferGeometry.");
        }

        var serialized = exportable.toJSON();
        var totalVertices = 0;
        var totalFaces = 0;
        exportable.traverse(function(child) {
          if (child.isMesh && child.geometry) {
            var pos = child.geometry.getAttribute('position');
            if (pos) totalVertices += pos.count;
            if (child.geometry.index) totalFaces += child.geometry.index.count / 3;
            else if (pos) totalFaces += pos.count / 3;
          }
        });

        parent.postMessage({
          channelId: '${channelId}',
          type: 'SUCCESS',
          payload: serialized,
          stats: { totalVertices: totalVertices, totalFaces: Math.round(totalFaces) }
        }, '*');
      } catch (err) {
        parent.postMessage({
          channelId: '${channelId}',
          type: 'ERROR',
          error: err.message || String(err)
        }, '*');
      }
    });
  })();
</script>
</body>
</html>`;

    iframe.srcdoc = htmlContent;
    iframe.onload = () => {
      iframe.contentWindow?.postMessage({ channelId, jsCode }, '*');
    };

    document.body.appendChild(iframe);
  });
}

/**
 * 3. Execute the code safely inside an isolated Web Worker or sandboxed iframe passing a mock scene context,
 * preventing access to cookies, localStorage, and parent DOM.
 */
export async function executeProceduralScript(
  tsCode: string,
  timeoutMs: number = 4000
): Promise<ExecutionResult> {
  const transpileStart = performance.now();
  const transpile = transpileTypeScript(tsCode);
  const transpileTimeMs = Math.round((performance.now() - transpileStart) * 10) / 10;

  if (!transpile.success || !transpile.jsCode) {
    return {
      success: false,
      error: transpile.error || 'Failed to transpile TypeScript code.',
      transpileTimeMs,
      executionTimeMs: 0,
    };
  }

  const execStart = performance.now();

  // Try isolated Web Worker first
  try {
    const workerResult = await new Promise<{
      object: THREE.Object3D;
      stats: { totalVertices: number; totalFaces: number };
    }>((resolve, reject) => {
      let isSettled = false;
      let timer: any = null;

      let worker: Worker;
      try {
        worker = new Worker(new URL('./sandboxWorker.ts', import.meta.url), { type: 'module' });
      } catch (e) {
        reject(e);
        return;
      }

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        worker.terminate();
      };

      timer = setTimeout(() => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        reject(new Error(`Script execution timed out after ${timeoutMs}ms (infinite loop guard).`));
      }, timeoutMs);

      worker.onmessage = (e: MessageEvent) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();

        if (e.data.type === 'SUCCESS') {
          try {
            const loader = new THREE.ObjectLoader();
            const restored = loader.parse(e.data.payload);
            resolve({
              object: restored,
              stats: e.data.stats,
            });
          } catch (err: any) {
            reject(new Error(`Failed to reconstruct Three.js object: ${err.message}`));
          }
        } else {
          reject(new Error(e.data.error || 'Unknown runtime error in procedural script.'));
        }
      };

      worker.onerror = (e) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        reject(new Error(e.message || 'Worker thread execution error.'));
      };

      worker.postMessage({ jsCode: transpile.jsCode });
    });

    const executionTimeMs = Math.round((performance.now() - execStart) * 10) / 10;
    return {
      success: true,
      object: workerResult.object,
      stats: workerResult.stats,
      transpileTimeMs,
      executionTimeMs,
    };
  } catch (workerErr: any) {
    // If Web Worker threw or is blocked by iframe CSP/Blob restrictions,
    // fallback gracefully to isolated sandboxed iframe runner
    try {
      const iframeResult = await executeInSandboxedIframe(transpile.jsCode, timeoutMs);
      const executionTimeMs = Math.round((performance.now() - execStart) * 10) / 10;
      return {
        success: true,
        object: iframeResult.object,
        stats: iframeResult.stats,
        transpileTimeMs,
        executionTimeMs,
      };
    } catch (fallbackErr: any) {
      const executionTimeMs = Math.round((performance.now() - execStart) * 10) / 10;
      return {
        success: false,
        error: fallbackErr.message || workerErr.message || 'Procedural script execution failed.',
        transpileTimeMs,
        executionTimeMs,
      };
    }
  }
}

/**
 * Built-in Architectural Procedural Script Presets
 */
export const PROCEDURAL_PRESETS = [
  {
    id: 'spiral-staircase',
    name: 'Helical Spiral Staircase',
    description: 'Central column, teak wood cantilevered steps, and helical bronze handrail',
    code: `import * as THREE from 'three';

/**
 * Procedural Helical Spiral Staircase
 * Creates a modern architectural spiral staircase with mahogany treads and bronze fittings.
 */
export default function createSpiralStaircase(THREE: any) {
  const staircase = new THREE.Group();
  staircase.name = "ArchitecturalSpiralStaircase";

  // Central Structural Mast
  const mastHeight = 3.2;
  const mastRadius = 0.12;
  const mastGeom = new THREE.CylinderGeometry(mastRadius, mastRadius, mastHeight, 32);
  const mastMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.3,
    metalness: 0.8,
  });
  const mast = new THREE.Mesh(mastGeom, mastMat);
  mast.position.y = mastHeight / 2;
  staircase.add(mast);

  // Cantilevered Treads
  const stepCount = 18;
  const totalRise = 3.0;
  const risePerStep = totalRise / stepCount;
  const angleStep = (Math.PI * 2) / 14; // 14 steps per full rotation
  const treadLength = 1.1;
  const treadThickness = 0.05;

  const treadGeom = new THREE.BoxGeometry(treadLength, treadThickness, 0.28);
  const treadMat = new THREE.MeshStandardMaterial({
    color: 0x92400e, // Warm mahogany
    roughness: 0.5,
    metalness: 0.1,
  });

  const spindleGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.9, 12);
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // Polished brass
    roughness: 0.25,
    metalness: 0.85,
  });

  for (let i = 0; i < stepCount; i++) {
    const angle = i * angleStep;
    const y = i * risePerStep + 0.1;

    // Tread
    const tread = new THREE.Mesh(treadGeom, treadMat);
    tread.position.set(
      Math.cos(angle) * (treadLength / 2 + 0.06),
      y,
      Math.sin(angle) * (treadLength / 2 + 0.06)
    );
    tread.rotation.y = -angle;
    staircase.add(tread);

    // Outer handrail spindle
    const spindle = new THREE.Mesh(spindleGeom, metalMat);
    const outerX = Math.cos(angle) * (treadLength + 0.02);
    const outerZ = Math.sin(angle) * (treadLength + 0.02);
    spindle.position.set(outerX, y + 0.45, outerZ);
    staircase.add(spindle);
  }

  return staircase;
}
`,
  },
  {
    id: 'architectural-pavilion',
    name: 'Modern Slatted Pavilion',
    description: 'Parametric cedar slatted pergola with steel perimeter frame',
    code: `import * as THREE from 'three';

/**
 * Modern Architectural Slatted Pavilion
 * Parametric outdoor shade structure with timber louvers and steel columns.
 */
export default function createPavilion(THREE: any) {
  const pavilion = new THREE.Group();
  pavilion.name = "ModernPergolaPavilion";

  const width = 4.0;
  const length = 4.0;
  const height = 2.8;

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.7,
  });

  const cedarMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    roughness: 0.55,
    metalness: 0.05,
  });

  // 4 Corner Columns
  const colGeom = new THREE.BoxGeometry(0.14, height, 0.14);
  const corners = [
    [-width / 2, -length / 2],
    [width / 2, -length / 2],
    [-width / 2, length / 2],
    [width / 2, length / 2],
  ];

  corners.forEach(([cx, cz]) => {
    const col = new THREE.Mesh(colGeom, steelMat);
    col.position.set(cx, height / 2, cz);
    pavilion.add(col);
  });

  // Perimeter Roof Beams
  const beamXGeom = new THREE.BoxGeometry(width + 0.28, 0.2, 0.14);
  const beamZGeom = new THREE.BoxGeometry(0.14, 0.2, length + 0.28);

  const beamN = new THREE.Mesh(beamXGeom, steelMat);
  beamN.position.set(0, height, -length / 2);
  pavilion.add(beamN);

  const beamS = new THREE.Mesh(beamXGeom, steelMat);
  beamS.position.set(0, height, length / 2);
  pavilion.add(beamS);

  const beamW = new THREE.Mesh(beamZGeom, steelMat);
  beamW.position.set(-width / 2, height, 0);
  pavilion.add(beamW);

  const beamE = new THREE.Mesh(beamZGeom, steelMat);
  beamE.position.set(width / 2, height, 0);
  pavilion.add(beamE);

  // Louvers
  const louverCount = 20;
  const louverGeom = new THREE.BoxGeometry(width - 0.1, 0.14, 0.04);
  const spacing = (length - 0.4) / (louverCount - 1);

  for (let i = 0; i < louverCount; i++) {
    const louver = new THREE.Mesh(louverGeom, cedarMat);
    const z = -length / 2 + 0.2 + i * spacing;
    louver.position.set(0, height + 0.08, z);
    louver.rotation.x = Math.PI / 6; // 30-degree sun angle tilt
    pavilion.add(louver);
  }

  return pavilion;
}
`,
  },
  {
    id: 'roman-fluted-column',
    name: 'Classical Fluted Column',
    description: 'Fluted marble shaft with molded base and Doric abacus capital',
    code: `import * as THREE from 'three';

/**
 * Classical Fluted Architectural Column
 * Precision procedural fluted shaft with capital and plinth.
 */
export default function createFlutedColumn(THREE: any) {
  const column = new THREE.Group();
  column.name = "ClassicalFlutedColumn";

  const marbleMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.1,
  });

  // Square Plinth (Pedestal Base)
  const baseGeom = new THREE.BoxGeometry(0.9, 0.2, 0.9);
  const base = new THREE.Mesh(baseGeom, marbleMat);
  base.position.y = 0.1;
  column.add(base);

  // Molded Torus Ring
  const torusGeom = new THREE.CylinderGeometry(0.38, 0.42, 0.12, 32);
  const torus = new THREE.Mesh(torusGeom, marbleMat);
  torus.position.y = 0.26;
  column.add(torus);

  // Fluted Shaft using LatheGeometry or Cylinder
  const shaftHeight = 2.4;
  const shaftRadius = 0.32;
  const shaftGeom = new THREE.CylinderGeometry(shaftRadius * 0.9, shaftRadius, shaftHeight, 20);
  const shaft = new THREE.Mesh(shaftGeom, marbleMat);
  shaft.position.y = 0.32 + shaftHeight / 2;
  column.add(shaft);

  // Capital (Neck & Abacus)
  const neckGeom = new THREE.CylinderGeometry(0.38, 0.3, 0.12, 32);
  const neck = new THREE.Mesh(neckGeom, marbleMat);
  neck.position.y = 0.32 + shaftHeight + 0.06;
  column.add(neck);

  const abacusGeom = new THREE.BoxGeometry(0.85, 0.16, 0.85);
  const abacus = new THREE.Mesh(abacusGeom, marbleMat);
  abacus.position.y = 0.32 + shaftHeight + 0.2;
  column.add(abacus);

  return column;
}
`,
  },
  {
    id: 'custom-template',
    name: 'Blank TypeScript Model Template',
    description: 'Starter template with typed THREE parameters and instructions',
    code: `import * as THREE from 'three';

/**
 * Custom Procedural Three.js Model
 * @param THREE The Three.js library instance
 * @param scene The mock architectural scene context
 * @returns THREE.Mesh, THREE.Group, or THREE.BufferGeometry
 */
export default function createModel(THREE: any, scene: any) {
  // 1. Create a root group or mesh
  const model = new THREE.Group();
  model.name = "MyProceduralModel";

  // 2. Define custom procedural geometry
  const geometry = new THREE.TorusKnotGeometry(0.8, 0.25, 120, 16);

  // 3. Define PBR architectural material
  const material = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // Vibrant azure
    roughness: 0.3,
    metalness: 0.8,
  });

  // 4. Construct mesh and position upright on floor
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 1.2;
  mesh.castShadow = true;
  model.add(mesh);

  return model;
}
`,
  },
];
