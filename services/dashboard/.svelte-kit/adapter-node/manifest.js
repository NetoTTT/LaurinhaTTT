export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.DcJeQDB8.js",app:"_app/immutable/entry/app.BDZAUyYH.js",imports:["_app/immutable/entry/start.DcJeQDB8.js","_app/immutable/chunks/TUcuHu3_.js","_app/immutable/chunks/7YYcctaQ.js","_app/immutable/chunks/D37meRkZ.js","_app/immutable/chunks/D0lUaFnm.js","_app/immutable/entry/app.BDZAUyYH.js","_app/immutable/chunks/D37meRkZ.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/7YYcctaQ.js","_app/immutable/chunks/BBWm0VUs.js","_app/immutable/chunks/C8jUpsqL.js","_app/immutable/chunks/DJpRpSNq.js","_app/immutable/chunks/Bdf91e8-.js","_app/immutable/chunks/D0lUaFnm.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js')),
			__memo(() => import('./nodes/5.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/api/logs/[service]",
				pattern: /^\/api\/logs\/([^/]+?)\/?$/,
				params: [{"name":"service","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/logs/_service_/_server.ts.js'))
			},
			{
				id: "/api/sse",
				pattern: /^\/api\/sse\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/sse/_server.ts.js'))
			},
			{
				id: "/commands",
				pattern: /^\/commands\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/messages",
				pattern: /^\/messages\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/whatsapp",
				pattern: /^\/whatsapp\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

export const prerendered = new Set([]);

export const base = "";