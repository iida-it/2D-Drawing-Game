import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GLBLoadResult {
  model: THREE.Group;
  stats: {
    totalVertices: number;
    totalFaces: number;
    size: THREE.Vector3;
    originalName: string;
  };
}

/**
 * 3. Automatically normalize the loaded model:
 * - Compute bounding box using THREE.Box3.
 * - Center its position and place the bottom base on ground level (y = 0).
 * - Enable castShadow and receiveShadow on all child meshes.
 */
export function normalizeLoadedModel(rootObject: THREE.Object3D, modelName: string = 'ImportedModel'): {
  container: THREE.Group;
  stats: {
    totalVertices: number;
    totalFaces: number;
    size: THREE.Vector3;
  };
} {
  const container = new THREE.Group();
  container.name = modelName;

  // Compute bounding box
  const box = new THREE.Box3().setFromObject(rootObject);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Center horizontally (X, Z) and place bottom at y = 0
  rootObject.position.x -= center.x;
  rootObject.position.z -= center.z;
  rootObject.position.y -= box.min.y;

  // Enable shadow casting and receiving on all child meshes
  let totalVertices = 0;
  let totalFaces = 0;

  rootObject.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (mesh.geometry) {
        const pos = mesh.geometry.getAttribute('position');
        if (pos) totalVertices += pos.count;
        if (mesh.geometry.index) {
          totalFaces += mesh.geometry.index.count / 3;
        } else if (pos) {
          totalFaces += pos.count / 3;
        }
      }
    }
  });

  container.add(rootObject);

  return {
    container,
    stats: {
      totalVertices,
      totalFaces: Math.round(totalFaces),
      size,
    },
  };
}

/**
 * 2. Accept .glb and .gltf files, read using URL.createObjectURL(file), and parse with GLTFLoader.
 */
export function loadGLBFromFile(file: File): Promise<GLBLoadResult> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided for GLB/GLTF loading.'));
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'glb' && extension !== 'gltf') {
      reject(new Error(`Unsupported file type ".${extension}". Please upload a .glb or .gltf 3D model file.`));
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    const loader = new GLTFLoader();

    loader.load(
      blobUrl,
      (gltf) => {
        URL.revokeObjectURL(blobUrl);

        try {
          const rawScene = gltf.scene || gltf.scenes[0];
          if (!rawScene) {
            reject(new Error('GLTF file did not contain a valid 3D scene or mesh hierarchy.'));
            return;
          }

          const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          const { container, stats } = normalizeLoadedModel(rawScene, cleanName);

          resolve({
            model: container,
            stats: {
              ...stats,
              originalName: file.name,
            },
          });
        } catch (err: any) {
          reject(new Error(`Failed to normalize 3D model: ${err.message}`));
        }
      },
      undefined,
      (error: unknown) => {
        URL.revokeObjectURL(blobUrl);
        console.error('GLTFLoader parsing error:', error);
        const errMsg = error instanceof Error ? error.message : (error as any)?.message;
        reject(new Error(errMsg || 'Failed to parse binary .glb/.gltf file. Ensure it is a valid 3D model.'));
      }
    );
  });
}

/**
 * Procedural architectural furniture models for instant 1-click testing
 */
export function createArchitecturalProp(type: 'armchair' | 'table' | 'plant' | 'lamp'): {
  container: THREE.Group;
  stats: { totalVertices: number; totalFaces: number; size: THREE.Vector3 };
} {
  const root = new THREE.Group();

  if (type === 'armchair') {
    root.name = 'Modern_Armchair';
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.4 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.8 });

    // Seat cushion
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.75), cushionMat);
    seat.position.y = 0.45;
    root.add(seat);

    // Backrest
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.14), cushionMat);
    back.position.set(0, 0.75, -0.32);
    root.add(back);

    // 4 Brass tapered legs
    const legGeom = new THREE.CylinderGeometry(0.018, 0.012, 0.4, 12);
    const legOffsets = [
      [-0.34, -0.28],
      [0.34, -0.28],
      [-0.34, 0.28],
      [0.34, 0.28],
    ];
    legOffsets.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeom, brassMat);
      leg.position.set(lx, 0.2, lz);
      root.add(leg);
    });
  } else if (type === 'table') {
    root.name = 'Oak_Dining_Table';
    const oakMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.5 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 });

    // Table top
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.9), oakMat);
    top.position.y = 0.75;
    root.add(top);

    // Trestle legs
    const legGeom = new THREE.BoxGeometry(0.08, 0.72, 0.7);
    const leg1 = new THREE.Mesh(legGeom, metalMat);
    leg1.position.set(-0.6, 0.36, 0);
    const leg2 = new THREE.Mesh(legGeom, metalMat);
    leg2.position.set(0.6, 0.36, 0);
    root.add(leg1);
    root.add(leg2);
  } else if (type === 'plant') {
    root.name = 'Potted_Fiddle_Leaf';
    const potMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 });
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.9 });

    // Ceramic pot
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.45, 24), potMat);
    pot.position.y = 0.225;
    root.add(pot);

    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.05, 24), soilMat);
    soil.position.y = 0.43;
    root.add(soil);

    // Plant stem and leaves
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.8, 12), leafMat);
    stem.position.y = 0.8;
    root.add(stem);

    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 5), leafMat);
      leaf.position.set(Math.cos(angle) * 0.18, 0.6 + i * 0.08, Math.sin(angle) * 0.18);
      leaf.rotation.x = 0.4;
      leaf.rotation.y = angle;
      root.add(leaf);
    }
  } else {
    root.name = 'Designer_Floor_Lamp';
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.2, metalness: 0.1 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 });
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.3, emissive: 0xfef08a, emissiveIntensity: 0.2 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 24), baseMat);
    base.position.y = 0.03;
    root.add(base);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.6, 12), brassMat);
    pole.position.y = 0.83;
    root.add(pole);

    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.32, 24, 1, true), shadeMat);
    shade.position.y = 1.65;
    root.add(shade);
  }

  return normalizeLoadedModel(root, root.name);
}
