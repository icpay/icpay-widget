import { css } from 'lit';
import type { ThemeConfig } from './types';

export const baseStyles = css`
  :host {
    /* Light mode defaults (from COLOR_PALETTE.md) */
    --icpay-background: #ffffff;
    --icpay-foreground: #171717;
    --icpay-muted-foreground: #6b7280;
    --icpay-accent-foreground: #ffffff;
    --icpay-primary: #3b82f6;
    --icpay-destructive: #ef4444;
    --icpay-primary-foreground: #ffffff;
    --icpay-secondary: #f3f4f6;
    --icpay-secondary-foreground: #171717;
    --icpay-accent: #f9fafb;
    --icpay-muted: #f9fafb;
    --icpay-border: #e5e7eb;
    --icpay-input: #e5e7eb;
    --icpay-ring: #3b82f6;
    --icpay-destructive-foreground: #ffffff;
    
    /* Status colors */
    --icpay-success-bg: rgba(16, 185, 129, 0.1);
    --icpay-success-text: #059669;
    --icpay-success-border: rgba(16, 185, 129, 0.3);
    --icpay-warning-bg: rgba(245, 158, 11, 0.1);
    --icpay-warning-text: #d97706;
    --icpay-warning-border: rgba(245, 158, 11, 0.3);
    --icpay-error-bg: rgba(239, 68, 68, 0.1);
    --icpay-error-text: #dc2626;
    --icpay-error-border: rgba(239, 68, 68, 0.3);
    --icpay-processing-bg: rgba(59, 130, 246, 0.1);
    --icpay-processing-text: #2563eb;
    --icpay-processing-border: rgba(59, 130, 246, 0.3);
    
    /* Legacy compatibility variables */
    --icpay-text: var(--icpay-foreground);
    --icpay-surface: transparent;
    --icpay-surface-alt: var(--icpay-secondary);
    --icpay-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    
    display: block;
    font-family: var(--icpay-font);
    color: var(--icpay-foreground);
    background: transparent;
  }

  :host([data-theme="dark"]) {
    /* Dark mode (from COLOR_PALETTE.md) */
    --icpay-background: hsl(222.2 84% 4.9%);
    --icpay-foreground: hsl(210 40% 98%);
    --icpay-muted-foreground: hsl(215 20.2% 65.1%);
    --icpay-accent-foreground: hsl(210 40% 98%);
    --icpay-primary: hsl(210 40% 98%);
    --icpay-destructive: hsl(0 62.8% 30.6%);
    --icpay-primary-foreground: hsl(222.2 47.4% 11.2%);
    --icpay-secondary: hsl(217.2 32.6% 17.5%);
    --icpay-secondary-foreground: hsl(210 40% 98%);
    --icpay-accent: hsl(217.2 32.6% 17.5%);
    --icpay-muted: hsl(217.2 32.6% 17.5%);
    --icpay-border: hsl(217.2 32.6% 30%);
    --icpay-input: hsl(217.2 32.6% 17.5%);
    --icpay-ring: hsl(210 40% 98%);
    --icpay-destructive-foreground: hsl(210 40% 98%);
    
    /* Status colors for dark mode */
    --icpay-success-bg: rgba(16, 185, 129, 0.1);
    --icpay-success-text: #34d399;
    --icpay-success-border: rgba(16, 185, 129, 0.3);
    --icpay-warning-bg: rgba(245, 158, 11, 0.1);
    --icpay-warning-text: #fbbf24;
    --icpay-warning-border: rgba(245, 158, 11, 0.3);
    --icpay-error-bg: rgba(239, 68, 68, 0.1);
    --icpay-error-text: #f87171;
    --icpay-error-border: rgba(239, 68, 68, 0.3);
    --icpay-processing-bg: rgba(59, 130, 246, 0.1);
    --icpay-processing-text: #60a5fa;
    --icpay-processing-border: rgba(59, 130, 246, 0.3);
    
    --icpay-text: var(--icpay-foreground);
    --icpay-surface-alt: var(--icpay-secondary);
  }

  .icpay-card {
    background: none;
    border: none;
    border-radius: 16px;
    box-shadow: none;
  }

  .icpay-section {
    padding: 20px;
  }

  .icpay-powered-by {
    margin-top: 12px;
    text-align: center;
    font-size: 10px;
    color: var(--icpay-muted-foreground);
    opacity: 0.6;
  }

  .icpay-powered-by a {
    color: var(--icpay-muted-foreground);
    text-decoration: none;
    transition: opacity 0.2s ease;
  }

  .icpay-powered-by a:hover {
    opacity: 1;
    text-decoration: underline;
  }

  .pay-button {
    width: 100%;
    background: var(--icpay-foreground);
    color: var(--icpay-background);
    border: none;
    border-radius: 16px;
    padding: 16px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: none;
  }

  :host([data-theme="dark"]) .pay-button {
    border: 1px solid var(--icpay-border);
  }

  .pay-button:hover {
    background: color-mix(in srgb, var(--icpay-foreground) 90%, transparent);
  }

  .pay-button.processing {
    background: var(--icpay-muted-foreground);
    color: var(--icpay-background);
    border-color: var(--icpay-muted-foreground);
    cursor: not-allowed;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
`;


// Helper to extract theme mode from config (handles both string and object formats)
export function getThemeModeFromConfig(theme?: 'light' | 'dark' | ThemeConfig | null): 'light' | 'dark' {
  if (typeof theme === 'string') {
    return theme;
  } else if (theme && typeof theme === 'object' && theme.mode) {
    return theme.mode;
  }
  return 'light'; // Default to light
}

export function applyThemeVars(host: HTMLElement, theme?: 'light' | 'dark' | ThemeConfig | null): void {
  if (!host) return;
  
  // Normalize theme: handle both string ('light' | 'dark') and ThemeConfig object formats
  let themeConfig: ThemeConfig | null = null;
  let mode: 'light' | 'dark' = 'light';
  
  if (typeof theme === 'string') {
    // Simple string format: theme = 'light' or 'dark'
    mode = theme;
    themeConfig = { mode };
  } else if (theme && typeof theme === 'object') {
    // ThemeConfig object format
    themeConfig = theme;
    mode = theme.mode || 'light';
  } else if (typeof document !== 'undefined') {
    // Fallback to document theme if no theme provided
    const docTheme = document.documentElement.getAttribute('data-icpay-theme') || 
                    document.documentElement.getAttribute('data-theme');
    if (docTheme === 'light' || docTheme === 'dark') {
      mode = docTheme;
    }
  }
  
  // Set data-theme attribute for CSS variable inheritance
  if (host instanceof HTMLElement) {
    host.setAttribute('data-theme', mode);
  }
  
  // Also set on document element so modals can detect theme
  if (typeof document !== 'undefined' && document.documentElement) {
    // Store theme mode on document for modal detection
    document.documentElement.setAttribute('data-icpay-theme', mode);
    // Also set CSS variables on document root for modals to inherit
    const root = document.documentElement;
    root.style.setProperty('--icpay-theme-mode', mode);
  }
  
  if (!themeConfig) {
    // If no theme config provided, just set the mode attribute (already done above)
    return;
  }
  
  const set = (k: string, v?: string) => { if (v) host.style.setProperty(k, v); };
  
  // Apply custom colors if provided
  if (themeConfig.primaryColor) set('--icpay-primary', themeConfig.primaryColor);
  if (themeConfig.secondaryColor) set('--icpay-secondary', themeConfig.secondaryColor);
  if (themeConfig.accentColor) set('--icpay-accent', themeConfig.accentColor);
  if (themeConfig.textColor) set('--icpay-foreground', themeConfig.textColor);
  if (themeConfig.mutedTextColor) set('--icpay-muted-foreground', themeConfig.mutedTextColor);
  if (themeConfig.surfaceColor) set('--icpay-background', themeConfig.surfaceColor);
  if (themeConfig.surfaceAltColor) set('--icpay-secondary', themeConfig.surfaceAltColor);
  if (themeConfig.borderColor) set('--icpay-border', themeConfig.borderColor);
  if (themeConfig.fontFamily) set('--icpay-font', themeConfig.fontFamily);
  
  // Legacy compatibility
  if (themeConfig.textColor) set('--icpay-text', themeConfig.textColor);
  if (themeConfig.mutedTextColor) set('--icpay-muted', themeConfig.mutedTextColor);
  if (themeConfig.surfaceAltColor) set('--icpay-surface-alt', themeConfig.surfaceAltColor);
}


