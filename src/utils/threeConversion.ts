import * as THREE from 'three';
import { ClosedRoom, WallOpening, Wall, Node, Point } from '../types';

export interface WallSegment2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  height: number;
}

/**
 * Procedural texture cache for high performance and zero external assets
 */
const textureCache = new Map<string, THREE.CanvasTexture>();

function createProceduralWoodTexture(isDark: boolean = false): THREE.CanvasTexture {
  const cacheKey = `wood_${isDark ? 'dark' : 'light'}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isDark ? '#3d2b1f' : '#d2b48c';
    ctx.fillRect(0, 0, 512, 512);

    // Wood grain planks
    const plankWidth = 64;
    for (let x = 0; x < 512; x += plankWidth) {
      ctx.fillStyle = isDark
        ? (x / plankWidth) % 2 === 0 ? '#433023' : '#39261a'
        : (x / plankWidth) % 2 === 0 ? '#deb887' : '#c8a679';
      ctx.fillRect(x, 0, plankWidth - 2, 512);

      // Subtle grain lines
      ctx.strokeStyle = isDark ? 'rgba(20, 10, 5, 0.15)' : 'rgba(120, 80, 40, 0.12)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 12; g++) {
        const gx = x + Math.random() * (plankWidth - 4);
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.bezierCurveTo(gx + 3, 170, gx - 3, 340, gx, 512);
        ctx.stroke();
      }
    }

    // Plank seams
    ctx.strokeStyle = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(80, 50, 20, 0.25)';
    ctx.lineWidth = 2;
    for (let x = plankWidth; x < 512; x += plankWidth) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(cacheKey, texture);
  return texture;
}

function createProceduralTileTexture(isMarble: boolean = false): THREE.CanvasTexture {
  const cacheKey = `tile_${isMarble ? 'marble' : 'ceramic'}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isMarble ? '#f3f4f6' : '#e2e8f0';
    ctx.fillRect(0, 0, 512, 512);

    const tileSize = 128;
    for (let x = 0; x < 512; x += tileSize) {
      for (let y = 0; y < 512; y += tileSize) {
        ctx.fillStyle = isMarble
          ? ((x + y) / tileSize) % 2 === 0 ? '#f8fafc' : '#f1f5f9'
          : ((x + y) / tileSize) % 2 === 0 ? '#e2e8f0' : '#cbd5e1';
        ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

        if (isMarble) {
          // Subtle marble veins
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + 10, y + 10);
          ctx.bezierCurveTo(x + 60, y + 40, x + 80, y + 100, x + 115, y + 120);
          ctx.stroke();
        }
      }
    }

    // Grout lines
    ctx.strokeStyle = isMarble ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.5)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 512; i += tileSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Architectural Materials Library
 */
export function getArchitecturalMaterials() {
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xfdfdfd,
    roughness: 0.7,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const wallCapMaterial = new THREE.MeshStandardMaterial({
    color: 0x334155, // Architectural dark slate wall cap
    roughness: 0.4,
    metalness: 0.2,
  });

  const doorWoodMaterial = new THREE.MeshStandardMaterial({
    color: 0x854d0e, // Rich teak / walnut
    roughness: 0.5,
    metalness: 0.1,
  });

  const doorHandleMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // Brass / gold handle
    roughness: 0.2,
    metalness: 0.9,
  });

  const windowFrameMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // Dark anthracite powder-coated aluminum
    roughness: 0.3,
    metalness: 0.5,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.92,
    opacity: 1,
    transparent: true,
    roughness: 0.08,
    ior: 1.52,
    thickness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });

  return {
    wallMaterial,
    wallCapMaterial,
    doorWoodMaterial,
    doorHandleMaterial,
    windowFrameMaterial,
    glassMaterial,
  };
}

/**
 * 1. Create a function 'generate3DFrom2DWalls(wallSegments: Array<{x1: number, y1: number, x2: number, y2: number, thickness: number, height: number}>)'
 * that generates 3D wall meshes.
 * 2. For each wall segment, calculate the 2D bounding polygon, create a THREE.Shape, and apply THREE.ExtrudeGeometry with the given wall height.
 */
export function generate3DFrom2DWalls(
  wallSegments: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thickness: number;
    height: number;
  }>
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'GeneratedWallsGroup';

  const { wallMaterial, wallCapMaterial } = getArchitecturalMaterials();

  for (let i = 0; i < wallSegments.length; i++) {
    const seg = wallSegments[i];
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;

    // Unit normal vector perpendicular to the wall direction
    const nx = (-dy / len) * (seg.thickness / 2);
    const ny = (dx / len) * (seg.thickness / 2);

    // 2D bounding polygon vertices
    const p1 = { x: seg.x1 + nx, y: seg.y1 + ny };
    const p2 = { x: seg.x2 + nx, y: seg.y2 + ny };
    const p3 = { x: seg.x2 - nx, y: seg.y2 - ny };
    const p4 = { x: seg.x1 - nx, y: seg.y1 - ny };

    // Create THREE.Shape representing the 2D bounding polygon
    const shape = new THREE.Shape();
    shape.moveTo(p1.x, p1.y);
    shape.lineTo(p2.x, p2.y);
    shape.lineTo(p3.x, p3.y);
    shape.lineTo(p4.x, p4.y);
    shape.closePath();

    // Apply THREE.ExtrudeGeometry with the given wall height
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: seg.height,
      bevelEnabled: false,
      curveSegments: 1,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Orient to Three.js standard Y-up coordinate system:
    // Rotate -90° on X so Extrude depth along Z becomes vertical +Y height!
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, wallMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Wall_${i}`;
    group.add(mesh);

    // Subtle architectural top cap trim
    const capShape = new THREE.Shape();
    const capThickness = seg.thickness + 0.02; // 2cm overhang
    const capNx = (-dy / len) * (capThickness / 2);
    const capNy = (dx / len) * (capThickness / 2);
    capShape.moveTo(seg.x1 + capNx, seg.y1 + capNy);
    capShape.lineTo(seg.x2 + capNx, seg.y2 + capNy);
    capShape.lineTo(seg.x2 - capNx, seg.y2 - capNy);
    capShape.lineTo(seg.x1 - capNx, seg.y1 - capNy);
    capShape.closePath();

    const capGeom = new THREE.ExtrudeGeometry(capShape, {
      depth: 0.03, // 3cm cap
      bevelEnabled: false,
    });
    capGeom.rotateX(-Math.PI / 2);
    capGeom.computeVertexNormals();
    const capMesh = new THREE.Mesh(capGeom, wallCapMaterial);
    capMesh.position.y = seg.height;
    capMesh.castShadow = true;
    capMesh.receiveShadow = true;
    group.add(capMesh);
  }

  return group;
}

/**
 * 3. Generate a floor plane automatically based on the enclosed room polygon.
 */
export function generate3DFloorFromRoomPolygon(
  roomPoints: Array<{ x: number; y: number }>,
  roomType: string = 'living',
  roomName: string = 'Room'
): THREE.Mesh {
  if (roomPoints.length < 3) {
    // Fallback plane if degenerate
    const emptyGeom = new THREE.PlaneGeometry(1, 1);
    emptyGeom.rotateX(-Math.PI / 2);
    return new THREE.Mesh(emptyGeom, new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
  }

  // Create THREE.Shape from room polygon vertices
  const floorShape = new THREE.Shape();
  floorShape.moveTo(roomPoints[0].x, roomPoints[0].y);
  for (let i = 1; i < roomPoints.length; i++) {
    floorShape.lineTo(roomPoints[i].x, roomPoints[i].y);
  }
  floorShape.closePath();

  // Extrude floor slab slightly downwards (3cm) so it grounds under walls
  const floorGeom = new THREE.ExtrudeGeometry(floorShape, {
    depth: 0.03,
    bevelEnabled: false,
  });
  floorGeom.rotateX(-Math.PI / 2);
  floorGeom.computeVertexNormals();

  // Create architectural material based on room type
  let floorMaterial: THREE.Material;
  const isDarkWood = roomType === 'office';
  const isWood = roomType === 'living' || roomType === 'dining' || roomType === 'bedroom';
  const isTile = roomType === 'kitchen' || roomType === 'bathroom';

  if (isWood) {
    const woodTex = createProceduralWoodTexture(isDarkWood);
    woodTex.repeat.set(1.5, 1.5);
    floorMaterial = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.45,
      metalness: 0.05,
    });
  } else if (isTile) {
    const tileTex = createProceduralTileTexture(roomType === 'bathroom');
    tileTex.repeat.set(2, 2);
    floorMaterial = new THREE.MeshStandardMaterial({
      map: tileTex,
      roughness: 0.3,
      metalness: 0.1,
    });
  } else {
    floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.6,
      metalness: 0.05,
    });
  }

  const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
  // Position so top of floor is exactly at y = 0
  floorMesh.position.y = -0.03;
  floorMesh.receiveShadow = true;
  floorMesh.name = `Floor_${roomName}_${roomType}`;
  return floorMesh;
}

/**
 * High-level function to generate realistic 3D architectural scene from 2D blueprint data
 * including walls with door/window openings cutouts, architectural doors with swings,
 * windows with glass frames, and automatic room floors!
 */
export function build3DArchitecturalModel({
  nodes,
  walls,
  openings,
  closedRooms,
  scaleFactor,
  wallHeightMeters = 2.8,
  wallThicknessMeters = 0.15,
}: {
  nodes: Node[];
  walls: Wall[];
  openings: WallOpening[];
  closedRooms: ClosedRoom[];
  scaleFactor: number;
  wallHeightMeters?: number;
  wallThicknessMeters?: number;
}): {
  rootGroup: THREE.Group;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; centerX: number; centerZ: number; sizeX: number; sizeZ: number };
} {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'ArchitecturalModelRoot';

  const nodeMap = new Map<string, Node>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // Determine 2D blueprint bounding box to center the 3D model at world origin (0, 0, 0)
  let minPxX = Infinity;
  let maxPxX = -Infinity;
  let minPxY = Infinity;
  let maxPxY = -Infinity;

  nodes.forEach((n) => {
    if (n.x < minPxX) minPxX = n.x;
    if (n.x > maxPxX) maxPxX = n.x;
    if (n.y < minPxY) minPxY = n.y;
    if (n.y > maxPxY) maxPxY = n.y;
  });

  if (!isFinite(minPxX)) {
    minPxX = 0;
    maxPxX = 400;
    minPxY = 0;
    maxPxY = 400;
  }

  const centerPxX = (minPxX + maxPxX) / 2;
  const centerPxY = (minPxY + maxPxY) / 2;

  // Convert pixel to centered meter coordinates
  const to3DCoords = (px: number, py: number): { x: number; z: number } => ({
    x: (px - centerPxX) * scaleFactor,
    z: (py - centerPxY) * scaleFactor,
  });

  const bounds = {
    minX: (minPxX - centerPxX) * scaleFactor,
    maxX: (maxPxX - centerPxX) * scaleFactor,
    minZ: (minPxY - centerPxY) * scaleFactor,
    maxZ: (maxPxY - centerPxY) * scaleFactor,
    centerX: 0,
    centerZ: 0,
    sizeX: Math.max(1, (maxPxX - minPxX) * scaleFactor),
    sizeZ: Math.max(1, (maxPxY - minPxY) * scaleFactor),
  };

  const {
    wallMaterial,
    wallCapMaterial,
    doorWoodMaterial,
    doorHandleMaterial,
    windowFrameMaterial,
    glassMaterial,
  } = getArchitecturalMaterials();

  const wallsGroup = new THREE.Group();
  wallsGroup.name = 'WallsAndOpenings';
  rootGroup.add(wallsGroup);

  // Convert walls to segments and cutouts for doors/windows
  walls.forEach((w) => {
    const n1 = nodeMap.get(w.startNodeId);
    const n2 = nodeMap.get(w.endNodeId);
    if (!n1 || !n2) return;

    const p1_3d = to3DCoords(n1.x, n1.y);
    const p2_3d = to3DCoords(n2.x, n2.y);

    const dx = p2_3d.x - p1_3d.x;
    const dz = p2_3d.z - p1_3d.z;
    const wallLen = Math.hypot(dx, dz);
    if (wallLen < 0.05) return;

    const thickness = w.thickness || wallThicknessMeters;
    const dirX = dx / wallLen;
    const dirZ = dz / wallLen;
    const normX = -dirZ;
    const normZ = dirX;

    // Filter openings for this wall
    const wallOps = openings.filter((o) => o.wallId === w.id);

    if (wallOps.length === 0) {
      // Solid continuous wall
      const wallSeg = {
        x1: p1_3d.x,
        y1: p1_3d.z,
        x2: p2_3d.x,
        y2: p2_3d.z,
        thickness,
        height: wallHeightMeters,
      };
      const segMeshGroup = generate3DFrom2DWalls([wallSeg]);
      wallsGroup.add(segMeshGroup);
    } else {
      // Sort openings along the wall
      const sortedOps = [...wallOps].sort((a, b) => a.positionRatio - b.positionRatio);

      // Break wall into solid segments, door openings, and window openings
      let currentDist = 0;
      const doorHeight = Math.min(2.1, wallHeightMeters - 0.2);
      const windowSillHeight = 0.9;
      const windowTopHeight = Math.min(2.1, wallHeightMeters - 0.2);

      sortedOps.forEach((op) => {
        const centerDist = op.positionRatio * wallLen;
        const halfWidth = Math.min(op.widthMeters / 2, wallLen / 2 - 0.05);
        const opStartDist = Math.max(0, centerDist - halfWidth);
        const opEndDist = Math.min(wallLen, centerDist + halfWidth);

        // Solid wall segment before this opening
        if (opStartDist > currentDist + 0.02) {
          const segStart = {
            x: p1_3d.x + dirX * currentDist,
            z: p1_3d.z + dirZ * currentDist,
          };
          const segEnd = {
            x: p1_3d.x + dirX * opStartDist,
            z: p1_3d.z + dirZ * opStartDist,
          };
          const segGroup = generate3DFrom2DWalls([
            {
              x1: segStart.x,
              y1: segStart.z,
              x2: segEnd.x,
              y2: segEnd.z,
              thickness,
              height: wallHeightMeters,
            },
          ]);
          wallsGroup.add(segGroup);
        }

        // Opening interval
        const opP1 = {
          x: p1_3d.x + dirX * opStartDist,
          z: p1_3d.z + dirZ * opStartDist,
        };
        const opP2 = {
          x: p1_3d.x + dirX * opEndDist,
          z: p1_3d.z + dirZ * opEndDist,
        };

        if (op.type === 'door') {
          // Lintel wall segment above the door opening
          if (wallHeightMeters > doorHeight + 0.05) {
            const lintelSeg = [
              {
                x1: opP1.x,
                y1: opP1.z,
                x2: opP2.x,
                y2: opP2.z,
                thickness,
                height: wallHeightMeters - doorHeight,
              },
            ];
            const lintelGroup = generate3DFrom2DWalls(lintelSeg);
            lintelGroup.position.y = doorHeight;
            wallsGroup.add(lintelGroup);
          }

          // 3D Architectural Door Leaf & Jamb
          const doorGroup = new THREE.Group();
          const doorWidth = Math.hypot(opP2.x - opP1.x, opP2.z - opP1.z);
          const doorThickness = 0.04; // 4cm door leaf

          // Door leaf geometry
          const doorLeafGeom = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
          doorLeafGeom.computeVertexNormals();
          const doorLeaf = new THREE.Mesh(doorLeafGeom, doorWoodMaterial);
          doorLeaf.castShadow = true;
          doorLeaf.receiveShadow = true;

          // Swing door open at a 45-degree angle
          const swingAngle = Math.PI / 4;
          doorLeaf.position.set(doorWidth / 2, doorHeight / 2, 0);

          const pivotGroup = new THREE.Group();
          pivotGroup.add(doorLeaf);
          pivotGroup.rotation.y = swingAngle;

          // Brass door handle
          const handleGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 12);
          const handle = new THREE.Mesh(handleGeom, doorHandleMaterial);
          handle.rotation.z = Math.PI / 2;
          handle.position.set(doorWidth - 0.08, 0.95, 0.035);
          doorLeaf.add(handle);

          // Position door at hinge point
          pivotGroup.position.set(opP1.x, 0, opP1.z);
          pivotGroup.rotation.y = Math.atan2(dz, dx) + (op.swingDirection === 'right' ? 0 : Math.PI);
          wallsGroup.add(pivotGroup);
        } else if (op.type === 'window') {
          // 1. Sill wall below window
          const sillSeg = [
            {
              x1: opP1.x,
              y1: opP1.z,
              x2: opP2.x,
              y2: opP2.z,
              thickness,
              height: windowSillHeight,
            },
          ];
          const sillGroup = generate3DFrom2DWalls(sillSeg);
          wallsGroup.add(sillGroup);

          // 2. Lintel wall above window
          if (wallHeightMeters > windowTopHeight + 0.05) {
            const lintelSeg = [
              {
                x1: opP1.x,
                y1: opP1.z,
                x2: opP2.x,
                y2: opP2.z,
                thickness,
                height: wallHeightMeters - windowTopHeight,
              },
            ];
            const lintelGroup = generate3DFrom2DWalls(lintelSeg);
            lintelGroup.position.y = windowTopHeight;
            wallsGroup.add(lintelGroup);
          }

          // 3. Window frame & glass pane
          const winWidth = Math.hypot(opP2.x - opP1.x, opP2.z - opP1.z);
          const winHeight = windowTopHeight - windowSillHeight;
          const winGroup = new THREE.Group();

          // Glass pane
          const glassGeom = new THREE.BoxGeometry(winWidth - 0.08, winHeight - 0.08, 0.012);
          const glass = new THREE.Mesh(glassGeom, glassMaterial);
          glass.castShadow = false;
          glass.receiveShadow = false;

          // Anthracite aluminum window frame
          const frameGeom = new THREE.BoxGeometry(winWidth, winHeight, thickness + 0.02);
          // Hollow frame via wireframe/box or outer frame
          const frameEdges = new THREE.EdgesGeometry(frameGeom);
          const frameLines = new THREE.LineSegments(
            frameEdges,
            new THREE.LineBasicMaterial({ color: 0x1e293b, linewidth: 2 })
          );

          winGroup.add(glass);
          winGroup.add(frameLines);

          const midX = (opP1.x + opP2.x) / 2;
          const midZ = (opP1.z + opP2.z) / 2;
          winGroup.position.set(midX, windowSillHeight + winHeight / 2, midZ);
          winGroup.rotation.y = Math.atan2(-dz, dx);
          wallsGroup.add(winGroup);
        }

        currentDist = opEndDist;
      });

      // Solid segment after the last opening
      if (currentDist < wallLen - 0.02) {
        const segStart = {
          x: p1_3d.x + dirX * currentDist,
          z: p1_3d.z + dirZ * currentDist,
        };
        const segGroup = generate3DFrom2DWalls([
          {
            x1: segStart.x,
            y1: segStart.z,
            x2: p2_3d.x,
            y2: p2_3d.z,
            thickness,
            height: wallHeightMeters,
          },
        ]);
        wallsGroup.add(segGroup);
      }
    }
  });

  // Automatically generate floors for all detected closed rooms
  const floorsGroup = new THREE.Group();
  floorsGroup.name = 'RoomFloorsGroup';
  rootGroup.add(floorsGroup);

  closedRooms.forEach((room) => {
    const pts3D = room.points.map((pt) => {
      const c = to3DCoords(pt.x, pt.y);
      return { x: c.x, y: c.z };
    });

    const floorMesh = generate3DFloorFromRoomPolygon(pts3D, room.roomType, room.name);
    floorsGroup.add(floorMesh);
  });

  // Exterior ground slab / architectural foundation pad
  const padSizeX = Math.max(16, bounds.sizeX + 8);
  const padSizeZ = Math.max(16, bounds.sizeZ + 8);
  const groundGeom = new THREE.PlaneGeometry(padSizeX, padSizeZ);
  groundGeom.rotateX(-Math.PI / 2);

  // Procedural blueprint grid texture on foundation
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = 512;
  groundCanvas.height = 512;
  const gctx = groundCanvas.getContext('2d');
  if (gctx) {
    gctx.fillStyle = '#f8fafc';
    gctx.fillRect(0, 0, 512, 512);
    gctx.strokeStyle = 'rgba(203, 213, 225, 0.45)';
    gctx.lineWidth = 1;
    for (let i = 0; i < 512; i += 32) {
      gctx.beginPath();
      gctx.moveTo(i, 0);
      gctx.lineTo(i, 512);
      gctx.stroke();
      gctx.beginPath();
      gctx.moveTo(0, i);
      gctx.lineTo(512, i);
      gctx.stroke();
    }
  }
  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.wrapS = THREE.RepeatWrapping;
  groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(padSizeX / 2, padSizeZ / 2);

  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    roughness: 0.9,
    metalness: 0.05,
  });

  const groundMesh = new THREE.Mesh(groundGeom, groundMat);
  groundMesh.position.y = -0.04;
  groundMesh.receiveShadow = true;
  groundMesh.name = 'ArchitecturalGroundPlate';
  rootGroup.add(groundMesh);

  return { rootGroup, bounds };
}

export { exportSceneToGLB } from './glbExport';
