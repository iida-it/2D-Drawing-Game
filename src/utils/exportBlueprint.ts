import { Node, Wall, BlueprintLevel, DraftingSettings } from '../types';
import {
  getDistance,
  pixelsToMeters,
  formatMeters,
  detectClosedRooms,
} from './geometry';

export function exportBlueprintPng(
  nodes: Node[],
  walls: Wall[],
  level: BlueprintLevel,
  settings: DraftingSettings,
  accuracyPercent: number
) {
  const exportCanvas = document.createElement('canvas');
  const width = 1600;
  const height = 1100;
  exportCanvas.width = width;
  exportCanvas.height = height;

  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return;

  // Architectural blueprint paper background (crisp off-white / blueprint grid)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Subtle CAD border frame
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  // Subtle grid in drawing area
  ctx.strokeStyle = 'rgba(241, 245, 249, 1)';
  ctx.lineWidth = 1;
  for (let x = 40; x < width - 40; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, height - 160);
    ctx.stroke();
  }
  for (let y = 40; y < height - 160; y += 40) {
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(width - 40, y);
    ctx.stroke();
  }

  // Calculate bounding box of player nodes
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  nodes.forEach((n) => {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  });

  if (minX === Infinity) {
    minX = 200;
    maxX = 600;
    minY = 150;
    maxY = 450;
  }

  const modelWidth = Math.max(200, maxX - minX);
  const modelHeight = Math.max(200, maxY - minY);
  const targetWidth = width - 240;
  const targetHeight = height - 280;

  const scale = Math.min(targetWidth / modelWidth, targetHeight / modelHeight, 2.2);
  const offsetX = (width - modelWidth * scale) / 2 - minX * scale;
  const offsetY = (height - 140 - modelHeight * scale) / 2 - minY * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw Rooms Fill with Pastel Colors
  const rooms = detectClosedRooms(nodes, walls, settings.scaleFactor);
  rooms.forEach((r) => {
    ctx.beginPath();
    r.points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.fillStyle = r.fillColor;
    ctx.fill();
    ctx.strokeStyle = r.borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Centered room badge
    const badgeW = 120;
    const badgeH = 42;
    ctx.fillStyle = r.tagBgColor;
    ctx.beginPath();
    ctx.roundRect(r.centroid.x - badgeW / 2, r.centroid.y - badgeH / 2, badgeW, badgeH, 6);
    ctx.fill();
    ctx.strokeStyle = r.borderColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = r.tagTextColor;
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.name.toUpperCase(), r.centroid.x, r.centroid.y - 8);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 13px "Fira Code", monospace';
    ctx.fillText(`${r.areaMetersSq.toFixed(2)} m²`, r.centroid.x, r.centroid.y + 9);
  });

  // Draw Walls
  const nodeMap = new Map<string, Node>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  walls.forEach((w) => {
    const n1 = nodeMap.get(w.startNodeId);
    const n2 = nodeMap.get(w.endNodeId);
    if (!n1 || !n2) return;

    // Wall thick stroke
    ctx.beginPath();
    ctx.moveTo(n1.x, n1.y);
    ctx.lineTo(n2.x, n2.y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'square';
    ctx.stroke();

    // Measurement line & text
    const distPx = getDistance(n1, n2);
    const distM = pixelsToMeters(distPx, settings.scaleFactor);
    const midX = (n1.x + n2.x) / 2;
    const midY = (n1.y + n2.y) / 2;

    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-4) {
      const nx = -dy / len;
      const ny = dx / len;
      const offset = 18;

      ctx.fillStyle = '#0284c7';
      ctx.font = '600 11px "Fira Code", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatMeters(distM), midX + nx * offset, midY + ny * offset);
    }
  });

  // Nodes
  nodes.forEach((n) => {
    ctx.beginPath();
    ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.restore();

  // Architectural Title Block in Bottom Right
  const tbX = width - 420;
  const tbY = height - 160;
  const tbW = 380;
  const tbH = 120;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(tbX, tbY, tbW, tbH);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.strokeRect(tbX, tbY, tbW, tbH);

  // Dividers
  ctx.beginPath();
  ctx.moveTo(tbX, tbY + 40);
  ctx.lineTo(tbX + tbW, tbY + 40);
  ctx.moveTo(tbX, tbY + 80);
  ctx.lineTo(tbX + tbW, tbY + 80);
  ctx.moveTo(tbX + 220, tbY + 40);
  ctx.lineTo(tbX + 220, tbY + tbH);
  ctx.stroke();

  // Title Block Text
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`PROJECT: ${level.title.toUpperCase()}`, tbX + 14, tbY + 20);

  ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(`CLIENT: ${level.client.name}`, tbX + 14, tbY + 60);
  ctx.fillText(`FIRM: ${level.client.company}`, tbX + 14, tbY + 100);

  ctx.font = '600 11px "Fira Code", monospace';
  ctx.fillStyle = '#0284c7';
  ctx.fillText(`ACCURACY: ${accuracyPercent}%`, tbX + 234, tbY + 60);
  ctx.fillText(`SCALE: 1px = 2cm`, tbX + 234, tbY + 100);

  // Trigger Download
  const link = document.createElement('a');
  link.download = `Blueprint_${level.title.replace(/\s+/g, '_')}_Plan.png`;
  link.href = exportCanvas.toDataURL('image/png');
  link.click();
}
