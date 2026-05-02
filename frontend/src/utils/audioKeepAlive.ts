/**
 * Audio Keep-Alive 工具
 * 
 * 解决 Android PWA 后台播放问题的核心机制：
 * 
 * 问题原因：
 * - Chrome: "Pages playing audible audio are exempted from background timer throttling.
 *           Exemption lasts for several seconds after audio stops playing."
 * - 当一首歌结束后，在加载下一首歌的过程中，如果没有音频在播放，
 *   Chrome 会在几秒后开始节流页面，导致 JavaScript 执行被限制。
 * 
 * 解决方案：
 * - 使用 AudioContext 生成一个超低音量的高频音频（人耳几乎听不到）
 * - 在歌曲切换期间保持这个音频播放，防止浏览器节流
 * - 当新歌曲开始播放后，可以停止保活音频
 * 
 * 参考：
 * - https://developer.chrome.com/blog/background_tabs
 * - https://jamesparsons.com/bypass-chome-memory-saver-javascript
 */

let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let isKeepAliveActive = false;
let isInitialized = false;

// 保活音频参数
const KEEP_ALIVE_FREQUENCY = 20000; // 20kHz - 超出大多数人的听觉范围
const KEEP_ALIVE_GAIN = 0.0001; // 极低音量 (-80dB)

/**
 * 初始化 AudioContext
 * 必须在用户交互后调用
 */
function initAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext;
  }

  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      console.warn('[AudioKeepAlive] AudioContext not supported');
      return null;
    }

    audioContext = new AudioCtx();
    console.log('[AudioKeepAlive] AudioContext initialized, state:', audioContext.state);
    return audioContext;
  } catch (error) {
    console.error('[AudioKeepAlive] Failed to create AudioContext:', error);
    return null;
  }
}

/**
 * 启动保活音频
 * 在歌曲切换时调用，防止浏览器在后台节流
 * 
 * 注意：只有在 AudioContext 已经被用户交互激活后才会真正启动
 */
export function startKeepAlive(): void {
  if (isKeepAliveActive) {
    return;
  }

  // 如果还没有初始化，不启动保活音频
  // 这样可以避免在用户首次点击播放时出现问题
  if (!isInitialized || !audioContext) {
    console.log('[AudioKeepAlive] Not initialized yet, skipping start');
    return;
  }

  // 如果 AudioContext 处于 suspended 状态，说明还没有用户交互
  if (audioContext.state === 'suspended') {
    console.log('[AudioKeepAlive] AudioContext suspended, skipping start');
    return;
  }

  try {
    // 创建振荡器（生成音频信号）
    oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = KEEP_ALIVE_FREQUENCY;

    // 创建增益节点（控制音量）
    gainNode = audioContext.createGain();
    gainNode.gain.value = KEEP_ALIVE_GAIN;

    // 连接节点：振荡器 -> 增益 -> 输出
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // 开始播放
    oscillator.start();
    isKeepAliveActive = true;

    console.log('[AudioKeepAlive] Keep-alive audio started (20kHz, -80dB)');
  } catch (error) {
    console.error('[AudioKeepAlive] Failed to start keep-alive:', error);
  }
}

/**
 * 停止保活音频
 * 在新歌曲开始播放后调用
 */
export function stopKeepAlive(): void {
  if (!isKeepAliveActive) {
    return;
  }

  try {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }

    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }

    isKeepAliveActive = false;
    console.log('[AudioKeepAlive] Keep-alive audio stopped');
  } catch (error) {
    console.error('[AudioKeepAlive] Failed to stop keep-alive:', error);
  }
}

/**
 * 检查保活音频是否正在运行
 */
export function isKeepAliveRunning(): boolean {
  return isKeepAliveActive;
}

/**
 * 清理资源
 */
export function cleanupKeepAlive(): void {
  stopKeepAlive();

  if (audioContext) {
    audioContext.close().catch(console.error);
    audioContext = null;
  }
}

/**
 * 在用户首次交互时初始化
 * 由于 AudioContext 需要用户交互才能启动，
 * 应该在用户点击播放按钮时调用此函数
 */
export function initKeepAliveOnUserGesture(): void {
  // 如果已经初始化，直接返回
  if (isInitialized) {
    return;
  }
  
  const ctx = initAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended') {
      ctx.resume()
        .then(() => {
          isInitialized = true;
          console.log('[AudioKeepAlive] Initialized on user gesture, state:', ctx.state);
        })
        .catch((err) => {
          console.error('[AudioKeepAlive] Failed to resume AudioContext:', err);
        });
    } else {
      // AudioContext 已经是 running 状态
      isInitialized = true;
      console.log('[AudioKeepAlive] Already running, marked as initialized');
    }
  }
}

/**
 * 获取 AudioContext 状态（用于调试）
 */
export function getKeepAliveStatus(): {
  contextState: string | null;
  isActive: boolean;
} {
  return {
    contextState: audioContext?.state ?? null,
    isActive: isKeepAliveActive,
  };
}
