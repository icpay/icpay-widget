/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./examples/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: '#0b0f1a',
        foreground: '#e5e7eb',
        'icpay-card': '#0b0f1a',
        'icpay-card-foreground': '#e5e7eb',
        popover: '#0b0f1a',
        'popover-foreground': '#e5e7eb',
        primary: '#0066FF',
        'primary-foreground': '#ffffff',
        secondary: '#1f2937',
        'secondary-foreground': '#e5e7eb',
        muted: '#1f2937',
        'muted-foreground': '#9ca3af',
        accent: '#1f2937',
        'accent-foreground': '#e5e7eb',
        destructive: '#ef4444',
        border: '#263042',
        input: '#1f2937',
        ring: '#0066FF',
        sidebar: '#0b0f1a',
        'sidebar-foreground': '#e5e7eb',
        'sidebar-primary': '#0066FF',
        'sidebar-primary-foreground': '#ffffff',
        'sidebar-accent': '#1f2937',
        'sidebar-accent-foreground': '#e5e7eb',
        'sidebar-border': '#263042',
        'sidebar-ring': '#0066FF',
      },
      borderRadius: {
        'xs': '0.25rem',
      },
      animation: {
        'fade-in-0': 'fade-in 0.5s ease-out',
        'fade-out-0': 'fade-out 0.5s ease-in',
        'zoom-in-95': 'zoom-in 0.2s ease-out',
        'zoom-out-95': 'zoom-out 0.2s ease-in',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'zoom-in': {
          '0%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        'zoom-out': {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(0.95)' },
        },
      },
    },
  },
  plugins: [],
}