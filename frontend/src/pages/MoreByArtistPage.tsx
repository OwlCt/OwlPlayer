import { useParams } from 'react-router-dom';
import MobileMoreByArtistPage from '../components/mobile/MobileMoreByArtistPage';

/**
 * MoreByArtistPage - Shows more albums from the same artist
 * Mobile-only page that displays albums from more-by-artist API
 */
export default function MoreByArtistPage() {
  const { albumId, artistName } = useParams();

  return (
    <MobileMoreByArtistPage
      albumId={albumId}
      artistName={artistName ? decodeURIComponent(artistName) : ''}
    />
  );
}
