import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { getProxiedImageUrl } from '../../utils/image';
import MobileHeader from './MobileHeader';
import CachedImage from '../CachedImage';

// 艺人列表项
export interface ArtistItem {
  id: string;
  name: string;
  artworkUrl: string;
}

// 歌单列表项
export interface PlaylistItem {
  id: string;
  name: string;
  artworkUrl?: string;
}

// 曲目列表项
export interface TrackItem {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  albumId: string;
  albumName: string;
  artworkUrl: string;
  duration: number;
  playCount?: number;
}

interface MobileArtistListPageProps {
  type: 'artists';
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  items: ArtistItem[];
  isLoading: boolean;
  onFetch: () => void;
}

interface MobilePlaylistListPageProps {
  type: 'playlists';
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  items: PlaylistItem[];
  isLoading: boolean;
  onFetch: () => void;
}

interface MobileTrackListPageProps {
  type: 'tracks';
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  items: TrackItem[];
  isLoading: boolean;
  onFetch: () => void;
  onPlayTrack: (index: number) => void;
}

type MobileProfileListPageProps = 
  | MobileArtistListPageProps 
  | MobilePlaylistListPageProps 
  | MobileTrackListPageProps;

export default function MobileProfileListPage(props: MobileProfileListPageProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      props.onFetch();
    }
  }, [isAuthenticated, props.onFetch]);

  if (props.isLoading) {
    return (
      <div className="min-h-screen bg-black">
        <MobileHeader
          title={props.title}
          opacity={1}
          backgroundColor="rgb(0, 0, 0)"
          showBackButton={true}
        />
        <div 
          className="flex items-center justify-center pt-32"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 128px)' }}
        >
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  const isEmpty = props.items.length === 0;

  return (
    <div className="min-h-screen bg-black pb-52">
      <MobileHeader
        title={props.title}
        opacity={1}
        backgroundColor="rgb(0, 0, 0)"
        showBackButton={true}
      />

      <div 
        className="pt-14 px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
      >
        {/* 统计信息 */}
        <p className="text-white/60 text-sm mb-4">
          {props.type === 'artists' && `${props.items.length} 位艺人`}
          {props.type === 'playlists' && `${props.items.length} 个歌单`}
          {props.type === 'tracks' && `${props.items.length} 首歌曲`}
        </p>

        {isEmpty ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-800 flex items-center justify-center">
              {props.type === 'tracks' ? (
                <svg className="w-8 h-8 text-white/40" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-white/40" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">{props.emptyTitle}</h2>
            <p className="text-white/50 text-sm">{props.emptyDescription}</p>
          </div>
        ) : (
          <>
            {props.type === 'artists' && (
              <ArtistGrid items={props.items} onItemClick={(id) => navigate(`/artist/${id}`)} />
            )}
            {props.type === 'playlists' && (
              <PlaylistGrid items={props.items} onItemClick={(id) => navigate(`/playlist/${id}`)} />
            )}
            {props.type === 'tracks' && (
              <TrackList items={props.items} onPlayTrack={props.onPlayTrack} />
            )}
          </>
        )}
      </div>
    </div>
  );
}


// 艺人网格组件
function ArtistGrid({ items, onItemClick }: { items: ArtistItem[]; onItemClick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {items.map((artist) => (
        <button
          key={artist.id}
          onClick={() => onItemClick(artist.id)}
          className="text-center active:opacity-70"
        >
          <div className="w-full aspect-square rounded-full overflow-hidden bg-neutral-800 mb-2">
            {artist.artworkUrl ? (
              <CachedImage
                src={getProxiedImageUrl(artist.artworkUrl, 300)}
                alt={artist.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40 text-3xl">
                ♪
              </div>
            )}
          </div>
          <p className="text-white text-base font-medium truncate">{artist.name}</p>
        </button>
      ))}
    </div>
  );
}

// 歌单网格组件
function PlaylistGrid({ items, onItemClick }: { items: PlaylistItem[]; onItemClick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {items.map((playlist) => (
        <button
          key={playlist.id}
          onClick={() => onItemClick(playlist.id)}
          className="text-left active:opacity-70"
        >
          <div className="w-full aspect-square rounded-lg overflow-hidden bg-neutral-800 mb-2">
            {playlist.artworkUrl ? (
              <CachedImage
                src={getProxiedImageUrl(playlist.artworkUrl, 300)}
                alt={playlist.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40 text-3xl">
                ♪
              </div>
            )}
          </div>
          <p className="text-white text-sm font-medium truncate">{playlist.name}</p>
          <p className="text-white/50 text-xs">歌单</p>
        </button>
      ))}
    </div>
  );
}

// 曲目列表组件
function TrackList({ items, onPlayTrack }: { items: TrackItem[]; onPlayTrack: (index: number) => void }) {
  return (
    <div className="space-y-1">
      {items.map((track, index) => (
        <button
          key={track.id}
          onClick={() => onPlayTrack(index)}
          className="flex items-center gap-3 w-full py-2 px-1 active:bg-white/5 rounded-lg"
        >
          <span className="w-6 text-center text-white/50 text-sm flex-shrink-0">{index + 1}</span>
          <div className="w-12 h-12 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
            {track.artworkUrl ? (
              <CachedImage
                src={getProxiedImageUrl(track.artworkUrl, 96)}
                alt={track.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40">
                ♪
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-white text-sm truncate">{track.name}</p>
            <p className="text-white/50 text-xs truncate">{track.artistName}</p>
          </div>
          {track.playCount !== undefined && (
            <span className="text-white/40 text-xs flex-shrink-0">{track.playCount}次</span>
          )}
        </button>
      ))}
    </div>
  );
}
