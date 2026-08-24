import {
  allThemes, getTheme, renderContext, renderClue, tagLabel,
  getLocale, ALL_LOCALES, LocaleCode, Theme, agree,
  Session, State, bits, PuzzleView, PlacedClue,
  scoreRun, formatDuration,
  dailyEdition, weeklyEdition, freeEdition, buildPuzzle, EditionRef, isoDate,
  LocalLeaderboard, entryFrom, makeRng,
  Api, ApiError, defaultApiBase, EditionInfo, PlayMode, RunResult, RoomPlayer, ArchiveDay, PublicFlags,
  tileArt, ART_DEFS,
  Settings, loadSettings, saveSettings, DEFAULT_SETTINGS, cssVars,
  termsForClue, TermId, dealFor, resultGrid, shareText,
  streakStats, StreakStats,
} from '../src/index.js';

type Mode = 'daily' | 'weekly' | 'free' | 'split' | 'room' | 'archive';
/** 0 = no tag, 1..5 = a colour. The original uses coloured corner tags as working
 *  notes rather than a two-state pencil, and once you are tracking three hypotheses at
 *  once two states is not enough. */
/** A working mark, in the two colours the board itself uses: none, leaning-A, leaning-B.
 *  Five arbitrary colours asked the player to invent a key and then remember it; two that
 *  match the states you are already deciding between need no key at all. */
type Pencil = 0 | 1 | 2;
const PENCIL_STATES = 3;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const el = (tag: string, cls = '', text = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

const THEME_IDS = allThemes().map((t) => t.id);
const LOCAL_ID = 'you';

interface Prefs { themeId: string; locale: LocaleCode; mode: Mode; players: number; }
const DEFAULTS: Prefs = { themeId: 'gallery', locale: 'en', mode: 'daily', players: 1 };
const loadPrefs = (): Prefs => {
  try { return { ...DEFAULTS, ...JSON.parse(globalThis.localStorage?.getItem('clues.prefs.v4') ?? '{}') }; }
  catch { return { ...DEFAULTS }; }
};
const savePrefs = (p: Prefs) => { try { globalThis.localStorage?.setItem('clues.prefs.v4', JSON.stringify(p)); } catch { /* ignore */ } };

const localBoard = new LocalLeaderboard();

function toggleRow(label: string, on: boolean, set: (on: boolean) => void): HTMLElement {
  const row = el('label', 'admin-row');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = on;
  box.onchange = () => set(box.checked);
  row.appendChild(box);
  row.appendChild(el('span', '', label));
  return row;
}

class App {
  prefs = loadPrefs();
  settings: Settings = loadSettings();
  inspecting = false;
  inspectClue: string | null = null;
  inspectCell: number | null = null;
  sheetCell: number | null = null;
  /** What the operator has left switched on. Absent until the server answers; everything
   *  is open until then, because a local board needs no permission from anyone. */
  flags: PublicFlags | null = null;
  /** Cells a hint has pointed at. Only these light up under the default setting. */
  hintedCells = new Set<number>();
  private flavourDeal = new Map<number, string>();
  private flavourKey = '';
  hintArmed = false;
  shareSeed: string | null = null;
  tutorialStep = -1;
  roomId: string | null = null;
  roomCode: string | null = null;
  players: RoomPlayer[] = [];
  focusCell: number | null = null;
  beat: number | null = null;
  archiveDays: ArchiveDay[] = [];
  archiveOpen = false;
  archiveDate: string | null = null;
  doneClues = new Set<string>();
  api = new Api(defaultApiBase());
  online = false;

  theme!: Theme;
  session!: Session;
  /** online */
  playId: string | null = null;
  edition!: EditionInfo;
  /** offline */
  localRef!: EditionRef;

  pencils: Pencil[] = [];
  activePlayer = 0;
  highlight = 0;
  busy = false;
  serverElapsed = 0;
  previousResult: RunResult | null = null;
  startedWall = 0;
  hintsUsed = 0;
  mistakes = 0;
  tick: number | null = null;

  get loc() { return getLocale(this.prefs.locale); }
  get ui() { return this.loc.ui; }
  get strings() { return this.theme.strings[this.prefs.locale]; }
  get playerCount() { return this.prefs.mode === 'split' ? Math.max(2, this.prefs.players) : 1; }
  get todayIndex() { const d = new Date(); return (d.getUTCDay() || 7) - 1; }

  /** A shared link carries a theme and, for practice boards, a seed. Boards are pure
   *  functions of their seed, so this reproduces the exact scenario with no server. */
  private linked: { seed?: string; difficulty?: number } | null = null;

  private readLink() {
    try {
      const q = new URLSearchParams(globalThis.location?.search ?? '');
      const g = q.get('g');
      if (g && allThemes().some((t) => t.id === g)) this.prefs.themeId = g;
      const m = q.get('m');
      if (m === 'daily' || m === 'weekly' || m === 'free' || m === 'split') this.prefs.mode = m;
      const room = q.get('room');
      if (room) { this.roomCode = room.toUpperCase(); this.prefs.mode = 'room'; }
      const seed = q.get('s');
      if (seed) {
        this.linked = { seed, difficulty: Number(q.get('d')) || 4 };
        this.prefs.mode = 'free';
      }
    } catch { /* no location, no link */ }
  }

  async start() {
    document.body.insertAdjacentHTML('afterbegin', ART_DEFS);
    this.readLink();
    this.theme = getTheme(this.prefs.themeId);
    this.applySkin();
    await this.probe();
    this.buildChrome();
    await this.newBoard();
    document.addEventListener('keydown', (e) => {
      // with a square open, the number keys answer it
      if (this.sheetCell !== null) {
        if (e.key === 'Escape') { this.closeSheet(); return; }
        if (e.key === '1' || e.key === '2') {
          const cell = this.sheetCell;
          this.closeSheet();
          void this.flip(cell, (e.key === '1' ? 0 : 1) as State);
        }
        return;
      }
      if (e.key.toLowerCase() === 'h') void this.doHint();
    });
    const checkHash = () => { if (location.hash === '#admin') void this.openAdmin(); };
    globalThis.addEventListener?.('hashchange', checkHash);
    checkHash();
  }

  /** Online if a server is reachable AND we have a valid token. Split mode is a
   *  one-device format, so it always runs locally. */
  async probe() {
    const up = await this.api.reachable();
    const me = up ? await this.api.me() : null;
    this.online = !!(up && me);
    // Unauthenticated on purpose: a signed-out visitor should see the same closed doors
    // as everyone else rather than discovering them by walking into one.
    if (up) { try { this.flags = (await this.api.flags()).flags; } catch { /* leave it open */ } }
  }

  themeAllowed(id: string): boolean { return !this.flags || this.flags.themes.includes(id); }
  modeAllowed(m: Mode): boolean {
    const f = this.flags;
    if (!f) return true;
    if (m === 'archive') return f.archive;
    if (m === 'weekly') return f.weekly;
    if (m === 'free') return f.free;
    if (m === 'room') return f.rooms;
    return true;
  }

  /* ---------------- board lifecycle ---------------- */

  async newBoard(dayIndex?: number) {
    this.theme = getTheme(this.prefs.themeId);
    this.busy = true;
    this.hintsUsed = 0; this.mistakes = 0; this.serverElapsed = 0;
    this.playId = null; this.previousResult = null;
    this.activePlayer = 0; this.highlight = 0;
    this.hintedCells.clear();

    if (this.beat) { clearInterval(this.beat); this.beat = null; }
    if (this.prefs.mode !== 'room') { this.roomId = null; this.roomCode = null; this.players = []; }

    if (this.prefs.mode === 'archive' && !this.archiveDate) {
      this.archiveOpen = true;
      await this.loadArchive();
      this.busy = false;
      this.applySkin();
      this.render();
      return;
    }

    if (this.prefs.mode === 'room') {
      if (!this.online) { this.toast(this.ui.room.codeHint, 'warn'); this.prefs.mode = 'daily'; }
      else {
        try {
          const res = await this.api.roomJoin(
            this.roomCode ? { code: this.roomCode } : { mode: 'daily', themeId: this.prefs.themeId },
          );
          this.roomId = res.roomId; this.roomCode = res.code; this.players = res.players;
          this.playId = res.playId; this.edition = res.edition;
          this.session = new Session({ puzzle: res.view, hintBudget: res.hintBudget, now: () => 0 });
          this.prefs.themeId = res.edition.themeId;
          this.theme = getTheme(this.prefs.themeId);
          // presence is a poll, not a socket: one small request every few seconds is
          // enough for a race and survives sleeping laptops and flaky wifi
          this.beat = setInterval(() => void this.heartbeat(), 2500) as unknown as number;
        } catch (e) {
          this.toast(`${(e as ApiError).code ?? 'offline'}`, 'warn');
          this.prefs.mode = 'daily';
        }
      }
    }

    const useServer = this.online && !this.playId && this.prefs.mode !== 'split'
      && this.prefs.mode !== 'room' && !this.linked;
    if (useServer) {
      try {
        const mode = this.prefs.mode as PlayMode;
        const res = await this.api.start({
          mode, themeId: this.prefs.themeId,
          dayIndex: mode === 'weekly' ? (dayIndex ?? this.todayIndex) : undefined,
          date: mode === 'archive' ? this.archiveDate ?? undefined : undefined,
        });
        this.playId = res.playId;
        this.edition = res.edition;
        this.session = new Session({ puzzle: res.view, hintBudget: res.hintBudget, now: () => 0 });
        this.previousResult = res.previousResult;
        this.shareSeed = res.shareSeed ?? null;
        if (res.previousResult) this.toast(this.replayNotice(res.previousResult), 'warn');
      } catch (e) {
        this.online = false;
        this.toast(`${(e as ApiError).code ?? 'offline'}`, 'warn');
      }
    }
    if (!this.playId) this.startLocal(dayIndex);

    this.pencils = new Array(this.session.puzzle.n).fill(0);
    this.doneClues.clear();
    this.inspectClue = null; this.inspectCell = null;
    this.startedWall = Date.now();
    if (this.tick) clearInterval(this.tick);
    this.tick = setInterval(() => this.paintStatus(), 500) as unknown as number;
    this.busy = false;
    this.applySkin();
    this.render();
  }

  private startLocal(dayIndex?: number) {
    const today = new Date();
    let ref: EditionRef;
    if (this.prefs.mode === 'weekly') {
      ref = weeklyEdition(THEME_IDS, today, this.prefs.themeId)[Math.min(dayIndex ?? this.todayIndex, this.todayIndex)];
    } else if (this.prefs.mode === 'archive' && this.archiveDate) {
      ref = dailyEdition(THEME_IDS, new Date(`${this.archiveDate}T12:00:00Z`), this.prefs.themeId);
    } else if (this.prefs.mode === 'daily' || this.prefs.mode === 'split') {
      ref = dailyEdition(THEME_IDS, today, this.prefs.themeId);
    } else if (this.linked) {
      ref = freeEdition(this.prefs.themeId, this.linked.difficulty ?? 4, this.linked.seed!);
      this.linked = null;   // only the first board comes from the link
    } else {
      ref = freeEdition(this.prefs.themeId, 4, `free|${this.prefs.themeId}|${Math.floor(Math.random() * 1e9)}`);
    }
    this.localRef = ref;
    this.shareSeed = ref.kind === 'free' ? ref.seed : null;
    this.edition = {
      id: ref.id, kind: ref.kind === 'weekly' ? 'weekly' : ref.kind === 'daily' ? 'daily' : 'free',
      themeId: ref.themeId, difficulty: ref.difficulty, date: ref.date,
      weekId: ref.weekId, dayIndex: ref.dayIndex, ranked: false,
    };
    const puzzle = buildPuzzle(ref, this.theme);
    this.session = new Session({
      puzzle,
      players: this.prefs.mode === 'split' ? this.playerCount : 1,
      hintBudget: 3,
    });
  }

  applySkin() {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(cssVars(this.theme, this.settings))) root.style.setProperty(k, v);
    document.body.className = this.theme.skinClass;
    document.body.dataset.colorMode = this.settings.colorMode;
    // Cold Open's labels are sentences ("She burns the letter"), so they stay in sentence
    // case; every other theme labels a person, a lot or a coordinate, which reads better shouted.
    document.body.dataset.labelMode = this.theme.labelMode;
    document.body.dataset.flavour = this.settings.showFlavour;
    document.body.dataset.tagSide = this.settings.tagSide;
    document.body.dataset.motion = this.settings.reduceMotion ? 'reduced' : 'normal';
    document.documentElement.lang = this.loc.bcp47;
  }

  /* ---------------- chrome ---------------- */

  /** The article lives on its own page, which reads the language out of the same stored
   *  prefs — so the only thing to do here is label the door in the right language. */
  paintArticleLink() {
    const foot = document.querySelector<HTMLElement>('.site-foot a.how-link');
    if (foot) foot.textContent = { en: 'How it was built', pt: 'Como foi construído', es: 'Cómo se construyó' }[this.prefs.locale];
    document.documentElement.lang = this.prefs.locale;
  }

  buildChrome() {
    this.paintArticleLink();
    const gameSel = $('#game') as HTMLSelectElement;
    gameSel.innerHTML = '';
    const open = allThemes().filter((t) => this.themeAllowed(t.id));
    for (const t of (open.length ? open : allThemes())) {
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.strings[this.prefs.locale].title;
      gameSel.appendChild(o);
    }
    if (!this.themeAllowed(this.prefs.themeId) && open.length) {
      this.prefs.themeId = open[0].id;
      savePrefs(this.prefs);
    }
    gameSel.value = this.prefs.themeId;
    gameSel.onchange = () => { this.prefs.themeId = gameSel.value; savePrefs(this.prefs); void this.newBoard(); };

    const langSel = $('#lang') as HTMLSelectElement;
    langSel.innerHTML = '';
    for (const code of ALL_LOCALES) {
      const o = document.createElement('option');
      o.value = code;
      o.textContent = { en: 'English', pt: 'Português', es: 'Español' }[code];
      langSel.appendChild(o);
    }
    langSel.value = this.prefs.locale;
    langSel.onchange = () => {
      this.prefs.locale = langSel.value as LocaleCode;
      savePrefs(this.prefs);
      this.buildChrome();      // language is a pure re-render — same board, same progress
      this.render();
    };

    // Split clues is shelved, not deleted: Session.cluesFor(player) and dealClues() are
    // still in the engine and still tested. Putting the tab back is one line.
    this.paintModes();

    $('#newBtn').onclick = () => void this.newBoard();
    this.paintAccount();
  }

  /** The local board stores edition ids, not days. Daily ids carry their date, which is
   *  what makes an offline streak possible at all — free play and rooms have no date and
   *  correctly count for nothing. */
  localPlayedDates(): string[] {
    return localBoard.all()
      .filter((r) => r.playerId === LOCAL_ID && r.editionId.startsWith('d:'))
      .map((r) => r.editionId.split(':')[1])
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  }

  streakNow(): StreakStats {
    if (this.online && this.api.stats) {
      const s = this.api.stats;
      return { current: s.streak, best: s.bestStreak, playedToday: s.playedToday, atRisk: s.atRisk };
    }
    return streakStats(this.localPlayedDates(), isoDate(new Date()));
  }

  paintAccount() {
    const wrap = $('#account');
    wrap.innerHTML = '';
    const dot = el('span', 'dot ' + (this.online ? 'up' : 'down'));
    wrap.appendChild(dot);
    const st = this.streakNow();
    if (st.current > 0) {
      // Shown before you play, not only after — a streak you cannot see is not one you
      // are protecting. Dimmed while today is still open, solid once today is banked.
      const chip = el('span', 'streak-chip' + (st.atRisk ? ' at-risk' : ''), `${st.current}`);
      chip.title = st.atRisk
        ? `${st.current}-day streak — today is still unplayed`
        : `${st.current}-day streak · best ${st.best}`;
      wrap.appendChild(chip);
    }
    // Signing in, signing out and leaving all live on their own page: a modal cannot be
    // linked to, does not survive a reload mid-code, and is a poor place to keep the exit.
    const link = document.createElement('a');
    link.className = 'link';
    link.href = 'account.html';
    if (this.online && this.api.user) {
      wrap.appendChild(el('span', 'who', this.api.user.displayName));
      link.textContent = 'Account';
    } else {
      wrap.appendChild(el('span', 'who', 'Local play'));
      link.textContent = 'Sign in';
    }
    wrap.appendChild(link);
  }

  replayNotice(r: RunResult) {
    return `${this.ui.solved} — ${formatDuration(r.timeMs)} · ${r.score}. ${this.ui.complete}.`;
  }

  /* ---------------- rendering ---------------- */

  render() {
    $('#title').textContent = this.strings.title;
    $('#tagline').textContent = this.strings.tagline;
    $('#newBtn').textContent = this.ui.newGame;
    ($('#game') as HTMLSelectElement).value = this.prefs.themeId;
    this.paintNotice();
    this.paintModes();
    // "ranked" is about THIS run, not the edition: a board you have already completed
    // can be replayed, but the result will not be re-ranked.
    $('#ranked').textContent = !this.online ? '○ local'
      : this.previousResult ? '✓ ' + this.ui.complete
      : this.edition.ranked ? '● ranked' : '○ practice';
    this.paintBoard();
    this.paintClues();
    this.paintStatus();
    this.paintWeek();
    this.paintPlayers();
    this.paintArchive();
    this.paintRoom();
    this.paintActions();
    this.paintInspect();
    void this.paintLeaderboard();
  }

  /** Repaint only what the highlight touches. Rebuilding the grid to move a highlight
   *  was survivable while clues lived in a side panel; now that a clue sits inside a
   *  tile, a rebuild detaches the very element the pointer is over — mouseenter and
   *  mouseleave then take turns tearing the board down. */
  paintHighlight() {
    const cells = document.querySelectorAll<HTMLElement>('#board .cell');
    cells.forEach((cell, i) => {
      cell.classList.toggle('lit', !!((this.highlight >> i) & 1));
      cell.classList.toggle('dimmed', this.inspecting && this.highlight !== 0 && !((this.highlight >> i) & 1));
    });
  }

  paintBoard() {
    const p = this.session.puzzle;
    const ctx = renderContext(this.theme, this.prefs.locale, p);
    const board = $('#board');
    board.innerHTML = '';
    board.style.gridTemplateColumns = `repeat(${p.w}, 1fr)`;
    const d = this.session.deduction();
    const forced = d.forcedA | d.forcedB;
    const tagKey = Object.keys(this.theme.tagSchema)[0];
    const visible = this.prefs.mode === 'split' && !this.online
      ? this.session.cluesFor(this.activePlayer)
      : this.session.activeClues();

    for (let i = 0; i < p.n; i++) {
      const knownB = (this.session.knownB >> i) & 1;
      const knownA = (this.session.knownA >> i) & 1;
      const known = knownB || knownA;
      const cell = el('button', 'cell');
      cell.classList.toggle('known', !!known);
      cell.classList.toggle('is-a', !!knownA);
      cell.classList.toggle('is-b', !!knownB);
      // Telling everyone which square is decidable removes the "where do I look next"
      // half of the puzzle. By default you only get it on a square you spent a hint on.
      const advertise = this.settings.showSolvable === 'always'
        || (this.settings.showSolvable === 'onHint' && this.hintedCells.has(i));
      cell.classList.toggle('forced', advertise && !known && !!((forced >> i) & 1));
      cell.classList.toggle('lit', !!((this.highlight >> i) & 1));
      cell.classList.toggle('dimmed', this.inspecting && this.highlight !== 0 && !((this.highlight >> i) & 1));
      if (!known) {
        // Always present, faint when unset: a corner you cannot see is a corner nobody
        // taps. It swallows its own click so tagging never opens the sheet.
        const tag = el('span', `tile-tag t${this.pencils[i]}`);
        tag.title = this.ui.actions.clearTags;
        tag.onclick = (e) => { e.stopPropagation(); this.cyclePencil(i); };
        cell.appendChild(tag);
      }
      if (this.settings.tileArt) {
        const art = el('span', 'art');
        art.innerHTML = tileArt({
          theme: this.theme, index: i, labelSeed: p.labelSeed,
          tag: tagKey ? p.tags[i][tagKey] : undefined,
          state: known ? (knownB ? 1 : 0) : null,
        });
        cell.appendChild(art);
      } else {
        cell.classList.add('no-art');
      }

      const cap = el('span', 'cap');
      cap.appendChild(el('span', 'cell-name', ctx.labels[i].text));
      if (tagKey) cap.appendChild(el('span', 'cell-tag', tagLabel(this.theme, this.prefs.locale, tagKey, p.tags[i][tagKey])));
      cell.appendChild(cap);

      // The clue this person was holding, now that they are resolved.
      const heldClue = known ? visible.find((c) => c.gate === i) : undefined;
      const flavour = known && !heldClue ? this.flavourFor(i) : '';
      if (heldClue) {
        const isDone = this.doneClues.has(heldClue.id);
        const box = el('span', 'cell-clue'
          + (isDone && this.settings.usedClues === 'dim' ? ' done' : '')
          + (this.inspectClue === heldClue.id ? ' picked' : ''),
          renderClue(this.loc, this.theme, ctx, heldClue.clue, heldClue.order));
        box.onclick = (e) => {
          e.stopPropagation();          // the tile underneath opens the sheet; this does not
          if (this.inspecting) {
            this.inspectClue = heldClue.id; this.inspectCell = null;
            this.highlight = maskOf(this.session.touches(heldClue.clue));
            this.render();
            return;
          }
          if (isDone) this.doneClues.delete(heldClue.id); else this.doneClues.add(heldClue.id);
          this.paintBoard();
        };
        box.onmouseenter = () => { if (!this.inspecting) { this.highlight = maskOf(this.session.touches(heldClue.clue)); this.paintHighlight(); } };
        box.onmouseleave = () => { if (!this.inspecting) { this.highlight = 0; this.paintHighlight(); } };
        cell.appendChild(box);
        cell.classList.add('has-clue');
      } else if (flavour) {
        cell.appendChild(el('span', 'cell-clue flavour', flavour));
        cell.classList.add('has-clue', 'has-flavour');
      }
      if (known) {
        const st = knownB ? this.strings.states.b : this.strings.states.a;
        cell.appendChild(el('span', 'cell-state', st.name));
      }
      cell.onclick = () => {
        this.focusCell = i;
        if (this.inspecting) { this.inspectCell = i; this.inspectClue = null; this.render(); return; }
        this.openTile(i);
      };
      cell.onmouseenter = () => { if (this.roomId) this.focusCell = i; };
      let held: number | null = null;
      cell.addEventListener('touchstart', () => {
        held = setTimeout(() => {
          held = null;
          if (!known) this.cyclePencil(i);
        }, 450) as unknown as number;
      }, { passive: true });
      const cancelHold = () => { if (held !== null) { clearTimeout(held); held = null; } };
      cell.addEventListener('touchend', cancelHold);
      cell.addEventListener('touchmove', cancelHold);
      cell.oncontextmenu = (e) => {
        e.preventDefault();
        if (!known) this.cyclePencil(i);
      };
      // where everyone else is looking, right now
      const here = this.players.filter((pl) => !pl.you && pl.focusCell === i && pl.idleSeconds <= 30);
      if (here.length) {
        const marks = el('span', 'player-marks');
        for (const pl of here) {
          const idx = this.players.findIndex((q) => q.userId === pl.userId);
          const m = el('i', '', pl.displayName.slice(0, 1).toUpperCase());
          m.style.background = playerColour(idx);
          m.title = `${pl.displayName} — ${this.ui.room.looking}`;
          marks.appendChild(m);
        }
        cell.appendChild(marks);
      }
      board.appendChild(cell);
    }
  }

  paintClues() {
    const p = this.session.puzzle;
    const ctx = renderContext(this.theme, this.prefs.locale, p);
    const list = $('#clues');
    list.innerHTML = '';
    const visible = this.prefs.mode === 'split' && !this.online
      ? this.session.cluesFor(this.activePlayer)
      : this.session.activeClues();

    // Reveal order, newest first. A gated clue was revealed by the move that solved its
    // gate, so the move log gives the ordering for free; the openers were there before
    // any move and settle at the bottom.
    const revealedAt = new Map<number, number>();
    this.session.moves.forEach((m, k) => revealedAt.set(m.cell, k));
    const rank = (c: PlacedClue) => (c.gate === null ? -1 : revealedAt.get(c.gate) ?? -1);
    const feed = [...visible].sort((a, b) => rank(b) - rank(a));
    const newest = feed.length && rank(feed[0]) >= 0 ? feed[0].id : null;

    list.appendChild(el('h3', 'clue-head', this.ui.clues));
    for (const pc of feed) {
      const isDone = this.doneClues.has(pc.id);
      if (isDone && this.settings.usedClues === 'hide' && !this.session.solved) continue;
      const row = el('div', 'clue' + (isDone && this.settings.usedClues === 'dim' ? ' done' : '')
        + (this.inspectClue === pc.id ? ' picked' : '')
        + (pc.id === newest && !this.session.solved ? ' fresh' : ''));
      row.appendChild(el('p', 'clue-text', renderClue(this.loc, this.theme, ctx, pc.clue, pc.order)));
      row.appendChild(el('span', 'clue-src', pc.gate === null
        ? this.ui.openingClues
        : `${this.ui.unlockedBy} ${ctx.labels[pc.gate].text}`));
      row.onmouseenter = () => { if (!this.inspecting) { this.highlight = maskOf(this.session.touches(pc.clue)); this.paintHighlight(); } };
      row.onmouseleave = () => { if (!this.inspecting) { this.highlight = 0; this.paintHighlight(); } };
      row.onclick = () => {
        if (this.inspecting) {
          this.inspectClue = pc.id; this.inspectCell = null;
          this.highlight = maskOf(this.session.touches(pc.clue));
          this.render();
          return;
        }
        if (isDone) this.doneClues.delete(pc.id); else this.doneClues.add(pc.id);
        this.paintClues();
      };
      list.appendChild(row);
    }
  }



  paintPlayers() {
    const wrap = $('#players');
    wrap.innerHTML = '';
    if (this.prefs.mode !== 'split') { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const count = el('div', 'player-count');
    [2, 3, 4].forEach((n) => {
      const b = el('button', 'chip' + (this.playerCount === n ? ' on' : ''), `${n}`);
      b.onclick = () => { this.prefs.players = n; savePrefs(this.prefs); void this.newBoard(); };
      count.appendChild(b);
    });
    wrap.appendChild(count);
    for (let i = 0; i < this.playerCount; i++) {
      const b = el('button', 'tab' + (this.activePlayer === i ? ' on' : ''), `${this.ui.playerN} ${i + 1}`);
      b.onclick = () => { this.activePlayer = i; this.render(); };
      wrap.appendChild(b);
    }
    wrap.appendChild(el('p', 'hint-note', this.ui.yourClues));
  }

  paintWeek() {
    const strip = $('#week');
    strip.innerHTML = '';
    if (this.prefs.mode !== 'weekly') { strip.style.display = 'none'; return; }
    strip.style.display = '';
    const week = weeklyEdition(THEME_IDS, new Date(), this.prefs.themeId);
    week.forEach((ref, i) => {
      const b = el('button', 'day' + (i === (this.edition.dayIndex ?? this.todayIndex) ? ' on' : ''));
      b.appendChild(el('span', 'day-name', this.ui.days[i].slice(0, 3)));
      b.appendChild(el('span', 'day-diff', '●'.repeat(Math.min(3, Math.ceil(ref.difficulty / 2.4)))));
      if (i > this.todayIndex) { b.classList.add('locked'); (b as HTMLButtonElement).disabled = true; }
      else b.onclick = () => void this.newBoard(i);
      strip.appendChild(b);
    });
  }

  paintStatus() {
    const s = this.session.snapshot();
    const ms = this.online ? (this.serverElapsed || Date.now() - this.startedWall) : s.elapsedMs;
    const showTime = this.settings.showTimer === 'always'
      || (this.settings.showTimer === 'onSolve' && this.session.solved);
    $('#time').textContent = showTime ? formatDuration(ms) : '—';
    $('#timeL').textContent = this.ui.timeLabel;
    const mistakes = this.online ? this.mistakes : s.mistakes;
    $('#mist').textContent = String(mistakes);
    // The cost of a mistake is real but it is settled at the end, not shouted at you
    // mid-board. The tooltip keeps the rule reachable without putting a running
    // penalty on screen while someone is thinking.
    $('#mistL').textContent = this.ui.mistakes;
    $('#mistL').title = this.ui.mistakeCost;
    $('#hints').textContent = String(this.online ? this.hintsUsed : s.hintsUsed);
    $('#hintsL').textContent = this.ui.hintsUsed;
    $('#prog').textContent = `${s.revealed}/${s.total}`;
    $('#diff').textContent = `${this.ui.difficulty} ${this.edition.difficulty}/7`;
  }

  async paintLeaderboard() {
    const browsing = this.prefs.mode === 'archive' && this.archiveOpen;
    const show = !browsing && (this.settings.showLeaderboard === 'always'
      || (this.settings.showLeaderboard === 'onSolve' && this.session.solved));
    ($('#lbpanel') as HTMLElement).style.display = show ? '' : 'none';
    ($('#wkpanel') as HTMLElement).style.display = show ? '' : 'none';
    if (!show) return;
    $('#lbhead').textContent = this.ui.leaderboard;
    $('#wkhead').textContent = this.ui.thisWeek;
    const box = $('#lbrows'), wbox = $('#wkrows');
    box.innerHTML = ''; wbox.innerHTML = '';
    try {
      const rows = this.online
        ? (await this.api.board(this.edition.id)).entries
        : await localBoard.top(this.edition.id, 8);
      const meId = this.online ? this.api.user?.id : LOCAL_ID;
      if (!rows.length) box.appendChild(el('p', 'empty', this.ui.noEntries));
      rows.slice(0, 8).forEach((r, i) => {
        const row = el('div', 'lbrow' + (r.playerId === meId ? ' me' : ''));
        row.appendChild(el('span', 'lbrank', String(i + 1)));
        row.appendChild(el('span', 'lbname', r.playerId === meId ? this.ui.you : r.displayName));
        row.appendChild(el('span', 'lbtime', formatDuration(r.timeMs)));
        row.appendChild(el('span', 'lbscore', String(r.score)));
        row.appendChild(el('span', 'lbperfect', r.perfect ? '★' : ''));
        box.appendChild(row);
      });
      const wid = this.edition.weekId ?? '';
      const wk = this.online ? (await this.api.week(wid)).standings : await localBoard.weekly(wid, 5);
      if (!wk.length) wbox.appendChild(el('p', 'empty', this.ui.noEntries));
      for (const w of wk.slice(0, 6)) {
        const row = el('div', 'lbrow wkrow' + (w.playerId === meId ? ' me' : ''));
        row.appendChild(el('span', 'lbname', w.playerId === meId ? this.ui.you : w.displayName));
        row.appendChild(el('span', 'lbtime', `${w.daysCompleted}/7`));
        row.appendChild(el('span', 'lbscore', String(w.totalScore)));
        wbox.appendChild(row);
      }
    } catch {
      box.appendChild(el('p', 'empty', this.ui.noEntries));
    }
  }

  /* ---------------- interaction ---------------- */

  async flip(i: number, state: State) {
    if (this.busy) return;
    // Deduce locally for instant feedback — the client can prove which cells are legal
    // from the clues it holds. The server still re-checks every move.
    const r = this.session.mark(i, state);
    if (r.outcome === 'not-deducible') { this.shake(i); this.showRefusal(i, state); return; }

    if (this.online && this.playId) {
      this.busy = true;
      try {
        const ack = await this.api.move({ playId: this.playId, cell: i, state });
        this.mistakes = ack.mistakes;
        this.hintsUsed = ack.hintsUsed;
        this.serverElapsed = ack.elapsedMs;
        if (ack.outcome === 'ok') this.session.addClues(ack.unlocked);
        if (ack.outcome !== r.outcome) { await this.newBoard(); return; }   // desync: refetch
        if (ack.result) { this.render(); this.showResult(ack.result); this.busy = false; return; }
      } catch (e) {
        const code = (e as ApiError).code;
        if (code === 'too-fast') { this.toast('Slow down a touch', 'warn'); }
        else { this.online = false; this.paintAccount(); this.toast('Lost the server — continuing locally', 'warn'); }
      } finally { this.busy = false; }
    }

    // 'wrong' means the board IS decided, the other way. The player gets the same
    // sentence as 'not-deducible' on purpose: saying "every arrangement has this one
    // available" would hand over the answer for free, which is worse than any penalty.
    // "You cannot show X is sold from what you know" is true in both cases.
    if (r.outcome === 'wrong') { this.shake(i); this.render(); this.showRefusal(i, state); return; }
    if (this.settings.autoClearPencil) this.pencils[i] = 0;
    if (this.session.solved && this.settings.undimAtEnd) this.doneClues.clear();
    this.render();
    if (r.solved && !this.online) void this.finishLocal();
  }

  async doHint() {
    if (this.settings.hintButton === 'disabled') return;
    if (this.settings.hintButton === 'confirm' && !this.hintArmed) {
      this.hintArmed = true;
      this.toast(this.ui.hint + '?', 'warn');
      setTimeout(() => { this.hintArmed = false; }, 4000);
      return;
    }
    this.hintArmed = false;
    if (this.online && this.playId) {
      try {
        const h = await this.api.hint(this.playId);
        this.hintsUsed = h.hintsUsed;
        this.applyHint(h.hint);
        return;
      } catch { /* fall through to local */ }
    }
    this.applyHint(this.session.hint());
  }

  private applyHint(h: { kind: string; clueId?: string; cell?: number }) {
    if (h.kind === 'none') { this.toast(this.ui.noHints, 'warn'); return; }
    if (h.kind === 'clue' && h.clueId) {
      const pc = this.session.puzzle.clues.find((c) => c.id === h.clueId);
      if (pc) this.highlight = maskOf(this.session.touches(pc.clue));
      this.toast(this.ui.hintClue, 'good');
    } else if (h.kind === 'cell' && h.cell !== undefined) {
      this.highlight = 1 << h.cell;
      this.hintedCells.add(h.cell);
      this.toast(this.ui.hintCell, 'good');
    }
    this.render();
  }

  async finishLocal() {
    const s = this.session.snapshot();
    const res = scoreRun({
      difficulty: this.edition.difficulty, elapsedMs: s.elapsedMs,
      hintsUsed: s.hintsUsed, mistakes: s.mistakes,
    });
    await localBoard.submit(entryFrom(this.localRef, LOCAL_ID, 'You', this.prefs.locale,
      s.elapsedMs, s.hintsUsed, s.mistakes, res));
    const st = streakStats(this.localPlayedDates(), isoDate(new Date()));
    this.showResult({
      editionId: this.edition.id, timeMs: s.elapsedMs, timeAddedMs: res.timeAddedMs, hintsUsed: s.hintsUsed,
      mistakes: s.mistakes, score: res.score, perfect: res.perfect,
      ranked: false, rank: null, streak: st.current, bestStreak: st.best,
    });
  }

  showResult(r: RunResult) {
    const s = this.session.snapshot();
    const p = this.session.puzzle;
    const marks = { w: p.w, h: p.h, missesByCell: s.missesByCell, hintedByCell: s.hintedByCell };
    const edition = this.edition.date ?? this.edition.id;

    const ov = $('#overlay');
    ov.innerHTML = '';
    const card = el('div', 'result');
    card.appendChild(el('h2', '', this.ui.solved));
    card.appendChild(el('p', 'big', `${this.ui.solvedIn} ${formatDuration(r.timeMs)}`));
    if (r.timeAddedMs > 0) {
      card.appendChild(el('p', 'penalty',
        `+${formatDuration(r.timeAddedMs)} ${this.ui.timePenalty} → ${this.ui.adjustedTime} ${formatDuration(r.timeMs + r.timeAddedMs)}`));
    }
    card.appendChild(el('p', 'score', `${this.ui.scoreLabel} ${r.score}`));

    // The grid IS the share. It goes on the card so what you post is what you saw.
    card.appendChild(el('pre', 'result-grid', resultGrid(marks)));

    if (typeof r.percentile === 'number') {
      card.appendChild(el('p', 'perfect', this.ui.percentileTop.replace('{n}', String(r.percentile))));
    }
    if (typeof r.perfectRate === 'number') {
      card.appendChild(el('p', 'streak', this.ui.perfectShare.replace('{n}', String(r.perfectRate))));
    }
    if (r.rank) card.appendChild(el('p', 'perfect', `${this.ui.rank} ${r.rank}`));
    if (r.perfect) card.appendChild(el('p', 'perfect', this.ui.perfect));
    if (!r.ranked) card.appendChild(el('p', 'streak', this.online ? 'Practice run — not ranked' : 'Local run — sign in for ranked play'));
    card.appendChild(el('p', 'streak',
      `${this.ui.streak} ${r.streak}${r.bestStreak && r.bestStreak > r.streak ? ` · best ${r.bestStreak}` : ''}`));

    const text = shareText({
      ...marks, title: this.strings.title, edition,
      elapsedMs: r.timeMs, addedMs: r.timeAddedMs,
      url: globalThis.location?.origin || undefined,
    });

    const row = el('div', 'result-share');
    const copy = el('button', '', this.ui.shareCopy);
    copy.onclick = () => {
      void navigator.clipboard?.writeText(text);
      copy.textContent = this.ui.copied;
    };
    row.appendChild(copy);
    // Native share is the one that works on a phone, where most of this gets posted.
    if (typeof navigator !== 'undefined' && navigator.share) {
      const send = el('button', '', this.ui.shareSend);
      send.onclick = () => { void navigator.share!({ text }).catch(() => { /* dismissed */ }); };
      row.appendChild(send);
    }
    const img = el('button', '', this.ui.shareImage);
    img.onclick = () => void this.shareImage(text);
    row.appendChild(img);
    card.appendChild(row);

    const again = el('button', 'primary', this.ui.newGame);
    again.onclick = () => { ov.classList.remove('on'); void this.newBoard(); };
    card.appendChild(again);
    ov.appendChild(card);
    ov.classList.add('on');
    void this.paintLeaderboard();
  }

  /** The image share. Instagram and the rest will not take text, and a screenshot of the
   *  card would carry the board with it — so the picture is drawn from the same string
   *  the text share uses, and carries no more information than that. */
  private async shareImage(text: string): Promise<void> {
    const lines = text.split('\n');
    const W = 900, pad = 64;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue('--surface-alt').trim() || '#ffffff';
    const ink = styles.getPropertyValue('--ink').trim() || '#111111';
    const soft = styles.getPropertyValue('--ink-soft').trim() || '#666666';

    const heights = lines.map((l) => (/[🟩🟨🟡🟠]/.test(l) ? 74 : l ? 52 : 26));
    canvas.width = W;
    canvas.height = pad * 2 + heights.reduce((a, b) => a + b, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    let y = pad;
    lines.forEach((line, i) => {
      y += heights[i];
      if (!line) return;
      const isGrid = /[🟩🟨🟡🟠]/.test(line);
      ctx.font = isGrid ? '58px system-ui, sans-serif'
        : i === 0 ? 'bold 40px system-ui, sans-serif' : '30px system-ui, sans-serif';
      ctx.fillStyle = i === 0 || isGrid ? ink : soft;
      ctx.fillText(line, W / 2, y - 12);
    });

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const name = `${this.theme.id}-${this.edition.date ?? 'board'}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    // Sharing the file directly beats a download on a phone, which is where it is wanted.
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => { /* dismissed */ });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  paintModes() {
    const modes: [Mode, string][] = [
      ['daily', this.ui.daily], ['archive', this.ui.archive.title], ['weekly', this.ui.weekly],
      ['free', this.ui.newGame], ['room', this.ui.room.title],
    ];
    const bar = $('#modes');
    bar.innerHTML = '';
    for (const [m, label] of modes.filter(([m]) => this.modeAllowed(m))) {
      const b = el('button', 'tab' + (this.prefs.mode === m ? ' on' : ''), label);
      b.onclick = () => {
        this.prefs.mode = m;
        if (m === 'archive') { this.archiveDate = null; this.archiveOpen = true; }
        savePrefs(this.prefs);
        void this.newBoard();
      };
      bar.appendChild(b);
    }
  }

  /* ---------------- archive ---------------- */

  /** Online the archive is authoritative and knows what you have played. Offline it is
   *  still browsable, because every past board is a pure function of its date. */
  async loadArchive() {
    if (this.online) {
      try {
        const res = await this.api.archive({ themeId: this.prefs.themeId, days: 63 });
        this.archiveDays = res.days;
        return;
      } catch { /* fall through to the local listing */ }
    }
    const today = new Date();
    const launch = new Date(Date.UTC(2026, 5, 1));
    const days: ArchiveDay[] = [];
    for (let i = 0; i < 63; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      if (d < launch) break;
      const ref = dailyEdition(THEME_IDS, d, this.prefs.themeId);
      const mine = await localBoard.best(ref.id, LOCAL_ID);
      days.push({
        date: ref.date!, editionId: ref.id, themeId: this.prefs.themeId,
        difficulty: ref.difficulty, weekday: (d.getUTCDay() || 7) - 1,
        played: !!mine, score: mine?.score ?? null, timeMs: mine?.timeMs ?? null,
        perfect: !!mine?.perfect, late: false,
      });
    }
    this.archiveDays = days;
  }

  paintArchive() {
    const host = $('#archive');
    const main = $('#playarea');
    const showing = this.prefs.mode === 'archive' && this.archiveOpen;
    host.style.display = showing ? '' : 'none';
    main.style.display = showing ? 'none' : '';
    ($('#cluepanel') as HTMLElement).style.display = showing ? 'none' : '';
    if (!showing) return;

    const A = this.ui.archive;
    host.innerHTML = '';
    host.appendChild(el('h2', 'arch-title', A.title));
    host.appendChild(el('p', 'arch-sub', A.subtitle));
    if (!this.archiveDays.length) { host.appendChild(el('p', 'empty', A.loading)); return; }

    const done = this.archiveDays.filter((d) => d.played).length;
    host.appendChild(el('p', 'arch-count', `${done} ${A.completed} ${A.of} ${this.archiveDays.length}`));

    const months = new Map<string, ArchiveDay[]>();
    for (const d of this.archiveDays) {
      const key = d.date.slice(0, 7);
      (months.get(key) ?? months.set(key, []).get(key)!).push(d);
    }
    const fmt = new Intl.DateTimeFormat(this.loc.bcp47, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const todayIso = this.archiveDays[0].date;

    for (const [key, list] of months) {
      host.appendChild(el('h3', 'arch-month', fmt.format(new Date(`${key}-15T12:00:00Z`))));
      const grid = el('div', 'arch-grid');
      // calendar order, Monday first
      const sorted = list.slice().sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 0; i < sorted[0].weekday; i++) grid.appendChild(el('span', 'arch-pad'));
      for (const d of sorted) {
        const cell = el('button', 'arch-day' + (d.played ? ' done' : '') + (d.date === todayIso ? ' today' : ''));
        cell.appendChild(el('span', 'arch-num', String(Number(d.date.slice(8)))));
        const pips = el('span', 'arch-pips');
        for (let k = 0; k < Math.min(3, Math.ceil(d.difficulty / 2.4)); k++) pips.appendChild(el('i'));
        cell.appendChild(pips);
        if (d.played) cell.appendChild(el('span', 'arch-score', d.perfect ? '\u2605' : String(d.score ?? '')));
        cell.title = `${d.date} · ${this.ui.difficulty} ${d.difficulty}/7` + (d.played ? ` · ${d.score}` : '');
        cell.onclick = () => { this.archiveDate = d.date; this.archiveOpen = false; void this.newBoard(); };
        grid.appendChild(cell);
      }
      host.appendChild(grid);
    }
  }

  /* ---------------- room presence ---------------- */

  async heartbeat() {
    if (!this.roomId) return;
    try {
      const r = await this.api.roomHeartbeat(this.roomId, this.focusCell);
      this.players = r.players;
      this.paintRoom();
      this.paintBoard();
    } catch { /* a dropped beat is not worth interrupting play for */ }
  }

  paintRoom() {
    const panel = $('#room');
    panel.innerHTML = '';
    if (this.prefs.mode !== 'room' || !this.roomId) { panel.style.display = 'none'; return; }
    panel.style.display = '';
    const R = this.ui.room;
    panel.appendChild(el('h2', 'panel-head', `${R.title} · ${this.roomCode}`));

    const invite = el('button', 'link', R.copyInvite);
    invite.onclick = () => {
      const base = (globalThis.location?.origin ?? '') + (globalThis.location?.pathname ?? '');
      void navigator.clipboard?.writeText(`${base}?room=${this.roomCode}`);
      this.toast(this.ui.actions.linkCopied, 'good');
    };
    panel.appendChild(invite);

    for (let i = 0; i < this.players.length; i++) {
      const pl = this.players[i];
      const row = el('div', 'player-row' + (pl.you ? ' me' : '') + (pl.idleSeconds > 30 ? ' stale' : ''));
      const dot = el('span', 'player-dot');
      dot.style.background = playerColour(i);
      row.appendChild(dot);
      const name = el('span', 'player-name', pl.displayName + (pl.you ? ` (${R.you})` : ''));
      row.appendChild(name);
      const bar = el('span', 'player-bar');
      const fill = el('i');
      fill.style.width = `${Math.round((pl.revealed / Math.max(1, pl.total)) * 100)}%`;
      fill.style.background = playerColour(i);
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el('span', 'player-count', pl.finished ? R.finished : `${pl.revealed}/${pl.total}`));
      panel.appendChild(row);
    }
    panel.appendChild(el('p', 'hint-note', R.codeHint));
  }

  /* ---------------- action grid ---------------- */

  paintActions() {
    const A = this.ui.actions;
    const wrap = $('#actions');
    wrap.innerHTML = '';
    const hasTags = this.pencils.some((v) => v !== 0);
    const mk = (label: string, icon: string, on: () => void, enabled = true) => {
      const b = el('button', 'action' + (enabled ? '' : ' off'));
      if (icon) b.appendChild(el('span', 'action-icon', icon));
      b.appendChild(el('span', '', label));
      if (enabled) b.onclick = on; else (b as HTMLButtonElement).disabled = true;
      wrap.appendChild(b);
      return b;
    };
    mk(A.clearTags, '', () => this.clearTags(), hasTags);
    const insp = mk(A.inspect, '\u{1F50D}', () => {
      this.inspecting = !this.inspecting;
      this.inspectClue = null; this.inspectCell = null; this.highlight = 0;
      this.render();
    });
    insp.classList.toggle('on', this.inspecting);
    mk(A.showHint, '\u{1F4A1}', () => void this.doHint(), this.settings.hintButton !== 'disabled');
    mk(A.settings, '', () => this.openSettings());
    mk(A.playTutorial, '', () => this.openTutorial(0));
    mk(A.shareScenario, '', () => void this.shareScenario());
    if (this.prefs.mode === 'archive' && this.archiveDate) {
      const back = el('button', 'action wide', this.ui.archive.back);
      back.onclick = () => { this.archiveDate = null; this.archiveOpen = true; void this.newBoard(); };
      wrap.appendChild(back);
    }
  }

  clearTags() {
    if (!this.pencils.some((v) => v !== 0)) { this.toast(this.ui.actions.noTags, 'warn'); return; }
    this.pencils = new Array(this.session.puzzle.n).fill(0);
    this.render();
  }

  /** Boards are pure functions of a seed, so a link is the whole scenario. Ranked boards
   *  share as a mode + theme instead — the server would refuse a supplied seed anyway. */
  async shareScenario() {
    const base = (globalThis.location?.origin ?? '') + (globalThis.location?.pathname ?? '');
    const q = new URLSearchParams();
    q.set('g', this.prefs.themeId);
    if (this.shareSeed) {
      q.set('s', this.shareSeed);
      q.set('d', String(this.edition.difficulty));
    } else {
      q.set('m', this.prefs.mode);
    }
    const url = `${base}?${q.toString()}`;
    try { await navigator.clipboard?.writeText(url); } catch { /* clipboard may be blocked */ }
    this.toast(this.ui.actions.linkCopied, 'good');
  }

  /* ---------------- tutorial ---------------- */

  openTutorial(step: number) {
    const T = this.ui.tutorial;
    this.tutorialStep = step;
    const ov = $('#overlay');
    ov.innerHTML = '';
    const card = el('div', 'result tutorial-card');
    card.appendChild(el('h2', '', T.title));
    card.appendChild(el('p', 'tut-count', `${step + 1} / ${T.steps.length}`));
    card.appendChild(el('p', 'tut-body', T.steps[step]));
    const dots = el('div', 'tut-dots');
    T.steps.forEach((_, i) => {
      const d = el('span', 'tut-dot' + (i === step ? ' on' : ''));
      d.onclick = () => this.openTutorial(i);
      dots.appendChild(d);
    });
    card.appendChild(dots);
    const last = step === T.steps.length - 1;
    const next = el('button', 'primary', last ? T.done : T.next);
    next.onclick = () => { if (last) { ov.classList.remove('on'); this.tutorialStep = -1; } else this.openTutorial(step + 1); };
    const skip = el('button', '', T.skip);
    skip.onclick = () => { ov.classList.remove('on'); this.tutorialStep = -1; };
    card.appendChild(next);
    if (!last) card.appendChild(skip);
    ov.appendChild(card);
    ov.classList.add('on');
  }

  paintNotice() {
    const box = $('#notice');
    const text = this.flags?.notice ?? '';
    box.textContent = text;
    box.style.display = text ? '' : 'none';
  }

  /* ---------------- admin ---------------- */

  /** Reached at #admin and nowhere else — there is no link to it, because the token is
   *  what grants access and a visible door only invites knocking. The secret lives in
   *  sessionStorage so it dies with the tab, never in localStorage and never in the URL. */
  async openAdmin() {
    const ov = $('#overlay');
    const secret = (() => {
      try { return globalThis.sessionStorage?.getItem('clues.admin') ?? ''; } catch { return ''; }
    })();

    const shell = (body: HTMLElement) => {
      ov.innerHTML = '';
      const card = el('div', 'sheet admin');
      card.appendChild(el('h3', '', 'Admin'));
      card.appendChild(body);
      const foot = el('div', 'sheet-close');
      const close = el('button', '', 'Close');
      close.onclick = () => { location.hash = ''; this.closeSheet(); };
      foot.appendChild(close);
      card.appendChild(foot);
      ov.appendChild(card);
      ov.classList.add('on');
    };

    const askForToken = (message?: string) => {
      const body = el('div', 'admin-body');
      if (message) body.appendChild(el('p', 'admin-warn', message));
      body.appendChild(el('p', 'sheet-note', 'Paste the admin token. It is kept for this tab only.'));
      const input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'off';
      input.className = 'admin-token';
      input.placeholder = 'admin token';
      body.appendChild(input);
      const go = el('button', 'admin-save', 'Unlock');
      const submit = () => {
        const v = input.value.trim();
        if (!v) return;
        try { globalThis.sessionStorage?.setItem('clues.admin', v); } catch { /* ignore */ }
        void this.openAdmin();
      };
      go.onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
      body.appendChild(go);
      shell(body);
      input.focus();
    };

    if (!secret) { askForToken(); return; }

    let data;
    try {
      data = await this.api.adminFlags(secret);
    } catch (e) {
      try { globalThis.sessionStorage?.removeItem('clues.admin'); } catch { /* ignore */ }
      const code = (e as ApiError).status;
      askForToken(code === 404
        ? 'This server has no admin surface — ADMIN_TOKEN is not set on it.'
        : 'That token was refused.');
      return;
    }

    const draft = { ...data.flags, themes: [...data.flags.themes] };
    const body = el('div', 'admin-body');

    body.appendChild(el('h4', 'admin-head', 'Puzzles'));
    for (const id of data.allThemes) {
      const theme = allThemes().find((t) => t.id === id);
      const name = theme ? theme.strings[this.prefs.locale].title : id;
      body.appendChild(toggleRow(name, draft.themes.includes(id), (on) => {
        draft.themes = on ? [...draft.themes, id] : draft.themes.filter((t) => t !== id);
      }));
    }

    body.appendChild(el('h4', 'admin-head', 'Modes'));
    const modeRows: [keyof typeof draft, string][] = [
      ['archive', 'Archive'], ['weekly', 'Weekly edition'], ['free', 'New board (free play)'],
      ['rooms', 'Rooms'], ['signups', 'New accounts'],
    ];
    for (const [key, label] of modeRows) {
      body.appendChild(toggleRow(label, draft[key] as boolean, (on) => { (draft as any)[key] = on; }));
    }

    body.appendChild(el('h4', 'admin-head', 'Notice to players'));
    const notice = document.createElement('textarea');
    notice.className = 'admin-notice';
    notice.rows = 2;
    notice.maxLength = 240;
    notice.value = draft.notice;
    notice.placeholder = 'Shown above the board, in every language. Leave empty for none.';
    body.appendChild(notice);

    const status = el('p', 'sheet-note', data.updatedAt
      ? `Last changed ${new Date(data.updatedAt).toLocaleString()}`
      : 'Never changed — these are the defaults.');
    body.appendChild(status);

    const save = el('button', 'admin-save', 'Save');
    save.onclick = async () => {
      draft.notice = notice.value;
      (save as HTMLButtonElement).disabled = true;
      try {
        const r = await this.api.adminSetFlags(secret, draft);
        this.flags = { themes: r.flags.themes, archive: r.flags.archive, weekly: r.flags.weekly,
          free: r.flags.free, rooms: r.flags.rooms, notice: r.flags.notice };
        status.textContent = 'Saved. Players see this within a few seconds.';
        this.buildChrome();
      } catch (e) {
        status.textContent = `Not saved: ${(e as ApiError).code ?? 'error'}`;
      } finally { (save as HTMLButtonElement).disabled = false; }
    };
    body.appendChild(save);
    shell(body);
  }

  /** Flavour lines go only to resolved cards that were holding no clue — about four in
   *  ten of them — and only to a third of those, so the board never turns chatty. The
   *  deal is seeded, so two people on the same board hear the same asides. */
  private flavourFor(i: number): string {
    const p = this.session.puzzle;
    const key = `${p.labelSeed}|${this.prefs.locale}|${this.theme.id}`;
    if (key !== this.flavourKey) {
      this.flavourKey = key;
      this.flavourDeal.clear();
      const lines = this.theme.strings[this.prefs.locale].flavour ?? [];
      if (lines.length) {
        const gated = new Set(p.clues.map((c) => c.gate).filter((g): g is number => g !== null));
        const empty: number[] = [];
        for (let n = 0; n < p.n; n++) if (!gated.has(n)) empty.push(n);
        const rng = makeRng(`${key}|flavour`);
        const chosen = rng.shuffle(empty).slice(0, Math.round(empty.length / 3));
        const pool = rng.shuffle([...lines]);
        chosen.forEach((cell, k) => this.flavourDeal.set(cell, pool[k % pool.length]));
      }
    }
    return this.flavourDeal.get(i) ?? '';
  }

  /* ---------------- the tile sheet ---------------- */

  /** One square, opened. A no-guess board should never make you tap and find out, so the
   *  sheet says up front whether this square is decidable yet, and when it is not it hands
   *  you the clues that mention it rather than a refusal. */
  openTile(i: number) {
    const p = this.session.puzzle;
    const ctx = renderContext(this.theme, this.prefs.locale, p);
    const tagKey = Object.keys(this.theme.tagSchema)[0];
    const knownB = (this.session.knownB >> i) & 1;
    const knownA = (this.session.knownA >> i) & 1;
    const known = !!(knownB || knownA);
    const d = this.session.deduction();

    const ov = $('#overlay');
    ov.innerHTML = '';
    const card = el('div', 'sheet');

    if (this.settings.tileArt) {
      const art = el('div', 'sheet-art');
      art.innerHTML = tileArt({
        theme: this.theme, index: i, labelSeed: p.labelSeed,
        tag: tagKey ? p.tags[i][tagKey] : undefined,
        state: known ? (knownB ? 1 : 0) : null,
      });
      card.appendChild(art);
    }
    card.appendChild(el('h3', '', ctx.labels[i].text));
    if (tagKey) card.appendChild(el('p', 'sheet-tag', tagLabel(this.theme, this.prefs.locale, tagKey, p.tags[i][tagKey])));

    const A_ = this.strings.states.a, B_ = this.strings.states.b;

    if (known) {
      card.appendChild(el('p', 'sheet-note', knownB ? B_.name : A_.name));
    }

    if (!known) {
      const row = el('div', 'sheet-choices');
      row.appendChild(el('span', 'sheet-prompt', this.ui.markAs));
      for (const [cls, st, state] of [['pick-a', A_, 0], ['pick-b', B_, 1]] as const) {
        // Both are always offered. Being told "no" and why is how you learn what you
        // missed; a greyed-out button teaches nothing and answers the question for you.
        const btn = el('button', cls, st.name) as HTMLButtonElement;
        btn.onclick = () => { this.closeSheet(); void this.flip(i, state as State); };
        row.appendChild(btn);
      }
      card.appendChild(row);

    }

    const foot = el('div', 'sheet-close');
    const close = el('button', '', this.ui.inspect.close);
    close.onclick = () => this.closeSheet();
    foot.appendChild(close);
    card.appendChild(foot);

    ov.appendChild(card);
    ov.classList.add('on');
    ov.onclick = (e) => { if (e.target === ov) this.closeSheet(); };
    this.sheetCell = i;
  }

  /** A refusal is the most useful thing this game says. It names the person, names what
   *  you tried to prove, and says exactly why it does not follow — and it offers the
   *  board to somebody else at the one moment a player actually wants help. */
  showRefusal(i: number, tried: State) {
    const ctx = renderContext(this.theme, this.prefs.locale, this.session.puzzle);
    const label = ctx.labels[i];
    const triedS = tried === 1 ? this.strings.states.b : this.strings.states.a;
    const otherS = tried === 1 ? this.strings.states.a : this.strings.states.b;
    const fill = (t: string, pred: string) =>
      t.replace(/\{name\}/g, label.text).replace('{pred}', pred).replace('{other}', pred);

    const ov = $('#overlay');
    ov.innerHTML = '';
    const card = el('div', 'sheet refusal');
    card.appendChild(el('h3', '', this.ui.refuseTitle));
    card.appendChild(el('p', 'refuse-body', fill(this.ui.refuseBody, agree(triedS.pred, label.g, false))));
    card.appendChild(el('p', 'refuse-why', fill(this.ui.refuseWhy, agree(otherS.pred, label.g, false))));
    const row = el('div', 'refuse-actions');
    const share = el('button', '', this.ui.refuseShare);
    share.onclick = () => { this.closeSheet(); void this.shareScenario(); };
    const go = el('button', 'primary', this.ui.refuseGo);
    go.onclick = () => this.closeSheet();
    row.appendChild(share); row.appendChild(go);
    card.appendChild(row);
    ov.appendChild(card);
    ov.classList.add('on');
    ov.onclick = (e) => { if (e.target === ov) this.closeSheet(); };
    this.sheetCell = null;
  }

  cyclePencil(i: number) {
    this.pencils[i] = ((this.pencils[i] + 1) % PENCIL_STATES) as Pencil;
    this.paintBoard();
  }

  closeSheet() {
    this.sheetCell = null;
    const ov = $('#overlay');
    ov.classList.remove('on');
    ov.innerHTML = '';
    ov.onclick = null;
  }

  /* ---------------- inspect ---------------- */

  /** Inspect answers the two questions a no-guess puzzle owes the player: what exactly
   *  does this clue cover, and what exactly do its words mean here. Both matter because
   *  "all", "both", "most", "between" and "connected" are technical terms on this board. */
  paintInspect() {
    const panel = $('#inspect');
    panel.innerHTML = '';
    if (!this.inspecting) { panel.style.display = 'none'; return; }
    panel.style.display = '';
    const I = this.ui.inspect;
    const ctx = renderContext(this.theme, this.prefs.locale, this.session.puzzle);
    panel.appendChild(el('h2', 'panel-head', I.title));

    if (this.inspectClue) {
      const pc = this.session.puzzle.clues.find((c) => c.id === this.inspectClue);
      if (pc) {
        panel.appendChild(el('p', 'insp-clue', renderClue(this.loc, this.theme, ctx, pc.clue, pc.order)));
        panel.appendChild(el('h3', 'insp-head', I.meaning));
        panel.appendChild(el('p', 'insp-body', this.loc.explain(pc.clue, ctx)));
        // naming all twenty squares for a whole-board clue is noise, not information
        const cells = this.session.touches(pc.clue);
        panel.appendChild(el('h3', 'insp-head', I.covers));
        const names = cells.map((c) => ctx.labels[c].text);
        const list = cells.length === this.session.puzzle.n
          ? `${this.ui.inspect.whole} (${cells.length})`
          : names.length > 10
            ? `${cells.length} — ${names.slice(0, 10).join(', ')}…`
            : `${cells.length} — ${names.join(', ')}`;
        panel.appendChild(el('p', 'insp-body', list));
        panel.appendChild(el('h3', 'insp-head', I.terms));
        for (const id of termsForClue(pc.clue) as TermId[]) {
          const t = this.loc.glossary[id];
          if (!t) continue;
          const row = el('div', 'term');
          row.appendChild(el('b', '', t.term));
          row.appendChild(el('span', '', t.def));
          panel.appendChild(row);
        }
      }
    } else if (this.inspectCell !== null) {
      const cell = this.inspectCell;
      panel.appendChild(el('p', 'insp-clue', ctx.labels[cell].text));
      // When the tile is a real work rather than a drawing, inspecting it should say
      // whose it is and what it is made of, the way a wall label does.
      const imgs = this.theme.images;
      if (imgs?.credit) {
        const n = dealFor(this.session.puzzle.labelSeed, imgs.count)[cell % imgs.count];
        panel.appendChild(el('p', 'insp-credit', imgs.credit(n)));
      }
      panel.appendChild(el('h3', 'insp-head', I.mentions));
      const hits = this.session.activeClues().filter((pc) => this.session.touches(pc.clue).includes(cell));
      if (!hits.length) panel.appendChild(el('p', 'insp-body', I.nothing));
      for (const pc of hits) {
        const row = el('div', 'clue');
        row.appendChild(el('p', 'clue-text', renderClue(this.loc, this.theme, ctx, pc.clue, pc.order)));
        row.onclick = () => {
          this.inspectClue = pc.id; this.inspectCell = null;
          this.highlight = maskOf(this.session.touches(pc.clue));
          this.render();
        };
        panel.appendChild(row);
      }
      this.highlight = 1 << cell;
    } else {
      panel.appendChild(el('p', 'insp-body', I.help));
    }

    const close = el('button', '', I.close);
    close.onclick = () => {
      this.inspecting = false; this.inspectClue = null; this.inspectCell = null;
      this.highlight = 0; this.render();
    };
    panel.appendChild(close);
  }

  /* ---------------- settings ---------------- */

  openSettings() {
    const S = this.ui.settings;
    const ov = $('#overlay');
    ov.innerHTML = '';
    const card = el('div', 'result settings-card');
    card.appendChild(el('h2', '', S.title));
    const rows = el('div', 'setting-rows');

    const select = <K extends keyof Settings>(key: K, label: string, opts: [Settings[K], string][]) => {
      const row = el('div', 'setting-row');
      row.appendChild(el('span', 'setting-label', label));
      const sel = document.createElement('select');
      for (const [v, l] of opts) {
        const o = document.createElement('option');
        o.value = String(v); o.textContent = l;
        sel.appendChild(o);
      }
      sel.value = String(this.settings[key]);
      sel.onchange = () => {
        (this.settings[key] as unknown) = sel.value as unknown as Settings[K];
        this.commitSettings();
      };
      row.appendChild(sel);
      rows.appendChild(row);
    };

    const check = (key: keyof Settings, label: string) => {
      const row = el('div', 'setting-row');
      row.appendChild(el('span', 'setting-label', label));
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!this.settings[key];
      box.onchange = () => { (this.settings[key] as unknown) = box.checked; this.commitSettings(); };
      row.appendChild(box);
      rows.appendChild(row);
    };

    // game + language first: they change everything below them
    const gameRow = el('div', 'setting-row');
    gameRow.appendChild(el('span', 'setting-label', S.game));
    const gameSel = document.createElement('select');
    for (const t of allThemes()) {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = t.strings[this.prefs.locale].title;
      gameSel.appendChild(o);
    }
    gameSel.value = this.prefs.themeId;
    gameSel.onchange = () => { this.prefs.themeId = gameSel.value; savePrefs(this.prefs); ov.classList.remove('on'); void this.newBoard(); };
    gameRow.appendChild(gameSel);
    rows.appendChild(gameRow);

    const langRow = el('div', 'setting-row');
    langRow.appendChild(el('span', 'setting-label', S.language));
    const langSel = document.createElement('select');
    for (const code of ALL_LOCALES) {
      const o = document.createElement('option');
      o.value = code; o.textContent = { en: 'English', pt: 'Português', es: 'Español' }[code];
      langSel.appendChild(o);
    }
    langSel.value = this.prefs.locale;
    langSel.onchange = () => {
      this.prefs.locale = langSel.value as LocaleCode;
      savePrefs(this.prefs);
      this.buildChrome(); this.render(); this.openSettings();
    };
    langRow.appendChild(langSel);
    rows.appendChild(langRow);

    select('font', S.font, [['theme', S.fontTheme], ['sans', S.fontSans], ['serif', S.fontSerif], ['mono', S.fontMono], ['readable', S.fontReadable]]);
    select('tagSide', S.tagSide, [['right', S.right], ['left', S.left]]);
    check('autoClearPencil', S.autoClearPencil);
    select('usedClues', S.usedClues, [['normal', S.normal], ['dim', S.dim], ['hide', S.hide]]);
    select('hintButton', S.hintButton, [['enabled', S.enabled], ['confirm', S.confirm], ['disabled', S.disabled]]);
    select('appearance', S.appearance, [['theme', S.followTheme], ['dark', S.dark], ['light', S.light]]);
    select('colorMode', S.colorMode, [['normal', S.normal], ['contrast', S.highContrast], ['colorblind', S.colorblind]]);
    select('showFlavour', S.showFlavour, [['normal', S.normal], ['dimmed', S.dimmed], ['hidden', S.hidden]]);
    select('showSolvable', S.showSolvable, [['onHint', S.onHint], ['always', S.always], ['never', S.never]]);
    select('showTimer', S.showTimer, [['onSolve', S.onSolve], ['always', S.always], ['never', S.never]]);
    select('showLeaderboard', S.showLeaderboard, [['always', S.always], ['onSolve', S.onSolve], ['never', S.never]]);
    check('tileArt', S.tileArt);
    check('reduceMotion', S.reduceMotion);
    check('undimAtEnd', S.undimAtEnd);

    card.appendChild(rows);

    const legal = el('p', 'streak legal-links');
    for (const [label, href] of [
      ['Your account', 'account.html'], ['Privacy', 'legal.html#privacy'],
      ['Terms', 'legal.html#terms'], ['How it was built', 'how.html'], ['Architecture', 'tech.html'],
    ] as const) {
      const a = document.createElement('a');
      a.href = href; a.textContent = label;
      legal.appendChild(a);
    }
    card.appendChild(legal);

    const done = el('button', 'primary', S.done);
    done.onclick = () => ov.classList.remove('on');
    const reset = el('button', '', S.reset);
    reset.onclick = () => { this.settings = { ...DEFAULT_SETTINGS }; this.commitSettings(); this.openSettings(); };
    card.appendChild(done);
    card.appendChild(reset);
    ov.appendChild(card);
    ov.classList.add('on');
  }

  private commitSettings() {
    saveSettings(this.settings);
    this.applySkin();
    this.render();
  }

  toast(msg: string, kind: string) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = `toast on ${kind}`;
    setTimeout(() => { t.className = 'toast'; }, 2200);
  }

  shake(i: number) {
    const cell = $('#board').children[i] as HTMLElement;
    cell?.classList.add('shake');
    setTimeout(() => cell?.classList.remove('shake'), 400);
  }
}

/** Stable, high-contrast player colours — distinguishable from the state colours and
 *  from each other under the colour-blind palette too. */
const PLAYER_COLOURS = ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#56b4e9'];
function playerColour(i: number): string { return PLAYER_COLOURS[i % PLAYER_COLOURS.length]; }

function maskOf(cells: number[]): number {
  let m = 0;
  for (const c of cells) m |= 1 << c;
  return m;
}

void new App().start();
