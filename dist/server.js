// Node.js adapter (local dev, Zoho Catalyst, Vercel). For Cloudflare see worker.ts.
import { createServer, } from "node:http";
import { loadConfig } from "./config.js";
import { createApp, parseQuality } from "./app.js";
const env = process.env;
const app = createApp(env);
function toRequest(req) {
    const host = req.headers.host ?? "localhost";
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value))
            for (const v of value)
                headers.append(key, v);
        else if (value !== undefined)
            headers.set(key, value);
    }
    return new Request(new URL(req.url ?? "/", `http://${host}`), {
        method: req.method,
        headers,
    });
}
export async function handler(req, res) {
    const response = await app.fetch(toRequest(req));
    const headers = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
}
const server = createServer((req, res) => {
    handler(req, res).catch((error) => {
        console.error(error);
        if (!res.headersSent)
            res.writeHead(500);
        res.end();
    });
});
if (process.env.VERCEL !== "1") {
    const config = loadConfig(env);
    server.listen(config.port, config.host, () => {
        console.log(JSON.stringify({
            level: "info",
            msg: "EchoMusic addon listening",
            host: config.host,
            port: config.port,
            provider: config.provider,
        }));
    });
    server.on("error", (error) => {
        console.error(error);
        process.exit(1);
    });
}
export { server as app, parseQuality };
