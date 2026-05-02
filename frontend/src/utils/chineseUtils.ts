/**
 * Chinese language utilities for lyrics display
 * Handles CJK detection, simplified/traditional Chinese detection and conversion
 */

/**
 * Check if a string contains CJK (Chinese/Japanese/Korean) characters
 */
export function containsCJK(s: string): boolean {
  for (const char of s) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    
    if (
      (code >= 0x1100 && code <= 0x11FF) ||   // Hangul Jamo
      (code >= 0x2E80 && code <= 0x2EFF) ||   // CJK Radicals Supplement
      (code >= 0x2F00 && code <= 0x2FDF) ||   // Kangxi Radicals
      (code >= 0x3000 && code <= 0x303F) ||   // CJK Symbols and Punctuation
      (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
      (code >= 0x30A0 && code <= 0x30FF) ||   // Katakana
      (code >= 0x3130 && code <= 0x318F) ||   // Hangul Compatibility Jamo
      (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Unified Ideographs Extension A
      (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
      (code >= 0xAC00 && code <= 0xD7AF) ||   // Hangul Syllables
      (code >= 0xF900 && code <= 0xFAFF) ||   // CJK Compatibility Ideographs
      (code >= 0x20000 && code <= 0x2A6DF) || // CJK Unified Ideographs Extension B
      (code >= 0x2A700 && code <= 0x2B73F) || // CJK Unified Ideographs Extension C
      (code >= 0x2B740 && code <= 0x2B81F) || // CJK Unified Ideographs Extension D
      (code >= 0x2F800 && code <= 0x2FA1F)    // CJK Compatibility Ideographs Supplement
    ) {
      return true;
    }
  }
  return false;
}

// Traditional Chinese characters that have different Simplified forms
const traditionalChars = new Set([
  '國', '學', '書', '語', '說', '話', '讀', '寫', '聽', '見', '視', '覺', '觀', '親', '愛', '戀',
  '歡', '樂', '畫', '圖', '電', '腦', '機', '車', '飛', '開', '關', '門', '燈', '風', '雲', '陽',
  '陰', '東', '裡', '裏', '邊', '過', '還', '這', '個', '們', '會', '對', '為', '與', '從', '來',
  '時', '間', '問', '題', '點', '頭', '臉', '體', '發', '變', '動', '靜', '長', '廣', '遠', '進',
  '達', '連', '運', '輸', '轉', '傳', '統', '經', '濟', '貿', '買', '賣', '價', '錢', '銀', '鐵',
  '鋼', '礦', '廠', '農', '業', '產', '種', '養', '醫', '藥', '療', '護', '險', '難', '雜', '複',
  '簡', '雙', '數', '萬', '億', '幾', '許', '讓', '請', '謝', '認', '識', '記', '憶', '實', '現',
  '將', '應', '該', '須', '當', '無', '沒', '僅', '雖', '卻', '並', '虛', '歸', '誰', '淚', '傷',
  '離', '憂', '獨', '緣', '終', '結', '絕', '斷', '續', '願', '懷', '憐', '歎', '嘆', '滿', '濕',
  '濃', '燒', '熱', '煙', '燭', '燦', '爛', '瘋', '癡', '盡', '眾', '確', '禮', '穩', '窮', '競',
  '筆', '節', '範', '築', '簾', '紅', '紛', '純', '紙', '細', '組', '絲', '綠', '緊', '線', '編',
  '縫', '總', '織', '繞', '繪', '繼', '纏', '罰', '罵', '義', '習', '聖', '聲', '聰', '聯', '職',
  '臨', '舊', '舉', '興', '艱', '艷', '華', '葉', '蒼', '藍', '藝', '處', '號', '蟲', '術', '衛',
  '裝', '補', '製', '褲', '覆', '觸', '計', '訂', '訊', '設', '訴', '詞', '詢', '試', '詩', '詳',
  '誇', '誠', '誤', '課', '調', '談', '論', '諒', '諸', '謀', '證', '譜', '豐', '負', '財', '貢',
  '貨', '質', '購', '貴', '費', '資', '賀', '賓', '賞', '賢', '賴', '賺', '贈', '贊', '趕', '趙',
  '跡', '踐', '蹤', '躍', '軍', '軒', '軟', '較', '載', '輕', '輝', '輪', '辦', '迴', '週', '違',
  '遙', '適', '選', '遲', '遺', '邏', '郵', '鄉', '鄭', '醜', '釋', '錄', '錯', '鍵', '鎖', '鏡',
  '鐘', '閃', '閉', '閒', '閣', '閱', '闆', '陣', '陳', '陸', '隊', '階', '際', '隨', '隱', '頁',
  '頂', '項', '順', '預', '頻', '額', '顏', '類', '顯', '飄', '餐', '館', '駐', '駕', '騎', '驗',
  '驚', '髮', '鬥', '鬧', '魚', '鮮', '鳥', '鳳', '鴻', '鵬', '鷹', '麗', '麼', '黃', '黨', '齊',
  '齒', '龍', '龜'
]);


/**
 * Check if a string contains Traditional Chinese characters
 * Returns true if more than 5% of CJK characters are traditional-specific
 */
export function isTraditionalChinese(s: string): boolean {
  let traditionalCount = 0;
  let totalCJK = 0;
  
  for (const char of s) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    
    // Count CJK Unified Ideographs
    if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF)) {
      totalCJK++;
      if (traditionalChars.has(char)) {
        traditionalCount++;
      }
    }
  }
  
  // If more than 5% of CJK characters are traditional-specific, consider it Traditional Chinese
  if (totalCJK > 0 && traditionalCount / totalCJK > 0.05) {
    return true;
  }
  return false;
}

/**
 * Detect the Chinese variant of a string
 * Returns 'traditional', 'simplified', or null if not Chinese
 */
export function detectChineseVariant(s: string): 'traditional' | 'simplified' | null {
  if (!containsCJK(s)) {
    return null;
  }
  return isTraditionalChinese(s) ? 'traditional' : 'simplified';
}

// OpenCC-js will be dynamically imported when needed
let openccConverter: {
  traditionalToSimplified: (s: string) => string;
  simplifiedToTraditional: (s: string) => string;
} | null = null;

/**
 * Initialize OpenCC converter (lazy loading)
 */
async function initOpenCC(): Promise<typeof openccConverter> {
  if (openccConverter) return openccConverter;
  
  try {
    // Dynamic import of opencc-js
    const OpenCC = await import('opencc-js');
    openccConverter = {
      traditionalToSimplified: OpenCC.Converter({ from: 'tw', to: 'cn' }),
      simplifiedToTraditional: OpenCC.Converter({ from: 'cn', to: 'tw' })
    };
    return openccConverter;
  } catch (e) {
    console.warn('OpenCC-js not available, using fallback');
    return null;
  }
}

/**
 * Convert Traditional Chinese to Simplified Chinese
 */
export async function toSimplified(s: string): Promise<string> {
  const converter = await initOpenCC();
  if (converter) {
    return converter.traditionalToSimplified(s);
  }
  // Fallback: return original string
  return s;
}

/**
 * Convert Simplified Chinese to Traditional Chinese
 */
export async function toTraditional(s: string): Promise<string> {
  const converter = await initOpenCC();
  if (converter) {
    return converter.simplifiedToTraditional(s);
  }
  // Fallback: return original string
  return s;
}

/**
 * Select the appropriate text based on user preference and available variants
 * @param mainText - The main lyric text
 * @param translationText - The translation text (may be a different Chinese variant)
 * @param userPreference - User's preferred Chinese variant
 * @returns The text to display
 */
export function selectChineseVariant(
  mainText: string,
  translationText: string | undefined,
  userPreference: 'simplified' | 'traditional' | 'auto'
): { text: string; showTranslation: boolean } {
  // If no translation, just return main text
  if (!translationText) {
    return { text: mainText, showTranslation: false };
  }
  
  const mainIsCJK = containsCJK(mainText);
  const transIsCJK = containsCJK(translationText);
  
  // If both are CJK, check if they're different variants
  if (mainIsCJK && transIsCJK) {
    const mainIsTraditional = isTraditionalChinese(mainText);
    const transIsTraditional = isTraditionalChinese(translationText);
    
    // If they're different variants (simplified/traditional pair)
    if (mainIsTraditional !== transIsTraditional) {
      if (userPreference === 'auto') {
        // Auto: prefer simplified
        return mainIsTraditional 
          ? { text: translationText, showTranslation: false }
          : { text: mainText, showTranslation: false };
      } else if (userPreference === 'traditional') {
        return mainIsTraditional
          ? { text: mainText, showTranslation: false }
          : { text: translationText, showTranslation: false };
      } else {
        // simplified
        return mainIsTraditional
          ? { text: translationText, showTranslation: false }
          : { text: mainText, showTranslation: false };
      }
    }
    
    // Same variant - don't show duplicate
    return { text: mainText, showTranslation: false };
  }
  
  // Different languages (e.g., Chinese main with English translation)
  return { text: mainText, showTranslation: true };
}
