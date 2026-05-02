/**
 * Desktop Audio Session 实现
 * 标准 HTML5 音频处理，无特殊平台逻辑
 */

import type {
  IAudioSessionManager,
  AudioSessionState,
  AudioSessionEvents,
  AudioSessionConfig,
} from './types';
import { defaultAudioSessionConfig } from './types';
import { detectPlatform, type PlatformInfo } from './detection';
import { getAuthenticatedStreamUrl } from '../streamUrl';

type EventHandler<K extends keyof AudioSessionEvents> = AudioSessionEvents[K];

export class DesktopAudioSession implements IAudioSessionManager {
  readonly platform = 'desktop' as const;
  private _state: AudioSessionState = 'closed';
  private _config: AudioSessionConfig;
  private platformInfo: PlatformInfo;
  private eventHandlers: Map<keyof AudioSessionEvents, Set<EventHandler<keyof AudioSessionEvents>>> = new Map();

  constructor(config?: Partial<AudioSessionConfig>) {
    this._config = { ...defaultAudioSessionConfig, ...config };
    this.platformInfo = detectPlatform();
  }

  get state(): AudioSessionState {
    return this._state;
  }

  get isHlsMode(): boolean {
    return this._config.hlsEnabled;
  }

  get config(): AudioSessionConfig {
    return this._config;
  }

  /**
   * 初始化音频会话
   */
  async initialize(): Promise<void> {
    this._state = 'active';
    this.emit('stateChange', 'active');
  }

  /**
   * 获取流媒体 URL
   * Desktop 统一使用 HLS，Safari 走原生播放，其它浏览器走 hls.js。
   */
  getStreamUrl(songId: string): string {
    return getAuthenticatedStreamUrl(songId, this.isHlsMode, "aac_256");
  }

  /**
   * 准备播放
   */
  async preparePlayback(audioElement: HTMLAudioElement, songId: string): Promise<void> {
    const url = this.getStreamUrl(songId);
    audioElement.src = url;
    this._state = 'active';
  }

  /**
   * 恢复播放
   */
  async resumePlayback(audioElement: HTMLAudioElement): Promise<boolean> {
    try {
      await audioElement.play();
      this._state = 'active';
      return true;
    } catch (error) {
      if ((error as Error).name === 'NotAllowedError') {
        // 需要用户交互
        return false;
      }
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * 处理播放错误
   * Desktop 不需要特殊的错误恢复逻辑
   */
  async handlePlaybackError(error: Error, _audioElement: HTMLAudioElement): Promise<boolean> {
    console.error('[Desktop] Playback error:', error);
    this.emit('error', error);
    return false;
  }

  /**
   * 同步进度
   */
  syncProgress(audioElement: HTMLAudioElement, savedProgress: number): void {
    if (audioElement.duration && savedProgress > 0 && savedProgress < audioElement.duration) {
      audioElement.currentTime = savedProgress;
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this._state = 'closed';
    this.eventHandlers.clear();
    this.emit('stateChange', 'closed');
  }

  /**
   * 添加事件监听
   */
  on<K extends keyof AudioSessionEvents>(event: K, handler: AudioSessionEvents[K]): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as EventHandler<keyof AudioSessionEvents>);
  }

  /**
   * 移除事件监听
   */
  off<K extends keyof AudioSessionEvents>(event: K, handler: AudioSessionEvents[K]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<keyof AudioSessionEvents>);
    }
  }

  /**
   * 触发事件
   */
  private emit<K extends keyof AudioSessionEvents>(
    event: K,
    ...args: Parameters<AudioSessionEvents[K]>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          (handler as (...args: Parameters<AudioSessionEvents[K]>) => void)(...args);
        } catch (error) {
          console.error(`[Desktop] Error in event handler for ${event}:`, error);
        }
      });
    }
  }
}
