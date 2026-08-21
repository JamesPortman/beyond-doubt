import { Theme } from './index.js';
import { noun, pred, predInv } from '../i18n/index.js';

/** The twenty-one works in the set, in filename order.
 *
 *  `title` is deliberately short: it is what the tile prints AND what a clue says when it
 *  names a work, so "Blue Mountain Sunrise", "Blue Mountain Sunset" and "Blue Mountain
 *  Trail" would all arrive on the board as "BLUE M…" and the puzzle would be unsolvable
 *  for reasons that have nothing to do with the puzzle. The full title survives in
 *  `full`, which Inspect shows the way a wall label does. */
const WORKS: { title: string; full: string; oil: boolean }[] = [
  { title: 'Council Beach', full: 'Council Beach', oil: true },
  { title: 'Lora Bay', full: 'Lora Bay', oil: true },
  { title: 'Bruce Trail', full: 'Bruce Trail', oil: true },
  { title: 'Access Point', full: 'Access Point', oil: true },
  { title: 'Alpine', full: 'Alpine Ski Club', oil: true },
  { title: 'Inglis Falls', full: 'Inglis Falls', oil: true },
  { title: 'Manitoulin', full: 'Manitoulin Island', oil: true },
  { title: 'Canola', full: 'Ravenna Canola', oil: true },
  { title: 'Ravenna', full: 'Ravenna Sunset', oil: true },
  { title: 'Singhampton', full: 'Singhampton', oil: true },
  { title: 'Northwinds', full: 'Northwinds', oil: true },
  { title: 'Sunrise', full: 'Blue Mountain Sunrise', oil: false },
  { title: 'Sunset', full: 'Blue Mountain Sunset', oil: false },
  { title: 'The Trail', full: 'Blue Mountain Trail', oil: false },
  { title: 'Bridal Veil', full: 'Bridal Veil Falls', oil: false },
  { title: 'Delphi Point', full: 'Delphi Point', oil: false },
  { title: 'Local Farm', full: 'Local Farm', oil: false },
  { title: 'Scenic Caves', full: 'Scenic Caves', oil: true },
  { title: 'Snowy Owl', full: 'Snowy Owl, Craigleith', oil: false },
  { title: 'The Grotto', full: 'The Grotto', oil: false },
  { title: 'The Summit', full: 'Top of Blue Mountain', oil: false },
];

/** The image set itself, shared with The Wall. Only the caption and the mark differ:
 *  Red Dot titles each work and puts a sold dot beside it; The Wall numbers them as
 *  anonymous lots and stamps the ones its story says are fake. */
export const GALLERY_IMAGES = {
  count: WORKS.length,
  src: (n: number) => `/assets/gallery/${String(n + 1).padStart(2, '0')}.webp`,
  credit: (n: number) => {
    const w = WORKS[n];
    const medium = `James Portman, ${w.oil ? 'oil on canvas' : 'photograph'}`;
    // The full title only earns a repeat when the tile had to shorten it.
    return w.full === w.title ? medium : `${w.full} — ${medium}`;
  },
  fixedCast: true,
} as const;

export const gallery: Theme = {
  id: 'gallery',
  labelMode: 'artwork',
  tagSchema: { size: ['small', 'medium', 'large', 'study'] },
  artKind: 'painting',
  skinClass: 'skin-gallery',
  images: { ...GALLERY_IMAGES, title: (n) => WORKS[n].title, mark: 'dot' },
  palette: {
    mood: 'light',
    bg: '#efece6', surface: '#faf8f4', surfaceAlt: '#ffffff',
    ink: '#1b1917', inkSoft: '#5f584f', line: '#ddd6ca',
    tile: '#26241f', tileInk: '#f8f4ec', tileLine: '#8c8375',
    accent: '#8a6f3c', stateA: '#3d6a54', stateB: '#b32217',
  },
  fonts: {
    display: '"Avenir Next", Futura, "Century Gothic", "Helvetica Neue", sans-serif',
    body: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    mono: 'ui-monospace, Menlo, monospace',
  },
  strings: {
    en: {
      title: 'Red Dot',
      tagline: 'Opening night on Georgian Bay. Work out which ones already have a buyer.',
      tile: noun('work', 'works', 'f'),
      states: {
        a: { name: 'Available', collective: noun('available work', 'available works', 'f'), adj: predInv('available', 'available'), pred: predInv('is available', 'are available') },
        b: { name: 'Sold', collective: noun('sold work', 'sold works', 'f'), adj: predInv('sold', 'sold'), pred: predInv('is sold', 'are sold') },
      },
      tags: {
        size: {
          label: noun('size', 'sizes', 'f'),
          values: {
            small: noun('small work', 'small works', 'f'),
            medium: noun('medium work', 'medium works', 'f'),
            large: noun('large work', 'large works', 'f'),
            study: noun('study', 'studies', 'f'),
          },
        },
      },
      labels: [],
    },
    pt: {
      title: 'Ponto Vermelho',
      tagline: 'Noite de abertura na Baía Georgiana. Descubra quais já têm comprador.',
      tile: noun('obra', 'obras', 'f'),
      states: {
        a: { name: 'Disponível', collective: noun('obra disponível', 'obras disponíveis', 'f'), adj: predInv('disponível', 'disponíveis'), pred: predInv('está disponível', 'estão disponíveis') },
        b: { name: 'Vendida', collective: noun('obra vendida', 'obras vendidas', 'f'), adj: pred('vendido', 'vendida', 'vendidos', 'vendidas'), pred: pred('está vendido', 'está vendida', 'estão vendidos', 'estão vendidas') },
      },
      tags: {
        size: {
          label: noun('formato', 'formatos', 'm'),
          values: {
            small: noun('obra pequena', 'obras pequenas', 'f'),
            medium: noun('obra média', 'obras médias', 'f'),
            large: noun('obra grande', 'obras grandes', 'f'),
            study: noun('estudo', 'estudos', 'm'),
          },
        },
      },
      labels: [],
    },
    es: {
      title: 'Punto Rojo',
      tagline: 'Noche de inauguración en la bahía Georgian. Averigua cuáles ya tienen comprador.',
      tile: noun('obra', 'obras', 'f'),
      states: {
        a: { name: 'Disponible', collective: noun('obra disponible', 'obras disponibles', 'f'), adj: predInv('disponible', 'disponibles'), pred: predInv('está disponible', 'están disponibles') },
        b: { name: 'Vendida', collective: noun('obra vendida', 'obras vendidas', 'f'), adj: pred('vendido', 'vendida', 'vendidos', 'vendidas'), pred: pred('está vendido', 'está vendida', 'están vendidos', 'están vendidas') },
      },
      tags: {
        size: {
          label: noun('formato', 'formatos', 'm'),
          values: {
            small: noun('obra pequeña', 'obras pequeñas', 'f'),
            medium: noun('obra mediana', 'obras medianas', 'f'),
            large: noun('obra grande', 'obras grandes', 'f'),
            study: noun('estudio', 'estudios', 'm'),
          },
        },
      },
      labels: [],
    },
  },
};
