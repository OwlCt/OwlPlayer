import { AlbumDetail, LocalAlbumRelatedShelf } from "../types";

export const LOCAL_RELATED_ALBUM_PREVIEW_LIMIT = 10;
export const LOCAL_RELATED_SONG_PREVIEW_LIMIT = 5;

export function isLocalAlbumDetail(
  album: Pick<AlbumDetail, "localRelatedContent"> | null | undefined,
): boolean {
  return album?.localRelatedContent !== undefined;
}

export function getLocalAlbumRelatedShelves(
  album: Pick<AlbumDetail, "localRelatedContent"> | null | undefined,
): LocalAlbumRelatedShelf[] {
  return album?.localRelatedContent?.shelves || [];
}

export function getLocalAlbumRelatedShelf(
  album: Pick<AlbumDetail, "localRelatedContent"> | null | undefined,
  shelfId: string,
): LocalAlbumRelatedShelf | undefined {
  return getLocalAlbumRelatedShelves(album).find(
    (shelf) => shelf.id === shelfId,
  );
}
