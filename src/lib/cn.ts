import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Theme colours tailwind-merge can't infer from their names. Without this,
// `border-hairline` reads as a border *width* and silently drops `border`
// (or survives `border-0`), and `text-foreground-secondary` can't override
// `text-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['hairline', 'surface1', 'surface2', 'surface3', 'faint', 'foreground-secondary'],
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
