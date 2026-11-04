import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Theme colours tailwind-merge can't infer from their names, so
// `text-foreground-secondary` can override `text-foreground`. Borders use
// `border-divider`: `border-hairline` is NativeWind's hairline *width*.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['hairline', 'divider', 'surface1', 'surface2', 'surface3', 'faint', 'foreground-secondary'],
    },
  },
});

/**
 * Merge Tailwind class names safely (dedupes conflicting utilities).
 * This is the single styling helper used across the app's components.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
