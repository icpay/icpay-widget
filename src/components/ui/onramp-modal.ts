import { html, TemplateResult } from 'lit';

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
	return html`
		<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);z-index:10000">
			<div style="position:relative;background:#0f1115;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
				<button @click=${opts.onClose} style="position:absolute;right:12px;top:12px;background:transparent;border:none;color:#fff;cursor:pointer;font-size:20px;opacity:0.8">×</button>
				${opts.onBack ? html`<button @click=${opts.onBack} style="position:absolute;left:12px;top:12px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;font-size:12px;border-radius:8px;padding:6px 10px;opacity:0.9">Back</button>` : null}
				<div style="color:#fff;font-weight:600;font-size:15px;margin-bottom:12px">${opts.title || 'Complete purchase'}</div>
				${hasUrl ? html`
					<iframe
						title="Onramp"
						src="${opts.url}"
						style="border:0;width:${typeof width === 'number' ? `${width}px` : width};height:${typeof height === 'number' ? `${height}px` : height};border-radius:12px;background:#000"
						sandbox="allow-forms allow-same-origin allow-scripts allow-popups allow-top-navigation-by-user-activation"
						allow="payment *"
					></iframe>
					<div style="margin-top:10px;text-align:right">
						<a href="${opts.url}" target="_blank" rel="noopener noreferrer" style="color:#93c5fd;font-size:12px;text-decoration:underline">Open in a new tab</a>
					</div>
				` : html`
					<div style="width:${typeof width === 'number' ? `${width}px` : width};height:${typeof height === 'number' ? `${height}px` : height};display:flex;align-items:center;justify-content:center;background:#151923;border:1px dashed rgba(255,255,255,0.15);border-radius:12px;color:#fff">
						${opts.errorMessage || 'Onramp URL not available'}
					</div>
				`}
			</div>
		</div>
	`;
}

