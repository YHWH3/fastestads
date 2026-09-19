// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- standard Astro env reference
/// <reference path="../.astro/types.d.ts" />

// Secrets are not part of wrangler vars — declared here so `env` stays typed.
declare namespace Cloudflare {
  interface Env {
    TYPESAFE_API_KEY?: string;
  }
}
