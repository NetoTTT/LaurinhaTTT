import * as server from '../entries/pages/_page.server.ts.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/2.DLaEKGVV.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BOapl1dN.js","_app/immutable/chunks/D37meRkZ.js","_app/immutable/chunks/BBWm0VUs.js","_app/immutable/chunks/DfjMaT63.js","_app/immutable/chunks/C8jUpsqL.js","_app/immutable/chunks/DJpRpSNq.js","_app/immutable/chunks/Bdf91e8-.js","_app/immutable/chunks/D0lUaFnm.js"];
export const stylesheets = [];
export const fonts = [];
