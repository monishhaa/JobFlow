/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: '#FAF9F6',
        panel: '#FFFFFF',
        ink: '#1C1C1A',
        muted: '#6B6A65',
        border: '#E4E2DC',
        accent: {
          DEFAULT: '#2F5D50',
          hover: '#254A40',
          light: '#EBF2EE',
        },
        status: {
          succeeded: '#3F7D5B',
          running: '#3B6EA8',
          queued: '#8A8A84',
          retrying: '#A5812F',
          dead: '#B0483F',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      fontSize: {
        '12': ['12px', '16px'],
        '13': ['13px', '18px'],
        '14': ['14px', '20px'],
        '20': ['20px', '28px'],
        '28': ['28px', '36px'],
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '6px',
        lg: '6px',
      }
    },
  },
  plugins: [],
}
