import { Clue, Selector } from '../core/clue.js';
import { Locale, Phrase, RenderContext, agree, cap, Gender, Term, TermId } from './index.js';
import { selectorSize } from './glossary.js';

const COLS = ['A', 'B', 'C', 'D', 'E', 'F'];
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = (n: number) => (n <= 10 ? WORDS[n] : String(n));

function phrase(sel: Selector, ctx: RenderContext): Phrase {
  const t = ctx.theme;
  const L = (i: number) => ctx.labels[i].text;
  const P = (bare: string, lead: string, g: Gender = t.tile.g, pron = false): Phrase =>
    ({ bare, lead, g, pronominal: pron });
  switch (sel.k) {
    case 'all': return P('the whole board', 'In total');
    case 'row': return P(`row ${sel.r + 1}`, `In row ${sel.r + 1}`);
    case 'col': return P(`column ${COLS[sel.c]}`, `In column ${COLS[sel.c]}`);
    case 'corners': return P('the four corners', 'Among the four corners', t.tile.g, true);
    case 'edges': return P('the outer edge', 'Along the outer edge');
    case 'interior': return P('the interior', 'Away from the outer edge');
    case 'neighbors': return P(`${L(sel.i)}'s neighbours`, `Among ${L(sel.i)}'s neighbours`, t.tile.g, true);
    case 'ortho': return P(`the squares directly beside ${L(sel.i)}`, `Directly beside ${L(sel.i)}`);
    case 'between': return P(`the squares strictly between ${L(sel.i)} and ${L(sel.j)}`, `Strictly between ${L(sel.i)} and ${L(sel.j)}`);
    case 'cell': return P(L(sel.i), `For ${L(sel.i)} alone`);
    case 'tag': {
      const v = ctx.theme.tags[sel.key]?.values[sel.value];
      const p = v ? v.p : sel.value;
      return P(`the ${p}`, `Among the ${p}`, v?.g ?? 'm', true);
    }
  }
}

function clue(c: Clue, ctx: RenderContext): string {
  const t = ctx.theme;
  const st = (s: 0 | 1) => (s === 1 ? t.states.b : t.states.a);
  const L = (i: number) => ctx.labels[i].text;

  switch (c.k) {
    case 'count': {
      const ph = phrase(c.sel, ctx);
      const S = st(c.state);
      const one = c.n === 1;
      const subj = ph.pronominal ? '' : ` ${one ? t.tile.s : t.tile.p}`;
      const verb = (pl: boolean) => agree(S.pred, ph.g, pl);
      switch (c.cmp) {
        case 'eq': return `${ph.lead}, exactly ${num(c.n)}${subj} ${verb(!one)}.`;
        case 'atLeast': return `${ph.lead}, at least ${num(c.n)}${subj} ${verb(!one)}.`;
        case 'atMost': return `${ph.lead}, at most ${num(c.n)}${subj} ${verb(!one)}.`;
        case 'none': return ph.pronominal
          ? `${ph.lead}, none ${agree(S.pred, ph.g, true)}.`
          : `${ph.lead}, no ${t.tile.s} ${agree(S.pred, ph.g, false)}.`;
        case 'all': return ph.pronominal
          ? `${ph.lead}, all of them ${agree(S.pred, ph.g, true)}.`
          : `${ph.lead}, every ${t.tile.s} ${agree(S.pred, ph.g, false)}.`;
      }
      break;
    }
    case 'compare': {
      const a = phrase(c.a, ctx), b = phrase(c.b, ctx);
      return `${cap(a.bare)} holds more ${st(c.state).collective.p} than ${b.bare}.`;
    }
    case 'implies':
      return `If ${L(c.i)} ${agree(st(c.si).pred, ctx.labels[c.i].g, false)}, then ${L(c.j)} ${agree(st(c.sj).pred, ctx.labels[c.j].g, false)}.`;
    case 'exactlyOneOf':
      return `Exactly one of ${L(c.i)} and ${L(c.j)} ${agree(st(c.state).pred, 'm', false)}.`;
    case 'sameState':
      return `${L(c.i)} and ${L(c.j)} are on the same side.`;
    case 'differentState':
      return `${L(c.i)} and ${L(c.j)} are on opposite sides.`;
    case 'nearest': {
      const S = st(c.state);
      return `The nearest ${agree(S.adj, t.tile.g, false)} ${t.tile.s} to ${L(c.i)} is exactly ${num(c.d)} ${c.d === 1 ? 'step' : 'steps'} away, counting diagonals.`;
    }
    case 'connected':
      return `All ${st(c.state).collective.p} form a single connected group — up, down, left, right, never diagonally.`;
    case 'uniqueMost': {
      const g = t.tags[c.key];
      const v = g?.values[c.value];
      return `${cap(v ? v.p : c.value)} include strictly more ${st(c.state).collective.p} than any other ${g ? g.label.s : c.key}.`;
    }
  }
  return '';
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function explain(c: Clue, ctx: RenderContext): string {
  const t = ctx.theme;
  const st = (x: 0 | 1) => (x === 1 ? t.states.b : t.states.a);
  const L = (i: number) => ctx.labels[i].text;
  switch (c.k) {
    case 'count': {
      const ph = phrase(c.sel, ctx);
      const size = selectorSize(c.sel, ctx.w, ctx.h);
      const head = size === null ? `${ph.lead}:` : `${ph.lead} there are ${size} ${t.tile.p}.`;
      const verbP = agree(st(c.state).pred, ph.g, true);
      const verbS = agree(st(c.state).pred, ph.g, false);
      switch (c.cmp) {
        case 'eq': return `${head} The number of them that ${verbP} is exactly ${c.n} — no more and no fewer.`;
        case 'atLeast': return `${head} At least ${c.n} of them ${verbP}. There may be more.`;
        case 'atMost': return `${head} At most ${c.n} of them ${verbP}. There may be fewer, including none at all.`;
        case 'none': return `${head} Not one of them ${verbS}.`;
        case 'all': return `${head} Every single one of them ${verbP}, without exception.`;
      }
      break;
    }
    case 'compare': {
      const a = phrase(c.a, ctx), b = phrase(c.b, ctx);
      return `${cap(a.bare)} holds strictly more ${st(c.state).collective.p} than ${b.bare}. An equal count would make this false.`;
    }
    case 'implies':
      return `If ${L(c.i)} ${agree(st(c.si).pred, ctx.labels[c.i].g, false)}, then ${L(c.j)} must too. But if ${L(c.i)} does not, this clue tells you nothing at all about ${L(c.j)}.`;
    case 'exactlyOneOf':
      return `One of ${L(c.i)} and ${L(c.j)} ${agree(st(c.state).pred, 'm', false)} and the other does not. Never both, never neither.`;
    case 'sameState':
      return `${L(c.i)} and ${L(c.j)} match: either both ${agree(st(0).pred, 'm', true)}, or both ${agree(st(1).pred, 'm', true)}.`;
    case 'differentState':
      return `${L(c.i)} and ${L(c.j)} do not match: one of each, though this does not say which way round.`;
    case 'nearest':
      return `Every square within ${c.d - 1 === 0 ? 'one step' : `${c.d - 1} steps`} of ${L(c.i)} is free of ${st(c.state).collective.p}, and at exactly ${c.d} ${c.d === 1 ? 'step' : 'steps'} there is at least one. Diagonals count as one step.`;
    case 'connected':
      return `You can walk from any ${st(c.state).collective.s} to any other, moving only up, down, left or right and never leaving the group. Touching at a corner does not count.`;
    case 'uniqueMost': {
      const g = t.tags[c.key];
      const v = g?.values[c.value];
      return `${cap(v ? v.p : c.value)} hold more ${st(c.state).collective.p} than any other ${g ? g.label.s : c.key} — strictly more, so a tie would make this false.`;
    }
  }
  return '';
}

const glossary: Record<TermId, Term> = {
  truth: { term: 'Everyone tells the truth', def: 'Every clue on the board is true, including clues released by a tile that turns out to be in the marked state. There are no liars here.' },
  neighbours: { term: 'Neighbours', def: 'The squares touching a tile on any side, diagonals included — up to 8, fewer at an edge or corner. The tile itself is not one of its own neighbours.' },
  ortho: { term: 'Directly beside', def: 'Up, down, left and right only — up to 4 squares. Diagonals do not count.' },
  row: { term: 'Row', def: 'A horizontal line of squares, numbered from the top.' },
  col: { term: 'Column', def: 'A vertical line of squares, lettered from the left.' },
  corners: { term: 'Corners', def: 'The four corner squares of the board, and only those.' },
  edges: { term: 'Outer edge', def: 'Every square on the outside ring of the board, corners included.' },
  interior: { term: 'Away from the edge', def: 'Every square that is not on the outer ring.' },
  between: { term: 'Strictly between', def: 'The squares on the straight line joining two tiles — horizontal, vertical or diagonal — not counting the two tiles at either end.' },
  connected: { term: 'Connected', def: 'An unbroken chain moving up, down, left or right. Two squares touching only at a corner are not connected.' },
  exactly: { term: 'Exactly', def: 'That number and no other. Not one more, not one fewer.' },
  atLeast: { term: 'At least', def: 'That many or more. It does not rule out there being more.' },
  atMost: { term: 'At most', def: 'That many or fewer, possibly none at all.' },
  none: { term: 'None', def: 'Zero of them. The clue rules out every single one.' },
  every: { term: 'Every', def: 'All of them without exception.' },
  most: { term: 'More than any other', def: 'Strictly the most. If two groups tie for the lead, the clue is false.' },
  ifThen: { term: 'If … then', def: 'A one-way promise. When the first part is true the second must be too; when the first part is false, the clue says nothing at all.' },
  exactlyOne: { term: 'Exactly one of', def: 'One of the two, and only one. Not both, and not neither.' },
  sameSide: { term: 'The same side', def: 'The two tiles share a state, but the clue does not say which one.' },
  oppositeSides: { term: 'Opposite sides', def: 'One of each, but the clue does not say which way round.' },
  steps: { term: 'Steps', def: 'Distance counted in moves between squares, where a diagonal move counts as one step, the same as a straight one.' },
  group: { term: 'Group', def: 'Every tile sharing the attribute printed on its face, wherever it sits on the board.' },
};

export const en: Locale = {
  code: 'en', bcp47: 'en-CA', dir: 'ltr',
  num: (n) => num(n),
  colName: (c) => COLS[c],
  clue,
  explain,
  glossary,
  ui: {
    play: 'Play', solo: 'Solo', daily: 'Daily', weekly: 'Weekly edition', leaderboard: 'Leaderboard',
    hint: 'Hint', hintClue: 'A clue you have not used yet', hintCell: 'This one is decidable now',
    noHints: 'No hints left',
    solved: 'Solved', timeLabel: 'Time', scoreLabel: 'Score', streak: 'Streak',
    illegalMove: 'That is not deducible yet',
    notDeducible: 'Nothing forces that yet — the board never asks you to guess',
    share: 'Share', copied: 'Copied',
    markAs: 'Mark as', clues: 'Clues', openingClues: 'Known from the start', unlockedBy: 'Unlocked by',
    difficulty: 'Difficulty',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    edition: 'Edition', rank: 'Rank', player: 'Player', you: 'You', hintsUsed: 'Hints', mistakes: 'Mistakes',
    noEntries: 'No entries yet', thisWeek: 'This week', allTime: 'All time',
    theme: 'Theme', language: 'Language', newGame: 'New board', restart: 'Restart',
    splitClues: 'Split clues', yourClues: 'Your clues', playerN: 'Player',
    perfect: 'Perfect — no hints, no mistakes', solvedIn: 'Solved in', weeklyTotal: 'Weekly total',
    complete: 'Complete',
    timePenalty: 'added for mistakes', adjustedTime: 'Adjusted time',
    mistakeCost: '+1:00 each',
    actions: {
      clearTags: 'Clear tags', inspect: 'Inspect', showHint: 'Show hint', settings: 'Settings',
      playTutorial: 'Play tutorial', shareScenario: 'Share scenario',
      noTags: 'No pencil marks to clear', linkCopied: 'Link copied — anyone who opens it gets this exact board',
      shareBody: 'Play this board',
    },
    tutorial: {
      title: 'How this works', next: 'Next', skip: 'Skip', done: 'Start playing',
      steps: [
        'Every tile is hiding one of two states. Your job is to work out which — never to guess.',
        'Start from the clues on the right. Every clue is true, including clues that come from a tile in the marked state. Nobody lies here.',
        'A tile with a dot in its corner is already decided by the clues you hold. Pick the right label above the board and click one. Picking the wrong label is the only mistake this game lets you make, and it adds a minute to your time.',
        'Solving a tile releases whatever that tile knew, so the clue list grows as you go. That is the whole loop.',
        'Try clicking a tile with no dot. The board refuses, because nothing forces it yet. That refusal is the promise: you are never asked to guess.',
        'Right-click a tile to leave a pencil mark, and use Inspect when a clue is doing something exact with its wording. That is everything — go and finish it.',
      ],
    },
    room: {
      title: 'Room', create: 'Start a room', join: 'Join', code: 'Room code',
      codeHint: 'Everyone in the room races the same board, each on their own copy.',
      players: 'Players', you: 'you', finished: 'finished', idle: 'idle',
      copyInvite: 'Copy invite', looking: 'looking at', leave: 'Leave room',
    },
    archive: {
      title: 'Archive', subtitle: 'Every board that has run, back to launch day.',
      played: 'done', open: 'Open the archive', back: 'Back to the archive',
      completed: 'played', of: 'of', today: 'today', locked: 'not yet',
      loading: 'Loading the back catalogue…',
    },
    settings: {
      title: 'Settings', done: 'Done', reset: 'Reset to defaults',
      game: 'Game', language: 'Language',
      font: 'Font', fontTheme: 'Theme default', fontSans: 'Sans', fontSerif: 'Serif',
      fontMono: 'Monospace', fontReadable: 'High legibility',
      tagSide: 'Result tag side', left: 'Left', right: 'Right',
      autoClearPencil: 'Auto-clear pencil marks',
      usedClues: 'Show used clues as', normal: 'Normal', dim: 'Dimmed', hide: 'Hidden',
      hintButton: 'Hint button', enabled: 'Enabled', confirm: 'Ask first', disabled: 'Disabled',
      appearance: 'Appearance', followTheme: 'Follow theme', dark: 'Dark', light: 'Light',
      colorMode: 'Colour mode', highContrast: 'High contrast', colorblind: 'Colour-blind safe',
      showTimer: 'Show timer', showLeaderboard: 'Show leaderboard',
      always: 'Always', onSolve: 'When solved', never: 'Never',
      tileArt: 'Tile artwork', reduceMotion: 'Reduce motion',
      undimAtEnd: 'Undim clues at the end', on: 'On', off: 'Off',
    },
    inspect: {
      title: 'Inspect', help: 'Pick a clue to see exactly what it covers and what its words mean.',
      meaning: 'What it means', terms: 'Terms used', covers: 'Squares it talks about',
      mentions: 'Clues mentioning this tile', nothing: 'Nothing selected yet',
      whole: 'The whole board',
      close: 'Close',
    },
  },
};
