import { Theme } from './index.js';
import { noun, pred, predInv, LabelSpec } from '../i18n/index.js';

const N = (t: string, g: 'm' | 'f'): LabelSpec => ({ text: t, g });

/** The classic binary, done straight: a room of people, some of whom did it.
 *  Kept deliberately close to the original's framing so the engine has an obvious
 *  reference implementation — everything visual about it is still ours. */
export const guestlist: Theme = {
  id: 'guestlist',
  labelMode: 'name',
  tagSchema: { role: ['host', 'family', 'neighbour', 'staff'] },
  artKind: 'portrait',
  skinClass: 'skin-guestlist',
  palette: {
    mood: 'dark',
    bg: '#151a26', surface: '#1d2434', surfaceAlt: '#252d40',
    ink: '#ece4d6', inkSoft: '#8d93a6', line: '#333c52',
    tile: '#f3ece0', tileInk: '#1d2434', tileLine: '#c8bda9',
    accent: '#d9a441', stateA: '#3f7f6b', stateB: '#b8353a',
    glow: 'rgba(217,164,65,.30)',
  },
  fonts: {
    display: '"Playfair Display", Didot, Georgia, serif',
    body: 'system-ui, -apple-system, sans-serif',
    mono: 'ui-monospace, Menlo, monospace',
  },
  strings: {
    en: {
      title: 'The Guest List',
      tagline: 'Twenty people at one address. Everyone tells the truth. Someone is still guilty.',
      tile: noun('guest', 'guests', 'm'),
      states: {
        a: {
          name: 'Innocent',
          collective: noun('innocent guest', 'innocent guests', 'm'),
          adj: predInv('innocent', 'innocent'),
          pred: predInv('is innocent', 'are innocent'),
        },
        b: {
          name: 'Guilty',
          collective: noun('guilty guest', 'guilty guests', 'm'),
          adj: predInv('guilty', 'guilty'),
          pred: predInv('is guilty', 'are guilty'),
        },
      },
      tags: {
        role: {
          label: noun('table', 'tables', 'f'),
          values: {
            host: noun('host', 'hosts', 'm'),
            family: noun('relative', 'relatives', 'm'),
            neighbour: noun('neighbour', 'neighbours', 'm'),
            staff: noun('member of staff', 'staff', 'm'),
          },
        },
      },
      labels: [N('Nadia', 'f'), N('Owen', 'm'), N('Priya', 'f'), N('Dev', 'm'), N('Tomas', 'm'), N('June', 'f'), N('Karim', 'm'), N('Sallie', 'f'), N('Marco', 'm'), N('Ruth', 'f'), N('Lin', 'f'), N('Aidan', 'm'), N('Greta', 'f'), N('Hugo', 'm'), N('Cora', 'f'), N('Wes', 'm'), N('Bea', 'f'), N('Ivan', 'm'), N('Noor', 'f'), N('Sam', 'm'), N('Elke', 'f'), N('Ross', 'm'), N('Tess', 'f'), N('Otto', 'm')],
    },
    pt: {
      title: 'A Lista de Convidados',
      tagline: 'Vinte pessoas no mesmo endereço. Todo mundo fala a verdade. Alguém continua culpado.',
      tile: noun('convidado', 'convidados', 'm'),
      states: {
        a: {
          name: 'Inocente',
          collective: noun('inocente', 'inocentes', 'm'),
          adj: predInv('inocente', 'inocentes'),
          pred: predInv('é inocente', 'são inocentes'),
        },
        b: {
          name: 'Culpado',
          collective: noun('culpado', 'culpados', 'm'),
          adj: pred('culpado', 'culpada', 'culpados', 'culpadas'),
          pred: pred('é culpado', 'é culpada', 'são culpados', 'são culpadas'),
        },
      },
      tags: {
        role: {
          label: noun('mesa', 'mesas', 'f'),
          values: {
            host: noun('anfitrião', 'anfitriões', 'm'),
            family: noun('parente', 'parentes', 'm'),
            neighbour: noun('vizinho', 'vizinhos', 'm'),
            staff: noun('funcionário', 'funcionários', 'm'),
          },
        },
      },
      labels: [N('Nádia', 'f'), N('Otávio', 'm'), N('Priscila', 'f'), N('Davi', 'm'), N('Tomás', 'm'), N('Juna', 'f'), N('Caio', 'm'), N('Sálvia', 'f'), N('Marco', 'm'), N('Rute', 'f'), N('Lina', 'f'), N('Aldo', 'm'), N('Greta', 'f'), N('Hugo', 'm'), N('Cora', 'f'), N('Vitor', 'm'), N('Bia', 'f'), N('Ivan', 'm'), N('Nara', 'f'), N('Samir', 'm'), N('Elza', 'f'), N('Rui', 'm'), N('Tessa', 'f'), N('Otto', 'm')],
    },
    es: {
      title: 'La Lista de Invitados',
      tagline: 'Veinte personas en la misma dirección. Todos dicen la verdad. Alguien sigue siendo culpable.',
      tile: noun('invitado', 'invitados', 'm'),
      states: {
        a: {
          name: 'Inocente',
          collective: noun('inocente', 'inocentes', 'm'),
          adj: predInv('inocente', 'inocentes'),
          pred: predInv('es inocente', 'son inocentes'),
        },
        b: {
          name: 'Culpable',
          collective: noun('culpable', 'culpables', 'm'),
          adj: predInv('culpable', 'culpables'),
          pred: predInv('es culpable', 'son culpables'),
        },
      },
      tags: {
        role: {
          label: noun('mesa', 'mesas', 'f'),
          values: {
            host: noun('anfitrión', 'anfitriones', 'm'),
            family: noun('pariente', 'parientes', 'm'),
            neighbour: noun('vecino', 'vecinos', 'm'),
            staff: noun('empleado', 'empleados', 'm'),
          },
        },
      },
      labels: [N('Nadia', 'f'), N('Octavio', 'm'), N('Priscila', 'f'), N('David', 'm'), N('Tomás', 'm'), N('Juana', 'f'), N('Karim', 'm'), N('Salomé', 'f'), N('Marco', 'm'), N('Rut', 'f'), N('Lina', 'f'), N('Aldo', 'm'), N('Greta', 'f'), N('Hugo', 'm'), N('Cora', 'f'), N('Wenceslao', 'm'), N('Bea', 'f'), N('Iván', 'm'), N('Nuria', 'f'), N('Samuel', 'm'), N('Elsa', 'f'), N('Rosendo', 'm'), N('Tesa', 'f'), N('Otto', 'm')],
    },
  },
};
