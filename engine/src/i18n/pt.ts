import { Clue, Selector } from '../core/clue.js';
import { Locale, Phrase, RenderContext, agree, cap, Gender, Term, TermId } from './index.js';
import { selectorSize } from './glossary.js';

const COLS = ['A', 'B', 'C', 'D', 'E', 'F'];
/** Only 1 and 2 inflect for gender in Portuguese. */
const WORDS_M = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
const WORDS_F = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
const num = (n: number, g: Gender) => (n <= 10 ? (g === 'f' ? WORDS_F : WORDS_M)[n] : String(n));
const art = (g: Gender, pl: boolean) => (g === 'f' ? (pl ? 'as' : 'a') : pl ? 'os' : 'o');
const todos = (g: Gender) => (g === 'f' ? 'todas as' : 'todos os');
const todosPron = (g: Gender) => (g === 'f' ? 'todas' : 'todos');
const nenhum = (g: Gender) => (g === 'f' ? 'nenhuma' : 'nenhum');
const o_a = (g: Gender) => (g === 'f' ? 'a' : 'o');

function phrase(sel: Selector, ctx: RenderContext): Phrase {
  const t = ctx.theme;
  const L = (i: number) => ctx.labels[i].text;
  const P = (bare: string, lead: string, g: Gender = t.tile.g, pron = false): Phrase =>
    ({ bare, lead, g, pronominal: pron });
  switch (sel.k) {
    case 'all': return P('o tabuleiro inteiro', 'No total');
    case 'row': return P(`a fileira ${sel.r + 1}`, `Na fileira ${sel.r + 1}`);
    case 'col': return P(`a coluna ${COLS[sel.c]}`, `Na coluna ${COLS[sel.c]}`);
    case 'corners': return P('os quatro cantos', 'Entre os quatro cantos', t.tile.g, true);
    case 'edges': return P('a borda externa', 'Na borda externa');
    case 'interior': return P('o interior', 'Longe da borda');
    case 'neighbors': return P(`os vizinhos de ${L(sel.i)}`, `Entre os vizinhos de ${L(sel.i)}`, t.tile.g, true);
    case 'ortho': return P(`as casas diretamente ao lado de ${L(sel.i)}`, `Diretamente ao lado de ${L(sel.i)}`);
    case 'between': return P(`as casas estritamente entre ${L(sel.i)} e ${L(sel.j)}`, `Estritamente entre ${L(sel.i)} e ${L(sel.j)}`);
    case 'cell': return P(L(sel.i), `Somente para ${L(sel.i)}`);
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
      switch (c.cmp) {
        case 'eq': return `${ph.lead}, exatamente ${num(c.n, ph.g)}${subj} ${verb(!one)}.`;
        case 'atLeast': return `${ph.lead}, pelo menos ${num(c.n, ph.g)}${subj} ${verb(!one)}.`;
        case 'atMost': return `${ph.lead}, no máximo ${num(c.n, ph.g)}${subj} ${verb(!one)}.`;
        case 'none': return ph.pronominal
          ? `${ph.lead}, ${nenhum(ph.g)} ${verb(false)}.`
          : `${ph.lead}, ${nenhum(ph.g)} ${t.tile.s} ${verb(false)}.`;
        case 'all': return ph.pronominal
          ? `${ph.lead}, ${todosPron(ph.g)} ${verb(true)}.`
          : `${ph.lead}, ${todos(ph.g)} ${t.tile.p} ${verb(true)}.`;
      }
      break;
    }
    case 'compare': {
      const a = phrase(c.a, ctx), b = phrase(c.b, ctx);
      return `${cap(a.bare)} tem mais ${st(c.state).collective.p} do que ${b.bare}.`;
    }
    case 'implies':
      return `Se ${L(c.i)} ${agree(st(c.si).pred, ctx.labels[c.i].g, false)}, então ${L(c.j)} ${agree(st(c.sj).pred, ctx.labels[c.j].g, false)}.`;
    case 'exactlyOneOf':
      return `Exatamente um entre ${L(c.i)} e ${L(c.j)} ${agree(st(c.state).pred, 'm', false)}.`;
    case 'sameState':
      return `${L(c.i)} e ${L(c.j)} estão do mesmo lado.`;
    case 'differentState':
      return `${L(c.i)} e ${L(c.j)} estão em lados opostos.`;
    case 'nearest': {
      const S = st(c.state), g = t.tile.g;
      return `${cap(art(g, false))} ${t.tile.s} ${agree(S.adj, g, false)} mais próxim${o_a(g)} de ${L(c.i)} está a exatamente ${num(c.d, 'm')} ${c.d === 1 ? 'passo' : 'passos'}, contando diagonais.`;
    }
    case 'connected': {
      const col = st(c.state).collective;
      return `${cap(todos(col.g))} ${col.p} formam um único grupo conectado — acima, abaixo, à esquerda, à direita, nunca na diagonal.`;
    }
    case 'uniqueMost': {
      const grp = t.tags[c.key];
      const v = grp?.values[c.value];
      const g = v?.g ?? 'm';
      return `${cap(art(g, true))} ${v ? v.p : c.value} têm estritamente mais ${st(c.state).collective.p} do que qualquer outr${o_a(grp?.label.g ?? 'm')} ${grp ? grp.label.s : c.key}.`;
    }
  }
  return '';
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const delas = (g: Gender) => (g === 'f' ? 'delas' : 'deles');

function explain(c: Clue, ctx: RenderContext): string {
  const t = ctx.theme;
  const st = (x: 0 | 1) => (x === 1 ? t.states.b : t.states.a);
  const L = (i: number) => ctx.labels[i].text;
  switch (c.k) {
    case 'count': {
      const ph = phrase(c.sel, ctx);
      const size = selectorSize(c.sel, ctx.w, ctx.h);
      const head = size === null ? `${ph.lead}:` : `${ph.lead} há ${size} ${t.tile.p}.`;
      const verbP = agree(st(c.state).pred, ph.g, true);
      const verbS = agree(st(c.state).pred, ph.g, false);
      const D = delas(ph.g);
      switch (c.cmp) {
        case 'eq': return `${head} O número ${D} que ${verbP} é exatamente ${num(c.n, ph.g)} — nem mais, nem menos.`;
        case 'atLeast': return `${head} Pelo menos ${num(c.n, ph.g)} ${D} ${verbP}. Pode haver mais.`;
        case 'atMost': return `${head} No máximo ${num(c.n, ph.g)} ${D} ${verbP}. Pode haver menos, ou nenhum${ph.g === 'f' ? 'a' : ''}.`;
        case 'none': return `${head} ${cap(nenhum(ph.g))} ${D} ${verbS}.`;
        case 'all': return `${head} Absolutamente ${todosPron(ph.g)} ${verbP}, sem exceção.`;
      }
      break;
    }
    case 'compare': {
      const a = phrase(c.a, ctx), b = phrase(c.b, ctx);
      return `${cap(a.bare)} tem estritamente mais ${st(c.state).collective.p} do que ${b.bare}. Um empate tornaria isto falso.`;
    }
    case 'implies':
      return `Se ${L(c.i)} ${agree(st(c.si).pred, ctx.labels[c.i].g, false)}, então ${L(c.j)} também precisa estar assim. Mas se ${L(c.i)} não estiver, a pista não diz absolutamente nada sobre ${L(c.j)}.`;
    case 'exactlyOneOf':
      return `Um entre ${L(c.i)} e ${L(c.j)} ${agree(st(c.state).pred, 'm', false)} e o outro não. Nunca os dois, nunca nenhum.`;
    case 'sameState':
      return `${L(c.i)} e ${L(c.j)} coincidem: ou os dois ${agree(st(0).pred, 'm', true)}, ou os dois ${agree(st(1).pred, 'm', true)}.`;
    case 'differentState':
      return `${L(c.i)} e ${L(c.j)} não coincidem: um de cada, mas a pista não diz qual é qual.`;
    case 'nearest':
      return `Tudo a menos de ${num(c.d, 'm')} ${c.d === 1 ? 'passo' : 'passos'} de ${L(c.i)} está livre de ${st(c.state).collective.p}, e a exatamente ${num(c.d, 'm')} ${c.d === 1 ? 'passo' : 'passos'} há pelo menos um. A diagonal conta como um passo.`;
    case 'connected':
      return `Dá para caminhar de qualquer ${st(c.state).collective.s} até qualquer outro movendo-se só para cima, baixo, esquerda e direita, sem sair do grupo. Encostar só na diagonal não vale.`;
    case 'uniqueMost': {
      const g = t.tags[c.key];
      const v = g?.values[c.value];
      return `${cap(art((v?.g ?? 'm'), true))} ${v ? v.p : c.value} têm mais ${st(c.state).collective.p} do que qualquer outr${o_a(g?.label.g ?? 'm')} ${g ? g.label.s : c.key} — estritamente mais, então um empate tornaria isto falso.`;
    }
  }
  return '';
}

const glossary: Record<TermId, Term> = {
  truth: { term: 'Todo mundo fala a verdade', def: 'Todas as pistas do tabuleiro são verdadeiras, inclusive as reveladas por uma casa que acaba sendo do estado marcado. Aqui ninguém mente.' },
  neighbours: { term: 'Vizinhos', def: 'As casas que encostam numa peça por qualquer lado, incluindo as diagonais — até 8, menos que isso na borda ou no canto. A própria peça não é vizinha de si mesma.' },
  ortho: { term: 'Diretamente ao lado', def: 'Só acima, abaixo, à esquerda e à direita — até 4 casas. Diagonais não contam.' },
  row: { term: 'Fileira', def: 'Uma linha horizontal de casas, numerada de cima para baixo.' },
  col: { term: 'Coluna', def: 'Uma linha vertical de casas, com letras da esquerda para a direita.' },
  corners: { term: 'Cantos', def: 'As quatro casas dos cantos do tabuleiro, e só elas.' },
  edges: { term: 'Borda externa', def: 'Todas as casas do anel externo do tabuleiro, cantos incluídos.' },
  interior: { term: 'Longe da borda', def: 'Todas as casas que não estão no anel externo.' },
  between: { term: 'Estritamente entre', def: 'As casas na linha reta que liga duas peças — horizontal, vertical ou diagonal — sem contar as duas peças das pontas.' },
  connected: { term: 'Conectado', def: 'Uma corrente sem interrupção andando para cima, baixo, esquerda ou direita. Duas casas que só se tocam na diagonal não estão conectadas.' },
  exactly: { term: 'Exatamente', def: 'Esse número e nenhum outro. Nem um a mais, nem um a menos.' },
  atLeast: { term: 'Pelo menos', def: 'Essa quantidade ou mais. Não exclui que haja mais.' },
  atMost: { term: 'No máximo', def: 'Essa quantidade ou menos, podendo ser nenhuma.' },
  none: { term: 'Nenhum', def: 'Zero. A pista descarta todos, um por um.' },
  every: { term: 'Todos', def: 'Todos, sem nenhuma exceção.' },
  most: { term: 'Mais do que qualquer outro', def: 'Estritamente o maior número. Se dois grupos empatam na liderança, a pista é falsa.' },
  ifThen: { term: 'Se … então', def: 'Uma promessa de mão única. Quando a primeira parte é verdadeira, a segunda também precisa ser; quando a primeira é falsa, a pista não diz nada.' },
  exactlyOne: { term: 'Exatamente um entre', def: 'Um dos dois, e só um. Não os dois, e não nenhum.' },
  sameSide: { term: 'Do mesmo lado', def: 'As duas peças compartilham o estado, mas a pista não diz qual.' },
  oppositeSides: { term: 'Em lados opostos', def: 'Um de cada, mas a pista não diz qual é qual.' },
  steps: { term: 'Passos', def: 'Distância contada em movimentos entre casas, onde a diagonal vale um passo, igual à reta.' },
  group: { term: 'Grupo', def: 'Todas as peças que compartilham o atributo escrito na face, esteja onde estiver no tabuleiro.' },
};

export const pt: Locale = {
  code: 'pt', bcp47: 'pt-BR', dir: 'ltr',
  num: (n, g) => num(n, g),
  colName: (c) => COLS[c],
  clue,
  explain,
  glossary,
  ui: {
    play: 'Jogar', solo: 'Solo', daily: 'Diária', weekly: 'Edição semanal', leaderboard: 'Classificação',
    hint: 'Dica', hintClue: 'Uma pista que você ainda não usou', hintCell: 'Esta já dá para decidir',
    noHints: 'Sem dicas restantes',
    solved: 'Resolvido', timeLabel: 'Tempo', scoreLabel: 'Pontos', streak: 'Sequência',
    illegalMove: 'Isso ainda não é dedutível',
    notDeducible: 'Nada obriga isso ainda — o jogo nunca pede que você chute',
    share: 'Compartilhar', copied: 'Copiado',
    markAs: 'Marcar como', clues: 'Pistas', openingClues: 'Sabido desde o início', unlockedBy: 'Revelado por',
    difficulty: 'Dificuldade',
    days: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'],
    edition: 'Edição', rank: 'Posição', player: 'Jogador', you: 'Você', hintsUsed: 'Dicas', mistakes: 'Erros',
    noEntries: 'Ainda sem registros', thisWeek: 'Esta semana', allTime: 'Geral',
    theme: 'Tema', language: 'Idioma', newGame: 'Novo tabuleiro', restart: 'Recomeçar',
    splitClues: 'Pistas divididas', yourClues: 'Suas pistas', playerN: 'Jogador',
    perfect: 'Perfeito — sem dicas, sem erros', solvedIn: 'Resolvido em', weeklyTotal: 'Total da semana',
    complete: 'Completo',
    resumed: 'Retomando sua partida de onde parou — o relógio continuou correndo',
    shareCopy: 'Copiar resultado',
    shareSend: 'Compartilhar',
    shareImage: 'Salvar imagem',
    percentileTop: 'Top {n}% por tempo',
    perfectShare: '{n}% resolveram sem erros',
    refuseTitle: 'Provas insuficientes',
    refuseBody: 'Não dá para mostrar que {name} {pred} com o que você sabe.',
    refuseWhy: 'Existe pelo menos uma disposição do tabuleiro que respeita todas as suas pistas em que {name} {other}.',
    refuseShare: 'Compartilhar este tabuleiro',
    refuseGo: 'Continuar',
    timePenalty: 'somado por erros', adjustedTime: 'Tempo ajustado',
    mistakeCost: '+1:00 cada',
    actions: {
      clearTags: 'Limpar marcas', inspect: 'Inspecionar', showHint: 'Ver dica', settings: 'Ajustes',
      playTutorial: 'Ver tutorial', shareScenario: 'Compartilhar cenário',
      noTags: 'Não há anotações para limpar', linkCopied: 'Link copiado — quem abrir recebe exatamente este tabuleiro',
      shareBody: 'Jogue este tabuleiro',
    },
    tutorial: {
      title: 'Como funciona', next: 'Próximo', skip: 'Pular', done: 'Começar a jogar',
      steps: [
        'Cada peça esconde um de dois estados. Sua tarefa é descobrir qual — nunca chutar.',
        'Comece pelas pistas à direita. Toda pista é verdadeira, inclusive as que vêm de uma peça no estado marcado. Aqui ninguém mente.',
        'Uma peça com um ponto no canto já está decidida pelas pistas que você tem. Escolha o rótulo certo acima do tabuleiro e clique nela. Escolher o rótulo errado é o único erro possível aqui, e soma um minuto ao seu tempo.',
        'Resolver uma peça libera o que ela sabia, então a lista de pistas cresce conforme você avança. É esse o ciclo inteiro.',
        'Tente clicar numa peça sem ponto. O tabuleiro recusa, porque nada ainda obriga aquilo. Essa recusa é a promessa: você nunca precisa chutar.',
        'Clique com o botão direito para deixar uma anotação, e use Inspecionar quando a palavra exata de uma pista importar. É só isso — agora vá terminar.',
      ],
    },
    room: {
      title: 'Sala', create: 'Criar sala', join: 'Entrar', code: 'Código da sala',
      codeHint: 'Todo mundo na sala disputa o mesmo tabuleiro, cada um na sua cópia.',
      players: 'Jogadores', you: 'você', finished: 'terminou', idle: 'ausente',
      copyInvite: 'Copiar convite', looking: 'olhando', leave: 'Sair da sala',
    },
    archive: {
      title: 'Arquivo', subtitle: 'Todos os tabuleiros já publicados, até o dia da estreia.',
      played: 'feito', open: 'Abrir o arquivo', back: 'Voltar ao arquivo',
      completed: 'jogados', of: 'de', today: 'hoje', locked: 'ainda não',
      loading: 'Carregando o acervo…',
    },
    settings: {
      title: 'Ajustes', done: 'Pronto', reset: 'Voltar ao padrão',
      game: 'Jogo', language: 'Idioma',
      font: 'Fonte', fontTheme: 'Padrão do tema', fontSans: 'Sem serifa', fontSerif: 'Com serifa',
      fontMono: 'Monoespaçada', fontReadable: 'Alta legibilidade',
      tagSide: 'Lado da etiqueta', left: 'Esquerda', right: 'Direita',
      autoClearPencil: 'Limpar anotações automaticamente',
    showFlavour: 'Comentários',
    dimmed: 'Esmaecido',
    hidden: 'Oculto',
    showSolvable: 'Marcar a peça resolvível',
    onHint: 'Só com dica',
      usedClues: 'Mostrar pistas usadas como', normal: 'Normal', dim: 'Apagadas', hide: 'Ocultas',
      hintButton: 'Botão de dica', enabled: 'Ativado', confirm: 'Perguntar antes', disabled: 'Desativado',
      appearance: 'Aparência', followTheme: 'Seguir o tema', dark: 'Escuro', light: 'Claro',
      colorMode: 'Modo de cor', highContrast: 'Alto contraste', colorblind: 'Seguro para daltonismo',
      showTimer: 'Mostrar cronômetro', showLeaderboard: 'Mostrar classificação',
      always: 'Sempre', onSolve: 'Ao resolver', never: 'Nunca',
      tileArt: 'Ilustração das peças', reduceMotion: 'Reduzir animação',
      undimAtEnd: 'Reacender as pistas no final', on: 'Sim', off: 'Não',
    },
    inspect: {
      title: 'Inspecionar', help: 'Escolha uma pista para ver exatamente o que ela cobre e o que cada palavra significa.',
      meaning: 'O que quer dizer', terms: 'Termos usados', covers: 'Casas de que ela fala',
      mentions: 'Pistas que citam esta peça', nothing: 'Nada selecionado ainda',
      whole: 'O tabuleiro inteiro',
      close: 'Fechar',
    },
  },
};
