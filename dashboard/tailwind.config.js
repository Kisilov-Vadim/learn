/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#13111c',
        surface:  '#1f1b2e',
        surface2: '#1a1730',
        border:   '#2d2040',
        border2:  '#3d2d5e',
        accent:   '#e879f9',
        accent2:  '#7c3aed',
        muted:    '#94a3b8',
        dim:      '#64748b',
        faint:    '#475569',
      },
    },
  },
  plugins: [],
}
