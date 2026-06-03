import * as server from '../entries/pages/whatsapp/_page.server.ts.js';

export const index = 5;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/whatsapp/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/whatsapp/+page.server.ts";
export const imports = ["_app/immutable/nodes/5.BS7hSK7L.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BOapl1dN.js","_app/immutable/chunks/D37meRkZ.js","_app/immutable/chunks/7YYcctaQ.js","_app/immutable/chunks/BBWm0VUs.js","_app/immutable/chunks/oHFLFQMb.js","_app/immutable/chunks/TUcuHu3_.js","_app/immutable/chunks/D0lUaFnm.js","_app/immutable/chunks/CTwQVCye.js","_app/immutable/chunks/DJpRpSNq.js","_app/immutable/chunks/Bdf91e8-.js"];
export const stylesheets = [];
export const fonts = [];
