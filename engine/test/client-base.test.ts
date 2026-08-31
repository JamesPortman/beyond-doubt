import test from 'node:test';
import assert from 'node:assert/strict';
import { basePath, currentBase } from '../src/base.js';
import { gallery } from '../src/themes/gallery.js';

// The demo answers on two URLs: its own Vercel domain at the root, and
// www.portman.ca/beyond-doubt/, which proxies it as a subpath. Every /api call is
// built from defaultApiBase(), so the prefix has to be recovered from the path.
test('basePath recovers the /beyond-doubt prefix, and only that prefix', () => {
  assert.equal(basePath('/beyond-doubt'), '/beyond-doubt');
  assert.equal(basePath('/beyond-doubt/'), '/beyond-doubt');
  assert.equal(basePath('/beyond-doubt/how.html'), '/beyond-doubt');
  assert.equal(basePath('/beyond-doubt/account.html'), '/beyond-doubt');

  // At a domain root there is no prefix to add.
  assert.equal(basePath('/'), '');
  assert.equal(basePath('/how.html'), '');

  // A path that merely starts with the same letters is a different app, not a prefix.
  assert.equal(basePath('/beyond-doubtful'), '');
  assert.equal(basePath('/beyond-doubt-extra/x'), '');

  // The prefix is only ever the leading segment.
  assert.equal(basePath('/other/beyond-doubt/x'), '');
});

// The tile artwork is fetched by path like the API is, so it needs the same prefix.
// A bare /assets/... resolves against the proxying site's own root, where portman.ca
// has an /assets directory of its own — which is how the board rendered blank tiles.
test('gallery artwork is addressed relative to the deployment, not the host root', () => {
  const loc = globalThis.location;
  try {
    Object.defineProperty(globalThis, 'location', {
      value: { pathname: '/beyond-doubt/' }, configurable: true, writable: true,
    });
    assert.equal(currentBase(), '/beyond-doubt');
    assert.equal(gallery.images?.src(0), '/beyond-doubt/assets/gallery/01.webp');

    (globalThis as { location?: unknown }).location = { pathname: '/' };
    assert.equal(currentBase(), '');
    assert.equal(gallery.images?.src(0), '/assets/gallery/01.webp');
  } finally {
    if (loc) Object.defineProperty(globalThis, 'location', { value: loc, configurable: true, writable: true });
    else delete (globalThis as { location?: unknown }).location;
  }
});

// Off-browser (server render, tests) there is no location and no prefix to add.
test('currentBase is empty when there is no location', () => {
  const loc = globalThis.location;
  try {
    delete (globalThis as { location?: unknown }).location;
    assert.equal(currentBase(), '');
  } finally {
    if (loc) Object.defineProperty(globalThis, 'location', { value: loc, configurable: true, writable: true });
  }
});
