import { SITE } from "../../site.config.mjs";

export function GET() {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap-index.xml", SITE.url).toString()}\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain" } });
}
