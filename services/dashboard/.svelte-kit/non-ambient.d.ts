
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/api" | "/api/logs" | "/api/logs/[service]" | "/api/sse" | "/commands" | "/messages" | "/whatsapp";
		RouteParams(): {
			"/api/logs/[service]": { service: string }
		};
		LayoutParams(): {
			"/": { service?: string | undefined };
			"/api": { service?: string | undefined };
			"/api/logs": { service?: string | undefined };
			"/api/logs/[service]": { service: string };
			"/api/sse": Record<string, never>;
			"/commands": Record<string, never>;
			"/messages": Record<string, never>;
			"/whatsapp": Record<string, never>
		};
		Pathname(): "/" | `/api/logs/${string}` & {} | "/api/sse" | "/commands" | "/messages" | "/whatsapp";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): string & {};
	}
}