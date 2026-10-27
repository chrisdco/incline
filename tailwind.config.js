const plugin = require('tailwindcss/plugin');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        surface1: 'hsl(var(--surface-1) / <alpha-value>)',
        surface2: 'hsl(var(--surface-2) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'hsl(var(--info) / <alpha-value>)',
          foreground: 'hsl(var(--info-foreground) / <alpha-value>)',
        },
        chart1: 'hsl(var(--chart-1) / <alpha-value>)',
        chart2: 'hsl(var(--chart-2) / <alpha-value>)',
        chart3: 'hsl(var(--chart-3) / <alpha-value>)',
        chart4: 'hsl(var(--chart-4) / <alpha-value>)',
        chart5: 'hsl(var(--chart-5) / <alpha-value>)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
      },
      // Type scale (docs/design/SYSTEM.md): Tailwind xs–3xl plus the two
      // sizes screens kept hand-rolling — 2xs for table headers / badges,
      // display for hero numbers.
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px' }],
        display: ['34px', { lineHeight: '40px', letterSpacing: '-0.5px' }],
      },
    },
  },
  plugins: [
    // Map font-weight utilities to the exact registered Geist faces so weights
    // render crisply on both platforms (RN ignores fontWeight for custom fonts
    // unless the variant face is referenced by name).
    plugin(({ addUtilities }) => {
      addUtilities({
        '.font-medium': { fontFamily: 'Geist-Medium', fontWeight: '500' },
        '.font-semibold': { fontFamily: 'Geist-SemiBold', fontWeight: '600' },
        '.font-bold': { fontFamily: 'Geist-Bold', fontWeight: '700' },
        '.font-extrabold': { fontFamily: 'Geist-Bold', fontWeight: '800' },
      });
    }),
  ],
};
