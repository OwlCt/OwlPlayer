import SongListPage from './SongListPage';

interface PlaylistPageProps {
  playlistId: string;
}

export default function PlaylistPage({ playlistId }: PlaylistPageProps) {
  return <SongListPage variant="playlist" playlistId={playlistId} />;
}
