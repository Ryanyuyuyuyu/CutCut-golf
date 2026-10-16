# Cloudflare Workers deployment

This publishes the existing static website, including its privacy and support pages, as a separate Worker. No application server or database is needed.

1. Sign in to the Cloudflare account that owns the intended Worker with `npx wrangler@4.151.0 login`, then check `npx wrangler@4.151.0 whoami`.
2. Confirm the account's workers.dev subdomain or a verified custom domain. Check whether the Worker name `cutcut-golf` is already in use before deploying; do not overwrite an unrelated Worker.
3. Build for the confirmed origin:

   ```sh
   node scripts/build-cloudflare.mjs https://YOUR-CONFIRMED-ORIGIN
   npx wrangler@4.151.0 deploy --dry-run
   ```

4. Publish with `npx wrangler@4.151.0 deploy`.
5. Verify the returned live URL, privacy and support pages, Chinese and English text, mobile layout, video playback, and the simulator before announcing it as published.

The build copies only `docs/` into `.cloudflare-dist/`, updates canonical and social-preview URLs, and adjusts the privacy page's hosting-provider statement for Cloudflare. Source files in `docs/` continue to support the existing GitHub Pages site. Login credentials and generated files are ignored by Git.
