import { css } from 'lit';
import type { ThemeConfig } from './types';

export const baseStyles = css`
  :host {
    --icpay-primary: #f9fafb;
    --icpay-secondary: #e5e7eb;
    --icpay-accent: #9ca3af;
    --icpay-text: #f9fafb;
    --icpay-muted: #9ca3af;
    --icpay-surface: #1f2937;
    --icpay-surface-alt: #374151;
    --icpay-border: #4b5563;
    --icpay-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: block;
    font-family: var(--icpay-font);
  }

  .card {
    background: var(--icpay-surface);
    border: 1px solid var(--icpay-border);
    border-radius: 16px;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }

  .section {
    padding: 20px;
  }

  .pay-button {
    width: 100%;
    background: linear-gradient(135deg, var(--icpay-primary) 0%, var(--icpay-secondary) 100%);
    color: #111827;
    border: 1px solid #d1d5db;
    border-radius: 16px;
    padding: 16px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  }

  .pay-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    background: linear-gradient(135deg, #ffffff 0%, #f3f4f6 100%);
  }

  .pay-button.processing {
    background: #6b7280;
    color: #f9fafb;
    border-color: #6b7280;
    cursor: not-allowed;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
`;


export function applyThemeVars(host: HTMLElement, theme?: ThemeConfig | null): void {
  if (!host || !theme) return;
  const primary = theme.primaryColor || undefined;
  const secondary = theme.secondaryColor || undefined;
  const set = (k: string, v?: string) => { if (v) host.style.setProperty(k, v); };
  set('--icpay-primary', primary);
  set('--icpay-secondary', secondary);

  const parseHex = (hex?: string) => {
    if (!hex) return null;
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
  };
  const luminance = (hex?: string) => {
    const rgb = parseHex(hex);
    if (!rgb) return 0;
    const toLin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
  };

  const basis = primary || secondary;
  const isLight = luminance(basis) > 0.6;
  const surface = theme.surfaceColor || (isLight ? '#f3f4f6' : '#1f2937');
  const surfaceAlt = theme.surfaceAltColor || (isLight ? '#e5e7eb' : '#374151');
  const border = theme.borderColor || (isLight ? '#d1d5db' : '#4b5563');
  const text = theme.textColor || (isLight ? '#111827' : '#f9fafb');
  const accent = theme.accentColor || secondary || primary || (isLight ? '#6b7280' : '#9ca3af');
  const muted = theme.mutedTextColor || (isLight ? '#6b7280' : '#9ca3af');

  set('--icpay-accent', accent);
  set('--icpay-text', text);
  set('--icpay-muted', muted);
  set('--icpay-surface', surface);
  set('--icpay-surface-alt', surfaceAlt);
  set('--icpay-border', border);
}


