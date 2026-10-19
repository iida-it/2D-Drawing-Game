import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface GLBExportOptions {
  filename?: string;
  binary?: boolean;
  optimize?: boolean;
  includeGround?: boolean;
}

/**
 * Optimizes geometry data before exporting by grouping non-moving meshes sharing
 * the same material and merging their geometries using BufferGeometryUtils.mergeGeometries.
 * This drastically reduces draw calls, simplifies node hierarchy in the GLTF tree,
 * and ensures minimal file size and fast loading.
 */
export function optimizeSceneForExport(
  source: THREE.Scene | THREE.Object3D,
  includeGround: boolean = true
): THREE.Scene {
  const exportScene = new THREE.Scene();
  exportScene.name = 'ExportScene';

  // Ensure all world matrices are up-to-date
  source.updateMatrixWorld(true);

  // Group meshes by their primary material UUID
  const materialMeshMap = new Map<
    string,
    {
      material: THREE.Material;
      meshes: THREE.Mesh[];
    }
  >();

  const standaloneMeshes: THREE.Mesh[] = [];

  source.traverse((child) => {
    // Only export meshes (skip cameras, lights, helpers)
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (!mesh.visible) return;

      // Optionally skip ground plane if user doesn't want the foundation pad in GLB
      if (!includeGround && mesh.name.includes('GroundPlate')) {
        return;
      }

      // Handle multi-material or single material
      if (Array.isArray(mesh.material)) {
        standaloneMeshes.push(mesh);
      } else if (mesh.material) {
        const mat = mesh.material;
        const key = mat.uuid;
        if (!materialMeshMap.has(key)) {
          materialMeshMap.set(key, { material: mat, meshes: [] });
        }
        materialMeshMap.get(key)!.meshes.push(mesh);
      } else {
        standaloneMeshes.push(mesh);
      }
    }
  });

  // Merge meshes sharing identical materials
  materialMeshMap.forEach(({ material, meshes }, matKey) => {
    if (meshes.length === 1) {
      // Single mesh: clone geometry with baked world matrix
      const m = meshes[0];
      const geom = m.geometry.clone();
      geom.applyMatrix4(m.matrixWorld);
      const clonedMesh = new THREE.Mesh(geom, material);
      clonedMesh.name = m.name || `Mesh_${matKey.slice(0, 6)}`;
      exportScene.add(clonedMesh);
      return;
    }

    // Multiple meshes: optimize via BufferGeometryUtils.mergeGeometries
    const preparedGeometries: THREE.BufferGeometry[] = [];

    // Determine if all geometries should be indexed or non-indexed for compatibility
    let hasNonIndexed = false;
    let hasIndexed = false;

    for (const m of meshes) {
      if (m.geometry.index !== null) hasIndexed = true;
      else hasNonIndexed = true;
    }

    const standardizeToIndexed = hasIndexed;

    for (const m of meshes) {
      let g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);

      // Ensure normal attribute exists
      if (!g.getAttribute('normal')) {
        g.computeVertexNormals();
      }

      // Standardize index attribute across all geometries in this merge group
      if (standardizeToIndexed && g.index === null) {
        // Convert non-indexed geometry to indexed
        const count = g.getAttribute('position').count;
        const indices = new Uint32Array(count);
        for (let i = 0; i < count; i++) indices[i] = i;
        g.setIndex(new THREE.BufferAttribute(indices, 1));
      } else if (!standardizeToIndexed && g.index !== null) {
        g = g.toNonIndexed();
      }

      // Ensure standard attributes only for clean merge
      const cleanGeom = new THREE.BufferGeometry();
      cleanGeom.setAttribute('position', g.getAttribute('position'));
      if (g.getAttribute('normal')) {
        cleanGeom.setAttribute('normal', g.getAttribute('normal'));
      }
      if (g.getAttribute('uv')) {
        cleanGeom.setAttribute('uv', g.getAttribute('uv'));
      }
      if (g.index) {
        cleanGeom.setIndex(g.index);
      }

      preparedGeometries.push(cleanGeom);
    }

    let mergedGeometry: THREE.BufferGeometry | null = null;
    try {
      mergedGeometry = BufferGeometryUtils.mergeGeometries(preparedGeometries, false);
    } catch {
      mergedGeometry = null;
    }

    if (mergedGeometry) {
      const mergedMesh = new THREE.Mesh(mergedGeometry, material);
      mergedMesh.name = `Merged_${material.name || 'Meshes'}_${preparedGeometries.length}parts`;
      exportScene.add(mergedMesh);
    } else {
      // Fallback: add individual geometries if merge was not possible
      preparedGeometries.forEach((geom, idx) => {
        const fallbackMesh = new THREE.Mesh(geom, material);
        fallbackMesh.name = `Mesh_Fallback_${idx}`;
        exportScene.add(fallbackMesh);
      });
    }
  });

  // Add standalone or multi-material meshes
  standaloneMeshes.forEach((m) => {
    const geom = m.geometry.clone();
    geom.applyMatrix4(m.matrixWorld);
    const clonedMesh = new THREE.Mesh(geom, m.material);
    clonedMesh.name = m.name;
    exportScene.add(clonedMesh);
  });

  return exportScene;
}

/**
 * 2. Create an 'exportSceneToGLB(scene: THREE.Scene)' function that exports
 * the generated 3D room and meshes into a binary .glb Blob.
 * 3. Automatically trigger a browser download for the generated .glb file.
 * 4. Optimize geometry data before exporting (merge non-moving meshes using BufferGeometryUtils.mergeGeometries).
 */
export function exportSceneToGLB(
  scene: THREE.Scene | THREE.Object3D,
  filename: string = 'architectural-blueprint-model.glb'
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      // 4. Optimize geometry data before exporting
      const optimizedScene = optimizeSceneForExport(scene, true);

      // 1. Import and instantiate GLTFExporter
      const exporter = new GLTFExporter();

      // Configure export options for clean binary .glb
      const options = {
        binary: true,
        onlyVisible: true,
        embedImages: true,
        includeCustomExtensions: false,
      };

      // 2. Export into a binary .glb Blob (non-blocking callback)
      exporter.parse(
        optimizedScene,
        (gltf) => {
          try {
            // In binary mode, GLTFExporter returns an ArrayBuffer
            const buffer = gltf as ArrayBuffer;
            const blob = new Blob([buffer], { type: 'model/gltf-binary' });

            // 3. Automatically trigger a browser download for the generated .glb file
            const cleanFilename = filename.toLowerCase().endsWith('.glb')
              ? filename
              : `${filename}.glb`;

            const blobUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = blobUrl;
            downloadLink.download = cleanFilename;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

            // Clean up blob URL after download starts
            setTimeout(() => {
              URL.revokeObjectURL(blobUrl);
            }, 3000);

            // Clean up temporary geometries created in the optimized scene
            optimizedScene.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                (child as THREE.Mesh).geometry?.dispose();
              }
            });

            resolve(blob);
          } catch (err) {
            reject(err);
          }
        },
        (error) => {
          console.error('Failed to export scene to GLB:', error);
          reject(error);
        },
        options
      );
    } catch (err) {
      console.error('Exception during GLB export preparation:', err);
      reject(err);
    }
  });
}
