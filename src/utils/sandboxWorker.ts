import * as THREE from 'three';

// Block all network and storage APIs in the worker
try {
  (self as any).fetch = undefined;
  (self as any).XMLHttpRequest = undefined;
  (self as any).WebSocket = undefined;
  (self as any).EventSource = undefined;
  (self as any).indexedDB = undefined;
} catch {
  // Ignore
}

self.onmessage = (e: MessageEvent) => {
  const { jsCode } = e.data;

  try {
    // Create mock scene context
    const mockScene = new THREE.Scene();
    mockScene.name = 'MockSceneContext';

    // Create sandbox scope
    const moduleExports: Record<string, any> = {};
    const moduleObj = { exports: moduleExports };

    // Function wrapper providing mock context and Three.js
    // Checks multiple output conventions:
    // 1. Direct 'return object'
    // 2. Auto-invoking exported functions ('export default function()', 'exports.default', or module.exports)
    // 3. Extracting meshes added via 'scene.add(mesh)'
    const sandboxFunc = new Function(
      'THREE',
      'scene',
      'require',
      'exports',
      'module',
      `"use strict";
      // Expose common Three.js primitives directly into scope
      const {
        Group,
        Mesh,
        BufferGeometry,
        BoxGeometry,
        SphereGeometry,
        CylinderGeometry,
        TorusGeometry,
        TorusKnotGeometry,
        PlaneGeometry,
        ConeGeometry,
        RingGeometry,
        ExtrudeGeometry,
        ShapeGeometry,
        Shape,
        Path,
        Vector2,
        Vector3,
        Matrix4,
        Euler,
        Quaternion,
        Color,
        MeshStandardMaterial,
        MeshPhysicalMaterial,
        MeshBasicMaterial,
        MeshLambertMaterial,
        DoubleSide,
        FrontSide,
        BackSide
      } = THREE;

      var __defaultExport = undefined;

      // 1. Execute user script. If script executes top-level 'return object', it returns immediately!
      ${jsCode};

      // 2. Output Convention: Export default function / assignment
      if (typeof __defaultExport === 'function') {
        return __defaultExport(THREE, scene);
      }
      if (__defaultExport !== undefined) {
        return __defaultExport;
      }

      // Check CommonJS-style export (exports.default / module.exports)
      if (typeof exports.default === 'function') {
        return exports.default(THREE, scene);
      }
      if (exports.default !== undefined) {
        return exports.default;
      }
      if (typeof exports.createModel === 'function') {
        return exports.createModel(THREE, scene);
      }
      if (typeof module.exports === 'function') {
        return module.exports(THREE, scene);
      }
      if (module.exports && module.exports !== exports) {
        return module.exports;
      }

      // Check common declared functions (createModel, createScene, createMesh)
      if (typeof createModel === 'function') {
        return createModel(THREE, scene);
      }
      if (typeof createScene === 'function') {
        return createScene(THREE, scene);
      }
      if (typeof createMesh === 'function') {
        return createMesh(THREE, scene);
      }

      // 3. Output Convention: If script called 'scene.add(mesh)', extract from scene
      if (scene && scene.children && scene.children.length > 0) {
        if (scene.children.length === 1) {
          return scene.children[0];
        }
        const sceneGroup = new THREE.Group();
        sceneGroup.name = "SceneExportedGroup";
        while (scene.children.length > 0) {
          sceneGroup.add(scene.children[0]);
        }
        return sceneGroup;
      }

      return null;`
    );

    const mockRequire = (id: string) => {
      if (id === 'three') return THREE;
      throw new Error(`External module "${id}" cannot be imported in secure sandbox.`);
    };

    const result = sandboxFunc(THREE, mockScene, mockRequire, moduleExports, moduleObj);

    let exportableObject: THREE.Object3D | null = null;

    if (result instanceof THREE.Object3D) {
      exportableObject = result;
    } else if (result instanceof THREE.BufferGeometry) {
      // Wrap bare geometry in standard material mesh
      const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.4,
        metalness: 0.2,
      });
      exportableObject = new THREE.Mesh(result, defaultMaterial);
    } else if (mockScene && mockScene.children.length > 0) {
      if (mockScene.children.length === 1) {
        exportableObject = mockScene.children[0];
      } else {
        const group = new THREE.Group();
        group.name = 'MockSceneGroup';
        while (mockScene.children.length > 0) {
          group.add(mockScene.children[0]);
        }
        exportableObject = group;
      }
    }

    // 3. If no mesh or group is produced, display a clear, friendly error prompt
    if (!exportableObject) {
      throw new Error(
        "No 3D model produced. Please either return a THREE.Mesh or THREE.Group (e.g. 'return myGroup;'), export a function (e.g. 'export default function() { return myGroup; }'), or call 'scene.add(mesh);' in your procedural script."
      );
    }

    // Serialize object to JSON for postMessage transfer
    const serialized = exportableObject.toJSON();

    // Compute basic geometry stats
    let totalVertices = 0;
    let totalFaces = 0;
    exportableObject.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const geom = (child as THREE.Mesh).geometry;
        if (geom) {
          const pos = geom.getAttribute('position');
          if (pos) totalVertices += pos.count;
          if (geom.index) totalFaces += geom.index.count / 3;
          else if (pos) totalFaces += pos.count / 3;
        }
      }
    });

    self.postMessage({
      type: 'SUCCESS',
      payload: serialized,
      stats: {
        totalVertices,
        totalFaces: Math.round(totalFaces),
      },
    });
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      error: err.message || String(err),
      stack: err.stack,
    });
  }
};
