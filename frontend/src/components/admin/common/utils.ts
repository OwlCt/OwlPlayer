// Helper function to format bytes to human-readable format
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to convert days to seconds
export function daysToSeconds(days: number): number {
  return days * 24 * 60 * 60;
}

// Helper function to convert seconds to days
export function secondsToDays(seconds: number): number {
  return Math.round(seconds / (24 * 60 * 60));
}

// Helper function to convert size with unit to bytes
export function sizeToBytes(value: number, unit: 'MB' | 'GB'): number {
  return unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024;
}

// Helper function to convert bytes to size with unit
export function bytesToSize(bytes: number): { value: number; unit: 'MB' | 'GB' } {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return { value: Math.round(gb * 100) / 100, unit: 'GB' };
  }
  return { value: Math.round(bytes / (1024 * 1024)), unit: 'MB' };
}

// Format date to Chinese locale
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Format datetime to Chinese locale
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('zh-CN');
}
