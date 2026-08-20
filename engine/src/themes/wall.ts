import { Theme } from './index.js';
import { noun, pred, predInv } from '../i18n/index.js';

export const wall: Theme = {
  id: 'wall',
  labelMode: 'numbered',
  tagSchema: { dealer: ['bruhn', 'marchetti', 'okonkwo', 'estate'] },
  artKind: 'painting',
  skinClass: 'skin-wall',
  palette: {
    mood: 'light',
    bg: '#efece5', surface: '#f8f6f0', surfaceAlt: '#fdfcf8',
    ink: '#241f1a', inkSoft: '#6e6459', line: '#d8d2c6',
    tile: '#6d3b3b', tileInk: '#f6f0e4', tileLine: '#b9963f',
    accent: '#b9963f', stateA: '#3f6b52', stateB: '#8f2f2f',
  },
  fonts: { display: 'Didot, "Bodoni MT", Georgia, serif', body: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, Menlo, monospace' },
  strings: {
    en: {
      title: 'The Wall',
      tagline: 'A salon hang of sixteen paintings. Some of them are lies.',
      tile: noun('painting', 'paintings', 'm'), labelPrefix: 'Lot',
      states: {
        a: { name: 'Authentic', collective: noun('authentic work', 'authentic works', 'm'), adj: predInv('authentic', 'authentic'), pred: predInv('is authentic', 'are authentic') },
        b: { name: 'Forged', collective: noun('forgery', 'forgeries', 'm'), adj: predInv('forged', 'forged'), pred: predInv('is forged', 'are forged') },
      },
      tags: {
        dealer: {
          label: noun('provenance', 'provenances', 'f'),
          values: { bruhn: noun('Bruhn picture', 'Bruhn pictures', 'm'), marchetti: noun('Marchetti picture', 'Marchetti pictures', 'm'), okonkwo: noun('Okonkwo picture', 'Okonkwo pictures', 'm'), estate: noun('estate picture', 'estate pictures', 'm') },
        },
      },
      labels: [],
    },
    pt: {
      title: 'A Parede',
      tagline: 'Dezesseis quadros na mesma parede. Alguns são mentira.',
      tile: noun('quadro', 'quadros', 'm'), labelPrefix: 'Lote',
      states: {
        a: { name: 'Autêntico', collective: noun('obra autêntica', 'obras autênticas', 'f'), adj: predInv('autêntico', 'autênticos'), pred: pred('é autêntico', 'é autêntica', 'são autênticos', 'são autênticas') },
        b: { name: 'Falso', collective: noun('falsificação', 'falsificações', 'f'), adj: pred('falso', 'falsa', 'falsos', 'falsas'), pred: pred('é falso', 'é falsa', 'são falsos', 'são falsas') },
      },
      tags: {
        dealer: {
          label: noun('procedência', 'procedências', 'f'),
          values: { bruhn: noun('quadro Bruhn', 'quadros Bruhn', 'm'), marchetti: noun('quadro Marchetti', 'quadros Marchetti', 'm'), okonkwo: noun('quadro Okonkwo', 'quadros Okonkwo', 'm'), estate: noun('quadro do espólio', 'quadros do espólio', 'm') },
        },
      },
      labels: [],
    },
    es: {
      title: 'La Pared',
      tagline: 'Dieciséis cuadros en la misma pared. Algunos son mentira.',
      tile: noun('cuadro', 'cuadros', 'm'), labelPrefix: 'Lote',
      states: {
        a: { name: 'Auténtico', collective: noun('obra auténtica', 'obras auténticas', 'f'), adj: pred('auténtico', 'auténtica', 'auténticos', 'auténticas'), pred: pred('es auténtico', 'es auténtica', 'son auténticos', 'son auténticas') },
        b: { name: 'Falso', collective: noun('falsificación', 'falsificaciones', 'f'), adj: pred('falso', 'falsa', 'falsos', 'falsas'), pred: pred('es falso', 'es falsa', 'son falsos', 'son falsas') },
      },
      tags: {
        dealer: {
          label: noun('procedencia', 'procedencias', 'f'),
          values: { bruhn: noun('cuadro Bruhn', 'cuadros Bruhn', 'm'), marchetti: noun('cuadro Marchetti', 'cuadros Marchetti', 'm'), okonkwo: noun('cuadro Okonkwo', 'cuadros Okonkwo', 'm'), estate: noun('cuadro de la herencia', 'cuadros de la herencia', 'm') },
        },
      },
      labels: [],
    },
  },
};
