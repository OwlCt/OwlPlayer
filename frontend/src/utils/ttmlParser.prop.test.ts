/**
 * Property-based tests for TTML Parser
 * **Feature: lyrics-refactor**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseTTML, serializeTTML, getCurrentLineIndex, getWordFillPercent, LyricLine, LyricWord, ParsedLyrics } from './ttmlParser';

// Safe text generator - alphanumeric only to avoid XML issues
const safeTextArb = fc.stringMatching(/^[a-zA-Z0-9]+$/).filter(s => s.length >= 1 && s.length <= 20);

// Arbitrary generators for TTML structures
const wordArb = fc.record({
  timestamp: fc.integer({ min: 0, max: 300000 }),
  endTime: fc.integer({ min: 0, max: 300000 }),
  text: safeTextArb
}).map(w => ({
  ...w,
  endTime: Math.max(w.timestamp + 100, w.endTime) // Ensure end > start
}));

const lineArb = fc.record({
  key: fc.integer({ min: 1, max: 100 }).map(n => `L${n}`),
  timestamp: fc.integer({ min: 0, max: 300000 }),
  endTime: fc.integer({ min: 0, max: 300000 }),
  text: safeTextArb,
  translation: fc.option(safeTextArb, { nil: undefined }),
  transliteration: fc.option(safeTextArb, { nil: undefined })
}).map(l => ({
  ...l,
  endTime: Math.max(l.timestamp + 1000, l.endTime)
}));

// Line with words for Word timing
const lineWithWordsArb = fc.record({
  key: fc.integer({ min: 1, max: 100 }).map(n => `L${n}`),
  timestamp: fc.integer({ min: 0, max: 300000 }),
  endTime: fc.integer({ min: 0, max: 300000 }),
  text: safeTextArb,
  translation: fc.option(safeTextArb, { nil: undefined }),
  transliteration: fc.option(safeTextArb, { nil: undefined }),
  words: fc.array(wordArb, { minLength: 1, maxLength: 5 })
}).map(l => ({
  ...l,
  endTime: Math.max(l.timestamp + 1000, l.endTime),
  text: l.words.map(w => w.text).join('') // Text should match words
}));

const parsedLyricsArb = fc.record({
  timing: fc.constantFrom('Line', 'None') as fc.Arbitrary<'Word' | 'Line' | 'None'>, // Only test Line/None for simplicity
  language: fc.constantFrom('en', 'zh-Hant', 'zh-Hans', 'ja', 'ko'),
  translationLanguage: fc.option(fc.constantFrom('zh-Hans', 'zh-Hant', 'en'), { nil: undefined }),
  lines: fc.array(lineArb, { minLength: 1, maxLength: 10 })
}).map(p => ({
  ...p,
  // Ensure unique keys by reassigning
  lines: p.lines.map((l, i) => ({ ...l, key: `L${i + 1}` })),
  hasTranslation: p.lines.some(l => l.translation !== undefined),
  hasTransliteration: p.lines.some(l => l.transliteration !== undefined)
}));

describe('TTML Parser Property Tests', () => {
  /**
   * **Property 1: TTML 解析 Round-Trip**
   * **Validates: Requirements 4.8**
   * For any valid parsed lyrics, serializing then parsing should preserve semantic content
   */
  it('Property 1: TTML round-trip preserves semantic content', () => {
    fc.assert(
      fc.property(parsedLyricsArb, (lyrics) => {
        const serialized = serializeTTML(lyrics);
        const reparsed = parseTTML(serialized);
        
        // Timing type should be preserved
        expect(reparsed.timing).toBe(lyrics.timing);
        
        // Language should be preserved
        expect(reparsed.language).toBe(lyrics.language);
        
        // Number of lines should be preserved
        expect(reparsed.lines.length).toBe(lyrics.lines.length);
        
        // Sort both by timestamp for comparison (parser sorts by timestamp)
        const sortedOriginal = [...lyrics.lines].sort((a, b) => a.timestamp - b.timestamp);
        const sortedReparsed = [...reparsed.lines].sort((a, b) => a.timestamp - b.timestamp);
        
        // Each line's text should be preserved (comparing sorted arrays)
        for (let i = 0; i < sortedOriginal.length; i++) {
          expect(sortedReparsed[i].text).toBe(sortedOriginal[i].text);
          expect(sortedReparsed[i].timestamp).toBe(sortedOriginal[i].timestamp);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });


  /**
   * **Property 2: 歌词类型正确识别**
   * **Validates: Requirements 4.2**
   * Parser should correctly identify lyrics type from itunes:timing attribute
   */
  it('Property 2: Lyrics type correctly identified from timing attribute', () => {
    const timingTypes = ['Word', 'Line', 'None'] as const;
    
    fc.assert(
      fc.property(fc.constantFrom(...timingTypes), (timing) => {
        const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="${timing}" xml:lang="en">
  <body>
    <div>
      <p begin="0.000" end="5.000" itunes:key="L1">Test line</p>
    </div>
  </body>
</tt>`;
        
        const parsed = parseTTML(ttml);
        expect(parsed.timing).toBe(timing);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Property 3: 逐字时间戳完整提取**
   * **Validates: Requirements 4.3**
   * For word-timed lyrics, each word should have valid begin < end timestamps
   */
  it('Property 3: Word timestamps are complete and valid (begin < end)', () => {
    fc.assert(
      fc.property(
        fc.array(wordArb, { minLength: 1, maxLength: 5 }),
        (words) => {
          // Build TTML with word timing
          const spans = words.map(w => 
            `<span begin="${(w.timestamp / 1000).toFixed(3)}" end="${(w.endTime / 1000).toFixed(3)}">${w.text}</span>`
          ).join('');
          
          const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word" xml:lang="en">
  <body>
    <div>
      <p begin="${(words[0].timestamp / 1000).toFixed(3)}" end="${(words[words.length-1].endTime / 1000).toFixed(3)}" itunes:key="L1">${spans}</p>
    </div>
  </body>
</tt>`;
          
          const parsed = parseTTML(ttml);
          
          // Should have words extracted
          expect(parsed.lines.length).toBe(1);
          expect(parsed.lines[0].words).toBeDefined();
          expect(parsed.lines[0].words!.length).toBe(words.length);
          
          // Each word should have begin < end
          for (const word of parsed.lines[0].words!) {
            expect(word.timestamp).toBeLessThan(word.endTime);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Property 4: 行级时间戳完整提取**
   * **Validates: Requirements 4.4**
   * For line-timed lyrics, each line should have valid begin < end timestamps
   */
  it('Property 4: Line timestamps are complete and valid (begin < end)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            begin: fc.integer({ min: 0, max: 300000 }),
            duration: fc.integer({ min: 1000, max: 10000 }),
            text: safeTextArb
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (lines) => {
          const paragraphs = lines.map((l, i) => {
            const begin = (l.begin / 1000).toFixed(3);
            const end = ((l.begin + l.duration) / 1000).toFixed(3);
            return `      <p begin="${begin}" end="${end}" itunes:key="L${i+1}">${l.text}</p>`;
          }).join('\n');
          
          const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Line" xml:lang="en">
  <body>
    <div>
${paragraphs}
    </div>
  </body>
</tt>`;
          
          const parsed = parseTTML(ttml);
          
          expect(parsed.lines.length).toBe(lines.length);
          
          // Each line should have begin < end
          for (const line of parsed.lines) {
            expect(line.timestamp).toBeLessThan(line.endTime);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Property 5: 翻译正确关联**
   * **Validates: Requirements 4.5**
   * Translations should be correctly associated with lines via 'for' attribute
   */
  it('Property 5: Translations correctly associated with lines via for attribute', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            key: fc.integer({ min: 1, max: 20 }).map(n => `L${n}`),
            text: safeTextArb,
            translation: safeTextArb
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (lines) => {
          // Ensure unique keys
          const uniqueLines = lines.filter((l, i, arr) => 
            arr.findIndex(x => x.key === l.key) === i
          );
          if (uniqueLines.length === 0) return true;
          
          const paragraphs = uniqueLines.map((l, i) => 
            `      <p begin="${i}.000" end="${i + 1}.000" itunes:key="${l.key}">${l.text}</p>`
          ).join('\n');
          
          const translations = uniqueLines.map(l => 
            `            <text for="${l.key}">${l.translation}</text>`
          ).join('\n');
          
          const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Line" xml:lang="zh-Hant">
  <head>
    <metadata>
      <iTunesMetadata>
        <translations>
          <translation xml:lang="zh-Hans">
${translations}
          </translation>
        </translations>
      </iTunesMetadata>
    </metadata>
  </head>
  <body>
    <div>
${paragraphs}
    </div>
  </body>
</tt>`;
          
          const parsed = parseTTML(ttml);
          
          expect(parsed.hasTranslation).toBe(true);
          
          // Each line should have its correct translation
          for (const originalLine of uniqueLines) {
            const parsedLine = parsed.lines.find(l => l.key === originalLine.key);
            expect(parsedLine).toBeDefined();
            expect(parsedLine!.translation).toBe(originalLine.translation);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test getCurrentLineIndex binary search
   */
  it('getCurrentLineIndex returns correct line for given time', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 300000 }), { minLength: 1, maxLength: 20 })
          .map(timestamps => timestamps.sort((a, b) => a - b)),
        fc.integer({ min: 0, max: 300000 }),
        (timestamps, currentTime) => {
          const lines: LyricLine[] = timestamps.map((t, i) => ({
            key: `L${i}`,
            timestamp: t,
            endTime: t + 5000,
            text: `Line ${i}`
          }));
          
          const index = getCurrentLineIndex(lines, currentTime);
          
          if (index === -1) {
            // No line found - current time is before first line
            expect(currentTime).toBeLessThan(lines[0].timestamp);
          } else {
            // Found line - its timestamp should be <= currentTime
            expect(lines[index].timestamp).toBeLessThanOrEqual(currentTime);
            
            // Next line (if exists) should have timestamp > currentTime
            if (index < lines.length - 1) {
              expect(lines[index + 1].timestamp).toBeGreaterThan(currentTime);
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test getWordFillPercent calculation
   */
  it('getWordFillPercent returns value between 0 and 100', () => {
    fc.assert(
      fc.property(
        wordArb,
        fc.integer({ min: 0, max: 400000 }),
        (word, currentTime) => {
          const percent = getWordFillPercent(word, currentTime);
          
          expect(percent).toBeGreaterThanOrEqual(0);
          expect(percent).toBeLessThanOrEqual(100);
          
          // Before word starts: 0%
          if (currentTime < word.timestamp) {
            expect(percent).toBe(0);
          }
          
          // After word ends: 100%
          if (currentTime >= word.endTime) {
            expect(percent).toBe(100);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
