import { makeRng, Rng } from '../core/rng.js';
import { Theme, ArtKind } from '../themes/index.js';
import { State } from '../core/clue.js';

/** Tile artwork, drawn rather than fetched. Every tile gets a distinct picture derived
 *  deterministically from the board's label seed, so two players on the same board see the
 *  same faces, it works offline, it scales to any size, and it recolours with the theme
 *  instead of needing a new asset set per skin. Swap `tileArt` for an <img> lookup if you
 *  ever commission real illustration — nothing else changes. */

export interface ArtOptions {
  theme: Theme;
  index: number;
  labelSeed: string;
  tag?: string;
  /** null while unresolved */
  state?: State | null;
}

const SKIN = ['#f0d5b8', '#e0b892', '#d9a778', '#c08a5e', '#a06a45', '#7d4f33', '#5d3a26'];
const HAIR = ['#22190f', '#3b2a18', '#5a3d21', '#7d5a2e', '#a8894f', '#c9b48c', '#4a4a52', '#6d2f22', '#8c8c94'];
const CLOTH = ['#3d4f63', '#5c4a6b', '#6b4a3d', '#3f5f4a', '#7a3f47', '#4a4a55', '#6b6250'];

export function tileArt(o: ArtOptions): string {
  const rng = makeRng(`${o.labelSeed}|art|${o.index}`);
  const kind = o.theme.artKind;
  const body = (() => {
    switch (kind) {
      case 'portrait': return portrait(rng, o, !!o.theme.artMono);
      case 'tree': return tree(rng, o);
      case 'painting': return painting(rng, o);
      case 'dossier': return dossier(rng, o);
      case 'starfield': return starfield(rng, o);
      case 'frame': return frame(rng, o);
    }
  })();
  return `<svg class="tile-art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${body}</svg>`;
}

/* ------------------------------------------------------------------ *
 * Portrait — built in layers the way a photographer would light one:
 * ground, backdrop, shoulders, neck with its cast shadow, ears, head,
 * modelling on the shadow side, features, then hair on top.
 * ------------------------------------------------------------------ */

function portrait(rng: Rng, o: ArtOptions, mono: boolean): string {
  const p = o.theme.palette;
  const id = `p${o.index}`;
  const skin = mono ? '#ddd8cd' : rng.pick(SKIN);
  const shadow = mix(skin, '#000000', mono ? 0.12 : 0.2);
  const blush = mix(skin, '#c2453a', mono ? 0 : 0.14);
  const hair = mono ? '#2a2622' : rng.pick(HAIR);
  const hairLit = mix(hair, '#ffffff', 0.22);
  const ink = mono ? '#241f1c' : '#2b2118';
  const cloth = mono ? '#a9a396' : rng.pick(CLOTH);
  const clothLit = mix(cloth, '#ffffff', 0.16);
  const backdrop = mono ? '#e9e4d9' : mix(p.tile, p.accent, 0.1);
  const backdropLo = mix(backdrop, '#000000', 0.12);

  const hairStyle = rng.int(7);
  const facial = !mono && rng.next() > 0.68 ? rng.int(3) : -1;
  const glasses = rng.next() > 0.76;
  const earring = rng.next() > 0.82;
  const smiling = rng.next() > 0.42;
  const eyeY = 45 + rng.int(3);
  const headW = 17 + rng.next() * 2.4;
  const guilty = o.state === 1;

  const hairBack = [
    '', '',
    `<path d="M25 46c-3 12-2 24 2 32 2-11 1-22-2-32z" fill="${hair}"/><path d="M75 46c3 12 2 24-2 32-2-11-1-22 2-32z" fill="${hair}"/>`,
    `<path d="M24 44c-4 16-3 30 2 40 3-14 2-28-2-40z" fill="${hair}"/><path d="M76 44c4 16 3 30-2 40-3-14-2-28 2-40z" fill="${hair}"/>`,
    '', '', '',
  ][hairStyle];

  const hairFront = [
    `<path d="M29 43c0-15 9-23 21-23s21 8 21 23c0-6-6-11-21-11s-21 5-21 11z" fill="${hair}"/>
     <path d="M33 34c4-6 10-9 17-9 5 0 9 1 12 3-6-1-18-2-29 6z" fill="${hairLit}" opacity=".5"/>`,
    `<path d="M28 45c-2-19 10-26 22-26s24 7 22 26c-2-13-8-17-22-17s-20 4-22 17z" fill="${hair}"/>
     <path d="M35 27c6-4 18-5 26 1-8-1-18-2-26-1z" fill="${hairLit}" opacity=".45"/>`,
    `<path d="M28 44c1-16 11-24 22-24s21 8 22 24c1 8-2 10-3 5-2-9-8-14-19-14s-17 5-19 14c-1 5-4 3-3-5z" fill="${hair}"/>`,
    `<ellipse cx="50" cy="33" rx="23" ry="15" fill="${hair}"/><ellipse cx="44" cy="28" rx="10" ry="5" fill="${hairLit}" opacity=".4"/>`,
    `<path d="M31 42c1-14 10-21 19-21s19 7 20 21c-4-7-11-10-20-10s-15 3-19 10z" fill="${hair}"/>
     <circle cx="50" cy="19" r="7.5" fill="${hair}"/><circle cx="47" cy="17" r="3" fill="${hairLit}" opacity=".4"/>`,
    `<path d="M32 44c-1-15 8-23 18-23s19 8 18 23c-3-5-2-11-18-11s-15 6-18 11z" fill="${hair}"/>
     <path d="M32 44q9-8 18-8t18 8" stroke="${hairLit}" stroke-width="1.2" fill="none" opacity=".45"/>`,
    `<path d="M30 44c0-14 9-22 20-22s20 8 20 22c-2-4-4-7-7-9-4 3-10 4-16 3-5-1-9-3-11-6-3 2-5 6-6 12z" fill="${hair}"/>`,
  ][hairStyle];

  const facialHair = facial === 0
    ? `<path d="M${50 - headW * 0.62} ${eyeY + 12}q${headW * 0.62} ${16} ${headW * 1.24} 0q-2 16-${headW * 0.62} 16t-${headW * 0.62}-16z" fill="${hair}" opacity=".9"/>`
    : facial === 1
      ? `<path d="M44 ${eyeY + 14}q6 3 12 0q-1 4-6 4t-6-4z" fill="${hair}"/>`
      : facial === 2
        ? `<path d="M${50 - headW * 0.5} ${eyeY + 15}q${headW * 0.5} 10 ${headW} 0q-3 9-${headW * 0.5} 9t-${headW * 0.5}-9z" fill="${hair}" opacity=".85"/>`
        : '';

  return `
    <defs>
      <linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${backdrop}"/><stop offset="1" stop-color="${backdropLo}"/>
      </linearGradient>
      <radialGradient id="${id}vig" cx="0.5" cy="0.42" r="0.72">
        <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${mono ? 0.1 : 0.22}"/>
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill="url(#${id}bg)"/>
    ${hairBack}
    <path d="M50 66c-17 0-29 10-31 25-1 5-1 9-1 9h64s0-4-1-9c-2-15-14-25-31-25z" fill="${cloth}"/>
    <path d="M50 66c-4 0-8 1-11 2l11 14 11-14c-3-1-7-2-11-2z" fill="${mix(skin, '#000000', 0.06)}"/>
    <path d="M39 68l11 14-4 18h-6z" fill="${clothLit}" opacity=".55"/>
    <path d="M61 68L50 82l4 18h6z" fill="${clothLit}" opacity=".35"/>
    <path d="M45 58h10v9q-5 4-10 0z" fill="${shadow}"/>
    <ellipse cx="${50 - headW - 1}" cy="${eyeY + 3}" rx="3" ry="4.4" fill="${skin}"/>
    <ellipse cx="${50 + headW + 1}" cy="${eyeY + 3}" rx="3" ry="4.4" fill="${skin}"/>
    <ellipse cx="${50 - headW - 1}" cy="${eyeY + 3}" rx="1.4" ry="2.2" fill="${shadow}" opacity=".55"/>
    <ellipse cx="${50 + headW + 1}" cy="${eyeY + 3}" rx="1.4" ry="2.2" fill="${shadow}" opacity=".55"/>
    <path d="M50 24c-${headW} 0-${headW} 12-${headW} 21 0 13 8 22 ${headW} 22s${headW}-9 ${headW}-22c0-9 0-21-${headW}-21z" fill="${skin}"/>
    <path d="M50 24c-${headW} 0-${headW} 12-${headW} 21 0 13 8 22 ${headW} 22V24z" fill="${shadow}" opacity=".26"/>
    <ellipse cx="${50 - headW * 0.62}" cy="${eyeY + 9}" rx="4" ry="2.6" fill="${blush}" opacity="${mono ? 0 : 0.5}"/>
    <ellipse cx="${50 + headW * 0.62}" cy="${eyeY + 9}" rx="4" ry="2.6" fill="${blush}" opacity="${mono ? 0 : 0.5}"/>
    ${hairFront}
    <path d="M${43.5 - rng.next()} ${eyeY - 4}q3.4-2.4 7 -0.2" stroke="${hair}" stroke-width="1.9" fill="none" stroke-linecap="round"/>
    <path d="M${53.5 + rng.next()} ${eyeY - 4.2}q3.4-2.2 7 0.2" stroke="${hair}" stroke-width="1.9" fill="none" stroke-linecap="round"/>
    <ellipse cx="43.4" cy="${eyeY}" rx="3.4" ry="2.5" fill="#fdfcfa"/>
    <ellipse cx="56.6" cy="${eyeY}" rx="3.4" ry="2.5" fill="#fdfcfa"/>
    <circle cx="${43.4 + rng.next() * 0.8 - 0.4}" cy="${eyeY}" r="1.7" fill="${ink}"/>
    <circle cx="${56.6 + rng.next() * 0.8 - 0.4}" cy="${eyeY}" r="1.7" fill="${ink}"/>
    <circle cx="42.8" cy="${eyeY - 0.7}" r="0.6" fill="#fff"/>
    <circle cx="56" cy="${eyeY - 0.7}" r="0.6" fill="#fff"/>
    <path d="M40 ${eyeY - 2.4}q3.4-2 6.8 0" stroke="${ink}" stroke-width="0.8" fill="none" opacity=".5"/>
    <path d="M53.2 ${eyeY - 2.4}q3.4-2 6.8 0" stroke="${ink}" stroke-width="0.8" fill="none" opacity=".5"/>
    <path d="M50 ${eyeY + 2}q-1.6 4 0.4 6" stroke="${shadow}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".8"/>
    <path d="M${45.6} ${eyeY + 12}q4.4 ${smiling ? 4.2 : -1.6} 8.8 0" stroke="${ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    ${smiling ? `<path d="M46.6 ${eyeY + 12.4}q3.4 2 6.8 0z" fill="#fff" opacity=".55"/>` : ''}
    ${facialHair}
    ${glasses ? `<g stroke="${ink}" stroke-width="1.3" fill="none" opacity=".9">
        <rect x="38.4" y="${eyeY - 3.6}" width="10" height="7.4" rx="2.4"/>
        <rect x="51.6" y="${eyeY - 3.6}" width="10" height="7.4" rx="2.4"/>
        <path d="M48.4 ${eyeY} h3.2M38.4 ${eyeY - 1}l-4-1M61.6 ${eyeY - 1}l4-1"/></g>` : ''}
    ${earring ? `<circle cx="${50 + headW + 1}" cy="${eyeY + 8}" r="1.6" fill="${p.accent}"/>` : ''}
    <rect width="100" height="100" fill="url(#${id}vig)"/>
    ${guilty ? `<path d="M17 17L83 83M83 17L17 83" stroke="${p.stateB}" stroke-width="6.5" stroke-linecap="round" opacity=".88"/>` : ''}
    ${mono ? `<rect width="100" height="100" fill="url(#halftone)" opacity=".2"/>` : ''}`;
}

/* ------------------------------------------------------------------ */

function tree(rng: Rng, o: ArtOptions): string {
  const p = o.theme.palette;
  const id = `t${o.index}`;
  const blighted = o.state === 1;
  const base = blighted ? p.stateB : p.stateA;
  const leaf = mix(base, '#ffffff', rng.next() * 0.16);
  const leafLit = mix(leaf, '#ffffff', 0.3);
  const leafDark = mix(leaf, '#000000', 0.26);
  const bark = mix(p.ink, '#7a5a3a', 0.45);
  const barkLit = mix(bark, '#ffffff', 0.22);
  const sky = mix(p.tile, '#ffffff', 0.35);
  const grass = mix(p.stateA, '#000000', 0.1);

  const lean = rng.next() * 7 - 3.5;
  const size = 0.88 + rng.next() * 0.3;
  const cy = 40 + rng.next() * 5;
  const habit = rng.int(3);
  const groundY = 78 + rng.int(5);

  const blob = (cx: number, cyy: number, r: number, fill: string, op = 1) =>
    `<circle cx="${cx.toFixed(1)}" cy="${cyy.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" opacity="${op}"/>`;

  let canopy = '';
  if (habit === 0) {
    const puffs: string[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rng.next() * 0.6;
      const cx = 50 + Math.cos(a) * 12 * size + lean;
      const yy = cy + Math.sin(a) * 8.5 * size;
      puffs.push(blob(cx, yy, (12 + rng.next() * 6) * size, k % 3 === 0 ? leafDark : leaf));
    }
    canopy = puffs.join('')
      + blob(46 + lean, cy - 8 * size, 9 * size, leafLit, 0.55)
      + blob(56 + lean, cy + 6 * size, 7 * size, leafDark, 0.4);
  } else if (habit === 1) {
    canopy = `<path d="M${50 + lean} ${cy - 27 * size}c${19 * size} 0 ${24 * size} ${17 * size} ${19 * size} ${27 * size}c${-5 * size} ${10 * size} ${-28 * size} ${12 * size} ${-39 * size} ${1 * size}c${-11 * size} ${-11 * size} ${-2 * size} ${-28 * size} ${20 * size} ${-28 * size}z" fill="${leaf}"/>
      <path d="M${50 + lean} ${cy - 27 * size}c${19 * size} 0 ${24 * size} ${17 * size} ${19 * size} ${27 * size}c${-3 * size} ${5 * size} ${-12 * size} ${8 * size} ${-19 * size} ${8 * size}z" fill="${leafLit}" opacity=".4"/>
      ${blob(42 + lean, cy + 6 * size, 10 * size, leafDark, 0.35)}`;
  } else {
    canopy = `<path d="M${50 + lean} ${cy - 31 * size} L${50 + lean + 21 * size} ${cy - 2 * size} H${50 + lean - 21 * size} Z" fill="${leaf}"/>
      <path d="M${50 + lean} ${cy - 20 * size} L${50 + lean + 24 * size} ${cy + 14 * size} H${50 + lean - 24 * size} Z" fill="${leafDark}"/>
      <path d="M${50 + lean} ${cy - 31 * size} L${50 + lean + 21 * size} ${cy - 2 * size} H${50 + lean} Z" fill="${leafLit}" opacity=".28"/>`;
  }

  const specks = Array.from({ length: 14 }, () =>
    `<circle cx="${(32 + rng.next() * 36 + lean).toFixed(1)}" cy="${(cy - 16 + rng.next() * 30).toFixed(1)}" r="${(0.6 + rng.next() * 0.9).toFixed(1)}" fill="${leafLit}" opacity=".5"/>`).join('');

  const fruit = blighted ? '' : Array.from({ length: 3 + rng.int(4) }, () => {
    const fx = 38 + rng.next() * 24 + lean, fy = cy - 10 + rng.next() * 22;
    return `<circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="2.6" fill="${p.accent}"/>
            <circle cx="${(fx - 0.8).toFixed(1)}" cy="${(fy - 0.8).toFixed(1)}" r="0.9" fill="#fff" opacity=".6"/>`;
  }).join('');

  const lesions = blighted ? Array.from({ length: 8 }, () =>
    `<circle cx="${(34 + rng.next() * 34 + lean).toFixed(1)}" cy="${(cy - 12 + rng.next() * 26).toFixed(1)}" r="${(1.4 + rng.next() * 2.2).toFixed(1)}" fill="${mix(p.ink, base, 0.35)}" opacity=".55"/>`).join('')
    + `<path d="M${44 + lean} ${cy + 9} l-13 -7 M${56 + lean} ${cy + 5} l14 -9" stroke="${bark}" stroke-width="1.7" stroke-linecap="round" opacity=".75"/>` : '';

  return `
    <defs><linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${p.tile}"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${id}sky)"/>
    <rect x="0" y="${groundY}" width="100" height="${100 - groundY}" fill="${grass}" opacity=".4"/>
    <path d="M0 ${groundY}q25-3 50 0t50 0" stroke="${grass}" stroke-width="1.2" fill="none" opacity=".6"/>
    <ellipse cx="${52 + lean}" cy="${groundY + 3}" rx="${16 * size}" ry="3.4" fill="#000" opacity=".18"/>
    <path d="M${47.5 + lean} ${cy + 4} L${44.6 - lean * 0.2} ${groundY + 2} q5.4 1.6 10.8 0 L${52.5 + lean} ${cy + 4} z" fill="${bark}"/>
    <path d="M${47.5 + lean} ${cy + 4} L${44.6 - lean * 0.2} ${groundY + 2} q2.4 0.7 4.8 0.9 L${50 + lean} ${cy + 4} z" fill="${barkLit}" opacity=".45"/>
    <path d="M${48.6 + lean} ${cy + 14} l-9.4 -8 M${51 + lean} ${cy + 21} l9.6 -9.4 M${49 + lean} ${cy + 26} l-7 -6"
      stroke="${bark}" stroke-width="2.1" stroke-linecap="round" fill="none"/>
    ${canopy}${specks}${lesions}${fruit}`;
}

/* ------------------------------------------------------------------ */

const PIGMENT = ['#7d3f2e', '#2f4858', '#6b7a4b', '#8a6a2f', '#4a3b5c', '#9c5a3c', '#2f5d52', '#b08245', '#d9c9a8', '#3a3f4a', '#5c6b7a', '#a34b3c'];

function painting(rng: Rng, o: ArtOptions): string {
  const p = o.theme.palette;
  const id = `w${o.index}`;
  const forged = o.state === 1;
  const pal = rng.shuffle(PIGMENT);
  const [sky, ground, form, hi, accent] = pal;
  const gold = p.tileLine;
  const goldLit = mix(gold, '#ffffff', 0.45);
  const goldDark = mix(gold, '#000000', 0.4);
  const sub = rng.int(5);
  const inner = `<rect x="16" y="16" width="68" height="68" fill="${sky}"/>`;

  const art = sub === 0
    ? `${inner}
       <rect x="16" y="16" width="68" height="34" fill="${mix(sky, '#ffffff', 0.25)}"/>
       <path d="M16 ${52 + rng.int(6)} L34 ${36 + rng.int(6)} L48 50 L${62 + rng.int(6)} ${38 + rng.int(5)} L84 58 v26 H16z" fill="${ground}"/>
       <path d="M16 ${64 + rng.int(6)} L38 ${54 + rng.int(4)} L60 66 L84 ${58 + rng.int(6)} v26 H16z" fill="${mix(ground, '#000000', 0.25)}"/>
       <circle cx="${30 + rng.int(38)}" cy="${28 + rng.int(6)}" r="${4 + rng.int(3)}" fill="${hi}" opacity=".95"/>
       <path d="M16 78q16-4 32 0t36 0v6H16z" fill="${mix(ground, '#000000', 0.45)}"/>`
    : sub === 1
      ? `${inner}
         <ellipse cx="50" cy="60" rx="30" ry="26" fill="${mix(sky, '#000000', 0.2)}"/>
         <path d="M50 68c-16 0-25 8-27 16h54c-2-8-11-16-27-16z" fill="${form}"/>
         <ellipse cx="50" cy="48" rx="13" ry="16" fill="${hi}"/>
         <path d="M50 32c-9 0-13 6-13 12 2-5 6-8 13-8s11 3 13 8c0-6-4-12-13-12z" fill="${mix(form, '#000000', 0.35)}"/>
         <path d="M42 78q8 5 16 0" stroke="${accent}" stroke-width="2" fill="none" opacity=".8"/>`
      : sub === 2
        ? `${inner}
           <rect x="16" y="${58 + rng.int(6)}" width="68" height="26" fill="${ground}"/>
           <ellipse cx="50" cy="${62 + rng.int(4)}" rx="22" ry="6" fill="${mix(ground, '#000000', 0.3)}"/>
           <path d="M42 64c0-13 3-21 8-21s8 8 8 21z" fill="${form}"/>
           <circle cx="${34 + rng.int(6)}" cy="58" r="7" fill="${hi}"/>
           <circle cx="${60 + rng.int(6)}" cy="60" r="5" fill="${accent}"/>
           <ellipse cx="50" cy="43" rx="6" ry="3" fill="${mix(form, '#ffffff', 0.3)}"/>`
        : sub === 3
          ? `${inner}${Array.from({ length: 6 }, (_, k) =>
              `<rect x="16" y="${16 + k * 11.4}" width="68" height="${7 + rng.int(5)}" fill="${pal[k % pal.length]}" opacity=".94"/>`).join('')}
             <rect x="${24 + rng.int(30)}" y="16" width="${4 + rng.int(5)}" height="68" fill="${hi}" opacity=".5"/>`
          : `${inner}
             <path d="M16 84 L${32 + rng.int(8)} ${34 + rng.int(12)} L50 84z" fill="${ground}"/>
             <path d="M${40 + rng.int(8)} 84 L${64 + rng.int(8)} ${26 + rng.int(10)} L84 84z" fill="${form}"/>
             <path d="M${58 + rng.int(8)} ${34 + rng.int(8)} l6 -6 6 6z" fill="${mix(form, '#ffffff', 0.5)}"/>
             <rect x="16" y="${72 + rng.int(5)}" width="68" height="12" fill="${hi}" opacity=".6"/>`;

  return `
    <defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${goldLit}"/><stop offset="0.5" stop-color="${gold}"/><stop offset="1" stop-color="${goldDark}"/>
      </linearGradient>
      <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".16"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="${mix(p.bg, '#000000', 0.04)}"/>
    <rect x="6" y="6" width="88" height="88" fill="none" stroke="url(#${id}g)" stroke-width="9"/>
    <rect x="10.5" y="10.5" width="79" height="79" fill="none" stroke="${goldDark}" stroke-width="1"/>
    <rect x="13" y="13" width="74" height="74" fill="${mix(p.bg, '#ffffff', 0.5)}"/>
    ${art}
    <rect x="16" y="16" width="68" height="68" fill="url(#${id}c)"/>
    <rect x="15.5" y="15.5" width="69" height="69" fill="none" stroke="${goldDark}" stroke-width="1.4"/>
    ${[[8, 8], [84, 8], [8, 84], [84, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${goldLit}"/><circle cx="${x}" cy="${y}" r="1.6" fill="${goldDark}"/>`).join('')}
    <path d="M${62 + rng.int(8)} 80 l3 -2 2 2 3 -3" stroke="${mix(sky, '#000000', 0.5)}" stroke-width="0.9" fill="none" opacity=".8"/>
    ${forged ? `<path d="M34 14 q7 24 -3 42 q-7 17 5 36" stroke="${p.stateB}" stroke-width="1.8" fill="none" opacity=".95"/>
                <path d="M34 40 l-7 6M31 62 l8 5" stroke="${p.stateB}" stroke-width="1.2" fill="none" opacity=".7"/>` : ''}`;
}

/* ------------------------------------------------------------------ */

function dossier(rng: Rng, o: ArtOptions): string {
  const p = o.theme.palette;
  const flagged = o.state === 1;
  const c = flagged ? p.stateB : p.accent;
  const dim = mix(c, p.tile, 0.55);
  const paper = mix(p.tile, '#ffffff', 0.06);

  const lines = Array.from({ length: 6 }, (_, k) =>
    `<rect x="44" y="${26 + k * 9.4}" width="${16 + rng.int(38)}" height="3.2" rx="1.4" fill="${k === 1 ? c : dim}" opacity="${k === 1 ? '.95' : '.5'}"/>`).join('');
  const barcode = Array.from({ length: 16 }, (_, k) =>
    `<rect x="${44 + k * 3.1}" y="84" width="${rng.next() > 0.5 ? 1.6 : 0.8}" height="8" fill="${dim}" opacity=".7"/>`).join('');

  return `
    <rect width="100" height="100" fill="${p.tile}"/>
    <rect x="6" y="6" width="88" height="88" fill="${paper}" stroke="${mix(dim, p.tile, 0.4)}" stroke-width="0.8"/>
    <rect x="6" y="6" width="88" height="12" fill="${c}" opacity=".16"/>
    <rect x="10" y="10" width="26" height="4" rx="2" fill="${c}" opacity=".8"/>
    ${[26, 46, 66].map((y) => `<circle cx="4" cy="${y}" r="2.2" fill="${p.bg}"/>`).join('')}
    <rect x="10" y="24" width="28" height="34" fill="${mix(c, '#000000', 0.55)}" opacity=".5"/>
    <circle cx="24" cy="36" r="7" fill="${c}" opacity=".7"/>
    <path d="M24 45c-7 0-11 5-12 13h24c-1-8-5-13-12-13z" fill="${c}" opacity=".7"/>
    <rect x="10" y="24" width="28" height="34" fill="url(#halftone)" opacity=".2"/>
    <rect x="10" y="24" width="28" height="34" fill="none" stroke="${dim}" stroke-width="0.8"/>
    ${lines}
    <rect x="10" y="64" width="28" height="3" rx="1.5" fill="${dim}" opacity=".45"/>
    <rect x="10" y="71" width="20" height="3" rx="1.5" fill="${dim}" opacity=".45"/>
    <rect x="10" y="78" width="24" height="3" rx="1.5" fill="${dim}" opacity=".3"/>
    ${barcode}
    ${flagged ? `<g transform="rotate(-13 50 52)" opacity=".92">
        <rect x="16" y="42" width="68" height="20" rx="2" fill="none" stroke="${p.stateB}" stroke-width="2.6"/>
        <rect x="22" y="49.5" width="56" height="5" rx="1" fill="${p.stateB}"/>
        <rect x="22" y="44" width="20" height="2" fill="${p.stateB}" opacity=".7"/>
      </g>` : ''}`;
}

/* ------------------------------------------------------------------ */

function starfield(rng: Rng, o: ArtOptions): string {
  const p = o.theme.palette;
  const id = `s${o.index}`;
  const source = o.state === 1;
  const nx = 20 + rng.next() * 60, ny = 20 + rng.next() * 60;

  const stars = Array.from({ length: 34 }, () => {
    const r = 0.35 + rng.next() * 1.5;
    const x = rng.next() * 100, y = rng.next() * 100;
    const bright = r > 1.5;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${p.ink}" opacity="${(0.2 + rng.next() * 0.7).toFixed(2)}"/>`
      + (bright ? `<path d="M${(x - r * 3).toFixed(1)} ${y.toFixed(1)}h${(r * 6).toFixed(1)}M${x.toFixed(1)} ${(y - r * 3).toFixed(1)}v${(r * 6).toFixed(1)}" stroke="${p.ink}" stroke-width="0.35" opacity=".45"/>` : '');
  }).join('');

  const scratch = rng.next() > 0.6
    ? `<path d="M${rng.int(100)} 0 q${rng.int(20) - 10} 50 ${rng.int(16) - 8} 100" stroke="${p.inkSoft}" stroke-width="0.4" fill="none" opacity=".3"/>` : '';

  return `
    <defs>
      <radialGradient id="${id}n" cx="${(nx / 100).toFixed(2)}" cy="${(ny / 100).toFixed(2)}" r="0.55">
        <stop offset="0" stop-color="${p.accent}" stop-opacity=".16"/>
        <stop offset="1" stop-color="${p.accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill="${p.tile}"/>
    <rect width="100" height="100" fill="url(#${id}n)"/>
    ${[25, 50, 75].map((v) => `<path d="M${v} 0v3M${v} 97v3M0 ${v}h3M97 ${v}h3" stroke="${p.inkSoft}" stroke-width="0.5" opacity=".45"/>`).join('')}
    ${stars}${scratch}
    ${source
      ? `<circle cx="50" cy="50" r="13" fill="${p.accent}" opacity=".12"/>
         <circle cx="50" cy="50" r="9" fill="none" stroke="${p.accent}" stroke-width="1.5"/>
         <circle cx="50" cy="50" r="3.4" fill="${p.accent}"/>
         <path d="M50 33v-7M50 67v7M33 50h-7M67 50h7" stroke="${p.accent}" stroke-width="1.3" opacity=".75"/>`
      : `<circle cx="${(30 + rng.next() * 40).toFixed(1)}" cy="${(30 + rng.next() * 40).toFixed(1)}" r="1.9" fill="${p.inkSoft}" opacity=".65"/>`}`;
}

/* ------------------------------------------------------------------ */

function frame(rng: Rng, o: ArtOptions): string {
  const p = o.theme.palette;
  const id = `f${o.index}`;
  const cut = o.state === 1;
  const shot = rng.int(4);
  const ink = p.tileInk;
  const far = mix(ink, p.tile, 0.62);
  const mid = mix(ink, p.tile, 0.32);
  const hz = 62 + rng.int(12);
  const fx = 26 + rng.int(18);
  const gx = 58 + rng.int(14);
  const scale = 0.84 + rng.next() * 0.36;

  const backdrop = `<path d="M6 ${hz} L${18 + rng.int(8)} ${hz - 16 - rng.int(8)} L${34 + rng.int(6)} ${hz - 4} L${52 + rng.int(8)} ${hz - 20 - rng.int(6)} L${74 + rng.int(8)} ${hz - 6} L94 ${hz}z" fill="${far}" opacity=".38"/>`;

  const scene = [
    `${backdrop}<path d="M6 ${hz}h88" stroke="${ink}" stroke-width="1.5"/>
     <circle cx="${fx}" cy="${hz - 17}" r="${5.5 + rng.int(2)}" fill="${mid}" stroke="${ink}" stroke-width="1.4"/>
     <path d="M${fx} ${hz - 10}v12M${fx - 7} ${hz - 6}h14M${fx - 5} ${hz + 13}l5 -11 5 11" stroke="${ink}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
     <rect x="${gx}" y="${hz - 30}" width="${20 + rng.int(12)}" height="${24 + rng.int(6)}" fill="${mid}" opacity=".35" stroke="${ink}" stroke-width="1.4"/>
     <rect x="${gx + 5}" y="${hz - 24}" width="7" height="8" fill="${ink}" opacity=".5"/>`,
    `${backdrop}<path d="M6 ${hz + 4}h88" stroke="${ink}" stroke-width="1.5"/>
     <rect x="${fx - 9}" y="${hz - 38}" width="${20 + rng.int(10)}" height="${40 + rng.int(6)}" fill="${mid}" opacity=".3" stroke="${ink}" stroke-width="1.5"/>
     <path d="M${gx} ${hz + 4}V${hz - 24}l${9 + rng.int(5)} -11 14 11v${28 + rng.int(4)}" fill="${mid}" opacity=".3" stroke="${ink}" stroke-width="1.5"/>
     <circle cx="${gx + 13}" cy="${hz - 14}" r="4.5" fill="${p.accent}" opacity=".55" stroke="${ink}" stroke-width="1.2"/>`,
    `<g transform="translate(50 ${hz - 16}) scale(${scale.toFixed(2)}) translate(-50 -52)">
       <circle cx="50" cy="52" r="19" fill="${mid}" opacity=".22" stroke="${ink}" stroke-width="1.7"/>
       <ellipse cx="43" cy="${48 + rng.int(2)}" rx="3" ry="2.4" fill="${ink}"/>
       <ellipse cx="57" cy="${48 + rng.int(2)}" rx="3" ry="2.4" fill="${ink}"/>
       <path d="M42 61q8 ${rng.next() > 0.5 ? 6 : -3} 16 0" stroke="${ink}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
       <path d="M33 40q6 -8 17 -8t17 8" stroke="${ink}" stroke-width="1.5" fill="none"/>
     </g>`,
    `<path d="M6 ${hz + 8}h88" stroke="${ink}" stroke-width="1.5"/>
     <path d="M${10 + rng.int(6)} ${hz + 8}l${13 + rng.int(5)} -${22 + rng.int(8)} 12 ${13 + rng.int(5)} 10 -${17 + rng.int(6)} ${15 + rng.int(5)} ${28 + rng.int(4)}z" fill="${mid}" opacity=".3" stroke="${ink}" stroke-width="1.5"/>
     <circle cx="${gx + 8}" cy="${24 + rng.int(12)}" r="${5 + rng.int(3)}" fill="${p.accent}" opacity=".4" stroke="${ink}" stroke-width="1.3"/>
     <path d="M6 ${hz + 8}q22 -4 44 0t44 0" stroke="${ink}" stroke-width="0.8" fill="none" opacity=".4"/>`,
  ][shot];

  const grain = Array.from({ length: 5 }, () =>
    `<path d="M${rng.int(88) + 6} ${16 + rng.int(66)}h${2 + rng.int(8)}" stroke="${ink}" stroke-width="0.7" opacity=".14"/>`).join('');

  return `
    <defs><radialGradient id="${id}v" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/>
    </radialGradient></defs>
    <rect width="100" height="100" fill="${p.tile}"/>
    ${[0, 92].map((y) => `<rect x="0" y="${y}" width="100" height="8" fill="${ink}" opacity=".1"/>`).join('')}
    ${[10, 30, 50, 70, 90].flatMap((x) => [2, 94].map((y) =>
      `<rect x="${x - 4}" y="${y}" width="8" height="4.4" rx="1" fill="${ink}" opacity=".4"/>`)).join('')}
    <g opacity="${cut ? '.32' : '.95'}">${scene}</g>${grain}
    <rect width="100" height="100" fill="url(#${id}v)"/>
    ${cut ? `<path d="M12 22 L88 80" stroke="${p.accent}" stroke-width="3.4" stroke-linecap="round" opacity=".85"/>
             <path d="M12 22 L88 80" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".35"/>` : ''}`;
}

/* ------------------------------------------------------------------ */

/** Mix two hex colours. Positive t moves `hex` toward `towards`. */
function mix(hex: string, towards: string, t: number): string {
  const pa = parse(hex), pb = parse(towards);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))));
  return `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}
function parse(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** One shared <defs> for the halftone texture the photocopy and dossier themes use. */
export const ART_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<pattern id="halftone" width="3" height="3" patternUnits="userSpaceOnUse">
  <circle cx="1.5" cy="1.5" r="0.7" fill="#000"/>
</pattern></defs></svg>`;
