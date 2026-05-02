import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore';
import { extractDominantColor } from '../utils/colorExtractor';
import { getProxiedImageUrl } from '../utils/image';
import ProfileArtistCard from './ProfileArtistCard';

export interface ArtistListItem {
  id: string;
  name: string;
  artworkUrl: string;
}

export interface ArtistListPageProps {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  artists: ArtistListItem[];
  isLoading: boolean;
  onFetch: () => void;
}

export default function ArtistListPage({
  title,
  emptyTitle,
  emptyDescription,
  artists,
  isLoading,
  onFetch,
}: ArtistListPageProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [themeColor, setThemeColor] = useState<string>('rgb(38, 38, 38)');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      onFetch();
    }
  }, [isAuthenticated, onFetch]);

  useEffect(() => {
    if (artists.length > 0 && artists[0].artworkUrl) {
      const imageUrl = getProxiedImageUrl(artists[0].artworkUrl, 100);
      extractDominantColor(imageUrl).then(setThemeColor);
    }
  }, [artists]);

  const handleBack = () => {
    navigate('/profile');
  };

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
        <p className="text-sm text-white/60 uppercase tracking-wider mb-2">艺人</p>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-sm text-white/60 mt-1">{artists.length} 位艺人</p>
      </div>

      {/* Content */}
      {artists.length === 0 ? (
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
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-white mb-2">{emptyTitle}</h2>
          <p className="text-spotify-light-gray">{emptyDescription}</p>
        </div>
      ) : (
        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 240px))' }}>
          {artists.map((artist) => (
            <ProfileArtistCard
              key={artist.id}
              artist={artist}
              onClick={() => navigate(`/artist/${artist.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
