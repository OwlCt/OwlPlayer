import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore';
import { usePlaylistsStore } from '../store/playlistsStore';
import { getProxiedImageUrl } from '../utils/image';
import CachedImage from './CachedImage';

export default function PlaylistsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { playlists, fetchPlaylists, isLoading } = usePlaylistsStore();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchPlaylists();
    }
  }, [isAuthenticated, fetchPlaylists]);

  const handleBack = useCallback(() => {
    navigate('/profile');
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="p-8">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
        >
          <FiArrowLeft size={20} />
          <span>返回</span>
        </button>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-spotify-green border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Back button */}
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
      >
        <FiArrowLeft size={20} />
        <span>返回</span>
      </button>

      {/* Header */}
      <div className="mb-8">
        <p className="text-sm text-white/60 uppercase tracking-wider mb-2">歌单</p>
        <h1 className="text-3xl font-bold">创建的歌单</h1>
        <p className="text-sm text-white/60 mt-1">{playlists.length} 个歌单</p>
      </div>

      {/* Content */}
      {playlists.length === 0 ? (
        <div className="text-center py-16">
          <svg
            className="w-16 h-16 text-spotify-light-gray mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
          <h2 className="text-xl font-semibold text-white mb-2">还没有创建歌单</h2>
          <p className="text-spotify-light-gray">创建你的第一个歌单来收藏喜欢的音乐</p>
        </div>
      ) : (
        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 240px))' }}>
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              onClick={() => navigate(`/playlist/${playlist.id}`)}
              className="p-4 rounded-lg hover:bg-spotify-dark transition-colors cursor-pointer group"
            >
              <div className="aspect-square rounded-lg bg-spotify-gray overflow-hidden shadow-lg mb-4">
                {playlist.artwork_url ? (
                  <CachedImage
                    src={getProxiedImageUrl(playlist.artwork_url, 300)}
                    alt={playlist.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl text-spotify-light-gray bg-gradient-to-br from-spotify-gray to-spotify-dark">
                    ♪
                  </div>
                )}
              </div>
              <h3 className="font-bold truncate">{playlist.name}</h3>
              <p className="text-sm text-spotify-light-gray truncate">由 {user?.username} 创建</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
