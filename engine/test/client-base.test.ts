import test from 'node:test';
import assert from 'node:assert/strict';
import { basePath } from '../src/net/client.js';

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
