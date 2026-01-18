import { html, TemplateResult } from 'lit';

// Helper to detect current theme mode
function getThemeMode(themeOverride?: 'light' | 'dark'): 'light' | 'dark' {
  // If theme is explicitly provided, use it
  if (themeOverride === 'light' || themeOverride === 'dark') return themeOverride;
  
  if (typeof document === 'undefined') return 'light';
  // Check for ICPay-specific theme attribute first
  const icpayTheme = document.documentElement.getAttribute('data-icpay-theme');
  if (icpayTheme === 'light' || icpayTheme === 'dark') return icpayTheme;
  // Fallback to generic data-theme
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'light' || theme === 'dark') return theme;
  // Default to light
  return 'light';
}

export type OnrampProviderItem = {
	slug: string;
	name: string;
	logoUrl?: string | null;
};

export function renderOnrampProviderPicker(opts: {
	visible: boolean;
	providers: OnrampProviderItem[];
	onSelect: (slug: string) => void;
	onClose: () => void;
	title?: string;
	theme?: 'light' | 'dark'; // Theme mode from widget config
}): TemplateResult | null {
	if (!opts.visible) return null as any;
	const providers = opts.providers || [];
	const themeMode = getThemeMode(opts.theme);
	return html`
		<style>
			/* Theme-aware color variables - Light mode defaults */
			.icpay-onramp-overlay {
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
			[data-theme="dark"] .icpay-onramp-overlay,
			[data-icpay-theme="dark"] .icpay-onramp-overlay,
			:root[data-theme="dark"] .icpay-onramp-overlay,
			:root[data-icpay-theme="dark"] .icpay-onramp-overlay,
			html[data-theme="dark"] .icpay-onramp-overlay,
			html[data-icpay-theme="dark"] .icpay-onramp-overlay,
			.icpay-onramp-overlay[data-theme="dark"] {
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
			.icpay-onramp-provider-btn {
				display: flex;
				align-items: center;
				gap: 10px;
				background: var(--icpay-secondary);
				border: 1px solid var(--icpay-border);
				border-radius: 10px;
				padding: 10px 12px;
				color: var(--icpay-foreground);
				cursor: pointer;
				text-align: left;
				transition: background-color 0.2s;
			}
			.icpay-onramp-provider-btn:hover {
				background: var(--icpay-accent);
			}
			.icpay-onramp-overlay {
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
			.icpay-onramp-container {
				position: relative;
				background: var(--icpay-background);
				border: 1px solid var(--icpay-border);
				border-radius: 16px;
				padding: 16px;
				box-shadow: 0 20px 60px rgba(0,0,0,0.5);
				min-width: 320px;
				max-width: 420px;
				margin: auto;
			}
			@media (max-width: 768px) {
				.icpay-onramp-overlay {
					align-items: flex-end;
					justify-content: stretch;
				}
				.icpay-onramp-container {
					max-width: 100%;
					width: 100%;
					height: 70vh;
					max-height: 70vh;
					border-radius: 16px 16px 0 0;
					margin: 0;
					overflow-y: auto;
				}
			}
		</style>
		<div class="icpay-onramp-overlay" data-theme="${themeMode}">
			<div class="icpay-onramp-container">
				<button @click=${opts.onClose} style="position:absolute;right:12px;top:12px;background:transparent;border:none;color:var(--icpay-foreground);cursor:pointer;font-size:20px;opacity:0.8">×</button>
				<div style="color:var(--icpay-foreground);font-weight:600;font-size:16px;margin-bottom:12px">${opts.title || 'Choose a provider'}</div>
				<div style="display:flex;flex-direction:column;gap:10px">
					${providers.map((p) => html`
						<button
							class="icpay-onramp-provider-btn"
							@click=${() => opts.onSelect(p.slug)}
						>
							${p.logoUrl ? html`<img src="${p.logoUrl}" style="width:24px;height:24px;border-radius:4px" />` : html`<div style="width:24px;height:24px;border-radius:4px;background:var(--icpay-secondary)"></div>`}
							<span style="font-size:14px">${p.name}</span>
						</button>
					`)}
				</div>
			</div>
		</div>
	`;
}

