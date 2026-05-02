/**
 * AudioSessionManager 类型定义
 * 定义平台、状态、事件和接口类型
 */

/** 支持的平台类型 */
export type Platform = 'ios' | 'android' | 'desktop';

/** 音频会话状态 */
export type AudioSessionState = 'active' | 'suspended' | 'interrupted' | 'closed';

/** 音频会话事件类型 */
export interface AudioSessionEvents {
  /** 会话状态变化 */
  stateChange: (state: AudioSessionState) => void;
  /** 进入后台 */
  backgroundEnter: () => void;
  /** 退出后台 */
  backgroundExit: () => void;
  /** 会话冻结 (iOS) */
  sessionFrozen: () => void;
  /** 会话恢复 */
  sessionRestored: () => void;
  /** 错误发生 */
  error: (error: Error) => void;
  /** 需要用户交互 (iOS 中断恢复) */
  needsUserInteraction: () => void;
}

/** 音频会话配置 */
export interface AudioSessionConfig {
  /** 是否启用 HLS 模式 */
  hlsEnabled: boolean;
  /** 是否启用后台预加载 */
  backgroundPreloadEnabled: boolean;
  /** 最大重试次数 */
  maxRetryAttempts: number;
}

/** 音频会话管理器接口 */
export interface IAudioSessionManager {
  /** 当前平台 */
  readonly platform: Platform;
  /** 当前会话状态 */
  readonly state: AudioSessionState;
  /** 是否使用 HLS 模式 */
  readonly isHlsMode: boolean;
  /** 配置 */
  readonly config: AudioSessionConfig;

  /** 初始化音频会话 */
  initialize(): Promise<void>;

  /** 获取流媒体 URL */
  getStreamUrl(songId: string): string;

  /** 准备播放 */
  preparePlayback(audioElement: HTMLAudioElement, songId: string): Promise<void>;

  /** 恢复播放 (用户交互后) */
  resumePlayback(audioElement: HTMLAudioElement): Promise<boolean>;

  /** 处理播放错误 */
  handlePlaybackError(error: Error, audioElement: HTMLAudioElement): Promise<boolean>;

  /** 同步进度 (后台恢复时) */
  syncProgress(audioElement: HTMLAudioElement, savedProgress: number): void;

  /** 清理资源 */
  cleanup(): void;

  /** 事件监听 */
  on<K extends keyof AudioSessionEvents>(event: K, handler: AudioSessionEvents[K]): void;
  off<K extends keyof AudioSessionEvents>(event: K, handler: AudioSessionEvents[K]): void;
}

/** 默认配置 */
export const defaultAudioSessionConfig: AudioSessionConfig = {
  hlsEnabled: true,
  backgroundPreloadEnabled: true,
  maxRetryAttempts: 3,
};
