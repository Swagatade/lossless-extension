// Cloudflare Workers entrypoint.
// Config comes from wrangler.toml [vars] and secrets (`wrangler secret put`).
import { createApp } from "./app.js";
// One app per isolate; rebuilt only if the env object changes (e.g. new deploy).
const apps = new WeakMap();
export default {
    async fetch(request, env) {
        let app = apps.get(env);
        if (!app) {
            try {
                app = createApp(env);
            }
            catch (error) {
                console.error(JSON.stringify({
                    level: "error",
                    msg: error instanceof Error ? error.message : String(error),
                }));
                return new Response(JSON.stringify({ error: "invalid configuration" }), {
                    status: 500,
                    headers: { "Content-Type": "application/json; charset=utf-8" },
                });
            }
            apps.set(env, app);
        }
        return app.fetch(request);
    },
};
