/**
 * Lyrics toolbar component with toggle buttons for display options
 */
import React from 'react';
import { useLyricsSettings, LyricsSettings } from '../hooks/useLyricsSettings';

interface LyricsToolbarProps {
  hasTranslation: boolean;
  hasChinese?: boolean;
  compact?: boolean;
}

const variantLabels: Record<LyricsSettings['chineseVariant'], string> = {
  auto: '自动',
  simplified: '简',
  traditional: '繁'
};

export const LyricsToolbar: React.FC<LyricsToolbarProps> = ({
  hasTranslation,
  hasChinese = false,
  compact = false
}) => {
  const { settings, toggleTranslation, cycleChineseVariant } = useLyricsSettings();

  // Compact mode: no background wrapper, just buttons
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {/* Translation toggle */}
        {hasTranslation && (
          <button
            onClick={toggleTranslation}
            className={`px-2 py-1 text-xs rounded-full transition-colors ${
              settings.showTranslation
                ? 'bg-spotify-green text-black'
                : 'bg-spotify-gray text-spotify-light-gray hover:bg-spotify-gray/80'
            }`}
            title="显示翻译"
          >
            译
          </button>
        )}

        {/* Chinese variant toggle */}
        {hasChinese && (
          <button
            onClick={cycleChineseVariant}
            className="px-2 py-1 text-xs rounded-full bg-spotify-gray text-spotify-light-gray hover:bg-spotify-gray/80 transition-colors"
            title="切换简繁体"
          >
            {variantLabels[settings.chineseVariant]}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-black/20 rounded-lg backdrop-blur-sm">
      {/* Translation toggle */}
      {hasTranslation && (
        <button
          onClick={toggleTranslation}
          className={`px-3 py-1 text-sm rounded-full transition-colors ${
            settings.showTranslation
              ? 'bg-white/20 text-white'
              : 'bg-white/5 text-white/50 hover:bg-white/10'
          }`}
          title="显示翻译"
        >
          译
        </button>
      )}

      {/* Chinese variant toggle */}
      {hasChinese && (
        <button
          onClick={cycleChineseVariant}
          className="px-3 py-1 text-sm rounded-full bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
          title="切换简繁体"
        >
          {variantLabels[settings.chineseVariant]}
        </button>
      )}
    </div>
  );
};

export default LyricsToolbar;
