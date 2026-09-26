import { Theme } from './index.js';
import { currentBase } from '../base.js';
import { noun, pred, predInv } from '../i18n/index.js';

/** The works in the set, in filename order, mirroring the visible catalogue on
 *  georgianartist.com — `id` is that site's product id, so a work can be traced back
 *  to the listing its picture came from when the catalogue next moves.
 *
 *  `title` is deliberately short: it is what the tile prints AND what a clue says when it
 *  names a work, so "Blue Mountain Sunrise", "Blue Mountain Sunset" and "Blue Mountain
 *  Trail" would all arrive on the board as "BLUE M…" and the puzzle would be unsolvable
 *  for reasons that have nothing to do with the puzzle. The full title survives in
 *  `full`, which Inspect shows the way a wall label does.
 *
 *  One thing the set deliberately does NOT mirror: the site lists "Autumn Canopy" and
 *  "Top of Blue Mountain" as two photographs of the same picture. Two tiles showing the
 *  same image under different names is the one thing a board that labels by title cannot
 *  survive, so only "Top of Blue Mountain" is here. */
const WORKS: { title: string; full: string; oil: boolean; id: string }[] = [
  { title: 'Council Beach', full: 'Council Beach', oil: true, id: 'council-beach' },
  { title: 'Lora Bay', full: 'Lora Bay', oil: true, id: 'lora-bay' },
  { title: 'Bruce Trail', full: 'Bruce Trail in the Grey Highlands', oil: true, id: 'bruce-trail' },
  { title: 'Epping', full: 'Bruce Trail at Epping', oil: true, id: 'bruce-trail-epping' },
  { title: 'Access Point', full: 'Beaver River: Access Point 2', oil: true, id: 'beaver-river-access' },
  { title: 'Alpine', full: 'Alpine Ski Club: Fall', oil: true, id: 'alpine-ski-fall' },
  { title: 'Inglis Falls', full: 'Inglis Falls, Owen Sound', oil: true, id: 'inglis-falls' },
  { title: 'Manitoulin', full: 'Manitoulin Island', oil: true, id: 'manitoulin-island' },
  { title: 'Killarney', full: 'Near Killarney', oil: true, id: 'near-killarney' },
  { title: 'Peasemarsh', full: 'Peasemarsh', oil: true, id: 'peasemarsh' },
  { title: 'Canola', full: 'Ravenna Canola', oil: true, id: 'ravenna-canola-painting' },
  { title: 'Scenic Caves', full: 'Scenic Caves', oil: true, id: 'scenic-caves' },
  { title: 'Singhampton', full: 'Singhampton', oil: true, id: 'singhampton' },
  { title: 'Northwinds', full: 'Northwinds Beach', oil: true, id: 'northwinds-beach' },
  { title: 'Sunrise', full: 'Blue Mountain Sunrise', oil: false, id: 'blue-mountain-sunrise' },
  { title: 'Sunset', full: 'Blue Mountain Sunset', oil: false, id: 'blue-mountain-sunset-2' },
  { title: 'The Trail', full: 'Blue Mountain Trail', oil: false, id: 'blue-mountain-trail' },
  { title: 'Bridal Veil', full: 'Bridal Veil Falls', oil: false, id: 'bridal-veil-falls' },
  { title: 'Delphi Point', full: 'Delphi Point', oil: false, id: 'delphi-point' },
  { title: 'Local Farm', full: 'Local Farm', oil: false, id: 'local-farm' },
  { title: 'Snowy Owl', full: 'Snowy Owl in Craigleith', oil: false, id: 'snowy-owl-in-craigleith' },
  { title: 'The Grotto', full: 'The Grotto', oil: false, id: 'the-grotto' },
  { title: 'The Summit', full: 'Top of Blue Mountain', oil: false, id: 'top-of-blue-mountain-photo' },
  { title: 'Twilight', full: 'Northwinds Beach Twilight', oil: false, id: 'northwinds-beach-twilight' },
];

export const gallery: Theme = {
  id: 'gallery',
  labelMode: 'artwork',
  tagSchema: { size: ['small', 'medium', 'large', 'study'] },
  artKind: 'painting',
  skinClass: 'skin-gallery',
  images: {
    count: WORKS.length,
    // currentBase() keeps the artwork reachable when the app is proxied at a subpath;
    // a bare /assets/... would resolve against the proxying site's own root.
    src: (n) => `${currentBase()}/assets/gallery/${String(n + 1).padStart(2, '0')}.webp`,
    title: (n) => WORKS[n].title,
    credit: (n) => {
      const w = WORKS[n];
      const medium = `James Portman, ${w.oil ? 'oil on canvas' : 'photograph'}`;
      // The full title only earns a repeat when the tile had to shorten it.
      return w.full === w.title ? medium : `${w.full} — ${medium}`;
    },
    // A red dot beside the lot is what the room actually does when something sells, and
    // it is the only mark in the set that leaves the picture itself alone.
    mark: 'dot',
    fixedCast: true,
  },
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
      title: 'Auction Night',
      tagline: 'Auction night on Georgian Bay. Work out which lots have already gone.',
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
      flavour: [
        'The auctioneer has had three coffees.',
        "Someone's phone has gone off twice.",
        'The wine is not very good.',
        'I came for the one with the owl in it.',
        'Is that a reserve or is he just pausing?',
        "My paddle is under someone's coat.",
        'I have already spent this money in my head.',
        'There is a draught from the loading door.',
      ],
      labels: [],
    },
    pt: {
      title: 'Noite de Leilão',
      tagline: 'Noite de leilão na Baía Georgiana. Descubra quais lotes já foram vendidos.',
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
      flavour: [
        'O leiloeiro já tomou três cafés.',
        'O telefone de alguém tocou duas vezes.',
        'O vinho não é grande coisa.',
        'Vim pela que tem a coruja.',
        'Isso é preço mínimo ou ele só fez uma pausa?',
        'Minha placa está debaixo do casaco de alguém.',
        'Já gastei esse dinheiro de cabeça.',
        'Está entrando vento pela porta de carga.',
      ],
      labels: [],
    },
    es: {
      title: 'Noche de Subasta',
      tagline: 'Noche de subasta en la bahía Georgian. Averigua qué lotes ya se vendieron.',
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
      flavour: [
        'El subastador lleva tres cafés.',
        'A alguien le ha sonado el móvil dos veces.',
        'El vino no es gran cosa.',
        'Vine por el del búho.',
        '¿Eso es precio de reserva o solo hizo una pausa?',
        'Mi paleta está debajo del abrigo de alguien.',
        'Ya me he gastado este dinero mentalmente.',
        'Entra corriente por la puerta de carga.',
      ],
      labels: [],
    },
  },
};
