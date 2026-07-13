/**
 * Effimero analytics snippet.
 *
 * Usage:
 *   <script src="https://your-host/effimero.js"
 *           data-site="my-site" data-endpoint="https://your-host/collect" defer></script>
 *
 * Sends a pageview beacon on load and on SPA navigations (pushState/popstate).
 * Uses no cookies, no localStorage, no fingerprinting — the only data sent is
 * the page path and the referrer hostname; visitor identity is derived
 * server-side from IP + User-Agent + a daily rotating salt and never stored.
 */
(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;

  const siteId = script.dataset.site;
  // Default endpoint: same origin the snippet was served from.
  const endpoint = script.dataset.endpoint ?? new URL("/collect", script.src).href;
  if (!siteId) return;

  // Respect explicit browser opt-out signals even though nothing is stored.
  if (navigator.doNotTrack === "1" || (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl) {
    return;
  }

  let lastPath = "";

  const send = () => {
    const path = location.pathname;
    if (path === lastPath) return; // dedupe repeated history events on the same page
    lastPath = path;

    const body = JSON.stringify({
      siteId,
      path,
      referrer: document.referrer || undefined,
    });

    // Sent as text/plain (CORS-safelisted): a JSON content type forces a
    // preflight that browsers refuse to pair with beacons, silently dropping
    // the hit. sendBeacon survives page unloads; fetch keepalive is the fallback.
    if (!navigator.sendBeacon?.(endpoint, body)) {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  };

  // SPA support: wrap pushState/replaceState and listen to popstate.
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      send();
    };
  }
  addEventListener("popstate", send);

  send();
})();
