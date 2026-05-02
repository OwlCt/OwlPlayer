/**
 * 从图片中提取主色调
 * 使用 Canvas API 分析图片像素
 */

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface ExtractedColors {
  dominant: string;      // 主色调 (hex)
  vibrant: string;       // 鲜艳色 (hex)
  muted: string;         // 柔和色 (hex)
  darkMuted: string;     // 深色柔和 (hex)
  lightMuted: string;    // 浅色柔和 (hex)
}

// 缓存已提取的颜色
const colorCache = new Map<string, ExtractedColors>();

/**
 * RGB 转 Hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * 计算颜色的亮度 (0-255)
 */
function getLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 计算颜色的饱和度 (0-1)
 */
function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/**
 * 量化颜色到较少的色彩空间
 */
function quantizeColor(r: number, g: number, b: number, levels: number = 32): string {
  const factor = 256 / levels;
  const qr = Math.floor(r / factor) * factor;
  const qg = Math.floor(g / factor) * factor;
  const qb = Math.floor(b / factor) * factor;
  return `${qr},${qg},${qb}`;
}

/**
 * 从图片 URL 提取颜色
 */
export async function extractColorsFromImage(imageUrl: string): Promise<ExtractedColors> {
  // 检查缓存
  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)!;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve(getDefaultColors());
          return;
        }

        // 缩小图片以提高性能
        const size = 50;
        canvas.width = size;
        canvas.height = size;
        
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels = imageData.data;

        // 统计颜色频率
        const colorCounts = new Map<string, { count: number; r: number; g: number; b: number }>();
        
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];
          
          // 跳过透明像素
          if (a < 128) continue;
          
          // 跳过太暗或太亮的颜色
          const lum = getLuminance(r, g, b);
          if (lum < 20 || lum > 235) continue;
          
          const key = quantizeColor(r, g, b);
          const existing = colorCounts.get(key);
          
          if (existing) {
            existing.count++;
            existing.r = (existing.r + r) / 2;
            existing.g = (existing.g + g) / 2;
            existing.b = (existing.b + b) / 2;
          } else {
            colorCounts.set(key, { count: 1, r, g, b });
          }
        }

        // 转换为数组并排序
        const sortedColors = Array.from(colorCounts.entries())
          .map(([_, value]) => value)
          .sort((a, b) => b.count - a.count);

        if (sortedColors.length === 0) {
          resolve(getDefaultColors());
          return;
        }

        // 提取不同类型的颜色
        const dominant = sortedColors[0];
        
        // 找鲜艳色 (高饱和度)
        const vibrant = sortedColors.find(c => getSaturation(c.r, c.g, c.b) > 0.5) || dominant;
        
        // 找柔和色 (中等饱和度和亮度)
        const muted = sortedColors.find(c => {
          const sat = getSaturation(c.r, c.g, c.b);
          const lum = getLuminance(c.r, c.g, c.b);
          return sat > 0.1 && sat < 0.5 && lum > 50 && lum < 200;
        }) || dominant;
        
        // 找深色柔和 - 优先找较暗的颜色
        const darkMutedBase = sortedColors.find(c => {
          const lum = getLuminance(c.r, c.g, c.b);
          return lum < 80;
        }) || sortedColors.find(c => {
          const lum = getLuminance(c.r, c.g, c.b);
          return lum < 120;
        }) || dominant;
        
        // 将 darkMuted 颜色进一步压暗，确保足够深
        const darkenFactor = 0.5; // 压暗到原来的 50%
        const darkMuted = {
          r: darkMutedBase.r * darkenFactor,
          g: darkMutedBase.g * darkenFactor,
          b: darkMutedBase.b * darkenFactor,
        };
        
        // 找浅色柔和
        const lightMuted = sortedColors.find(c => {
          const lum = getLuminance(c.r, c.g, c.b);
          return lum > 150;
        }) || dominant;

        const colors: ExtractedColors = {
          dominant: rgbToHex(dominant.r, dominant.g, dominant.b),
          vibrant: rgbToHex(vibrant.r, vibrant.g, vibrant.b),
          muted: rgbToHex(muted.r, muted.g, muted.b),
          darkMuted: rgbToHex(darkMuted.r, darkMuted.g, darkMuted.b),
          lightMuted: rgbToHex(lightMuted.r, lightMuted.g, lightMuted.b),
        };

        // 缓存结果
        colorCache.set(imageUrl, colors);
        resolve(colors);
      } catch (error) {
        console.error('Color extraction failed:', error);
        resolve(getDefaultColors());
      }
    };

    img.onerror = () => {
      console.error('Failed to load image for color extraction');
      resolve(getDefaultColors());
    };

    img.src = imageUrl;
  });
}

/**
 * 默认颜色（当提取失败时使用）
 */
function getDefaultColors(): ExtractedColors {
  return {
    dominant: '#1a1a1a',
    vibrant: '#1db954',
    muted: '#535353',
    darkMuted: '#151515',
    lightMuted: '#b3b3b3',
  };
}

/**
 * 清除颜色缓存
 */
export function clearColorCache(): void {
  colorCache.clear();
}

/**
 * 调整颜色亮度
 */
export function adjustBrightness(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  const newR = Math.min(255, Math.max(0, Math.round(r * factor)));
  const newG = Math.min(255, Math.max(0, Math.round(g * factor)));
  const newB = Math.min(255, Math.max(0, Math.round(b * factor)));
  
  return rgbToHex(newR, newG, newB);
}

/**
 * 混合两个颜色
 */
export function blendColors(hex1: string, hex2: string, ratio: number = 0.5): string {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  
  const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
  const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
  const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
  
  return rgbToHex(r, g, b);
}

/**
 * 从图片 URL 提取主色调（简化版，只返回 dominant 颜色）
 * 用于页面背景渐变等场景
 */
export async function extractDominantColor(imageUrl: string): Promise<string> {
  const colors = await extractColorsFromImage(imageUrl);
  return colors.dominant;
}
