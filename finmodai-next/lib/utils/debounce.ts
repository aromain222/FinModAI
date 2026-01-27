/**
 * Debounce utility for slider inputs with immediate visual feedback
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

/**
 * Debounced hook with immediate callback support
 * Useful for sliders: immediate visual update, debounced computation
 */
export function useDebounced<T>(
  value: T,
  delay: number,
  onDebounced: (value: T) => void
): [T, (value: T) => void] {
  // This is a simplified version - in real usage, use React hooks
  let timeout: NodeJS.Timeout | null = null;
  let immediateValue = value;

  const setValue = (newValue: T) => {
    immediateValue = newValue; // Immediate update for UI
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      onDebounced(newValue);
    }, delay);
  };

  return [immediateValue, setValue];
}

