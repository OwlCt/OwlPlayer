import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

export interface ClickableLinkProps {
  text: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * A reusable clickable link component for album and artist names.
 * Displays as plain text when disabled or no href is provided.
 * Shows underline on hover and uses pointer cursor when clickable.
 */
export default function ClickableLink({
  text,
  href,
  onClick,
  className,
  disabled = false,
}: ClickableLinkProps) {
  const navigate = useNavigate();

  const isClickable = !disabled && (href || onClick);

  const handleClick = (e: React.MouseEvent) => {
    if (!isClickable) return;
    
    e.stopPropagation();
    
    if (onClick) {
      onClick(e);
    } else if (href) {
      navigate(href);
    }
  };

  if (!isClickable) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span
      onClick={handleClick}
      className={clsx(
        'cursor-pointer hover:underline',
        className
      )}
    >
      {text}
    </span>
  );
}

/**
 * Helper function to generate artist detail page URL
 */
export function getArtistHref(artistId?: string): string | undefined {
  return artistId ? `/artist/${artistId}` : undefined;
}

/**
 * Helper function to generate album detail page URL
 */
export function getAlbumHref(albumId?: string): string | undefined {
  return albumId ? `/album/${albumId}` : undefined;
}
