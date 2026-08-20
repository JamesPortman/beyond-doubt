import { Theme } from './index.js';
import { noun, pred, predInv } from '../i18n/index.js';

export const plate19: Theme = {
  id: 'plate19',
  labelMode: 'coord',
  tagSchema: { band: ['blue', 'visual', 'red', 'infrared'] },
  artKind: 'starfield',
  skinClass: 'skin-plate19',
  palette: {
    mood: 'dark',
    bg: '#0b0c10', surface: '#12151b', surfaceAlt: '#171c24',
    ink: '#cfd6e2', inkSoft: '#7c8698', line: '#222835',
    tile: '#101318', tileInk: '#b9c2d2', tileLine: '#262d3a',
    accent: '#e8c46a', stateA: '#4a5568', stateB: '#e8c46a',
    glow: 'rgba(232,196,106,.35)',
  },
  fonts: { display: '"Avenir Next", Futura, system-ui, sans-serif', body: 'system-ui, -apple-system, sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, monospace' },
  strings: {
    en: {
      title: 'Plate 19',
      tagline: 'A glass plate of a sky that should have nothing in it.',
      tile: noun('field', 'fields', 'm'),
      states: {
        a: { name: 'Artefact', collective: noun('empty field', 'empty fields', 'm'), adj: predInv('empty', 'empty'), pred: predInv('holds only plate artefact', 'hold only plate artefact') },
        b: { name: 'Source', collective: noun('real source', 'real sources', 'm'), adj: predInv('occupied', 'occupied'), pred: predInv('holds a real source', 'hold a real source') },
      },
      tags: {
        band: {
          label: noun('band', 'bands', 'f'),
          values: { blue: noun('blue-band field', 'blue-band fields', 'm'), visual: noun('visual-band field', 'visual-band fields', 'm'), red: noun('red-band field', 'red-band fields', 'm'), infrared: noun('infrared field', 'infrared fields', 'm') },
        },
      },
      labels: [],
      flourishes: ['02:14 — {s}', '02:51 — {s}', '03:07 — {s}', '03:41 — {s}', '04:26 — {s}'],
    },
    pt: {
      title: 'Chapa 19',
      tagline: 'Uma chapa de vidro de um céu que deveria estar vazio.',
      tile: noun('campo', 'campos', 'm'),
      states: {
        a: { name: 'Artefato', collective: noun('campo vazio', 'campos vazios', 'm'), adj: pred('vazio', 'vazia', 'vazios', 'vazias'), pred: predInv('tem apenas artefato da chapa', 'têm apenas artefato da chapa') },
        b: { name: 'Fonte', collective: noun('fonte real', 'fontes reais', 'f'), adj: pred('ocupado', 'ocupada', 'ocupados', 'ocupadas'), pred: predInv('tem uma fonte real', 'têm uma fonte real') },
      },
      tags: {
        band: {
          label: noun('banda', 'bandas', 'f'),
          values: { blue: noun('campo da banda azul', 'campos da banda azul', 'm'), visual: noun('campo da banda visual', 'campos da banda visual', 'm'), red: noun('campo da banda vermelha', 'campos da banda vermelha', 'm'), infrared: noun('campo infravermelho', 'campos infravermelhos', 'm') },
        },
      },
      labels: [],
      flourishes: ['02h14 — {s}', '02h51 — {s}', '03h07 — {s}', '03h41 — {s}', '04h26 — {s}'],
    },
    es: {
      title: 'Placa 19',
      tagline: 'Una placa de vidrio de un cielo que debería estar vacío.',
      tile: noun('campo', 'campos', 'm'),
      states: {
        a: { name: 'Artefacto', collective: noun('campo vacío', 'campos vacíos', 'm'), adj: pred('vacío', 'vacía', 'vacíos', 'vacías'), pred: predInv('solo tiene artefacto de la placa', 'solo tienen artefacto de la placa') },
        b: { name: 'Fuente', collective: noun('fuente real', 'fuentes reales', 'f'), adj: pred('ocupado', 'ocupada', 'ocupados', 'ocupadas'), pred: predInv('tiene una fuente real', 'tienen una fuente real') },
      },
      tags: {
        band: {
          label: noun('banda', 'bandas', 'f'),
          values: { blue: noun('campo de banda azul', 'campos de banda azul', 'm'), visual: noun('campo de banda visual', 'campos de banda visual', 'm'), red: noun('campo de banda roja', 'campos de banda roja', 'm'), infrared: noun('campo infrarrojo', 'campos infrarrojos', 'm') },
        },
      },
      labels: [],
      flourishes: ['02:14 — {s}', '02:51 — {s}', '03:07 — {s}', '03:41 — {s}', '04:26 — {s}'],
    },
  },
};
