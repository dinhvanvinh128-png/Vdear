import type { Config } from 'tailwindcss';

/**
 * Vdearypto — design tokens.
 *
 * Chữ và hình khối lấy đúng theo bản tĩnh (legacy-static/css/styles.css) để hai
 * nửa của cùng một website không trông như hai sản phẩm khác nhau:
 * Chakra Petch cho tiêu đề, Inter cho nội dung, JetBrains Mono cho con số.
 * Trước đây toàn bộ app đặt mặc định là monospace — đó là chủ ý cũ, nhưng nó
 * lệch hẳn với dashboard chính nên bỏ.
 *
 * Semantic colors (up/down/warn/info) vẫn là CSS variable để đổi nền sáng/tối
 * mà không phải đụng vào component.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        'panel-2': 'rgb(var(--panel-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-2': 'rgb(var(--brand-2) / <alpha-value>)',
        up: 'rgb(var(--up) / <alpha-value>)',
        down: 'rgb(var(--down) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        display: ['"Chakra Petch"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // serif cũ (Newsreader) không có trong bản tĩnh; trỏ về Inter để không
        // còn khối chữ nào rơi ra ngoài hệ chữ chung.
        serif: ['Inter', 'system-ui', 'sans-serif'],
      },
      /* Bo góc theo bản tĩnh: panel 14px, nút và ô nhỏ 10px. */
      borderRadius: {
        DEFAULT: '10px',
        sm: '8px',
        md: '10px',
        lg: 'var(--radius)',
        xl: 'var(--radius)',
        '2xl': 'var(--radius)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulseDot: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        marquee: 'marquee 40s linear infinite',
        pulseDot: 'pulseDot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
