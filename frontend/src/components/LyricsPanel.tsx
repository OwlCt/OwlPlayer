import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FiX } from 'react-icons/fi';
import { getLyrics } from '../api';
import { usePlayerStore } from '../store/playerStore';
import { parseTTML, getCurrentLineIndex, ParsedLyrics, LyricLine } from '../utils/ttmlParser';
import { useLyricsSettings } from '../hooks/useLyricsSettings';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { LyricsToolbar } from './LyricsToolbar';
import { LyricLineComponent } from './LyricLine';
import { containsCJK, selectChineseVariant } from '../utils/chineseUtils';
import { offlineCacheService } from '../services/offlineCacheService';
import { getCacheFirstArtworkUrl } from '../utils/cacheFirstImage';
import { getProxiedImageUrl } from '../utils/image';

interface LyricsPanelProps {
  songId: string;
  onClose: () => void;
}

export default function LyricsPanel({ songId, onClose }: LyricsPanelProps) {
  const [parsedLyrics, setParsedLyrics] = useState<ParsedLyrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [backgroundUrl, setBackgroundUrl] = useState<string>('');

  // Ref-based time — no re-renders per frame
  const currentTimeRef = useRef(0);

  // Word fill updater registry
  const wordUpdatersRef = useRef<Map<string, () => void>>(new Map());
  const registerUpdater = useCallback((key: string, fn: () => void) => {
    wordUpdatersRef.current.set(key, fn);
  }, []);
  const unregisterUpdater = useCallback((key: string) => {
    wordUpdatersRef.current.delete(key);
  }, []);
  const { seek, audioRef, currentSong } = usePlayerStore();
  const { settings } = useLyricsSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll animation hook
  const { scrollToLine, isPaused, resumeAutoScroll } = useScrollAnimation({
    containerRef,
    lineRefs,
    currentLineIndex,
    enabled: true,
  });

  // Load and parse lyrics (cache-first)
  useEffect(() => {
    const loadLyrics = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Cache-first: check if song has cached lyrics
        let cachedTtml: string | null = null;
        
        try {
          const cachedSong = await offlineCacheService.getCachedSong(songId);
          if (cachedSong?.lyrics?.ttml) {
            cachedTtml = cachedSong.lyrics.ttml;
            console.log(`[LyricsPanel] Using cached lyrics for ${songId}`);
          }
        } catch (cacheError) {
          console.warn('[LyricsPanel] Cache check failed:', cacheError);
        }
        
        if (cachedTtml) {
          // Use the same parser as online mode
          const parsed = parseTTML(cachedTtml);
          setParsedLyrics(parsed);
        } else if (navigator.onLine) {
          // Fall back to API when not cached and online
          const data = await getLyrics(songId);
          if (data.available && data.ttml) {
            const parsed = parseTTML(data.ttml);
            setParsedLyrics(parsed);
          } else {
            setError('暂无歌词');
          }
        } else {
          // Offline and not cached
          setError('歌词未缓存，无法离线显示');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载歌词失败');
      } finally {
        setLoading(false);
      }
    };

    loadLyrics();
  }, [songId]);

  // Process lines based on Chinese variant preference
  const processedLines = useMemo(() => {
    if (!parsedLyrics) return [];
    
    return parsedLyrics.lines.map(line => {
      const { text, showTranslation } = selectChineseVariant(
        line.text,
        line.translation,
        settings.chineseVariant
      );
      
      return {
        ...line,
        text,
        translation: showTranslation ? line.translation : undefined
      };
    });
  }, [parsedLyrics, settings.chineseVariant]);

  // Check if lyrics contain Chinese
  const hasChinese = useMemo(() => {
    if (!parsedLyrics) return false;
    return parsedLyrics.lines.some(line => containsCJK(line.text));
  }, [parsedLyrics]);

  // Whether any line uses word-level timing
  const hasWordTiming = useMemo(() => {
    return parsedLyrics?.lines.some(
      (line) =>
        (line.words && line.words.length > 0) ||
        (line.translationWords && line.translationWords.length > 0) ||
        (line.transliterationWords && line.transliterationWords.length > 0)
    ) ?? false;
  }, [parsedLyrics]);

  // Time update — ref-based, only setState when line changes
  useEffect(() => {
    if (processedLines.length === 0 || !audioRef) return;

    let animationFrameId: number;
    let lastIndex = -1;

    const update = () => {
      const timeMs = audioRef.currentTime * 1000;
      currentTimeRef.current = timeMs;

      const newIndex = getCurrentLineIndex(processedLines, timeMs);
      if (newIndex !== lastIndex) {
        lastIndex = newIndex;
        setCurrentLineIndex(newIndex);
      }

      wordUpdatersRef.current.forEach(fn => fn());
    };

    if (hasWordTiming) {
      const tick = () => {
        update();
        animationFrameId = requestAnimationFrame(tick);
      };
      animationFrameId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(animationFrameId);
    } else {
      audioRef.addEventListener('timeupdate', update);
      update();
      return () => audioRef.removeEventListener('timeupdate', update);
    }
  }, [audioRef, processedLines, hasWordTiming]);

  // Auto-scroll when current line changes
  useEffect(() => {
    if (currentLineIndex >= 0) {
      scrollToLine(currentLineIndex);
    }
  }, [currentLineIndex, scrollToLine]);

  // Reset state when song changes
  useEffect(() => {
    setCurrentLineIndex(-1);
    lineRefs.current = [];
  }, [songId]);

  // Load background image URL with cache-first support
  useEffect(() => {
    if (!currentSong?.artworkUrl) {
      setBackgroundUrl('');
      return;
    }

    const loadBackgroundUrl = async () => {
      const fallbackUrl = getProxiedImageUrl(currentSong.artworkUrl, 600);
      const url = await getCacheFirstArtworkUrl(currentSong.id, fallbackUrl);
      setBackgroundUrl(url);
    };

    loadBackgroundUrl();
  }, [currentSong?.id, currentSong?.artworkUrl]);

  const handleLineClick = (line: LyricLine) => {
    seek(line.timestamp / 1000);
    resumeAutoScroll(); // Resume auto-scroll when user clicks a line
  };

  return (
    <div className="w-96 relative overflow-hidden flex flex-col border-l border-spotify-gray">
      {/* Blurred Background - GPU composited for Safari/Firefox performance */}
      <div
        className="absolute inset-0 z-0 opacity-50 pointer-events-none"
        style={{
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(80px) saturate(1.5)',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />
      <div className="absolute inset-0 z-0 bg-black/40 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <h2 className="font-bold">歌词</h2>
          {isPaused && (
            <span className="text-xs text-spotify-light-gray opacity-60">
              (已暂停自动滚动)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {parsedLyrics && (
            <LyricsToolbar
              hasTranslation={parsedLyrics.hasTranslation}
              hasChinese={hasChinese}
              compact
            />
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-spotify-gray text-spotify-light-gray hover:text-white transition-colors"
          >
            <FiX size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        className="relative z-10 flex-1 overflow-y-auto p-6"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)'
        }}
      >
        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-spotify-green border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-spotify-light-gray">
            {error}
          </div>
        )}

        {!loading && !error && processedLines.length > 0 && (
          <div className="space-y-4 py-[40vh]">
            {processedLines.map((line, index) => {
              const adjacentIndex = currentLineIndex >= 0 ? index - currentLineIndex : index;
              
              return (
                <div
                  key={line.key || index}
                  ref={(el) => (lineRefs.current[index] = el)}
                  onClick={() => handleLineClick(line)}
                  className="cursor-pointer"
                >
                  <LyricLineComponent
                    line={line}
                    isActive={index === currentLineIndex}
                    adjacentIndex={adjacentIndex}
                    showTranslation={settings.showTranslation}
                    showTransliteration={settings.showTransliteration}
                    currentTimeRef={currentTimeRef}
                    registerUpdater={registerUpdater}
                    unregisterUpdater={unregisterUpdater}
                    lineKey={line.key || `lp-${index}`}
                  />
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && processedLines.length === 0 && (
          <div className="text-center py-8 text-spotify-light-gray">
            暂无歌词
          </div>
        )}
      </div>
    </div>
  );
}
