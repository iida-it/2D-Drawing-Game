import * as pdfjsLib from 'pdfjs-dist';
import { UploadedFloorPlan } from '../types';

// Set up pdf.js worker URL from CDN
try {
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${
      pdfjsLib.version || '4.10.38'
    }/pdf.worker.min.mjs`;
  }
} catch {
  // Worker initialization fallback
}

export async function processUploadedFile(
  file: File,
  pageNumber: number = 1
): Promise<UploadedFloorPlan> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    return processPdfFile(file, pageNumber);
  } else {
    return processImageFile(file);
  }
}

async function processImageFile(file: File): Promise<UploadedFloorPlan> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        resolve({
          id: `custom-plan-${Date.now()}`,
          name: file.name,
          imageElement: img,
          dataUrl,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          position: { x: 180, y: 120 },
          scale: 1.0,
          fileType: 'image',
        });
      };
      img.onerror = () => {
        reject(new Error('Failed to load image file. Please check file format.'));
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file from disk.'));
    };
    reader.readAsDataURL(file);
  });
}

async function processPdfFile(file: File, targetPage: number = 1): Promise<UploadedFloorPlan> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const pageIndex = Math.max(1, Math.min(targetPage, totalPages));
  const page = await pdfDoc.getPage(pageIndex);

  // Render PDF page to canvas at high architectural resolution (viewport scale 2.0)
  const scale = 2.0;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for PDF rendering.');
  }

  // Render white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: ctx,
    viewport,
    canvas,
  };

  await page.render(renderContext).promise;

  const dataUrl = canvas.toDataURL('image/png');

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        id: `custom-pdf-${Date.now()}`,
        name: file.name,
        imageElement: img,
        dataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
        position: { x: 160, y: 100 },
        scale: 0.65, // Adjust for 2x scale render
        fileType: 'pdf',
        totalPages,
        currentPage: pageIndex,
      });
    };
    img.onerror = () => {
      reject(new Error('Failed to create preview from PDF page.'));
    };
    img.src = dataUrl;
  });
}
