import { Theme } from './index.js';
import { noun, pred, predInv, LabelSpec } from '../i18n/index.js';

const N = (t: string, g: 'm' | 'f'): LabelSpec => ({ text: t, g });

export const callboard: Theme = {
  id: 'callboard',
  labelMode: 'name',
  tagSchema: { dept: ['stage', 'wardrobe', 'sound', 'cast'] },
  artKind: 'portrait',
  artMono: true,
  skinClass: 'skin-callboard',
  palette: {
    mood: 'dark',
    // A stage-door callboard is painted steel, not warm cork: neutral greys throughout,
    // with the amber left only on the accent so the pinned notices still read as lit.
    bg: '#1f2123', surface: '#292c2f', surfaceAlt: '#33373a',
    ink: '#e8eaec', inkSoft: '#9aa0a5', line: '#3e4347',
    tile: '#e4e6e8', tileInk: '#26292b', tileLine: '#b0b5b9',
    accent: '#ffc46e', stateA: '#4e7d63', stateB: '#c0392b',
    glow: 'rgba(255,196,110,.22)',
  },
  fonts: { display: '"Courier New", ui-monospace, monospace', body: 'ui-monospace, "SF Mono", Menlo, monospace', mono: 'ui-monospace, Menlo, monospace' },
  strings: {
    en: {
      title: 'The Callboard',
      tagline: 'One hour to curtain, and somebody is cutting rope.',
      tile: noun('person', 'people', 'm'),
      states: {
        a: { name: 'In the show', collective: noun('company member', 'company members', 'm'), adj: predInv('loyal', 'loyal'), pred: predInv('is in the show', 'are in the show') },
        b: { name: 'Against it', collective: noun('saboteur', 'saboteurs', 'm'), adj: predInv('hostile', 'hostile'), pred: predInv('is working against the show', 'are working against the show') },
      },
      tags: {
        dept: {
          label: noun('department', 'departments', 'm'),
          values: { stage: noun('stage crew', 'stage crew', 'm'), wardrobe: noun('dresser', 'dressers', 'm'), sound: noun('sound tech', 'sound techs', 'm'), cast: noun('cast member', 'cast members', 'm') },
        },
      },
      labels: [N('Nadia', 'f'), N('Owen', 'm'), N('Priya', 'f'), N('Dev', 'm'), N('Tomas', 'm'), N('June', 'f'), N('Karim', 'm'), N('Sallie', 'f'), N('Marco', 'm'), N('Ruth', 'f'), N('Lin', 'f'), N('Aidan', 'm'), N('Greta', 'f'), N('Hugo', 'm'), N('Cora', 'f'), N('Wes', 'm'), N('Bea', 'f'), N('Ivan', 'm'), N('Noor', 'f'), N('Sam', 'm'), N('Elke', 'f'), N('Ross', 'm'), N('Tess', 'f'), N('Otto', 'm')],
    },
    pt: {
      title: 'O Quadro de Avisos',
      tagline: 'Uma hora para abrir, e alguém está cortando as cordas.',
      tile: noun('pessoa', 'pessoas', 'f'),
      states: {
        a: { name: 'Na montagem', collective: noun('integrante', 'integrantes', 'm'), adj: predInv('leal', 'leais'), pred: predInv('está na montagem', 'estão na montagem') },
        b: { name: 'Contra', collective: noun('sabotador', 'sabotadores', 'm'), adj: predInv('hostil', 'hostis'), pred: predInv('está trabalhando contra a montagem', 'estão trabalhando contra a montagem') },
      },
      tags: {
        dept: {
          label: noun('setor', 'setores', 'm'),
          values: { stage: noun('maquinista', 'maquinistas', 'm'), wardrobe: noun('camareira', 'camareiras', 'f'), sound: noun('técnico de som', 'técnicos de som', 'm'), cast: noun('ator', 'atores', 'm') },
        },
      },
      labels: [N('Nádia', 'f'), N('Otávio', 'm'), N('Priscila', 'f'), N('Davi', 'm'), N('Tomás', 'm'), N('Juna', 'f'), N('Caio', 'm'), N('Sálvia', 'f'), N('Marco', 'm'), N('Rute', 'f'), N('Lina', 'f'), N('Aldo', 'm'), N('Greta', 'f'), N('Hugo', 'm'), N('Cora', 'f'), N('Vitor', 'm'), N('Bia', 'f'), N('Ivan', 'm'), N('Nara', 'f'), N('Samir', 'm'), N('Elza', 'f'), N('Rui', 'm'), N('Tessa', 'f'), N('Otto', 'm')],
    },
    es: {
      title: 'El Tablón de Llamadas',
      tagline: 'Una hora para el estreno, y alguien está cortando cuerdas.',
      tile: noun('persona', 'personas', 'f'),
      states: {
        a: { name: 'En la función', collective: noun('integrante', 'integrantes', 'm'), adj: predInv('leal', 'leales'), pred: predInv('está en la función', 'están en la función') },
        b: { name: 'En contra', collective: noun('saboteador', 'saboteadores', 'm'), adj: predInv('hostil', 'hostiles'), pred: predInv('está saboteando la función', 'están saboteando la función') },
      },
      tags: {
        dept: {
          label: noun('área', 'áreas', 'f'),
          values: { stage: noun('tramoyista', 'tramoyistas', 'm'), wardrobe: noun('vestuarista', 'vestuaristas', 'm'), sound: noun('técnico de sonido', 'técnicos de sonido', 'm'), cast: noun('actor', 'actores', 'm') },
        },
      },
      labels: [N('Nadia', 'f'), N('Octavio', 'm'), N('Priscila', 'f'), N('David', 'm'), N('Tomás', 'm'), N('Juana', 'f'), N('Karim', 'm'), N('Salomé', 'f'), N('Marco', 'm'), N('Rut', 'f'), N('Lina', 'f'), N('Aldo', 'm'), N('Greta', 'f'), N('Hugo', 'm'), N('Cora', 'f'), N('Wenceslao', 'm'), N('Bea', 'f'), N('Iván', 'm'), N('Nuria', 'f'), N('Samuel', 'm'), N('Elsa', 'f'), N('Rosendo', 'm'), N('Tesa', 'f'), N('Otto', 'm')],
    },
  },
};
