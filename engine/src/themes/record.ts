import { Theme } from './index.js';
import { noun, pred, predInv } from '../i18n/index.js';

export const record: Theme = {
  id: 'record',
  labelMode: 'coord',
  tagSchema: { clearance: ['l1', 'l2', 'l3', 'l4'] },
  artKind: 'dossier',
  skinClass: 'skin-record',
  palette: {
    mood: 'dark',
    bg: '#07090c', surface: '#0d131a', surfaceAlt: '#111922',
    ink: '#9fdde2', inkSoft: '#4a6b78', line: '#1d2a36',
    tile: '#0f151b', tileInk: '#5fd0d8', tileLine: '#1d2a36',
    accent: '#5fd0d8', stateA: '#3f8f7a', stateB: '#d8544a',
    glow: 'rgba(95,208,216,.20)',
  },
  fonts: { display: 'ui-monospace, "SF Mono", Menlo, monospace', body: 'ui-monospace, "SF Mono", Menlo, monospace', mono: 'ui-monospace, Menlo, monospace' },
  strings: {
    en: {
      title: 'Record of Service',
      tagline: 'Everyone is telling the truth. That is the problem.',
      tile: noun('file', 'files', 'm'),
      states: {
        a: { name: 'Cleared', collective: noun('cleared file', 'cleared files', 'm'), adj: predInv('cleared', 'cleared'), pred: predInv('is cleared', 'are cleared') },
        b: { name: 'Flagged', collective: noun('flagged file', 'flagged files', 'm'), adj: predInv('flagged', 'flagged'), pred: predInv('is flagged', 'are flagged') },
      },
      tags: {
        clearance: {
          label: noun('clearance band', 'clearance bands', 'f'),
          values: { l1: noun('Band I file', 'Band I files', 'm'), l2: noun('Band II file', 'Band II files', 'm'), l3: noun('Band III file', 'Band III files', 'm'), l4: noun('Band IV file', 'Band IV files', 'm') },
        },
      },
      labels: [],
      flourishes: ['Per §2.1 — {s}', 'Disclosure 4(b): {s}', 'Audit note — {s}', 'Filed under review: {s}'],
    },
    pt: {
      title: 'Registro de Serviço',
      tagline: 'Todo mundo está falando a verdade. Esse é o problema.',
      tile: noun('ficha', 'fichas', 'f'),
      states: {
        a: { name: 'Liberada', collective: noun('ficha liberada', 'fichas liberadas', 'f'), adj: pred('liberado', 'liberada', 'liberados', 'liberadas'), pred: pred('está liberado', 'está liberada', 'estão liberados', 'estão liberadas') },
        b: { name: 'Sinalizada', collective: noun('ficha sinalizada', 'fichas sinalizadas', 'f'), adj: pred('sinalizado', 'sinalizada', 'sinalizados', 'sinalizadas'), pred: pred('está sinalizado', 'está sinalizada', 'estão sinalizados', 'estão sinalizadas') },
      },
      tags: {
        clearance: {
          label: noun('faixa de acesso', 'faixas de acesso', 'f'),
          values: { l1: noun('ficha da Faixa I', 'fichas da Faixa I', 'f'), l2: noun('ficha da Faixa II', 'fichas da Faixa II', 'f'), l3: noun('ficha da Faixa III', 'fichas da Faixa III', 'f'), l4: noun('ficha da Faixa IV', 'fichas da Faixa IV', 'f') },
        },
      },
      labels: [],
      flourishes: ['Conforme §2.1 — {s}', 'Divulgação 4(b): {s}', 'Nota de auditoria — {s}', 'Registrado em revisão: {s}'],
    },
    es: {
      title: 'Registro de Servicio',
      tagline: 'Todos dicen la verdad. Ese es el problema.',
      tile: noun('ficha', 'fichas', 'f'),
      states: {
        a: { name: 'Aprobada', collective: noun('ficha aprobada', 'fichas aprobadas', 'f'), adj: pred('aprobado', 'aprobada', 'aprobados', 'aprobadas'), pred: pred('está aprobado', 'está aprobada', 'están aprobados', 'están aprobadas') },
        b: { name: 'Marcada', collective: noun('ficha marcada', 'fichas marcadas', 'f'), adj: pred('marcado', 'marcada', 'marcados', 'marcadas'), pred: pred('está marcado', 'está marcada', 'están marcados', 'están marcadas') },
      },
      tags: {
        clearance: {
          label: noun('banda de acceso', 'bandas de acceso', 'f'),
          values: { l1: noun('ficha de Banda I', 'fichas de Banda I', 'f'), l2: noun('ficha de Banda II', 'fichas de Banda II', 'f'), l3: noun('ficha de Banda III', 'fichas de Banda III', 'f'), l4: noun('ficha de Banda IV', 'fichas de Banda IV', 'f') },
        },
      },
      labels: [],
      flourishes: ['Según §2.1 — {s}', 'Divulgación 4(b): {s}', 'Nota de auditoría — {s}', 'Registrado en revisión: {s}'],
    },
  },
};
