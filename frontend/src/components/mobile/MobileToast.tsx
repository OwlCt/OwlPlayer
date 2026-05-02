import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../../store/toastStore';

/**
 * MobileToast component
 * Displays toast messages above the mini player/bottom navigation
 * Styled like Spotify's mobile toast (white background, black text)
 */
export default function MobileToast() {
  const { toasts, removeToast } = useToastStore();

  // Only show the most recent toast
  const currentToast = toasts[toasts.length - 1];

  return (
    <AnimatePresence>
      {currentToast && (
        <motion.div
          key={currentToast.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          onClick={() => removeToast(currentToast.id)}
          className="fixed left-2 right-2 z-50 pointer-events-auto"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 120px)' }}
        >
          <div className="bg-white text-black rounded-md px-4 py-3 shadow-lg text-sm font-medium">
            {currentToast.message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
