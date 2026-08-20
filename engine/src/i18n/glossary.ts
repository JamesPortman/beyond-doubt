import { Clue } from '../core/clue.js';
import { TermId } from './index.js';

/** Which definitions a given clue actually needs. Inspect shows these and nothing else,
 *  so the player gets the three terms in front of them rather than a wall of rules. */
export function termsForClue(c: Clue): TermId[] {
  const out: TermId[] = [];
  const add = (t: TermId) => { if (!out.includes(t)) out.push(t); };
  add('truth');
  switch (c.k) {
    case 'count': {
      switch (c.sel.k) {
        case 'neighbors': add('neighbours'); break;
        case 'ortho': add('ortho'); break;
        case 'row': add('row'); break;
        case 'col': add('col'); break;
        case 'corners': add('corners'); break;
        case 'edges': add('edges'); break;
        case 'interior': add('interior'); break;
        case 'between': add('between'); break;
        case 'tag': add('group'); break;
        default: break;
      }
      switch (c.cmp) {
        case 'eq': add('exactly'); break;
        case 'atLeast': add('atLeast'); break;
        case 'atMost': add('atMost'); break;
        case 'none': add('none'); break;
        case 'all': add('every'); break;
      }
      break;
    }
    case 'compare': add('most'); break;
    case 'implies': add('ifThen'); break;
    case 'exactlyOneOf': add('exactlyOne'); break;
    case 'sameState': add('sameSide'); break;
    case 'differentState': add('oppositeSides'); break;
    case 'nearest': add('steps'); break;
    case 'connected': add('connected'); break;
    case 'uniqueMost': add('most'); add('group'); break;
  }
  return out;
}

/** How many squares a selector covers, for Inspect's plain-language explanation.
 *  Returns null when the size depends on data Inspect does not carry (tag groups). */
export function selectorSize(sel: Clue extends never ? never : import('../core/clue.js').Selector, w: number, h: number): number | null {
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  switch (sel.k) {
    case 'all': return w * h;
    case 'cell': return 1;
    case 'row': return w;
    case 'col': return h;
    case 'corners': return 4;
    case 'edges': return w * h - Math.max(0, (w - 2) * (h - 2));
    case 'interior': return Math.max(0, (w - 2) * (h - 2));
    case 'neighbors':
    case 'ortho': {
      const x = sel.i % w, y = Math.floor(sel.i / w);
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (sel.k === 'ortho' && dx !== 0 && dy !== 0) continue;
        if (inb(x + dx, y + dy)) n++;
      }
      return n;
    }
    case 'between': {
      const [xi, yi] = [sel.i % w, Math.floor(sel.i / w)];
      const [xj, yj] = [sel.j % w, Math.floor(sel.j / w)];
      const adx = Math.abs(xj - xi), ady = Math.abs(yj - yi);
      if (adx === 0) return Math.max(0, ady - 1);
      if (ady === 0) return Math.max(0, adx - 1);
      if (adx === ady) return Math.max(0, adx - 1);
      return 0;
    }
    case 'tag': return null;
  }
}
