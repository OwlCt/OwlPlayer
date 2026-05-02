import { FiTrash2, FiRefreshCw, FiMusic } from 'react-icons/fi';
import { useDataTab } from './hooks';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SuccessAlert, ErrorAlert, SubmitButton } from './common';

export default function DataTab() {
  const isMobile = useIsMobile();
  const {
    isClearingPlayHistory,
    isClearingPlaybackState,
    isClearingStreamingAudioCache,
    error,
    success,
    handleClearPlayHistory,
    handleClearPlaybackState,
    handleClearStreamingAudioCache,
  } = useDataTab();

  return (
    <div className="space-y-4">
      {success && <SuccessAlert message={success} />}
      {error && <ErrorAlert message={error} />}

      {/* Clear Play History */}
      <div className={`bg-white/5 rounded-lg ${isMobile ? 'p-4' : 'p-6'}`}>
        <div className={`flex ${isMobile ? 'flex-col' : 'items-start gap-4'}`}>
          {!isMobile && (
            <div className="p-3 bg-red-500/20 rounded-lg">
              <FiTrash2 className="w-6 h-6 text-red-400" />
            </div>
          )}
          <div className="flex-1">
            <div className={`flex items-center gap-2 ${isMobile ? 'mb-2' : 'mb-2'}`}>
              {isMobile && <FiTrash2 className="w-5 h-5 text-red-400" />}
              <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-medium text-white`}>清除播放历史</h3>
            </div>
            <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-white/60 mb-4`}>
              清除所有播放历史记录，包括"本月热门曲目"和"本月热门艺人"的统计数据。此操作不可撤销。
            </p>
            <div className={isMobile ? 'flex justify-center' : ''}>
              <SubmitButton
                type="button"
                variant="danger"
                loading={isClearingPlayHistory}
                loadingText="清除中..."
                onClick={handleClearPlayHistory}
              >
                清除播放历史
              </SubmitButton>
            </div>
          </div>
        </div>
      </div>

      {/* Clear Playback State Cache */}
      <div className={`bg-white/5 rounded-lg ${isMobile ? 'p-4' : 'p-6'}`}>
        <div className={`flex ${isMobile ? 'flex-col' : 'items-start gap-4'}`}>
          {!isMobile && (
            <div className="p-3 bg-orange-500/20 rounded-lg">
              <FiRefreshCw className="w-6 h-6 text-orange-400" />
            </div>
          )}
          <div className="flex-1">
            <div className={`flex items-center gap-2 ${isMobile ? 'mb-2' : 'mb-2'}`}>
              {isMobile && <FiRefreshCw className="w-5 h-5 text-orange-400" />}
              <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-medium text-white`}>清除播放状态缓存</h3>
            </div>
            <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-white/60 mb-4`}>
              清除当前播放队列和进度缓存。如果遇到播放队列异常（如旧队列不断恢复），可以尝试清除。
            </p>
            <div className={isMobile ? 'flex justify-center' : ''}>
              <SubmitButton
                type="button"
                variant="danger"
                loading={isClearingPlaybackState}
                loadingText="清除中..."
                onClick={handleClearPlaybackState}
              >
                清除播放状态
              </SubmitButton>
            </div>
          </div>
        </div>
      </div>

      {/* Clear Streaming Audio Cache */}
      <div className={`bg-white/5 rounded-lg ${isMobile ? 'p-4' : 'p-6'}`}>
        <div className={`flex ${isMobile ? 'flex-col' : 'items-start gap-4'}`}>
          {!isMobile && (
            <div className="p-3 bg-sky-500/20 rounded-lg">
              <FiMusic className="w-6 h-6 text-sky-300" />
            </div>
          )}
          <div className="flex-1">
            <div className={`flex items-center gap-2 ${isMobile ? 'mb-2' : 'mb-2'}`}>
              {isMobile && <FiMusic className="w-5 h-5 text-sky-300" />}
              <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-medium text-white`}>清除流式音频缓存</h3>
            </div>
            <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-white/60 mb-4`}>
              清除当前设备上用于在线播放的音频缓存，包括预加载音频和 Service Worker 流式缓存。不会删除离线下载内容。
            </p>
            <div className={isMobile ? 'flex justify-center' : ''}>
              <SubmitButton
                type="button"
                variant="danger"
                loading={isClearingStreamingAudioCache}
                loadingText="清除中..."
                onClick={handleClearStreamingAudioCache}
              >
                清除流式缓存
              </SubmitButton>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="pt-4 border-t border-white/10">
        <h3 className="text-sm font-medium text-white/80 mb-3">关于数据管理</h3>
        <ul className="text-xs text-white/50 space-y-2">
          <li>• 播放历史用于生成"本月热门曲目"和"本月热门艺人"统计</li>
          <li>• 只有播放超过30秒的歌曲才会被记录到播放历史</li>
          <li>• 清除播放历史不会影响你的喜欢的歌曲和歌单</li>
          <li>• 播放状态缓存包括当前播放队列、播放进度和音量设置</li>
          <li>• 流式音频缓存只用于在线播放加速，不包含离线下载的歌曲数据</li>
        </ul>
      </div>
    </div>
  );
}
