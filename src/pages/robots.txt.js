import { SITE } from "../config/site.js";

export function GET({ site }) {
  const base = site || new URL(SITE.url);
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap-index.xml", base).toString()}\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain" } });
}
