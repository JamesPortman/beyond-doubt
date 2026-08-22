import { Clue, Selector } from '../core/clue.js';
import { Locale, Phrase, RenderContext, agree, cap, Gender, Term, TermId } from './index.js';
import { selectorSize } from './glossary.js';

const COLS = ['A', 'B', 'C', 'D', 'E', 'F'];
/** Spanish inflects only "uno" for gender, and apocopates it to "un" before a noun. */
const WORDS = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
const num = (n: number, g: Gender, standalone = false) => {
  if (n === 1) return g === 'f' ? 'una' : standalone ? 'uno' : 'un';
  return n <= 10 ? WORDS[n] : String(n);
};
const art = (g: Gender, pl: boolean) => (g === 'f' ? (pl ? 'las' : 'la') : pl ? 'los' : 'el');
const todos = (g: Gender) => (g === 'f' ? 'todas las' : 'todos los');
const todosPron = (g: Gender) => (g === 'f' ? 'todas' : 'todos');
const ninguno = (g: Gender, standalone: boolean) => (g === 'f' ? 'ninguna' : standalone ? 'ninguno' : 'ningún');
const o_a = (g: Gender) => (g === 'f' ? 'a' : 'o');

function phrase(sel: Selector, ctx: RenderContext): Phrase {
  const t = ctx.theme;
  const L = (i: number) => ctx.labels[i].text;
  const P = (bare: string, lead: string, g: Gender = t.tile.g, pron = false): Phrase =>
    ({ bare, lead, g, pronominal: pron });
  switch (sel.k) {
    case 'all': return P('el tablero entero', 'En total');
    case 'row': return P(`la fila ${sel.r + 1}`, `En la fila ${sel.r + 1}`);
    case 'col': return P(`la columna ${COLS[sel.c]}`, `En la columna ${COLS[sel.c]}`);
    case 'corners': return P('las cuatro esquinas', 'Entre las cuatro esquinas', t.tile.g, true);
    case 'edges': return P('el borde exterior', 'En el borde exterior');
    case 'interior': return P('el interior', 'Lejos del borde');
    case 'neighbors': return P(`los vecinos de ${L(sel.i)}`, `Entre los vecinos de ${L(sel.i)}`, t.tile.g, true);
    case 'ortho': return P(`las casillas justo al lado de ${L(sel.i)}`, `Justo al lado de ${L(sel.i)}`);
    case 'between': return P(`las casillas estrictamente entre ${L(sel.i)} y ${L(sel.j)}`, `Estrictamente entre ${L(sel.i)} y ${L(sel.j)}`);
    case 'cell': return P(L(sel.i), `Solo para ${L(sel.i)}`);
    case 'tag': {
      const v = ctx.theme.tags[sel.key]?.values[sel.value];
      const g = v?.g ?? 'm';
      const p = v ? v.p : sel.value;
      return P(`${art(g, true)} ${p}`, `Entre ${art(g, true)} ${p}`, g, true);
    }
  }
}

function clue(c: Clue, ctx: RenderContext): string {
  const t = ctx.theme;
  const st = (s: 0 | 1) => (s === 1 ? t.states.b : t.states.a);
  const L = (i: number) => ctx.labels[i].text;

  switch (c.k) {
    case 'count': {
      const ph = phrase(c.sel, ctx);
      const S = st(c.state);
      const one = c.n === 1;
      const subj = ph.pronominal ? '' : ` ${one ? t.tile.s : t.tile.p}`;
      const verb = (pl: boolean) => agree(S.pred, ph.g, pl);
      const N = num(c.n, ph.g, ph.pronominal);
      switch (c.cmp) {
        case 'eq': return `${ph.lead}, exactamente ${N}${subj} ${verb(!one)}.`;
        case 'atLeast': return `${ph.lead}, al menos ${N}${subj} ${verb(!one)}.`;
        case 'atMost': return `${ph.lead}, como máximo ${N}${subj} ${verb(!one)}.`;
        case 'none': return ph.pronominal
          ? `${ph.lead}, ${ninguno(ph.g, true)} ${verb(false)}.`
          : `${ph.lead}, ${ninguno(ph.g, false)} ${t.tile.s} ${verb(false)}.`;
        case 'all': return ph.pronominal
          ? `${ph.lead}, ${todosPron(ph.g)} ${verb(true)}.`
          : `${ph.lead}, ${todos(ph.g)} ${t.tile.p} ${verb(true)}.`;
      }
      break;
    }
    case 'compare': {
      const a = phrase(c.a, ctx), b = phrase(c.b, ctx);
      return `${cap(a.bare)} tiene más ${st(c.state).collective.p} que ${b.bare}.`;
    }
    case 'implies':
      return `Si ${L(c.i)} ${agree(st(c.si).pred, ctx.labels[c.i].g, false)}, entonces ${L(c.j)} ${agree(st(c.sj).pred, ctx.labels[c.j].g, false)}.`;
    case 'exactlyOneOf':
      return `Exactamente uno entre ${L(c.i)} y ${L(c.j)} ${agree(st(c.state).pred, 'm', false)}.`;
    case 'sameState':
      return `${L(c.i)} y ${L(c.j)} están del mismo lado.`;
    case 'differentState':
      return `${L(c.i)} y ${L(c.j)} están en lados opuestos.`;
    case 'nearest': {
      const S = st(c.state), g = t.tile.g;
      return `${cap(art(g, false))} ${t.tile.s} ${agree(S.adj, g, false)} más cercan${o_a(g)} a ${L(c.i)} está a exactamente ${num(c.d, 'm', true)} ${c.d === 1 ? 'paso' : 'pasos'}, contando diagonales.`;
    }
    case 'connected': {
      const col = st(c.state).collective;
      return `${cap(todos(col.g))} ${col.p} forman un único grupo conectado — arriba, abajo, izquierda, derecha, nunca en diagonal.`;
    }
    case 'uniqueMost': {
      const grp = t.tags[c.key];
      const v = grp?.values[c.value];
      const g = v?.g ?? 'm';
      return `${cap(art(g, true))} ${v ? v.p : c.value} tienen estrictamente más ${st(c.state).collective.p} que cualquier otr${o_a(grp?.label.g ?? 'm')} ${grp ? grp.label.s : c.key}.`;
    }
  }
  return '';
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const deEllas = (g: Gender) => (g === 'f' ? 'de ellas' : 'de ellos');

function explain(c: Clue, ctx: RenderContext): string {
  const t = ctx.theme;
  const st = (x: 0 | 1) => (x === 1 ? t.states.b : t.states.a);
  const L = (i: number) => ctx.labels[i].text;
  switch (c.k) {
    case 'count': {
      const ph = phrase(c.sel, ctx);
      const size = selectorSize(c.sel, ctx.w, ctx.h);
      const head = size === null ? `${ph.lead}:` : `${ph.lead} hay ${size} ${t.tile.p}.`;
      const verbP = agree(st(c.state).pred, ph.g, true);
      const verbS = agree(st(c.state).pred, ph.g, false);
      const D = deEllas(ph.g);
      switch (c.cmp) {
        case 'eq': return `${head} El número ${D} que ${verbP} es exactamente ${num(c.n, ph.g, true)} — ni uno más, ni uno menos.`;
        case 'atLeast': return `${head} Al menos ${num(c.n, ph.g, true)} ${D} ${verbP}. Puede haber más.`;
        case 'atMost': return `${head} Como máximo ${num(c.n, ph.g, true)} ${D} ${verbP}. Puede haber menos, incluso ${ninguno(ph.g, true)}.`;
        case 'none': return `${head} ${cap(ninguno(ph.g, true))} ${D} ${verbS}.`;
        case 'all': return `${head} Absolutamente ${todosPron(ph.g)} ${verbP}, sin excepción.`;
      }
      break;
    }
    case 'compare': {
      const a = phrase(c.a, ctx), b = phrase(c.b, ctx);
      return `${cap(a.bare)} tiene estrictamente más ${st(c.state).collective.p} que ${b.bare}. Un empate lo haría falso.`;
    }
    case 'implies':
      return `Si ${L(c.i)} ${agree(st(c.si).pred, ctx.labels[c.i].g, false)}, entonces ${L(c.j)} también tiene que estarlo. Pero si ${L(c.i)} no lo está, la pista no dice absolutamente nada sobre ${L(c.j)}.`;
    case 'exactlyOneOf':
      return `Uno entre ${L(c.i)} y ${L(c.j)} ${agree(st(c.state).pred, 'm', false)} y el otro no. Nunca los dos, nunca ninguno.`;
    case 'sameState':
      return `${L(c.i)} y ${L(c.j)} coinciden: o los dos ${agree(st(0).pred, 'm', true)}, o los dos ${agree(st(1).pred, 'm', true)}.`;
    case 'differentState':
      return `${L(c.i)} y ${L(c.j)} no coinciden: uno de cada, aunque la pista no dice cuál es cuál.`;
    case 'nearest':
      return `Todo lo que está a menos de ${num(c.d, 'm', true)} ${c.d === 1 ? 'paso' : 'pasos'} de ${L(c.i)} está libre de ${st(c.state).collective.p}, y a exactamente ${num(c.d, 'm', true)} ${c.d === 1 ? 'paso' : 'pasos'} hay al menos uno. La diagonal cuenta como un paso.`;
    case 'connected':
      return `Se puede caminar de cualquier ${st(c.state).collective.s} a cualquier otro moviéndose solo arriba, abajo, izquierda y derecha, sin salir del grupo. Tocarse solo en diagonal no vale.`;
    case 'uniqueMost': {
      const g = t.tags[c.key];
      const v = g?.values[c.value];
      return `${cap(art((v?.g ?? 'm'), true))} ${v ? v.p : c.value} tienen más ${st(c.state).collective.p} que cualquier otr${o_a(g?.label.g ?? 'm')} ${g ? g.label.s : c.key} — estrictamente más, así que un empate lo haría falso.`;
    }
  }
  return '';
}

const glossary: Record<TermId, Term> = {
  truth: { term: 'Todos dicen la verdad', def: 'Todas las pistas del tablero son verdaderas, incluidas las que revela una casilla que resulta estar en el estado marcado. Aquí nadie miente.' },
  neighbours: { term: 'Vecinos', def: 'Las casillas que tocan a una ficha por cualquier lado, diagonales incluidas — hasta 8, menos en un borde o una esquina. La ficha no es vecina de sí misma.' },
  ortho: { term: 'Justo al lado', def: 'Solo arriba, abajo, izquierda y derecha — hasta 4 casillas. Las diagonales no cuentan.' },
  row: { term: 'Fila', def: 'Una línea horizontal de casillas, numerada desde arriba.' },
  col: { term: 'Columna', def: 'Una línea vertical de casillas, con letras desde la izquierda.' },
  corners: { term: 'Esquinas', def: 'Las cuatro casillas de las esquinas del tablero, y solo esas.' },
  edges: { term: 'Borde exterior', def: 'Todas las casillas del anillo exterior del tablero, esquinas incluidas.' },
  interior: { term: 'Lejos del borde', def: 'Todas las casillas que no están en el anillo exterior.' },
  between: { term: 'Estrictamente entre', def: 'Las casillas de la línea recta que une dos fichas — horizontal, vertical o diagonal — sin contar las dos fichas de los extremos.' },
  connected: { term: 'Conectado', def: 'Una cadena sin cortes moviéndose arriba, abajo, izquierda o derecha. Dos casillas que solo se tocan en una esquina no están conectadas.' },
  exactly: { term: 'Exactamente', def: 'Ese número y ningún otro. Ni uno más, ni uno menos.' },
  atLeast: { term: 'Al menos', def: 'Esa cantidad o más. No descarta que haya más.' },
  atMost: { term: 'Como máximo', def: 'Esa cantidad o menos, incluso ninguna.' },
  none: { term: 'Ninguno', def: 'Cero. La pista los descarta todos, uno por uno.' },
  every: { term: 'Todos', def: 'Todos, sin ninguna excepción.' },
  most: { term: 'Más que cualquier otro', def: 'Estrictamente la mayor cantidad. Si dos grupos empatan a la cabeza, la pista es falsa.' },
  ifThen: { term: 'Si … entonces', def: 'Una promesa de un solo sentido. Cuando la primera parte es verdadera, la segunda también debe serlo; cuando la primera es falsa, la pista no dice nada.' },
  exactlyOne: { term: 'Exactamente uno entre', def: 'Uno de los dos, y solo uno. No los dos, y no ninguno.' },
  sameSide: { term: 'Del mismo lado', def: 'Las dos fichas comparten estado, pero la pista no dice cuál.' },
  oppositeSides: { term: 'En lados opuestos', def: 'Uno de cada, pero la pista no dice cuál es cuál.' },
  steps: { term: 'Pasos', def: 'Distancia contada en movimientos entre casillas, donde la diagonal cuenta como un paso, igual que la recta.' },
  group: { term: 'Grupo', def: 'Todas las fichas que comparten el atributo escrito en su cara, estén donde estén en el tablero.' },
};

export const es: Locale = {
  code: 'es', bcp47: 'es-419', dir: 'ltr',
  num: (n, g) => num(n, g),
  colName: (c) => COLS[c],
  clue,
  explain,
  glossary,
  ui: {
    play: 'Jugar', solo: 'Solo', daily: 'Diario', weekly: 'Edición semanal', leaderboard: 'Clasificación',
    hint: 'Pista', hintClue: 'Una pista que aún no has usado', hintCell: 'Esta ya se puede decidir',
    noHints: 'No quedan pistas',
    solved: 'Resuelto', timeLabel: 'Tiempo', scoreLabel: 'Puntos', streak: 'Racha',
    illegalMove: 'Eso todavía no se deduce',
    notDeducible: 'Nada lo obliga todavía — el juego nunca te pide adivinar',
    share: 'Compartir', copied: 'Copiado',
    markAs: 'Marcar como', clues: 'Pistas', openingClues: 'Se sabe desde el principio', unlockedBy: 'Revelado por',
    difficulty: 'Dificultad',
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    edition: 'Edición', rank: 'Puesto', player: 'Jugador', you: 'Tú', hintsUsed: 'Pistas', mistakes: 'Errores',
    noEntries: 'Aún no hay registros', thisWeek: 'Esta semana', allTime: 'Histórico',
    theme: 'Tema', language: 'Idioma', newGame: 'Tablero nuevo', restart: 'Reiniciar',
    splitClues: 'Pistas repartidas', yourClues: 'Tus pistas', playerN: 'Jugador',
    perfect: 'Perfecto — sin pistas, sin errores', solvedIn: 'Resuelto en', weeklyTotal: 'Total semanal',
    complete: 'Completo',
    shareCopy: 'Copiar resultado',
    shareSend: 'Compartir',
    shareImage: 'Guardar imagen',
    percentileTop: 'Top {n}% por tiempo',
    perfectShare: '{n}% lo resolvieron sin fallos',
    refuseTitle: 'Pruebas insuficientes',
    refuseBody: 'No puedes demostrar que {name} {pred} con lo que sabes.',
    refuseWhy: 'Existe al menos una disposición del tablero que cumple todas tus pistas en la que {name} {other}.',
    refuseShare: 'Compartir este tablero',
    refuseGo: 'Seguir',
    timePenalty: 'añadido por errores', adjustedTime: 'Tiempo ajustado',
    mistakeCost: '+1:00 cada',
    actions: {
      clearTags: 'Borrar marcas', inspect: 'Inspeccionar', showHint: 'Ver pista', settings: 'Ajustes',
      playTutorial: 'Ver tutorial', shareScenario: 'Compartir escenario',
      noTags: 'No hay anotaciones que borrar', linkCopied: 'Enlace copiado — quien lo abra recibe exactamente este tablero',
      shareBody: 'Juega este tablero',
    },
    tutorial: {
      title: 'Cómo funciona', next: 'Siguiente', skip: 'Saltar', done: 'Empezar a jugar',
      steps: [
        'Cada ficha esconde uno de dos estados. Tu tarea es deducir cuál — nunca adivinar.',
        'Empieza por las pistas de la derecha. Toda pista es verdadera, incluidas las que vienen de una ficha en el estado marcado. Aquí nadie miente.',
        'Una ficha con un punto en la esquina ya está decidida por las pistas que tienes. Elige la etiqueta correcta encima del tablero y haz clic en ella. Elegir la etiqueta equivocada es el único error posible aquí, y suma un minuto a tu tiempo.',
        'Resolver una ficha libera lo que esa ficha sabía, así que la lista de pistas crece conforme avanzas. Ese es todo el ciclo.',
        'Prueba a hacer clic en una ficha sin punto. El tablero lo rechaza, porque nada la obliga todavía. Ese rechazo es la promesa: nunca se te pide adivinar.',
        'Haz clic derecho para dejar una anotación, y usa Inspeccionar cuando la palabra exacta de una pista importe. Eso es todo — ve a terminarlo.',
      ],
    },
    room: {
      title: 'Sala', create: 'Crear sala', join: 'Entrar', code: 'Código de sala',
      codeHint: 'Todos en la sala compiten en el mismo tablero, cada uno en su copia.',
      players: 'Jugadores', you: 'tú', finished: 'terminó', idle: 'ausente',
      copyInvite: 'Copiar invitación', looking: 'mirando', leave: 'Salir de la sala',
    },
    archive: {
      title: 'Archivo', subtitle: 'Todos los tableros publicados, hasta el día del estreno.',
      played: 'hecho', open: 'Abrir el archivo', back: 'Volver al archivo',
      completed: 'jugados', of: 'de', today: 'hoy', locked: 'todavía no',
      loading: 'Cargando el catálogo…',
    },
    settings: {
      title: 'Ajustes', done: 'Listo', reset: 'Volver a los valores por defecto',
      game: 'Juego', language: 'Idioma',
      font: 'Tipografía', fontTheme: 'La del tema', fontSans: 'Sin serifa', fontSerif: 'Con serifa',
      fontMono: 'Monoespaciada', fontReadable: 'Alta legibilidad',
      tagSide: 'Lado de la etiqueta', left: 'Izquierda', right: 'Derecha',
      autoClearPencil: 'Borrar anotaciones automáticamente',
    showFlavour: 'Comentarios',
    dimmed: 'Atenuado',
    hidden: 'Oculto',
    showSolvable: 'Marcar la casilla resoluble',
    onHint: 'Solo con pista',
      usedClues: 'Mostrar las pistas usadas como', normal: 'Normal', dim: 'Atenuadas', hide: 'Ocultas',
      hintButton: 'Botón de pista', enabled: 'Activado', confirm: 'Preguntar antes', disabled: 'Desactivado',
      appearance: 'Apariencia', followTheme: 'Seguir el tema', dark: 'Oscuro', light: 'Claro',
      colorMode: 'Modo de color', highContrast: 'Alto contraste', colorblind: 'Seguro para daltonismo',
      showTimer: 'Mostrar cronómetro', showLeaderboard: 'Mostrar clasificación',
      always: 'Siempre', onSolve: 'Al resolver', never: 'Nunca',
      tileArt: 'Ilustración de las fichas', reduceMotion: 'Reducir animación',
      undimAtEnd: 'Reactivar las pistas al final', on: 'Sí', off: 'No',
    },
    inspect: {
      title: 'Inspeccionar', help: 'Elige una pista para ver exactamente qué cubre y qué significa cada palabra.',
      meaning: 'Qué quiere decir', terms: 'Términos usados', covers: 'Casillas de las que habla',
      mentions: 'Pistas que mencionan esta ficha', nothing: 'Nada seleccionado todavía',
      whole: 'El tablero entero',
      close: 'Cerrar',
    },
  },
};
