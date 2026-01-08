import { html, TemplateResult } from 'lit';

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
}): TemplateResult | null {
	if (!opts.visible) return null as any;
	const providers = opts.providers || [];
	return html`
		<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);z-index:10000">
			<div style="position:relative;background:#0f1115;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5);min-width:320px;max-width:420px">
				<button @click=${opts.onClose} style="position:absolute;right:12px;top:12px;background:transparent;border:none;color:#fff;cursor:pointer;font-size:20px;opacity:0.8">×</button>
				<div style="color:#fff;font-weight:600;font-size:16px;margin-bottom:12px">${opts.title || 'Choose a provider'}</div>
				<div style="display:flex;flex-direction:column;gap:10px">
					${providers.map((p) => html`
						<button
							style="display:flex;align-items:center;gap:10px;background:#171a21;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 12px;color:#fff;cursor:pointer;text-align:left"
							@click=${() => opts.onSelect(p.slug)}
						>
							${p.logoUrl ? html`<img src="${p.logoUrl}" style="width:24px;height:24px;border-radius:4px" />` : html`<div style="width:24px;height:24px;border-radius:4px;background:#2a2f3a"></div>`}
							<span style="font-size:14px">${p.name}</span>
						</button>
					`)}
				</div>
			</div>
		</div>
	`;
}

