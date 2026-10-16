import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/build-cloudflare.mjs https://your-site.workers.dev");
const url = new URL(input);
if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
  throw new Error("Provide the verified HTTPS origin, without a path, query, or credentials.");
}
const origin = url.origin;
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".cloudflare-dist");
const githubOrigin = "https://ryanyuyuyuyu.github.io/CutCut-golf";
await rm(output, { recursive: true, force: true });
await cp(path.join(root, "docs"), output, { recursive: true });

for (const relative of ["index.html", "privacy/index.html", "support/index.html"]) {
  const filename = path.join(output, relative);
  let html = await readFile(filename, "utf8");
  html = html.replaceAll(githubOrigin, origin);
  if (relative === "index.html") {
    html = html.replace('  <meta property="og:type"', `  <link rel="canonical" href="${origin}/">\n  <meta property="og:url" content="${origin}/">\n  <meta property="og:type"`);
  }
  if (relative === "privacy/index.html") {
    const original = `Opening this privacy policy or the support page makes a browser request to GitHub Pages. GitHub's handling of that request is governed by the
        <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">GitHub General Privacy Statement</a>.`;
    if (!html.includes(original)) throw new Error("Review the privacy hosting paragraph before deploying.");
    html = html.replace(original, `Opening this privacy policy or the support page makes a browser request to Cloudflare, which hosts this website.
        See the <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare Privacy Policy</a> for information about its handling of request data.`);
  }
  await writeFile(filename, html);
}
console.log(`Prepared Cloudflare static assets for ${origin} in ${output}`);
