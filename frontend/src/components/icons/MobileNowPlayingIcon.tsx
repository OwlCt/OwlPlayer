/**
 * Mobile Now Playing Icon - Animated equalizer bars
 * Uses the same CSS animation as desktop but with mobile-specific styling
 * Desktop has 4 bars, mobile has 3 bars (thinner, no border-radius)
 */

interface MobileNowPlayingIconProps {
  className?: string;
}

export const MobileNowPlayingIcon = ({ 
  className = "" 
}: MobileNowPlayingIconProps) => {
  return (
    <div className={`equalizer equalizer-mobile ${className}`}>
      <div className="equalizer-bar"></div>
      <div className="equalizer-bar"></div>
      <div className="equalizer-bar"></div>
    </div>
  );
};

export default MobileNowPlayingIcon;
