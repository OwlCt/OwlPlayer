/**
 * LyricLine component with karaoke-style word-by-word fill effect.
 *
 * Performance architecture:
 * - Parent passes currentTimeRef (a ref, not state) so time updates don't trigger re-renders
 * - Word fill is driven by a parent RAF loop that calls registered updater callbacks
 * - Opacity/scale transitions use a single shared RAF coordinator (not per-line RAF)
 * - Component is React.memo'd — only re-renders when line index or active state changes
 */
import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { LyricLine as LyricLineType, LyricWord } from '../utils/ttmlParser';
import { getLineOpacity, calculateWordFillPercentage, easings } from '../utils/scrollAnimator';

// ─── Centralized Animation Coordinator ───────────────────────────────
// One RAF loop drives ALL line opacity/scale animations with the same timestamp.

const TRANSITION_DURATION = 600;

interface LineAnimation {
  el: HTMLDivElement;
  startTime: number;
  fromOpacity: number;
  fromScale: number;
  toOpacity: number;
  toScale: number;
}

const activeAnimations = new Map<string, LineAnimation>();
let rafId: number | null = null;

function tick(now: number) {
  let hasActive = false;
  activeAnimations.forEach((anim, key) => {
    const progress = Math.min((now - anim.startTime) / TRANSITION_DURATION, 1);
    const eased = easings.iosSpring(progress);
    anim.el.style.opacity = String(anim.fromOpacity + (anim.toOpacity - anim.fromOpacity) * eased);
    anim.el.style.transform = `scale(${anim.fromScale + (anim.toScale - anim.fromScale) * eased})`;
    if (progress >= 1) activeAnimations.delete(key);
    else hasActive = true;
  });
  rafId = hasActive ? requestAnimationFrame(tick) : null;
}

function startAnimation(id: string, el: HTMLDivElement, fromO: number, fromS: number, toO: number, toS: number) {
  activeAnimations.set(id, { el, startTime: performance.now(), fromOpacity: fromO, fromScale: fromS, toOpacity: toO, toScale: toS });
  if (rafId === null) rafId = requestAnimationFrame(tick);
}

function stopAnimation(id: string) { activeAnimations.delete(id); }

// ─── Word Component (ref-based, no re-render per frame) ─────────────

interface WordProps {
  word: LyricWord;
  wordKey: string;
  currentTimeRef: React.RefObject<number>;
  registerUpdater: (key: string, fn: () => void) => void;
  unregisterUpdater: (key: string) => void;
}

const Word: React.FC<WordProps> = React.memo(({ word, wordKey, currentTimeRef, registerUpdater, unregisterUpdater }) => {
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const update = () => {
      if (!fillRef.current) return;
      const pct = calculateWordFillPercentage(currentTimeRef.current, word.timestamp, word.endTime);
      fillRef.current.style.width = `${pct}%`;
    };
    registerUpdater(wordKey, update);
    update();
    return () => unregisterUpdater(wordKey);
  }, [word.timestamp, word.endTime, wordKey, currentTimeRef, registerUpdater, unregisterUpdater]);

  return (
    <span className="relative inline-block" style={{ whiteSpace: 'pre' }}>
      <span className="text-white/40">{word.text}</span>
      <span
        ref={fillRef}
        className="absolute left-0 top-0 overflow-hidden text-white"
        style={{ width: '0%', whiteSpace: 'pre' }}
        aria-hidden="true"
      >
        {word.text}
      </span>
    </span>
  );
});

// ─── LyricLine Component ────────────────────────────────────────────

export interface LyricLineProps {
  line: LyricLineType;
  isActive: boolean;
  adjacentIndex: number;
  showTranslation?: boolean;
  showTransliteration?: boolean;
  variant?: 'default' | 'expanded';
  // Ref-based time — does NOT trigger re-renders
  currentTimeRef: React.RefObject<number>;
  registerUpdater: (key: string, fn: () => void) => void;
  unregisterUpdater: (key: string) => void;
  lineKey: string; // stable key for animation coordinator
}

let lineIdCounter = 0;

export const LyricLineComponent: React.FC<LyricLineProps> = React.memo(({
  line,
  isActive,
  adjacentIndex,
  showTranslation = true,
  showTransliteration = false,
  variant = 'default',
  currentTimeRef,
  registerUpdater,
  unregisterUpdater,
  lineKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animId = useRef(lineKey || `lyric-${++lineIdCounter}`);
  const currentVals = useRef({ opacity: -1, scale: -1 });
  const hasWordTiming = line.words && line.words.length > 0;

  // For line-level fill (non-word-timed lines), register an updater
  const lineFillRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (hasWordTiming || !lineFillRef.current) return;
    const update = () => {
      if (!lineFillRef.current) return;
      const t = currentTimeRef.current;
      const width = (t >= line.timestamp && t < line.endTime) || isActive ? '100%' : '0%';
      lineFillRef.current.style.width = width;
    };
    const key = `${lineKey}-linefill`;
    registerUpdater(key, update);
    update();
    return () => unregisterUpdater(key);
  }, [hasWordTiming, isActive, line.timestamp, line.endTime, lineKey, currentTimeRef, registerUpdater, unregisterUpdater]);

  const targetOpacity = useMemo(() => isActive ? 1.0 : getLineOpacity(adjacentIndex), [isActive, adjacentIndex]);
  const targetScale = isActive ? 1.02 : 1.0;
  const fontSize = variant === 'expanded' ? '2rem' : undefined;
  const isNearActive = Math.abs(adjacentIndex) <= 1;

  // Coordinated opacity/scale animation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prev = currentVals.current;
    if (prev.opacity < 0) {
      currentVals.current = { opacity: targetOpacity, scale: targetScale };
      el.style.opacity = String(targetOpacity);
      el.style.transform = `scale(${targetScale})`;
      return;
    }
    if (prev.opacity === targetOpacity && prev.scale === targetScale) return;
    startAnimation(animId.current, el, prev.opacity, prev.scale, targetOpacity, targetScale);
    currentVals.current = { opacity: targetOpacity, scale: targetScale };
    return () => stopAnimation(animId.current);
  }, [targetOpacity, targetScale]);

  useEffect(() => { const id = animId.current; return () => stopAnimation(id); }, []);

  return (
    <div
      ref={containerRef}
      className="py-2"
      style={{
        transformOrigin: 'left center',
        opacity: targetOpacity,
        transform: `scale(${targetScale})`,
        ...(fontSize ? { fontSize } : {}),
        willChange: isNearActive ? 'transform, opacity' : 'auto',
      }}
    >
      <div className={`font-medium leading-relaxed ${variant === 'expanded' ? '' : 'text-2xl'}`}>
        {hasWordTiming ? (
          line.words!.map((word, i) => (
            <Word
              key={i}
              word={word}
              wordKey={`${lineKey}-w${i}`}
              currentTimeRef={currentTimeRef}
              registerUpdater={registerUpdater}
              unregisterUpdater={unregisterUpdater}
            />
          ))
        ) : (
          <span className="relative inline-block" style={{ whiteSpace: 'pre-wrap' }}>
            <span className="text-white/40">{line.text}</span>
            <span
              ref={lineFillRef}
              className="absolute left-0 top-0 h-full overflow-hidden"
              style={{ width: '0%' }}
            >
              <span className="text-white block">{line.text}</span>
            </span>
          </span>
        )}
      </div>

      {showTransliteration && line.transliteration && (
        <div className="text-sm text-white/50 mt-1">
          {line.transliterationWords && line.transliterationWords.length > 0 ? (
            line.transliterationWords.map((word, i) => (
              <Word
                key={i}
                word={word}
                wordKey={`${lineKey}-tl${i}`}
                currentTimeRef={currentTimeRef}
                registerUpdater={registerUpdater}
                unregisterUpdater={unregisterUpdater}
              />
            ))
          ) : (
            line.transliteration
          )}
        </div>
      )}

      {showTranslation && line.translation && (
        <div className="text-base text-white/60 mt-1">{line.translation}</div>
      )}
    </div>
  );
}, (prev, next) => {
  // Only re-render when these change — NOT on currentTimeRef changes
  return prev.isActive === next.isActive
    && prev.adjacentIndex === next.adjacentIndex
    && prev.showTranslation === next.showTranslation
    && prev.showTransliteration === next.showTransliteration
    && prev.line === next.line
    && prev.variant === next.variant;
});

export default LyricLineComponent;
