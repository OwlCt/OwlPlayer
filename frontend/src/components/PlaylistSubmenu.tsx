import { useState, useMemo, useEffect } from 'react';
import { IoSearch, IoAdd } from 'react-icons/io5';
import { usePlaylistsStore, Playlist } from '../store/playlistsStore';

interface PlaylistSubmenuProps {
  onSelectPlaylist: (playlistId: string) => void;
  onCreatePlaylist: () => void;
}

// Pure function to filter playlists by search query
export function filterPlaylists(playlists: Playlist[], searchQuery: string): Playlist[] {
  if (!searchQuery.trim()) {
    return playlists;
  }
  const query = searchQuery.toLowerCase().trim();
  return playlists.filter(playlist => 
    playlist.name.toLowerCase().includes(query)
  );
}

export default function PlaylistSubmenu({ onSelectPlaylist, onCreatePlaylist }: PlaylistSubmenuProps) {
  const { playlists, fetchPlaylists } = usePlaylistsStore();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch playlists on mount
  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  // Filter playlists based on search query
  const filteredPlaylists = useMemo(() => {
    return filterPlaylists(playlists, searchQuery);
  }, [playlists, searchQuery]);

  return (
    <div className="min-w-[220px]">
      {/* Search input */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white/10 rounded">
          <IoSearch className="text-gray-400 w-4 h-4 flex-shrink-0" />
          <input
            type="text"
            placeholder="查找歌单"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-sm text-white placeholder-gray-400 outline-none w-full"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {/* Create new playlist option */}
      <div
        className="flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-white/10 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onCreatePlaylist();
        }}
      >
        <IoAdd className="w-5 h-5" />
        <span>新建歌单</span>
      </div>

      {/* Divider */}
      <div className="my-1 border-t border-white/10" />

      {/* Playlist list */}
      <div className="max-h-[200px] overflow-y-auto">
        {filteredPlaylists.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-400">
            {searchQuery ? '未找到匹配的歌单' : '暂无歌单'}
          </div>
        ) : (
          filteredPlaylists.map((playlist) => (
            <div
              key={playlist.id}
              className="flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-white/10 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelectPlaylist(playlist.id);
              }}
            >
              <span className="truncate">{playlist.name}</span>
              <span className="text-gray-400 text-xs ml-auto">{playlist.song_count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
