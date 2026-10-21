import React, { useState } from 'react';
import {
  X,
  Keyboard,
  Mouse,
  BookOpen,
  PenTool,
  MousePointer2,
  DoorOpen,
  Box,
  Check,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'guide' | 'shortcuts';
}

// Crisp Vector Icon for 3-Point Arc
const Arc3PtIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className || 'w-5 h-5'}
  >
    <path d="M4 19 A 15 15 0 0 1 19 4" />
    <circle cx="4" cy="19" r="1.75" fill="currentColor" />
    <circle cx="11.5" cy="7.5" r="1.75" fill="currentColor" />
    <circle cx="19" cy="4" r="1.75" fill="currentColor" />
  </svg>
);

// Crisp Vector Icon for Start-End-Radius Arc
const ArcRadiusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className || 'w-5 h-5'}
  >
    <path d="M4 19 A 15 15 0 0 1 19 4" />
    <circle cx="4" cy="19" r="1.75" fill="currentColor" />
    <circle cx="19" cy="4" r="1.75" fill="currentColor" />
    <path d="M11.5 11.5 L15 15" strokeDasharray="2 2" strokeWidth="1.5" />
  </svg>
);

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'guide',
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'guide' | 'shortcuts'>(initialTab);

  if (!isOpen) return null;

  const toolShortcuts = [
    { key: 'V', desc: t('scSelectMove') },
    { key: 'P / L', desc: t('scDrawWall') },
    { key: 'A', desc: t('toolArc3Pt') || '3-Point Arc Wall' },
    { key: 'R', desc: t('toolArcRadius') || 'Start, End, Radius Arc' },
    { key: 'D', desc: t('scDoorTool') },
    { key: 'B', desc: t('toolDoubleDoor') || 'Double Door' },
    { key: 'S', desc: t('toolSlidingDoor') || 'Sliding Door' },
    { key: 'W', desc: t('scWindowTool') },
    { key: 'M', desc: t('scMeasureTool') },
    { key: 'C', desc: t('scCalibrateTool') },
    { key: 'E', desc: t('scEraseTool') },
    { key: 'H', desc: t('toolPan') || 'Pan Tool' },
    { key: 'Tab', desc: t('scToggle2D3D') },
    { key: 'W/E/R (3D)', desc: t('sc3DGizmo') },
  ];

  const canvasShortcuts = [
    { key: '0 - 9, . + Enter', desc: 'Direct Type: Set exact wall length / arc radius' },
    { key: 'F', desc: t('scFlipSwing') },
    { key: 'Shift+S / X', desc: t('scGridSnap') },
    { key: 'O', desc: t('scOrthoAngle') },
    { key: 'G', desc: t('scGhostLayer') },
    { key: 'Shift (Hold)', desc: t('scShiftClamp') },
    { key: 'Space + Drag', desc: t('scPanCanvasSpace') },
    { key: 'Middle Mouse Drag', desc: t('scPanCanvasMiddle') },
    { key: 'Mouse Wheel', desc: t('scMouseWheelZoom') },
    { key: 'Esc / Right-Click', desc: t('scEscCancel') },
    { key: 'Del / Backspace', desc: t('scDelWall') },
    { key: 'Ctrl + Z', desc: t('scUndo') },
    { key: 'Ctrl + Y', desc: t('scRedo') },
  ];

  const guideCards = [
    {
      id: 'straight-wall',
      title: t('guideStraightWallTitle'),
      subtitle: t('guideStraightWallSub'),
      icon: PenTool,
      accentColor: 'sky',
      badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
      steps: [
        { num: '1', text: t('guideStraightWallStep1') },
        { num: '2', text: t('guideStraightWallStep2') },
        { num: '3', text: t('guideStraightWallStep3') },
      ],
      tip: t('guideStraightWallTip'),
    },
    {
      id: 'arc-3pt',
      title: t('guideArc3PtTitle'),
      subtitle: t('guideArc3PtSub'),
      customIcon: Arc3PtIcon,
      accentColor: 'indigo',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      steps: [
        { num: '1', text: t('guideArc3PtStep1') },
        { num: '2', text: t('guideArc3PtStep2') },
        { num: '3', text: t('guideArc3PtStep3') },
      ],
      tip: t('guideArc3PtTip'),
    },
    {
      id: 'arc-radius',
      title: t('guideArcRadiusTitle'),
      subtitle: t('guideArcRadiusSub'),
      customIcon: ArcRadiusIcon,
      accentColor: 'cyan',
      badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      steps: [
        { num: '1', text: t('guideArcRadiusStep1') },
        { num: '2', text: t('guideArcRadiusStep2') },
        { num: '3', text: t('guideArcRadiusStep3') },
      ],
      tip: t('guideArcRadiusTip'),
    },
    {
      id: 'openings',
      title: t('guideOpeningsTitle'),
      subtitle: t('guideOpeningsSub'),
      icon: DoorOpen,
      accentColor: 'amber',
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
      steps: [
        { num: '1', text: t('guideOpeningsStep1') },
        { num: '2', text: t('guideOpeningsStep2') },
        { num: '3', text: t('guideOpeningsStep3') },
      ],
      tip: t('guideOpeningsTip'),
    },
    {
      id: 'select',
      title: t('guideSelectTitle'),
      subtitle: t('guideSelectSub'),
      icon: MousePointer2,
      accentColor: 'emerald',
      badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      steps: [
        { num: '1', text: t('guideSelectStep1') },
        { num: '2', text: t('guideSelectStep2') },
        { num: '3', text: t('guideSelectStep3') },
      ],
      tip: t('guideSelectTip'),
    },
    {
      id: '3d-glb',
      title: t('guide3DTitle'),
      subtitle: t('guide3DSub'),
      icon: Box,
      accentColor: 'violet',
      badgeColor: 'bg-violet-50 text-violet-800 border-violet-200',
      steps: [
        { num: '1', text: t('guide3DStep1') },
        { num: '2', text: t('guide3DStep2') },
        { num: '3', text: t('guide3DStep3') },
      ],
      tip: t('guide3DTip'),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-sm shadow-sky-200 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>{t('guideModalTitle')}</span>
              </h3>
              <p className="text-xs text-slate-500">
                {t('guideModalSub')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-100 flex items-center gap-2 shrink-0 bg-white">
          <button
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all select-none ${
              activeTab === 'guide'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>{t('tabUserGuide')}</span>
          </button>

          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all select-none ${
              activeTab === 'shortcuts'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>{t('tabShortcuts')}</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'guide' ? (
            <div className="space-y-4">
              {guideCards.map((card) => {
                const IconComponent = card.icon;
                const CustomIconComponent = card.customIcon;

                return (
                  <div
                    key={card.id}
                    className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 shadow-2xs hover:border-slate-300 transition-all"
                  >
                    {/* Card Title & Shortcut */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-white border border-slate-200/80 shadow-2xs text-slate-800">
                          {CustomIconComponent ? (
                            <CustomIconComponent className="w-4 h-4 text-sky-600" />
                          ) : (
                            IconComponent && <IconComponent className="w-4 h-4 text-sky-600" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">
                            {card.title}
                          </h4>
                        </div>
                      </div>
                      <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md border ${card.badgeColor}`}>
                        {card.subtitle}
                      </span>
                    </div>

                    {/* Step by Step list */}
                    <div className="space-y-2 mb-3">
                      {card.steps.map((st, sIdx) => (
                        <div key={sIdx} className="flex items-start gap-2.5 text-xs text-slate-700">
                          <span className="w-4 h-4 rounded-full bg-sky-100 text-sky-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                            {st.num}
                          </span>
                          <span className="leading-relaxed">{st.text}</span>
                        </div>
                      ))}
                    </div>

                    {/* Pro Tip Callout */}
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/80 border border-amber-200/60 text-xs text-amber-900">
                      <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <span className="font-semibold text-amber-800 mr-1.5">{t('proTip')}:</span>
                        <span>{card.tip}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Tool Selection Hotkeys */}
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                  <Keyboard className="w-4 h-4 text-sky-600" />
                  <span>{t('toolSelectionHotkeys')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {toolShortcuts.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs hover:bg-white hover:border-slate-200 transition-colors"
                    >
                      <span className="text-slate-700 font-medium">{item.desc}</span>
                      <kbd className="px-2 py-1 bg-white border border-slate-200 rounded-lg font-mono text-[11px] text-slate-900 font-bold shadow-2xs shrink-0 ml-2">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Canvas Navigation & Snapping */}
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                  <Mouse className="w-4 h-4 text-sky-600" />
                  <span>{t('canvasNavSnapping')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {canvasShortcuts.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs hover:bg-white hover:border-slate-200 transition-colors"
                    >
                      <span className="text-slate-700 font-medium">{item.desc}</span>
                      <kbd className="px-2 py-1 bg-white border border-slate-200 rounded-lg font-mono text-[11px] text-slate-900 font-bold shadow-2xs shrink-0 ml-2">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-1.5 hidden sm:flex">
            <Sparkles className="w-3.5 h-3.5 text-sky-500" />
            <span>Planner 5D CAD Engine · Press <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200 text-[10px] text-slate-700 font-bold">?</kbd> anytime</span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t('gotIt')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
