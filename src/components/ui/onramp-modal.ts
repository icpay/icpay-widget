import { html, TemplateResult } from 'lit';

// Helper to detect current theme mode
function getThemeMode(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  // Check for ICPay-specific theme attribute first
  const icpayTheme = document.documentElement.getAttribute('data-icpay-theme');
  if (icpayTheme === 'light' || icpayTheme === 'dark') return icpayTheme;
  // Fallback to generic data-theme
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'light' || theme === 'dark') return theme;
  // Default to dark
  return 'dark';
}

export type OnrampModalOptions = {
	visible: boolean;
	url?: string | null;
	errorMessage?: string | null;
	width?: number | string;
	height?: number | string;
	onClose: () => void;
	onBack?: () => void;
	title?: string;
};

export function renderOnrampModal(opts: OnrampModalOptions): TemplateResult | null {
	if (!opts.visible) return null as any;
	const width = opts.width ?? 420;
	const height = opts.height ?? 680;
	const hasUrl = typeof opts.url === 'string' && (opts.url || '').startsWith('http');
	const themeMode = getThemeMode();
	return html`
		<style>
			/* Theme-aware color variables - Light mode defaults */
			.icpay-onramp-modal-overlay {
				--icpay-background: #ffffff;
				--icpay-foreground: #171717;
				--icpay-muted-foreground: #6b7280;
				--icpay-primary: #3b82f6;
				--icpay-primary-foreground: #ffffff;
				--icpay-secondary: #f3f4f6;
				--icpay-secondary-foreground: #171717;
				--icpay-accent: #f9fafb;
				--icpay-border: #e5e7eb;
			}
			/* Dark mode */
			[data-theme="dark"] .icpay-onramp-modal-overlay,
			[data-icpay-theme="dark"] .icpay-onramp-modal-overlay,
			:root[data-theme="dark"] .icpay-onramp-modal-overlay,
			:root[data-icpay-theme="dark"] .icpay-onramp-modal-overlay,
			html[data-theme="dark"] .icpay-onramp-modal-overlay,
			html[data-icpay-theme="dark"] .icpay-onramp-modal-overlay,
			.icpay-onramp-modal-overlay[data-theme="dark"] {
				--icpay-background: hsl(222.2 84% 4.9%);
				--icpay-foreground: hsl(210 40% 98%);
				--icpay-muted-foreground: hsl(215 20.2% 65.1%);
				--icpay-primary: hsl(210 40% 98%);
				--icpay-primary-foreground: hsl(222.2 47.4% 11.2%);
				--icpay-secondary: hsl(217.2 32.6% 17.5%);
				--icpay-secondary-foreground: hsl(210 40% 98%);
				--icpay-accent: hsl(217.2 32.6% 17.5%);
				--icpay-border: hsl(217.2 32.6% 30%);
			}
			.icpay-onramp-modal-overlay {
				position: fixed !important;
				inset: 0 !important;
				display: flex;
				align-items: center;
				justify-content: center;
				background: rgba(0,0,0,0.85);
				backdrop-filter: blur(10px);
				z-index: 99999 !important;
				/* Ensure modal breaks out of any parent constraints */
				transform: none !important;
				will-change: auto;
				isolation: isolate;
			}
			.icpay-onramp-modal-container {
				position: relative;
				background: var(--icpay-background);
				border: 1px solid var(--icpay-border);
				border-radius: 16px;
				padding: 16px;
				box-shadow: 0 20px 60px rgba(0,0,0,0.5);
				margin: auto;
				max-width: 90vw;
			}
			@media (max-width: 768px) {
				.icpay-onramp-modal-overlay {
					align-items: flex-end;
					justify-content: stretch;
				}
				.icpay-onramp-modal-container {
					max-width: 100%;
					width: 100%;
					height: 70vh;
					max-height: 70vh;
					border-radius: 16px 16px 0 0;
					margin: 0;
					overflow-y: auto;
					display: flex;
					flex-direction: column;
				}
			}
		</style>
		<div class="icpay-onramp-modal-overlay" data-theme="${themeMode}">
			<div class="icpay-onramp-modal-container">
				<button @click=${opts.onClose} style="position:absolute;right:12px;top:12px;background:transparent;border:none;color:var(--icpay-foreground);cursor:pointer;font-size:20px;opacity:0.8;z-index:10">×</button>
				${opts.onBack ? html`<button @click=${opts.onBack} style="position:absolute;left:12px;top:12px;background:transparent;border:1px solid var(--icpay-border);color:var(--icpay-foreground);cursor:pointer;font-size:12px;border-radius:8px;padding:6px 10px;opacity:0.9;z-index:10">Back</button>` : null}
				<div style="color:var(--icpay-foreground);font-weight:600;font-size:15px;margin-bottom:12px">${opts.title || 'Complete purchase'}</div>
				${hasUrl ? html`
					<iframe
						title="Onramp"
						src="${opts.url}"
						style="border:0;width:${typeof width === 'number' ? `${width}px` : width};height:${typeof height === 'number' ? `${height}px` : height};border-radius:12px;background:#000"
						sandbox="allow-forms allow-same-origin allow-scripts allow-popups allow-top-navigation-by-user-activation"
						allow="payment *"
					></iframe>
					<div style="margin-top:10px;text-align:right">
						<a href="${opts.url}" target="_blank" rel="noopener noreferrer" style="color:var(--icpay-primary);font-size:12px;text-decoration:underline">Open in a new tab</a>
					</div>
				` : html`
					<div style="width:${typeof width === 'number' ? `${width}px` : width};height:${typeof height === 'number' ? `${height}px` : height};display:flex;align-items:center;justify-content:center;background:var(--icpay-secondary);border:1px dashed var(--icpay-border);border-radius:12px;color:var(--icpay-foreground)">
						${opts.errorMessage || 'Onramp URL not available'}
					</div>
				`}
			</div>
		</div>
	`;
}

