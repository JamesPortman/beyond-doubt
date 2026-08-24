/** The account page.
 *
 *  It is a page rather than a modal because it does three things a modal is bad at:
 *  it can be linked to, it survives a reload mid-sign-in, and it is where someone goes
 *  looking when they want to leave. The game itself never asks for an account. */
import {
  allThemes, getTheme, LocaleCode, loadSettings, cssVars,
  Api, ApiError, defaultApiBase,
} from '../src/index.js';
import '../src/themes/all.js';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const el = (tag: string, cls = '', text = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

const prefs = (() => {
  try { return JSON.parse(globalThis.localStorage?.getItem('clues.prefs.v4') ?? '{}'); }
  catch { return {}; }
})() as { themeId?: string; locale?: LocaleCode };

// the page wears whatever the game was last wearing, so arriving here is not a scene change
const theme = getTheme(prefs.themeId ?? 'gallery') ?? getTheme(allThemes()[0].id)!;
for (const [k, v] of Object.entries(cssVars(theme, loadSettings()))) {
  document.documentElement.style.setProperty(k, v);
}
document.body.className = `skin-${theme.id}`;

const api = new Api(defaultApiBase());
const main = $('#account-main');

function say(node: HTMLElement, msg: string, kind = ''): void {
  node.textContent = msg;
  node.className = `note ${kind}`;
}

/** Turn an API failure into something a person can act on. Anything unrecognised keeps
 *  its code — a mystery with a name is easier to report than a mystery without one. */
function reason(e: unknown, fallback: string): string {
  const c = (e as ApiError).code;
  if (c === 'too-many-requests') return 'Too many attempts just now. Try again in a few minutes.';
  if (c === 'bad-code') return 'That code did not match. Check it, or send a new one.';
  if (c === 'bad-email') return 'That does not look like an email address.';
  if (c === 'signups-closed') return 'New accounts are closed at the moment. Existing accounts still work.';
  if (!c) return 'Could not reach the game right now.';
  return `${fallback} (${c})`;
}

/* ------------------------------ signed out ------------------------------ */

function renderSignIn(): void {
  main.innerHTML = '';
  main.appendChild(el('h1', 'welcome', 'Welcome'));
  main.appendChild(el('p', 'lede',
    'The daily board is free and needs no account. Sign in and the game starts keeping score: your streak, your place on the leaderboards, and every board you have finished.'));

  const card = el('div', 'card');
  card.appendChild(el('h2', '', 'Sign in or create an account'));
  card.appendChild(el('p', 'sub-note',
    'One field, and no password to invent or forget — we email you a six-digit code. The same form does both: if the address is new, the account is created when the code checks out.'));

  const form = el('form', 'fields') as HTMLFormElement;
  const email = document.createElement('input');
  email.type = 'email'; email.required = true; email.autocomplete = 'email';
  email.placeholder = 'you@example.com'; email.id = 'email';
  const code = document.createElement('input');
  code.type = 'text'; code.inputMode = 'numeric'; code.autocomplete = 'one-time-code';
  code.placeholder = '000000'; code.id = 'code';
  const name = document.createElement('input');
  name.type = 'text'; name.placeholder = 'Shown on the leaderboard'; name.id = 'name';
  name.maxLength = 24;

  const row = (label: string, input: HTMLInputElement, hint = '') => {
    const r = el('div', 'field-row');
    const l = document.createElement('label');
    l.htmlFor = input.id; l.textContent = label;
    r.appendChild(l);
    const stack = el('div', 'field-stack');
    input.className = 'field';
    stack.appendChild(input);
    if (hint) stack.appendChild(el('span', 'hint', hint));
    r.appendChild(stack);
    return r;
  };

  const emailRow = row('Email', email);
  const codeRow = row('Code', code, 'Expires in ten minutes.');
  const nameRow = row('Display name', name, 'Optional. It does not have to be your name.');
  codeRow.hidden = true; nameRow.hidden = true;
  form.append(emailRow, codeRow, nameRow);

  const note = el('p', 'note');
  const go = el('button', 'primary', 'Email me a code') as HTMLButtonElement;
  go.type = 'submit';
  const again = el('button', 'link-btn', 'Use a different address') as HTMLButtonElement;
  again.type = 'button'; again.hidden = true;

  let stage: 'email' | 'code' = 'email';
  again.onclick = () => {
    stage = 'email';
    codeRow.hidden = true; nameRow.hidden = true; again.hidden = true;
    email.disabled = false; go.textContent = 'Email me a code';
    say(note, '');
    email.focus();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    go.disabled = true;
    try {
      if (stage === 'email') {
        const r = await api.requestCode(email.value.trim());
        stage = 'code';
        codeRow.hidden = false; nameRow.hidden = false; again.hidden = false;
        email.disabled = true;
        go.textContent = 'Sign in';
        say(note, r.devCode ? `Development mode — your code is ${r.devCode}` : `Code sent to ${email.value.trim()}. Check your inbox.`, 'good');
        if (r.devCode) code.value = r.devCode;
        code.focus();
      } else {
        await api.verify(email.value.trim(), code.value.trim(), name.value.trim() || undefined);
        renderAccount();
        return;
      }
    } catch (err) {
      say(note, reason(err, 'Could not sign in'), 'bad');
    } finally {
      go.disabled = false;
    }
  };

  const actions = el('div', 'actions');
  actions.append(go, again);
  form.append(note, actions);
  card.appendChild(form);
  main.appendChild(card);

  main.appendChild(el('p', 'aside',
    'No password is ever stored, because there is no password. Signing in from a new device just means another code.'));
  email.focus();
}

/* ------------------------------- signed in ------------------------------- */

async function renderAccount(): Promise<void> {
  main.innerHTML = '';
  // verify() hands back the user but not the streak, so ask for it once. A failure here
  // costs the numbers, not the page — the account controls still have to work offline.
  if (!api.stats) await api.me().catch(() => null);
  const user = api.user;
  const stats = api.stats;
  main.appendChild(el('h1', 'welcome', `Hello, ${user?.displayName ?? 'there'}`));

  if (stats) {
    const row = el('div', 'stat-row');
    const stat = (n: string, label: string) => {
      const s = el('div', 'stat');
      s.appendChild(el('b', '', n));
      s.appendChild(el('span', '', label));
      row.appendChild(s);
    };
    stat(String(stats.streak), stats.streak === 1 ? 'day streak' : 'days running');
    stat(String(stats.bestStreak), 'best ever');
    stat(String(stats.daysPlayed), stats.daysPlayed === 1 ? 'day played' : 'days played');
    main.appendChild(row);
    if (stats.atRisk) {
      main.appendChild(el('p', 'lede', 'Today is still unplayed — your streak is riding on it.'));
    }
  }

  const play = el('a', 'primary as-button', 'Play today’s board') as HTMLAnchorElement;
  play.href = './';
  const acts = el('div', 'actions');
  acts.appendChild(play);
  const out = el('button', '', 'Sign out') as HTMLButtonElement;
  out.onclick = () => { api.signOut(); renderSignIn(); };
  acts.appendChild(out);
  main.appendChild(acts);

  const card = el('div', 'card');
  card.appendChild(el('h2', '', 'Your data'));
  card.appendChild(el('p', 'sub-note',
    `Signed in as ${user?.email ?? ''}. Everything held about you is one button away, and so is the exit.`));
  const note = el('p', 'note');

  const exp = el('button', '', 'Download my data') as HTMLButtonElement;
  exp.onclick = async () => {
    exp.disabled = true;
    try {
      const dump = await api.exportAccount();
      const url = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `beyond-doubt-${dump.account.id}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      say(note, 'Downloaded — the account row, every play and every result.', 'good');
    } catch (e) { say(note, reason(e, 'Could not export'), 'bad'); }
    finally { exp.disabled = false; }
  };

  const del = el('button', 'danger', 'Delete my account') as HTMLButtonElement;
  del.onclick = () => renderDelete();

  const acts2 = el('div', 'actions');
  acts2.append(exp, del);
  card.append(acts2, note);
  main.appendChild(card);
}

/** Two gates, deliberately: a code proving the address is still theirs, and a word typed
 *  out in full. Neither is friction for someone who means it, and a live session alone —
 *  a borrowed phone, a shared laptop — is not enough. */
function renderDelete(): void {
  main.innerHTML = '';
  main.appendChild(el('h1', 'welcome', 'Delete your account'));
  main.appendChild(el('p', 'lede',
    'This erases your account, every run you have recorded, your streak and your place on every leaderboard. It cannot be undone, and there is no copy kept.'));

  const card = el('div', 'card danger-card');
  const form = el('form', 'fields') as HTMLFormElement;
  const code = document.createElement('input');
  code.type = 'text'; code.inputMode = 'numeric'; code.id = 'del-code'; code.placeholder = '000000';
  const word = document.createElement('input');
  word.type = 'text'; word.id = 'del-word'; word.placeholder = 'DELETE';

  const row = (label: string, input: HTMLInputElement, hint: string) => {
    const r = el('div', 'field-row');
    const l = document.createElement('label');
    l.htmlFor = input.id; l.textContent = label;
    const stack = el('div', 'field-stack');
    input.className = 'field';
    stack.append(input, el('span', 'hint', hint));
    r.append(l, stack);
    return r;
  };
  const codeRow = row('Code', code, 'Emailed to you, to prove the address is still yours.');
  const wordRow = row('Confirm', word, 'Type DELETE in capitals.');
  codeRow.hidden = true; wordRow.hidden = true;
  form.append(codeRow, wordRow);

  const note = el('p', 'note', 'We will email a code before anything is deleted.');
  const go = el('button', 'danger', 'Email me a code') as HTMLButtonElement;
  go.type = 'submit';
  const back = el('button', 'primary', 'Keep my account') as HTMLButtonElement;
  back.type = 'button';
  back.onclick = () => { void renderAccount(); };

  let stage: 'send' | 'confirm' = 'send';
  form.onsubmit = async (e) => {
    e.preventDefault();
    go.disabled = true;
    try {
      if (stage === 'send') {
        const r = await api.requestCode(api.user!.email);
        stage = 'confirm';
        codeRow.hidden = false; wordRow.hidden = false;
        go.textContent = 'Delete permanently';
        say(note, r.devCode ? `Development mode — your code is ${r.devCode}` : 'Code sent. Check your inbox.', 'good');
        if (r.devCode) code.value = r.devCode;
      } else {
        if (word.value.trim().toUpperCase() !== 'DELETE') { say(note, 'Type DELETE to confirm.', 'bad'); return; }
        const gone = await api.deleteAccount(code.value.trim());
        api.signOut();
        main.innerHTML = '';
        main.appendChild(el('h1', 'welcome', 'Your account is gone'));
        main.appendChild(el('p', 'lede',
          `${gone.removed.results ?? 0} recorded runs and everything else held about you have been deleted. The daily board is still there whenever you want it.`));
        const a = el('a', 'primary as-button', 'Back to the game') as HTMLAnchorElement;
        a.href = './';
        const acts = el('div', 'actions'); acts.appendChild(a);
        main.appendChild(acts);
        return;
      }
    } catch (err) {
      say(note, reason(err, 'Could not delete the account'), 'bad');
    } finally {
      go.disabled = false;
    }
  };

  const acts = el('div', 'actions');
  acts.append(back, go);
  form.append(note, acts);
  card.appendChild(form);
  main.appendChild(card);
}

/* --------------------------------- boot --------------------------------- */

(async () => {
  main.appendChild(el('p', 'lede', 'One moment…'));
  const me = await api.me().catch(() => null);
  if (me) await renderAccount(); else renderSignIn();
})();
