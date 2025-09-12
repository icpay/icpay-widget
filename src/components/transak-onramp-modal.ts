import { html, TemplateResult } from 'lit';

type Environment = 'STAGING' | 'PRODUCTION';

export type TransakOnrampOptions = {
	visible: boolean;
	/** If provided, will embed Transak directly with session id */
	sessionId?: string | null;
	/** Optional error message to show when sessionId is missing */
	errorMessage?: string | null;
	/** Transak apiKey (public key). Required if using double-iframe helper */
	apiKey?: string | null;
	/** Controls staging vs production */
	environment?: Environment;
	/** Optional width/height for inner iframe */
	width?: number | string;
	height?: number | string;
	/** Called when user closes modal */
	onClose: () => void;
  /** Called when user clicks to go back to wallet selector */
  onBack?: () => void;
};

/**
 * Renders a modal containing Transak onramp widget.
 * - If sessionId is present, we embed Transak directly using the session flow URL.
 * - Otherwise, we fall back to Transak's double-iframe helper page that loads an inner iframe
 *   pointing to global-stg/global with the provided apiKey.
 *
 * Reference: https://docs.transak.com/docs/double-embed-iframe-webapp
 */
export function renderTransakOnrampModal(opts: TransakOnrampOptions): TemplateResult | null {
	if (!opts.visible) return null as any;
	const environment: Environment = opts.environment ?? 'STAGING';
	const width = opts.width ?? 420;
	const height = opts.height ?? 680;

	// Build iframe src
	let iframeSrc = '';
	if (opts.sessionId) {
		// Direct session embed per Transak session flow.
		// For production: https://global.transak.com?sessionId=...
		// For staging:    https://global-stg.transak.com?sessionId=...
		const base = environment === 'PRODUCTION' ? 'https://global.transak.com' : 'https://global-stg.transak.com';
		iframeSrc = `${base}?sessionId=${encodeURIComponent(opts.sessionId)}`;
	}

	return html`
		<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);z-index:10000">
			<div style="position:relative;background:#0f1115;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
				<button @click=${opts.onClose} aria-label="Close" title="Close"
					style="position:absolute;top:10px;right:10px;background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:20px">✕</button>
				${opts.sessionId ? html`
					<iframe
            id="transak-iframe"
						style="border:none;border-radius:12px;background:#111"
						width="${String(width)}"
						height="${String(height)}"
						src="${iframeSrc}"
						allow="camera;microphone;payment"
					></iframe>
				` : html`
					<div style="width:${String(width)}px;max-width:90vw;padding:12px">
						<div style="background:#1a1f2e;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px;color:#e5e7eb;text-align:center">
							<div style="font-size:18px;font-weight:600;margin-bottom:8px">Service unavailable</div>
							<div style="font-size:14px;opacity:0.85;margin-bottom:16px">${opts.errorMessage || 'The service is currently unavailable, please try again later.'}</div>
							<button
								@click=${() => { if (opts.onBack) opts.onBack(); else opts.onClose(); }}
								style="padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:linear-gradient(135deg,#3b82f6 0%,#10b981 100%);color:#fff;cursor:pointer;font-weight:600">
								Go back to wallet selection
							</button>
						</div>
					</div>
				`}
			</div>
		</div>
	`;
}


