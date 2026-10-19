import React from 'react';
import { X, Keyboard, Mouse } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  if (!isOpen) return null;

  const toolShortcuts = [
    { key: 'Tab / 3', desc: t('scToggle2D3D') },
    { key: 'W / E / R', desc: t('sc3DGizmo') },
    { key: 'V', desc: t('scSelectMove') },
    { key: 'W (in 2D)', desc: t('scDrawWall') },
    { key: 'D', desc: t('scDoorTool') },
    { key: 'N', desc: t('scWindowTool') },
    { key: 'M', desc: t('scMeasureTool') },
    { key: 'C', desc: t('scCalibrateTool') },
    { key: 'E (in 2D)', desc: t('scEraseTool') },
    { key: 'F', desc: t('scFlipSwing') },
    { key: 'S', desc: t('scGridSnap') },
    { key: 'O', desc: t('scOrthoAngle') },
    { key: 'G', desc: t('scGhostLayer') },
  ];

  const canvasShortcuts = [
    { key: 'Space + Drag', desc: t('scPanCanvasSpace') },
    { key: 'Middle Mouse Drag', desc: t('scPanCanvasMiddle') },
    { key: 'Mouse Wheel', desc: t('scMouseWheelZoom') },
    { key: 'Shift (Hold)', desc: t('scShiftClamp') },
    { key: 'Esc / Right-Click', desc: t('scEscCancel') },
    { key: 'Del / Backspace', desc: t('scDelWall') },
    { key: 'Ctrl + Z', desc: t('scUndo') },
    { key: 'Ctrl + Y', desc: t('scRedo') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">
                {t('shortcutsTitle')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {t('shortcutsSub')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Keyboard className="w-3.5 h-3.5" />
              {t('toolSelectionHotkeys')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {toolShortcuts.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                >
                  <span className="text-slate-600 text-[11px]">{item.desc}</span>
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-800 font-semibold shadow-2xs">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Mouse className="w-3.5 h-3.5" />
              {t('canvasNavSnapping')}
            </div>
            <div className="space-y-1.5">
              {canvasShortcuts.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                >
                  <span className="text-slate-600 text-[11px]">{item.desc}</span>
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-800 font-semibold shadow-2xs">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            {t('gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
};
