import { Theme } from './index.js';
import { noun, pred, predInv, LabelSpec } from '../i18n/index.js';

const T = (t: string, g: 'm' | 'f'): LabelSpec => ({ text: t, g });

export const coldopen: Theme = {
  id: 'coldopen',
  labelMode: 'title',
  tagSchema: { act: ['i', 'ii', 'iii'] },
  artKind: 'frame',
  skinClass: 'skin-coldopen',
  palette: {
    mood: 'light',
    bg: '#a97f4a', surface: '#f6efdd', surfaceAlt: '#fbf7ea',
    ink: '#241f14', inkSoft: '#4b4232', line: '#8a6737',
    tile: '#fbf7ea', tileInk: '#2c3550', tileLine: '#ded2b4',
    accent: '#c8342a', stateA: '#2f6f57', stateB: '#8a8a8a',
  },
  fonts: { display: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive', body: 'system-ui, -apple-system, sans-serif', mono: '"Courier New", ui-monospace, monospace' },
  strings: {
    en: {
      title: 'Cold Open',
      tagline: 'A corkboard of scenes. Half of them never happened.',
      tile: noun('scene', 'scenes', 'f'),
      states: {
        a: { name: 'Canon', collective: noun('canon scene', 'canon scenes', 'f'), adj: predInv('canon', 'canon'), pred: predInv('is canon', 'are canon') },
        b: { name: 'Cut', collective: noun('cut scene', 'cut scenes', 'f'), adj: predInv('cut', 'cut'), pred: predInv('was cut', 'were cut') },
      },
      tags: {
        act: { label: noun('act', 'acts', 'm'), values: { i: noun('Act I scene', 'Act I scenes', 'f'), ii: noun('Act II scene', 'Act II scenes', 'f'), iii: noun('Act III scene', 'Act III scenes', 'f') } },
      },
      labels: [T('Rooftop, dawn', 'f'), T('She burns the letter', 'f'), T('Diner, 2am', 'f'), T('He lies to the sister', 'f'), T('The boat', 'f'), T('Voicemail #3', 'f'), T('Car park standoff', 'f'), T('The key changes hands', 'f'), T('Hospital corridor', 'f'), T('Rain, no dialogue', 'f'), T('She reads the file', 'f'), T('Final call', 'f'), T('Wake, exterior', 'f'), T('Last shot: hands', 'f'), T('The wrong address', 'f'), T('Two coffees', 'f'), T('Border crossing', 'f'), T('He deletes it', 'f'), T('The tape plays', 'f'), T('Nobody answers', 'f'), T('Empty office', 'f'), T('She misses the train', 'f'), T('One ring', 'f'), T('The photograph', 'f')],
      flourishes: ['Continuity: {s}', 'Script note — {s}', 'From the production memo: {s}', 'Editor: {s}'],
    },
    pt: {
      title: 'Abertura Fria',
      tagline: 'Um quadro de cenas. Metade nunca aconteceu.',
      tile: noun('cena', 'cenas', 'f'),
      states: {
        a: { name: 'Cânone', collective: noun('cena canônica', 'cenas canônicas', 'f'), adj: pred('canônico', 'canônica', 'canônicos', 'canônicas'), pred: pred('é canônico', 'é canônica', 'são canônicos', 'são canônicas') },
        b: { name: 'Cortada', collective: noun('cena cortada', 'cenas cortadas', 'f'), adj: pred('cortado', 'cortada', 'cortados', 'cortadas'), pred: pred('foi cortado', 'foi cortada', 'foram cortados', 'foram cortadas') },
      },
      tags: {
        act: { label: noun('ato', 'atos', 'm'), values: { i: noun('cena do Ato I', 'cenas do Ato I', 'f'), ii: noun('cena do Ato II', 'cenas do Ato II', 'f'), iii: noun('cena do Ato III', 'cenas do Ato III', 'f') } },
      },
      labels: [T('Terraço, amanhecer', 'f'), T('Ela queima a carta', 'f'), T('Lanchonete, 2h', 'f'), T('Ele mente para a irmã', 'f'), T('O barco', 'f'), T('Recado de voz nº3', 'f'), T('Impasse no estacionamento', 'f'), T('A chave troca de mãos', 'f'), T('Corredor do hospital', 'f'), T('Chuva, sem diálogo', 'f'), T('Ela lê o dossiê', 'f'), T('Última ligação', 'f'), T('Velório, externa', 'f'), T('Último plano: mãos', 'f'), T('O endereço errado', 'f'), T('Dois cafés', 'f'), T('Travessia de fronteira', 'f'), T('Ele apaga tudo', 'f'), T('A fita toca', 'f'), T('Ninguém atende', 'f'), T('Escritório vazio', 'f'), T('Ela perde o trem', 'f'), T('Um toque', 'f'), T('A fotografia', 'f')],
      flourishes: ['Continuidade: {s}', 'Nota de roteiro — {s}', 'Do memorando de produção: {s}', 'Montagem: {s}'],
    },
    es: {
      title: 'Arranque en Frío',
      tagline: 'Un corcho lleno de escenas. La mitad nunca ocurrió.',
      tile: noun('escena', 'escenas', 'f'),
      states: {
        a: { name: 'Canon', collective: noun('escena canónica', 'escenas canónicas', 'f'), adj: pred('canónico', 'canónica', 'canónicos', 'canónicas'), pred: pred('es canónico', 'es canónica', 'son canónicos', 'son canónicas') },
        b: { name: 'Cortada', collective: noun('escena cortada', 'escenas cortadas', 'f'), adj: pred('cortado', 'cortada', 'cortados', 'cortadas'), pred: pred('fue cortado', 'fue cortada', 'fueron cortados', 'fueron cortadas') },
      },
      tags: {
        act: { label: noun('acto', 'actos', 'm'), values: { i: noun('escena del Acto I', 'escenas del Acto I', 'f'), ii: noun('escena del Acto II', 'escenas del Acto II', 'f'), iii: noun('escena del Acto III', 'escenas del Acto III', 'f') } },
      },
      labels: [T('Azotea, amanecer', 'f'), T('Ella quema la carta', 'f'), T('Cafetería, 2am', 'f'), T('Le miente a la hermana', 'f'), T('El barco', 'f'), T('Mensaje de voz n.º3', 'f'), T('Enfrentamiento en el garaje', 'f'), T('La llave cambia de manos', 'f'), T('Pasillo del hospital', 'f'), T('Lluvia, sin diálogo', 'f'), T('Ella lee el expediente', 'f'), T('Última llamada', 'f'), T('Velatorio, exterior', 'f'), T('Último plano: manos', 'f'), T('La dirección equivocada', 'f'), T('Dos cafés', 'f'), T('Cruce de frontera', 'f'), T('Él lo borra', 'f'), T('Suena la cinta', 'f'), T('Nadie contesta', 'f'), T('Oficina vacía', 'f'), T('Ella pierde el tren', 'f'), T('Un timbre', 'f'), T('La fotografía', 'f')],
      flourishes: ['Continuidad: {s}', 'Nota de guion — {s}', 'Del memo de producción: {s}', 'Montaje: {s}'],
    },
  },
};
