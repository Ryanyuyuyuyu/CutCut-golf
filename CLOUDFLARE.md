# Cloudflare Workers deployment

This publishes the existing static website, including its privacy and support pages, as a separate Worker. No application server or database is needed.

Production URL: **https://cutcut-golf.ryan-shiyu.workers.dev/**. Worker name: `cutcut-golf`.

1. Sign in to the Cloudflare account that owns this Worker with `npx wrangler@4.151.0 login`, then check `npx wrangler@4.151.0 whoami`. Deployment requires account read, user read, and Workers Scripts edit permissions; an OAuth refresh token can keep this existing authorization current.
2. Confirm the account owns the `ryan-shiyu.workers.dev` subdomain and the `cutcut-golf` Worker. Select that account with `CLOUDFLARE_ACCOUNT_ID` if more than one account is available.
3. Build for the production origin:

   ```sh
   node scripts/build-cloudflare.mjs https://cutcut-golf.ryan-shiyu.workers.dev
   npx wrangler@4.151.0 deploy --dry-run
   ```

4. Publish with `npx wrangler@4.151.0 deploy`.
5. Verify the returned live URL, privacy and support pages, Chinese and English text, mobile layout, video playback, and the simulator before announcing it as published.

The build copies only `docs/` into `.cloudflare-dist/`, updates canonical and social-preview URLs, and adjusts the privacy page's hosting-provider statement for Cloudflare. Source files in `docs/` continue to support the existing GitHub Pages site. Login credentials and generated files are ignored by Git.

The simulator fetches its small sample video once, on demand, and plays it through a browser-local Blob URL. This keeps trimming and replay accurate when the static asset host returns a full file for byte-range requests. The simulator does not save or export visitors' files.
