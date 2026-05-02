/**
 * TTML Parser for Apple Music lyrics
 * Parses TTML (Timed Text Markup Language) format used by Apple Music
 */

// Lyric word with timing (for syllable/word-level lyrics)
export interface LyricWord {
  timestamp: number;  // Start time in milliseconds
  endTime: number;    // End time in milliseconds
  text: string;
}

// Single lyric line
export interface LyricLine {
  key: string;                      // Line identifier (L1, L2, ...)
  timestamp: number;                // Line start time (ms)
  endTime: number;                  // Line end time (ms)
  text: string;                     // Main lyric text
  translation?: string;             // Translation text
  transliteration?: string;         // Romanization/pinyin
  words?: LyricWord[];              // Word-level timing (main text)
  translationWords?: LyricWord[];   // Word-level timing (translation)
  transliterationWords?: LyricWord[]; // Word-level timing (transliteration)
}

// Parsed lyrics result
export interface ParsedLyrics {
  timing: 'Word' | 'Line' | 'None';
  language: string;                 // Main language (e.g., 'zh-Hant', 'en')
  translationLanguage?: string;     // Translation language (e.g., 'zh-Hans')
  hasTranslation: boolean;
  hasTransliteration: boolean;
  lines: LyricLine[];
  songwriters?: string[];
}

// User display options
export interface LyricsDisplayOptions {
  showTranslation: boolean;
  showTransliteration: boolean;
  chineseVariant: 'simplified' | 'traditional' | 'auto';
}

/**
 * Parse time string to milliseconds
 * Supports formats: "ss.ms", "mm:ss.ms", "hh:mm:ss.ms"
 */
function parseTime(timeStr: string): number {
  if (!timeStr) return 0;
  
  const parts = timeStr.split(':');
  let seconds = 0;
  
  if (parts.length === 1) {
    // ss.ms format
    seconds = parseFloat(parts[0]);
  } else if (parts.length === 2) {
    // mm:ss.ms format
    seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    // hh:mm:ss.ms format
    seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  
  return Math.round(seconds * 1000);
}


/**
 * Extract text content from an element, handling nested spans
 */
function extractText(element: Element): string {
  let text = '';
  element.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      text += (node as Element).textContent || '';
    }
  });
  return text.trim();
}

/**
 * Extract words with timing from an element, preserving spaces between words
 */
function extractWords(element: Element): LyricWord[] {
  const words: LyricWord[] = [];
  
  // Iterate through child nodes to preserve text nodes (spaces) between spans
  element.childNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      // Skip background vocal spans (ttm:role="x-bg")
      if (el.getAttribute('ttm:role') === 'x-bg') {
        return;
      }
      
      if (el.tagName.toLowerCase() === 'span') {
        const begin = el.getAttribute('begin');
        const end = el.getAttribute('end');
        const text = el.textContent || '';
        
        if (begin && end) {
          words.push({
            timestamp: parseTime(begin),
            endTime: parseTime(end),
            text
          });
        } else {
          // Nested span without timing - recurse
          const nestedWords = extractWords(el);
          words.push(...nestedWords);
        }
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      // Preserve whitespace between spans
      const text = node.textContent || '';
      if (text.trim() === '' && text.length > 0 && words.length > 0) {
        // Append space to the previous word
        words[words.length - 1].text += text;
      }
    }
  });
  
  return words;
}

/**
 * Parse TTML string into structured lyrics
 */
export function parseTTML(ttml: string): ParsedLyrics {
  const parser = new DOMParser();
  const doc = parser.parseFromString(ttml, 'text/xml');
  
  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.error('TTML parse error:', parseError.textContent);
    return {
      timing: 'None',
      language: '',
      hasTranslation: false,
      hasTransliteration: false,
      lines: []
    };
  }
  
  const tt = doc.querySelector('tt');
  if (!tt) {
    return {
      timing: 'None',
      language: '',
      hasTranslation: false,
      hasTransliteration: false,
      lines: []
    };
  }
  
  // Get timing type from itunes:timing attribute
  const timingAttr = tt.getAttribute('itunes:timing') || 'None';
  const timing = timingAttr as 'Word' | 'Line' | 'None';
  
  // Get main language
  const language = tt.getAttribute('xml:lang') || '';
  
  // Parse translations
  const translations = new Map<string, { text: string; words?: LyricWord[]; lang?: string }>();
  let translationLanguage: string | undefined;
  
  const translationElements = doc.querySelectorAll('translations translation');
  translationElements.forEach(trans => {
    const lang = trans.getAttribute('xml:lang');
    if (lang && !translationLanguage) {
      translationLanguage = lang;
    }
    
    trans.querySelectorAll('text').forEach(textEl => {
      const forKey = textEl.getAttribute('for');
      if (forKey) {
        const words = extractWords(textEl);
        translations.set(forKey, {
          // Words already include trailing spaces, so just join them
          text: words.length > 0 ? words.map(w => w.text).join('') : extractText(textEl),
          words: words.length > 0 ? words : undefined,
          lang: lang ?? undefined
        });
      }
    });
  });

  
  // Parse transliterations
  const transliterations = new Map<string, { text: string; words?: LyricWord[] }>();
  const translitElements = doc.querySelectorAll('transliterations transliteration');
  translitElements.forEach(translit => {
    translit.querySelectorAll('text').forEach(textEl => {
      const forKey = textEl.getAttribute('for');
      if (forKey) {
        const words = extractWords(textEl);
        transliterations.set(forKey, {
          // Words already include trailing spaces, so just join them
          text: words.length > 0 ? words.map(w => w.text).join('') : extractText(textEl),
          words: words.length > 0 ? words : undefined
        });
      }
    });
  });
  
  // Parse lyric lines
  const lines: LyricLine[] = [];
  const paragraphs = doc.querySelectorAll('body div p');
  
  paragraphs.forEach(p => {
    const key = p.getAttribute('itunes:key') || `L${lines.length + 1}`;
    const begin = p.getAttribute('begin');
    const end = p.getAttribute('end');
    
    if (!begin) return;
    
    const timestamp = parseTime(begin);
    const endTime = end ? parseTime(end) : timestamp + 5000; // Default 5s duration
    
    // Extract main text and words
    let text: string;
    let words: LyricWord[] | undefined;
    
    if (timing === 'Word') {
      words = extractWords(p);
      text = words.map(w => w.text).join('');
    } else {
      text = extractText(p);
    }
    
    // Get translation and transliteration for this line
    const trans = translations.get(key);
    const translit = transliterations.get(key);
    
    lines.push({
      key,
      timestamp,
      endTime,
      text,
      translation: trans?.text,
      transliteration: translit?.text,
      words,
      translationWords: trans?.words,
      transliterationWords: translit?.words
    });
  });
  
  // Sort lines by timestamp
  lines.sort((a, b) => a.timestamp - b.timestamp);
  
  return {
    timing,
    language,
    translationLanguage,
    hasTranslation: translations.size > 0,
    hasTransliteration: transliterations.size > 0,
    lines
  };
}

/**
 * Serialize parsed lyrics back to TTML format (for round-trip testing)
 */
export function serializeTTML(lyrics: ParsedLyrics): string {
  const lines: string[] = [];
  
  // XML declaration and tt element
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="${lyrics.timing}" xml:lang="${lyrics.language}">`);
  
  // Head section with translations and transliterations
  if (lyrics.hasTranslation || lyrics.hasTransliteration) {
    lines.push('  <head>');
    lines.push('    <metadata>');
    lines.push('      <iTunesMetadata>');
    
    // Translations
    if (lyrics.hasTranslation) {
      lines.push('        <translations>');
      lines.push(`          <translation xml:lang="${lyrics.translationLanguage || 'zh-Hans'}">`);
      lyrics.lines.forEach(line => {
        if (line.translation) {
          if (line.translationWords && line.translationWords.length > 0) {
            const spans = line.translationWords.map(w => 
              `<span begin="${formatTime(w.timestamp)}" end="${formatTime(w.endTime)}">${escapeXml(w.text)}</span>`
            ).join('');
            lines.push(`            <text for="${line.key}">${spans}</text>`);
          } else {
            lines.push(`            <text for="${line.key}">${escapeXml(line.translation)}</text>`);
          }
        }
      });
      lines.push('          </translation>');
      lines.push('        </translations>');
    }

    
    // Transliterations
    if (lyrics.hasTransliteration) {
      lines.push('        <transliterations>');
      lines.push('          <transliteration>');
      lyrics.lines.forEach(line => {
        if (line.transliteration) {
          if (line.transliterationWords && line.transliterationWords.length > 0) {
            const spans = line.transliterationWords.map(w => 
              `<span begin="${formatTime(w.timestamp)}" end="${formatTime(w.endTime)}">${escapeXml(w.text)}</span>`
            ).join(' ');
            lines.push(`            <text for="${line.key}">${spans}</text>`);
          } else {
            lines.push(`            <text for="${line.key}">${escapeXml(line.transliteration)}</text>`);
          }
        }
      });
      lines.push('          </transliteration>');
      lines.push('        </transliterations>');
    }
    
    lines.push('      </iTunesMetadata>');
    lines.push('    </metadata>');
    lines.push('  </head>');
  }
  
  // Body section with lyrics
  lines.push('  <body>');
  lines.push('    <div>');
  
  lyrics.lines.forEach(line => {
    if (lyrics.timing === 'Word' && line.words && line.words.length > 0) {
      const spans = line.words.map(w => 
        `<span begin="${formatTime(w.timestamp)}" end="${formatTime(w.endTime)}">${escapeXml(w.text)}</span>`
      ).join('');
      lines.push(`      <p begin="${formatTime(line.timestamp)}" end="${formatTime(line.endTime)}" itunes:key="${line.key}">${spans}</p>`);
    } else {
      lines.push(`      <p begin="${formatTime(line.timestamp)}" end="${formatTime(line.endTime)}" itunes:key="${line.key}">${escapeXml(line.text)}</p>`);
    }
  });
  
  lines.push('    </div>');
  lines.push('  </body>');
  lines.push('</tt>');
  
  return lines.join('\n');
}

/**
 * Format milliseconds to TTML time format (ss.mmm)
 */
function formatTime(ms: number): string {
  const seconds = ms / 1000;
  return seconds.toFixed(3);
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Get the current line index based on playback time
 */
export function getCurrentLineIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1;
  
  // Binary search for the current line
  let left = 0;
  let right = lines.length - 1;
  let result = -1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (lines[mid].timestamp <= currentTime) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return result;
}

/**
 * Calculate fill percentage for a word based on current time
 * Used for karaoke-style word-by-word highlighting
 */
export function getWordFillPercent(word: LyricWord, currentTime: number): number {
  if (currentTime < word.timestamp) return 0;
  if (currentTime >= word.endTime) return 100;
  
  const progress = (currentTime - word.timestamp) / (word.endTime - word.timestamp);
  return Math.min(100, Math.max(0, progress * 100));
}
