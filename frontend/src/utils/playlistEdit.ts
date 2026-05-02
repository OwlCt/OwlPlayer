import { uploadPlaylistCover } from '../api';
import { usePlaylistsStore } from '../store/playlistsStore';
import { PlaylistUpdateData } from '../components/PlaylistEditModal';

/**
 * Handle saving playlist edits - shared logic for all edit entry points
 */
export async function savePlaylistEdit(
  playlistId: string,
  updates: PlaylistUpdateData
): Promise<void> {
  const { updatePlaylist } = usePlaylistsStore.getState();

  // Upload cover image if provided
  let artworkUrl = updates.artwork_url;
  if (updates.coverImage) {
    artworkUrl = await uploadPlaylistCover(playlistId, updates.coverImage);
  }

  // Build update payload
  const updatePayload: {
    name?: string;
    description?: string;
    artwork_url?: string;
    clear_artwork?: boolean;
    clear_description?: boolean;
  } = {
    name: updates.name,
  };

  // Handle description update
  if (updates.description === '') {
    updatePayload.clear_description = true;
  } else {
    updatePayload.description = updates.description;
  }

  if (artworkUrl !== undefined) {
    updatePayload.artwork_url = artworkUrl;
  }

  if (updates.removeCover) {
    updatePayload.clear_artwork = true;
  }

  await updatePlaylist(playlistId, updatePayload);
}
