import { Theme } from './index.js';
import { noun, pred, predInv } from '../i18n/index.js';

/** Note the tile noun: "tree" is neuter-ish in English, FEMININE in Portuguese (a árvore)
 *  and MASCULINE in Spanish (el árbol). Every adjective in every clue has to follow that,
 *  which is exactly why the engine never builds sentences by concatenation. */
export const orchard: Theme = {
  id: 'orchard',
  labelMode: 'coord',
  tagSchema: { variety: ['spy', 'russet', 'cortland', 'mcintosh'] },
  artKind: 'tree',
  skinClass: 'skin-orchard',
  palette: {
    mood: 'light',
    bg: '#f0e7d4', surface: '#f8f3e6', surfaceAlt: '#efe6d2',
    ink: '#33291c', inkSoft: '#7a6a51', line: '#ddcda9',
    tile: '#f7f1e2', tileInk: '#33291c', tileLine: '#d3c19b',
    accent: '#d2601a', stateA: '#3f7a4f', stateB: '#d2601a',
  },
  fonts: { display: '"Arial Black", Impact, sans-serif', body: 'system-ui, -apple-system, sans-serif', mono: 'ui-monospace, Menlo, monospace' },
  strings: {
    en: {
      title: 'The Orchard',
      tagline: 'Sixteen trees on a concession road. A blight is moving through them.',
      tile: noun('tree', 'trees', 'm'),
      states: {
        a: { name: 'Clean', collective: noun('clean tree', 'clean trees', 'm'), adj: predInv('healthy', 'healthy'), pred: predInv('is clean', 'are clean') },
        b: { name: 'Blighted', collective: noun('blighted tree', 'blighted trees', 'm'), adj: predInv('blighted', 'blighted'), pred: predInv('is blighted', 'are blighted') },
      },
      tags: {
        variety: {
          label: noun('variety', 'varieties', 'f'),
          values: { spy: noun('Northern Spy', 'Northern Spies', 'm'), russet: noun('Russet', 'Russets', 'm'), cortland: noun('Cortland', 'Cortlands', 'm'), mcintosh: noun('McIntosh', 'McIntoshes', 'm') },
        },
      },
      labels: [],
    },
    pt: {
      title: 'O Pomar',
      tagline: 'Dezesseis árvores na estrada vicinal. Uma praga está passando por elas.',
      tile: noun('árvore', 'árvores', 'f'),
      states: {
        a: { name: 'Sadia', collective: noun('árvore sadia', 'árvores sadias', 'f'), adj: pred('sadio', 'sadia', 'sadios', 'sadias'), pred: pred('está sadio', 'está sadia', 'estão sadios', 'estão sadias') },
        b: { name: 'Doente', collective: noun('árvore doente', 'árvores doentes', 'f'), adj: predInv('doente', 'doentes'), pred: predInv('está doente', 'estão doentes') },
      },
      tags: {
        variety: {
          label: noun('variedade', 'variedades', 'f'),
          values: { spy: noun('Northern Spy', 'Northern Spy', 'f'), russet: noun('Russet', 'Russet', 'f'), cortland: noun('Cortland', 'Cortland', 'f'), mcintosh: noun('McIntosh', 'McIntosh', 'f') },
        },
      },
      labels: [],
    },
    es: {
      title: 'El Huerto',
      tagline: 'Dieciséis árboles junto al camino. Una plaga se mueve entre ellos.',
      tile: noun('árbol', 'árboles', 'm'),
      states: {
        a: { name: 'Sano', collective: noun('árbol sano', 'árboles sanos', 'm'), adj: pred('sano', 'sana', 'sanos', 'sanas'), pred: pred('está sano', 'está sana', 'están sanos', 'están sanas') },
        b: { name: 'Enfermo', collective: noun('árbol enfermo', 'árboles enfermos', 'm'), adj: pred('enfermo', 'enferma', 'enfermos', 'enfermas'), pred: pred('está enfermo', 'está enferma', 'están enfermos', 'están enfermas') },
      },
      tags: {
        variety: {
          label: noun('variedad', 'variedades', 'f'),
          values: { spy: noun('Northern Spy', 'Northern Spy', 'm'), russet: noun('Russet', 'Russet', 'm'), cortland: noun('Cortland', 'Cortland', 'm'), mcintosh: noun('McIntosh', 'McIntosh', 'm') },
        },
      },
      labels: [],
    },
  },
};
