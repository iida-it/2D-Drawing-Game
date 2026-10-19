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
    // Strict isolation: no global scope access
    const sandboxFunc = new Function(
      'THREE',
      'scene',
      'require',
      'exports',
      'module',
      `"use strict";
      ${jsCode};
      if (typeof exports.default === 'function') {
        return exports.default(THREE, scene);
      }
      if (typeof exports.createModel === 'function') {
        return exports.createModel(THREE, scene);
      }
      if (typeof createModel === 'function') {
        return createModel(THREE, scene);
      }
      if (module.exports && module.exports !== exports && typeof module.exports === 'function') {
        return module.exports(THREE, scene);
      }
      if (scene.children.length > 0) {
        return scene;
      }
      return exports.default || exports.model || module.exports;`
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
      // Wrap bare geometry in standard mesh
      const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.4,
        metalness: 0.2,
      });
      exportableObject = new THREE.Mesh(result, defaultMaterial);
    } else if (mockScene.children.length > 0) {
      exportableObject = mockScene;
    }

    if (!exportableObject) {
      throw new Error(
        'The procedural script did not return or add a THREE.Mesh, THREE.Group, or THREE.BufferGeometry.'
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
