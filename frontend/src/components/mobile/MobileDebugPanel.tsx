/**
 * iOS PWA Debug Panel
 * 
 * 在 iOS PWA 模式下显示调试日志，方便排查问题
 * 通过连续点击版本号 5 次来打开
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { IoClose, IoCopy, IoTrash, IoChevronDown, IoChevronUp } from 'react-icons/io5';
import { isIOSPWA } from '../../utils/iosPwaDetection';
import { getAuthenticatedStreamUrl } from '../../utils/streamUrl';
import { detectPlatform } from '../../utils/audioSession/detection';
import {
  buildPlaybackStreamUrl,
  loadDesktopTranscodeQuality,
  loadIOSHLSQuality,
  mapIOSHLSQualityToQuery,
} from '../../utils/playbackQuality';

interface LogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  args: string;
}

// 全局日志存储
const MAX_LOGS = 500;
let globalLogs: LogEntry[] = [];
let logListeners: Set<() => void> = new Set();

// 添加日志监听器
function addLogListener(listener: () => void) {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
}

// 通知所有监听器
function notifyLogListeners() {
  logListeners.forEach(listener => listener());
}

// 添加日志 - 导出供其他模块使用
export function addLog(level: LogEntry['level'], args: unknown[]) {
  const message = args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    try {
      return JSON.stringify(arg, null, 0);
    } catch {
      return String(arg);
    }
  }).join(' ');

  const entry: LogEntry = {
    timestamp: Date.now(),
    level,
    message: message.slice(0, 500), // 增加长度限制
    args: message,
  };

  globalLogs.push(entry);
  if (globalLogs.length > MAX_LOGS) {
    globalLogs = globalLogs.slice(-MAX_LOGS);
  }

  notifyLogListeners();
}

// 简化的调试日志函数 - 导出供其他模块使用
export function debugLog(...args: unknown[]) {
  addLog('log', args);
}

export function debugWarn(...args: unknown[]) {
  addLog('warn', args);
}

export function debugError(...args: unknown[]) {
  addLog('error', args);
}

// 初始化控制台拦截
let isConsoleIntercepted = false;

export function initDebugConsole() {
  if (isConsoleIntercepted) return;
  if (typeof window === 'undefined') return;
  
  isConsoleIntercepted = true;
  
  // 添加一条初始化日志
  addLog('info', ['[Debug] Console interceptor initialized at', new Date().toISOString()]);

  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };

  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    addLog('log', args);
  };

  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    addLog('warn', args);
  };

  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    addLog('error', args);
  };

  console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    addLog('info', args);
  };

  // 捕获未处理的错误
  window.addEventListener('error', (event) => {
    addLog('error', [`[Uncaught] ${event.message} at ${event.filename}:${event.lineno}`]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    addLog('error', [`[Unhandled Promise] ${event.reason}`]);
  });

  // 不再用 console.log，直接添加到日志
  addLog('log', ['[Debug] Console interceptor ready']);
}

// 获取所有日志
export function getDebugLogs(): LogEntry[] {
  return [...globalLogs];
}

// 清除日志
export function clearDebugLogs() {
  globalLogs = [];
  notifyLogListeners();
}

// 格式化日志为文本
export function formatLogsAsText(): string {
  return globalLogs.map(log => {
    const time = new Date(log.timestamp).toISOString().slice(11, 23);
    const level = log.level.toUpperCase().padEnd(5);
    return `[${time}] ${level} ${log.args}`;
  }).join('\n');
}

interface MobileDebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileDebugPanel({ isOpen, onClose }: MobileDebugPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 订阅日志更新
  useEffect(() => {
    const updateLogs = () => setLogs(getDebugLogs());
    updateLogs();
    const removeListener = addLogListener(updateLogs);
    return () => {
      removeListener();
    };
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopy = useCallback(async () => {
    const text = formatLogsAsText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for iOS
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleClear = useCallback(() => {
    clearDebugLogs();
  }, []);

  // 测试按钮 - 点击后输出测试日志
  const handleTest = useCallback(async () => {
    // 直接添加日志，绕过 console
    addLog('log', ['[Test] Direct log - ' + Date.now()]);
    
    // 获取当前播放的歌曲 ID
    const playerState = (window as unknown as { usePlayerStore?: { getState: () => { currentSong?: { id: string } } } }).usePlayerStore?.getState?.();
    const songId = playerState?.currentSong?.id;
    
    if (songId) {
      addLog('log', ['[Test] Fetching m3u8 for song:', songId]);
      try {
        const platformInfo = detectPlatform();
        const playlistUrl =
          platformInfo.platform === 'ios'
            ? getAuthenticatedStreamUrl(
                songId,
                true,
                mapIOSHLSQualityToQuery(loadIOSHLSQuality()),
              )
            : buildPlaybackStreamUrl(
                getAuthenticatedStreamUrl(songId, true, 'aac_256'),
                platformInfo.platform,
                loadDesktopTranscodeQuality(),
              );
        const resp = await fetch(playlistUrl);
        const text = await resp.text();
        addLog('log', ['[Test] m3u8 status:', resp.status, 'content-type:', resp.headers.get('content-type')]);
        addLog('log', ['[Test] m3u8 content:', text.slice(0, 300)]);
      } catch (e) {
        addLog('error', ['[Test] Failed to fetch m3u8:', (e as Error).message]);
      }
    } else {
      addLog('warn', ['[Test] No current song']);
    }
  }, []);

  const filteredLogs = filter
    ? logs.filter(log => log.message.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-900 border-b border-neutral-800">
        <h2 className="text-white font-semibold">Debug Console</h2>
        <div className="flex items-center gap-2">
          <button
            onTouchEnd={(e) => { e.preventDefault(); handleTest(); }}
            onClick={handleTest}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded active:bg-blue-700"
            title="Test log"
          >
            Test
          </button>
          <button
            onClick={handleClear}
            className="p-2 text-white/60 hover:text-white"
            title="Clear logs"
          >
            <IoTrash size={20} />
          </button>
          <button
            onClick={handleCopy}
            className="p-2 text-white/60 hover:text-white"
            title="Copy all logs"
          >
            <IoCopy size={20} />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-white/60 hover:text-white"
          >
            <IoClose size={24} />
          </button>
        </div>
      </div>

      {/* Copy feedback */}
      {copied && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm">
          已复制 {logs.length} 条日志
        </div>
      )}

      {/* Filter */}
      <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter logs..."
          className="w-full bg-neutral-800 text-white px-3 py-2 rounded-lg text-sm"
        />
      </div>

      {/* Auto-scroll toggle */}
      <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
        <span className="text-white/60 text-sm">
          {filteredLogs.length} / {logs.length} logs
        </span>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1 text-sm ${autoScroll ? 'text-green-500' : 'text-white/60'}`}
        >
          {autoScroll ? <IoChevronDown size={16} /> : <IoChevronUp size={16} />}
          Auto-scroll
        </button>
      </div>

      {/* Log list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs"
      >
        {filteredLogs.map((log, index) => (
          <div
            key={index}
            className={`py-1 px-2 rounded mb-1 ${
              log.level === 'error' ? 'bg-red-900/30 text-red-300' :
              log.level === 'warn' ? 'bg-yellow-900/30 text-yellow-300' :
              log.level === 'info' ? 'bg-blue-900/30 text-blue-300' :
              'bg-neutral-800/50 text-white/80'
            }`}
          >
            <span className="text-white/40">
              {new Date(log.timestamp).toISOString().slice(11, 23)}
            </span>
            {' '}
            <span className={
              log.level === 'error' ? 'text-red-400' :
              log.level === 'warn' ? 'text-yellow-400' :
              log.level === 'info' ? 'text-blue-400' :
              'text-white/60'
            }>
              [{log.level.toUpperCase()}]
            </span>
            {' '}
            {log.message}
          </div>
        ))}
      </div>

      {/* Quick info */}
      <div className="px-4 py-2 bg-neutral-900 border-t border-neutral-800 text-xs text-white/40">
        <div>iOS PWA: {isIOSPWA() ? 'Yes' : 'No'}</div>
        <div>User Agent: {navigator.userAgent.slice(0, 60)}...</div>
      </div>
    </div>
  );
}

/**
 * Debug trigger hook - 连续点击 5 次打开调试面板
 */
export function useDebugTrigger() {
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const clickCountRef = useRef(0);
  const lastClickTimeRef = useRef(0);

  const handleTriggerClick = useCallback(() => {
    const now = Date.now();
    // 如果距离上次点击超过 2 秒，重置计数
    if (now - lastClickTimeRef.current > 2000) {
      clickCountRef.current = 0;
    }
    lastClickTimeRef.current = now;
    clickCountRef.current++;

    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      setIsDebugOpen(true);
    }
  }, []);

  const closeDebug = useCallback(() => {
    setIsDebugOpen(false);
  }, []);

  return {
    isDebugOpen,
    handleTriggerClick,
    closeDebug,
  };
}

export default MobileDebugPanel;
