/** Where this deployment lives on its host.
 *
 *  The app answers on two URLs: its own domain at the root, and
 *  www.portman.ca/beyond-doubt/, which proxies it as a subpath. Anything the browser
 *  fetches by a site-root path — the API, the tile artwork — has to carry that prefix
 *  or it lands on portman.ca's own root, where `/assets` and `/api` belong to no app
 *  in particular. Derived from the URL at runtime, so one build serves both. */

/** The prefix implied by a pathname: empty at a domain root, "/beyond-doubt" behind
 *  the proxy. A path that merely starts with the same letters is a different app. */
export function basePath(pathname: string): string {
  return /^\/beyond-doubt(\/|$)/.test(pathname) ? '/beyond-doubt' : '';
}

/** The prefix for the page being viewed. Empty off-browser (tests, server render),
 *  which is also the correct answer there. */
export function currentBase(): string {
  const p = globalThis.location?.pathname;
  return typeof p === 'string' ? basePath(p) : '';
}
