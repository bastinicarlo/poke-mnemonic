const STORAGE_KEY = 'pokeMnemonicState-v2';
const flashcardKey = 'pokeMnemonicFlashcards';
const studyBatchSize = 50;
const generations = [
  { name: 'Generazione I', start: 1, end: 151 },
  { name: 'Generazione II', start: 152, end: 251 },
  { name: 'Generazione III', start: 252, end: 386 },
  { name: 'Generazione IV', start: 387, end: 493 },
  { name: 'Generazione V', start: 494, end: 649 },
  { name: 'Generazione VI', start: 650, end: 721 },
  { name: 'Generazione VII', start: 722, end: 809 },
  { name: 'Generazione VIII', start: 810, end: 905 },
  { name: 'Generazione IX', start: 906, end: 1025 }
];

let pokemonNames = [];

const digitLookup = {
  0: ['s', 'z'],
  1: ['t', 'd'],
  2: ['n', 'gn'],
  3: ['m'],
  4: ['r'],
  5: ['l', 'gl'],
  6: ['c', 'g'],
  7: ['k', 'c', 'g', 'q', 'ch', 'gh'],
  8: ['f', 'v'],
  9: ['p', 'b']
};

const vowelBank = ['a', 'e', 'i', 'o', 'u'];
const syllableMap = {
  0: ['sa', 'za', 'se', 'si', 'so', 'su'],
  1: ['ta', 'da', 'te', 'ti', 'to', 'du'],
  2: ['na', 'gne', 'ni', 'no', 'nu', 'gno'],
  3: ['ma', 'me', 'mi', 'mo', 'mu'],
  4: ['ra', 're', 'ri', 'ro', 'ru'],
  5: ['la', 'gle', 'li', 'lo', 'lu', 'gla'],
  6: ['ca', 'ga', 'ce', 'gi', 'co', 'gu'],
  7: ['ka', 'cha', 'ga', 'gue', 'chi', 'ku'],
  8: ['fa', 'va', 'fe', 'vi', 'fo', 'vu'],
  9: ['pa', 'ba', 'pe', 'bi', 'po', 'bu']
};

const realWordFallbacks = [
  'sala', 'toro', 'naso', 'mela', 'riso', 'luna', 'faro', 'pino', 'casa', 'gatto',
  'dado', 'banca', 'mario', 'gino', 'pasta', 'puma', 'rosa', 'nave', 'tigre', 'lago',
  'chiesa', 'faro', 'sorella', 'pirata', 'dinosauro', 'tavolo', 'bambino', 'mamma', 'papà', 'finestra'
];

const exactWordMap = {
  1: ['sasata', 'zasata', 'sasita'],
  25: ['nala', 'anale', 'anala'],
  50: ['sala', 'sola'],
  150: ['talsa', 'talza'],
  251: ['nalata', 'nalata'],
  999: ['papapa', 'babbo', 'babbio'],
  120: ['tensa', 'tanza'],
  300: ['masa', 'mosa'],
  420: ['ransa', 'ranna']
};

const italianWordBank = [
  'sala', 'toro', 'naso', 'mela', 'riso', 'luna', 'casa', 'gatto', 'muro', 'pino',
  'dado', 'banca', 'rosa', 'lago', 'dente', 'nave', 'mamma', 'pasta', 'tigre', 'faro',
  'gino', 'mario', 'puma', 'nido', 'cane', 'tavolo', 'cielo', 'finestra', 'tetto', 'pietra',
  'pesce', 'sorella', 'bambino', 'pietra', 'albero', 'alloro', 'girata', 'grano', 'fiume', 'sasso',
  'donna', 'uomo', 'amore', 'tempo', 'luce', 'nube', 'stella', 'muro', 'porto', 'carta',
  'casa', 'ragno', 'serpente', 'volpe', 'foca', 'tartaruga', 'natura', 'cavallo', 'delfino', 'fiori',
  'giallo', 'bianco', 'rosso', 'verde', 'marrone', 'azzurro', 'petalo', 'fiore', 'montagna', 'lago',
  'mare', 'costa', 'vulcano', 'prato', 'bosco', 'luce', 'vento', 'vento', 'ananas', 'banana',
  'piede', 'mano', 'nastro', 'bandiera', 'esca', 'faro', 'manta', 'torre', 'sfera', 'rampa',
  'casa', 'fuoco', 'riso', 'sasso', 'mela', 'pera', 'mandorla', 'pesca', 'uva', 'orango',
  'pietra', 'natura', 'mappa', 'tubi', 'batteria', 'molla', 'cassa', 'pallone', 'tappeto', 'stanza',
  'palla', 'mappa', 'coda', 'stanza', 'scuola', 'parola', 'cervello', 'finestra', 'lavoro', 'vino'
];

const defaultState = {
  mode: 'number',
  selectedNumber: 25,
  customWords: {},
  progress: {}
};

const state = loadState();
let allPokemon = [];
let studyQueue = [];
let currentStudyIndex = 0;
let studyCardEntry = null;
let studyStage = 'question';
let studyNextStart = 1;
let studySession = { type: 'batch', generationIndex: 0 };

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return cloneDefaultState();

  try {
    const parsed = JSON.parse(raw);
    return { ...cloneDefaultState(), ...parsed };
  } catch {
    return cloneDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function loadPokemonNames() {
  const response = await fetch('./pokemon-names.json?v=3');
  if (!response.ok) throw new Error(`Unable to load Pokémon names: ${response.status}`);
  const names = await response.json();
  if (!Array.isArray(names) || names.length !== 1025
    || names.some((entry) => typeof entry.english !== 'string' || typeof entry.italian !== 'string')) {
    throw new Error('Pokémon name data is incomplete or invalid');
  }
  pokemonNames = names;
}

function getPokemonBaseName(number) {
  const index = number - 1;
  const names = pokemonNames[index];
  if (!names) return `Pokémon ${number}`;
  return names.english === names.italian
    ? names.english
    : `${names.english} (${names.italian})`;
}

function getPokemonSprite(number) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${number}.png`;
}

function normalizeWord(word) {
  return String(word || '').trim().toLowerCase();
}

function getNumberCode(number) {
  const digits = String(number).padStart(3, '0').split('');
  return digits.map((digit) => Number(digit));
}

function getPhoneticSegments(number) {
  const code = getNumberCode(number);
  return code.flatMap((digit) => {
    const variants = digitLookup[digit] || [];
    return variants.length ? [variants[0]] : [''];
  });
}

function encodeWord(word) {
  const normalized = String(word || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const digits = [];
  let index = 0;

  while (index < normalized.length) {
    const chunk = normalized.slice(index, index + 3);
    const pair = normalized.slice(index, index + 2);
    const char = normalized[index];

    if (chunk === 'sci' || chunk === 'sce') {
      digits.push(6); index += 3; continue;
    }
    if (pair === 'gn') {
      digits.push(2); index += 2; continue;
    }
    if (pair === 'gl') {
      digits.push(5); index += 2; continue;
    }
    if (pair === 'ch' || pair === 'gh') {
      digits.push(7); index += 2; continue;
    }
    if (pair === 'sc') {
      digits.push(6); index += 2; continue;
    }
    if (pair === 'ci' || pair === 'ce' || pair === 'gi' || pair === 'ge') {
      digits.push(6); index += 2; continue;
    }
    if (pair === 'qu') {
      digits.push(7); index += 2; continue;
    }

    if (char === 's' || char === 'z') {
      digits.push(0); index += 1; continue;
    }
    if (char === 't' || char === 'd') {
      digits.push(1); index += 1; continue;
    }
    if (char === 'n') {
      digits.push(2); index += 1; continue;
    }
    if (char === 'm') {
      digits.push(3); index += 1; continue;
    }
    if (char === 'r') {
      digits.push(4); index += 1; continue;
    }
    if (char === 'l') {
      digits.push(5); index += 1; continue;
    }
    if (char === 'c' || char === 'g') {
      digits.push(6); index += 1; continue;
    }
    if (char === 'f' || char === 'v') {
      digits.push(8); index += 1; continue;
    }
    if (char === 'p' || char === 'b') {
      digits.push(9); index += 1; continue;
    }
    if (char === 'q' || char === 'k' || char === 'h') {
      digits.push(7); index += 1; continue;
    }

    if (['a', 'e', 'i', 'o', 'u'].includes(char)) {
      index += 1; continue;
    }

    index += 1;
  }

  return digits.join('');
}

function buildExactWordCandidates(number) {
  const target = String(number).padStart(3, '0');
  const digitMap = {
    0: ['s', 'z'],
    1: ['t', 'd'],
    2: ['n', 'gn'],
    3: ['m'],
    4: ['r'],
    5: ['l', 'gl'],
    6: ['c', 'g', 'sc'],
    7: ['k', 'c', 'g', 'ch', 'gh'],
    8: ['f', 'v'],
    9: ['p', 'b']
  };

  const digits = target.split('');
  const variants = new Set();

  for (const first of digitMap[Number(digits[0])]) {
    for (const second of digitMap[Number(digits[1])]) {
      for (const third of digitMap[Number(digits[2])]) {
        const words = [
          `${first}a${second}a${third}`,
          `${first}a${second}a`,
          `${first}${second}a${third}`,
          `${first}${second}${third}`,
          `${first}${second}${third}a`,
          `${first}a${third}`,
          `${first}${second}a`,
          `${second}a${third}`
        ];

        words.forEach((candidate) => {
          const cleaned = candidate.toLowerCase().replace(/[^a-z]/g, '');
          if (cleaned.length < 3 || cleaned.length > 9) return;
          if (!/[aeiou]/.test(cleaned)) return;
          if (/(.)\1{2,}/.test(cleaned)) return;
          if (encodeWord(cleaned).padStart(3, '0') !== target) return;
          variants.add(cleaned);
        });
      }
    }
  }

  return Array.from(variants).slice(0, 8);
}

function buildCandidateWords(number) {
  const target = String(number).padStart(3, '0');
  const exactDirect = exactWordMap[number] || [];
  if (exactDirect.length) {
    return exactDirect.slice(0, 8);
  }

  const exactMatches = buildExactWordCandidates(number);
  if (exactMatches.length) return exactMatches;

  const fallback = [
    'nala', 'sata', 'zata', 'tora', 'mala', 'rina', 'luna', 'sora',
    'casa', 'dora', 'pino', 'gino', 'raro', 'moro', 'lago', 'faro'
  ].filter((word) => encodeWord(word).padStart(3, '0').startsWith(target) || encodeWord(word).padStart(3, '0') === target);

  return fallback.slice(0, 8).length ? fallback.slice(0, 8) : ['nala', 'sora', 'tora', 'mala', 'rina', 'luna'];
}

function generateWordForNumber(number) {
  const custom = normalizeWord(state.customWords[number]);
  if (custom) {
    return custom;
  }

  const patternWords = buildCandidateWords(number);
  const selection = patternWords[0] || 'nala';
  const primary = selection;

  const phonetic = getPhoneticSegments(number)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  if (phonetic.length && phonetic[0] && !patternWords.includes(primary)) {
    return `${phonetic[0]}${vowelBank[(number + 1) % vowelBank.length]}${phonetic[phonetic.length - 1]}`;
  }

  return primary;
}

function getWordAlternatives(number) {
  const custom = normalizeWord(state.customWords[number]);
  const alternatives = buildCandidateWords(number);
  const final = alternatives.filter((candidate) => candidate && candidate !== custom);
  return custom ? [custom, ...final].slice(0, 7) : final.slice(0, 7);
}

function updateWordPreview(number) {
  const name = getPokemonBaseName(number);
  const word = generateWordForNumber(number);
  const displayNumber = formatPokedexNumber(number);

  const sprite = document.getElementById('pokemonSprite');
  const nameEl = document.getElementById('pokemonName');
  const numberEl = document.getElementById('pokemonNumberLabel');
  const mainWord = document.getElementById('mainWord');
  const customInput = document.getElementById('customWordInput');
  const alternatives = document.getElementById('alternatives');

  nameEl.textContent = name;
  numberEl.textContent = `#${displayNumber}`;
  mainWord.textContent = word;
  customInput.value = state.customWords[number] || '';
  sprite.src = getPokemonSprite(number);
  sprite.alt = `${name} sprite`;

  alternatives.innerHTML = '';
  getWordAlternatives(number).forEach((candidate, idx) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (candidate === word ? ' active' : '');
    chip.textContent = candidate;
    chip.addEventListener('click', () => {
      customInput.value = candidate;
      saveWord(number, candidate);
    });
    alternatives.appendChild(chip);
  });
}

function formatPokedexNumber(number) {
  return String(number).padStart(3, '0');
}

function saveWord(number, word) {
  const normalized = normalizeWord(word);
  state.customWords[number] = normalized || undefined;
  if (!normalized) delete state.customWords[number];
  saveState();
  updateWordPreview(number);
}

function renderWordTable() {
  const table = document.getElementById('wordTable');
  table.innerHTML = '';

  const maxEntries = pokemonNames.length;
  const items = [];
  for (let i = 1; i <= maxEntries; i += 1) {
    const name = getPokemonBaseName(i);
    const defaultWord = generateWordForNumber(i);
    const word = state.customWords[i] || defaultWord;
    items.push({ number: i, name, word });
  }

  items.forEach(({ number, name, word }) => {
    const row = document.createElement('div');
    row.className = 'word-row';

    const index = document.createElement('strong');
    index.textContent = `#${formatPokedexNumber(number)}`;

    const mon = document.createElement('span');
    mon.textContent = name;

    const label = document.createElement('span');
    label.className = 'muted';
    label.textContent = word;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-button';
    button.textContent = 'Apri';
    button.addEventListener('click', () => {
      document.getElementById('pokemonNumber').value = number;
      state.selectedNumber = Number(number);
      updateWordPreview(Number(number));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    row.append(index, mon, label, button);
    table.appendChild(row);
  });
}

function buildStudyQueue(start, end) {
  const queue = [];
  for (let number = start; number <= end; number += 1) {
    queue.push(number);
  }

  return queue;
}

function formatStudyRange(start, end) {
  return `#${formatPokedexNumber(start)}–#${formatPokedexNumber(end)}`;
}

function startStudyRange(start, end, session) {
  studyQueue = buildStudyQueue(start, end);
  currentStudyIndex = 0;
  studySession = session;
  document.getElementById('studyPanel').classList.remove('hidden');
  document.getElementById('studyComplete').classList.add('hidden');
  document.getElementById('studyCard').classList.remove('hidden');
  updateStudyCard();
}

function updateStudyOptions() {
  const scope = document.getElementById('studyScope').value;
  document.getElementById('generationOption').classList.toggle('hidden', scope !== 'generation');
  document.getElementById('customRangeOption').classList.toggle('hidden', scope !== 'custom');
  const button = document.getElementById('studyButton');
  button.textContent = scope === 'batch'
    ? `Studia i prossimi 50 · ${formatStudyRange(studyNextStart, Math.min(studyNextStart + studyBatchSize - 1, pokemonNames.length))}`
    : scope === 'generation' ? 'Avvia la generazione' : 'Avvia l’intervallo';
}

function initializeCustomSelects() {
  const wrappers = [...document.querySelectorAll('.custom-select')];

  function closeMenu(wrapper, restoreFocus = false) {
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const menu = wrapper.querySelector('.custom-select-menu');
    menu.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function openMenu(wrapper, focusSelected = true) {
    wrappers.forEach((other) => {
      if (other !== wrapper) closeMenu(other);
    });
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const menu = wrapper.querySelector('.custom-select-menu');
    menu.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    const options = [...menu.querySelectorAll('[role="option"]')];
    const selected = options.find((option) => option.getAttribute('aria-selected') === 'true');
    const target = focusSelected ? selected || options[0] : options[0];
    if (target) target.focus();
  }

  wrappers.forEach((wrapper) => {
    const select = document.getElementById(wrapper.dataset.selectId);
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const value = wrapper.querySelector(`#${wrapper.dataset.selectId}Value`);
    const menu = wrapper.querySelector('.custom-select-menu');
    const options = [...select.options];

    menu.id = `${select.id}Listbox`;
    trigger.setAttribute('aria-controls', menu.id);
    options.forEach((option, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'custom-select-option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.value === select.value));
      item.tabIndex = -1;
      item.textContent = option.textContent;
      item.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        closeMenu(wrapper, true);
      });
      item.addEventListener('keydown', (event) => {
        const items = [...menu.querySelectorAll('[role="option"]')];
        const current = items.indexOf(item);
        let next = null;
        if (event.key === 'ArrowDown') next = (current + 1) % items.length;
        if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = items.length - 1;
        if (next !== null) {
          event.preventDefault();
          items[next].focus();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeMenu(wrapper, true);
        } else if (event.key === 'Tab') {
          closeMenu(wrapper);
        }
      });
      menu.appendChild(item);
    });

    function syncValue() {
      value.textContent = select.selectedOptions[0]?.textContent || '';
      menu.querySelectorAll('[role="option"]').forEach((item, index) => {
        item.setAttribute('aria-selected', String(options[index].value === select.value));
      });
    }

    select.addEventListener('change', syncValue);
    syncValue();
    trigger.addEventListener('click', () => {
      if (trigger.getAttribute('aria-expanded') === 'true') closeMenu(wrapper);
      else openMenu(wrapper);
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMenu(wrapper, event.key !== 'ArrowDown');
        if (event.key === 'ArrowDown') {
          const selected = menu.querySelector('[aria-selected="true"]');
          const items = [...menu.querySelectorAll('[role="option"]')];
          const next = selected ? items[(items.indexOf(selected) + 1) % items.length] : items[0];
          if (next) next.focus();
        }
      }
    });
  });

  document.addEventListener('pointerdown', (event) => {
    wrappers.forEach((wrapper) => {
      if (!wrapper.contains(event.target)) closeMenu(wrapper);
    });
  });
}

function startSelectedStudy() {
  state.mode = document.querySelector('.segment.active')?.dataset.mode || 'number';
  const scope = document.getElementById('studyScope').value;

  if (scope === 'generation') {
    const generationIndex = Number(document.getElementById('studyGeneration').value);
    const generation = generations[generationIndex];
    startStudyRange(generation.start, Math.min(generation.end, pokemonNames.length), {
      type: 'generation',
      generationIndex
    });
    return;
  }

  if (scope === 'custom') {
    const start = Number(document.getElementById('studyRangeStart').value);
    const end = Number(document.getElementById('studyRangeEnd').value);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > pokemonNames.length || start > end) {
      window.alert(`Inserisci un intervallo valido da #001 a #${formatPokedexNumber(pokemonNames.length)}, con il numero iniziale minore o uguale a quello finale.`);
      return;
    }
    startStudyRange(start, end, { type: 'custom' });
    return;
  }

  const start = studyNextStart > pokemonNames.length ? 1 : studyNextStart;
  const end = Math.min(start + studyBatchSize - 1, pokemonNames.length);
  startStudyRange(start, end, { type: 'batch' });
}

function getProgressCounts(start, end) {
  const counts = { studied: 0, review: 0, correct: 0 };
  for (let number = start; number <= end; number += 1) {
    const entry = state.progress[number];
    if (!entry || !Number.isFinite(entry.lastScore)) continue;
    counts.studied += 1;
    if (entry.lastScore >= 3) counts.correct += 1;
    else counts.review += 1;
  }
  counts.total = end - start + 1;
  counts.notStudied = counts.total - counts.studied;
  return counts;
}

function renderProgressOverview() {
  const totalCounts = getProgressCounts(1, pokemonNames.length);
  const summary = document.getElementById('progressSummary');
  summary.textContent = `Pokémon studiati: ${totalCounts.studied} di ${totalCounts.total} · Da ripassare: ${totalCounts.review} · Risposte giuste/facili: ${totalCounts.correct} · Non ancora studiati: ${totalCounts.notStudied}`;

  const list = document.getElementById('generationProgressList');
  list.replaceChildren();
  generations.forEach((generation) => {
    const end = Math.min(generation.end, pokemonNames.length);
    const counts = getProgressCounts(generation.start, end);
    const row = document.createElement('div');
    row.className = 'generation-progress-row';

    const title = document.createElement('strong');
    title.textContent = generation.name;

    const range = document.createElement('span');
    range.className = 'muted';
    range.textContent = formatStudyRange(generation.start, end);

    const details = document.createElement('span');
    details.textContent = `${counts.studied}/${counts.total} studiati · ${counts.review} da ripassare`;

    const progress = document.createElement('progress');
    progress.max = counts.total;
    progress.value = counts.studied;
    progress.setAttribute('aria-label', `${generation.name}: ${counts.studied} Pokémon studiati su ${counts.total}`);

    const startButton = document.createElement('button');
    startButton.type = 'button';
    startButton.className = 'secondary-button';
    startButton.textContent = 'Studia';
    startButton.addEventListener('click', () => {
      document.getElementById('studyScope').value = 'generation';
      document.getElementById('studyGeneration').value = String(generations.indexOf(generation));
      updateStudyOptions();
      startSelectedStudy();
      document.getElementById('studyPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    row.append(title, range, details, progress, startButton);
    list.appendChild(row);
  });
}

function updateStudyCard() {
  const card = document.getElementById('studyCard');
  const face = document.getElementById('studyFace');
  const label = document.getElementById('studyLabel');
  const frontText = document.getElementById('studyFrontText');
  const sprite = document.getElementById('studySprite');
  const hint = document.getElementById('studyHint');
  const answer = document.getElementById('studyAnswer');
  const progress = document.getElementById('studyProgress');

  if (!studyQueue.length) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  studyStage = 'question';
  studyCardEntry = studyQueue[currentStudyIndex];
  const number = studyCardEntry;
  const name = getPokemonBaseName(number);
  const batchStart = studyQueue[0];
  const batchEnd = studyQueue[studyQueue.length - 1];
  progress.textContent = `Pokémon ${currentStudyIndex + 1} di ${studyQueue.length} · ${formatStudyRange(batchStart, batchEnd)}`;

  if (state.mode === 'number') {
    label.textContent = 'Numero';
    frontText.textContent = `#${formatPokedexNumber(number)}`;
    sprite.hidden = true;
  } else {
    label.textContent = 'Pokémon';
    frontText.textContent = name;
    sprite.src = getPokemonSprite(number);
    sprite.alt = `${name} sprite`;
    sprite.hidden = false;
  }

  hint.classList.add('hidden');
  answer.classList.add('hidden');
  document.getElementById('studyRevealActions').classList.remove('hidden');
  document.querySelectorAll('.score-button').forEach((button) => button.classList.add('hidden'));
  face.setAttribute('aria-label', state.mode === 'number' ? 'Indovina il Pokémon associato al numero' : 'Indovina il numero associato al Pokémon');
}

function showStudyHint() {
  if (studyStage === 'answer') return;
  const hint = document.getElementById('studyHint');
  document.getElementById('studyHintText').textContent = generateWordForNumber(studyCardEntry);
  hint.classList.remove('hidden');
  studyStage = 'hint';
}

function revealStudyAnswer() {
  if (studyStage === 'answer') return;
  const number = studyCardEntry;
  const name = getPokemonBaseName(number);
  const sprite = document.getElementById('studySprite');
  const answerText = document.getElementById('studyAnswerText');

  if (state.mode === 'number') {
    answerText.textContent = name;
    sprite.src = getPokemonSprite(number);
    sprite.alt = `${name} sprite`;
    sprite.hidden = false;
  } else {
    answerText.textContent = `#${formatPokedexNumber(number)}`;
  }

  document.getElementById('studyAnswer').classList.remove('hidden');
  document.getElementById('studyRevealActions').classList.add('hidden');
  document.querySelectorAll('.score-button').forEach((button) => button.classList.remove('hidden'));
  studyStage = 'answer';
}

function nextStudyCard() {
  currentStudyIndex += 1;
  if (currentStudyIndex >= studyQueue.length) {
    const batchStart = studyQueue[0];
    const batchEnd = studyQueue[studyQueue.length - 1];
    let nextStart = null;
    let nextEnd = null;
    let nextLabel = '';
    if (studySession.type === 'batch') {
      studyNextStart = batchEnd + 1;
      if (studyNextStart > pokemonNames.length) studyNextStart = 1;
      nextStart = studyNextStart;
      nextEnd = Math.min(nextStart + studyBatchSize - 1, pokemonNames.length);
      nextLabel = `Studia i prossimi 50 · ${formatStudyRange(nextStart, nextEnd)}`;
      updateStudyOptions();
    } else if (studySession.type === 'generation') {
      const nextGenerationIndex = studySession.generationIndex + 1;
      if (nextGenerationIndex < generations.length) {
        const nextGeneration = generations[nextGenerationIndex];
        nextStart = nextGeneration.start;
        nextEnd = Math.min(nextGeneration.end, pokemonNames.length);
        nextLabel = `Studia ${nextGeneration.name}`;
      }
    }
    document.getElementById('studyCard').classList.add('hidden');
    document.getElementById('studyProgress').textContent = `${formatStudyRange(batchStart, batchEnd)} completati`;
    document.getElementById('studyCompleteTitle').textContent = `${formatStudyRange(batchStart, batchEnd)} completati!`;

    document.getElementById('studyCompleteText').textContent = nextStart
      ? 'Pronto per continuare?'
      : studySession.type === 'generation'
        ? 'Hai completato tutte le generazioni.'
        : 'Intervallo completato.';
    const nextButton = document.getElementById('nextStudyBatchButton');
    nextButton.textContent = nextLabel;
    nextButton.dataset.start = nextStart ? String(nextStart) : '';
    nextButton.dataset.end = nextEnd ? String(nextEnd) : '';
    nextButton.dataset.generationIndex = studySession.type === 'generation'
      ? String(studySession.generationIndex + 1)
      : '';
    nextButton.classList.toggle('hidden', !nextStart);
    document.getElementById('studyComplete').classList.remove('hidden');
    if (!document.getElementById('progressPanel').classList.contains('hidden')) renderProgressOverview();
    return;
  }
  updateStudyCard();
}

function registerStudyFeedback(score) {
  if (studyStage !== 'answer') return;
  const number = studyCardEntry;
  const existing = state.progress[number] || { streak: 0, ease: 2.5 };
  const factor = score >= 3 ? 1.3 : score === 2 ? 0.9 : 0.5;
  const newEase = Math.max(1.3, Math.min(3.5, existing.ease * factor + score * 0.2));
  state.progress[number] = {
    streak: score >= 3 ? existing.streak + 1 : 0,
    ease: newEase,
    lastScore: score
  };
  saveState();
  if (!document.getElementById('progressPanel').classList.contains('hidden')) renderProgressOverview();
  nextStudyCard();
}

function installServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
}

function attachEvents() {
  initializeCustomSelects();

  document.getElementById('generateButton').addEventListener('click', () => {
    const number = Math.min(1025, Math.max(1, Number(document.getElementById('pokemonNumber').value) || 1));
    state.selectedNumber = number;
    document.getElementById('pokemonNumber').value = number;
    updateWordPreview(number);
  });

  document.getElementById('pokemonNumber').addEventListener('change', () => {
    const value = Number(document.getElementById('pokemonNumber').value);
    if (Number.isFinite(value)) {
      state.selectedNumber = Math.min(1025, Math.max(1, value));
      updateWordPreview(state.selectedNumber);
    }
  });

  document.getElementById('saveWordButton').addEventListener('click', () => {
    const number = state.selectedNumber;
    const custom = document.getElementById('customWordInput').value;
    saveWord(number, custom);
  });

  document.getElementById('generateAllButton').addEventListener('click', () => {
    for (let i = 1; i <= pokemonNames.length; i += 1) {
      generateWordForNumber(i);
    }
    renderWordTable();
  });

  document.getElementById('studyScope').addEventListener('change', updateStudyOptions);
  document.getElementById('studyButton').addEventListener('click', () => {
    startSelectedStudy();
  });
  document.getElementById('nextStudyBatchButton').addEventListener('click', () => {
    const button = document.getElementById('nextStudyBatchButton');
    const start = Number(button.dataset.start);
    const end = Number(button.dataset.end);
    const generationIndex = button.dataset.generationIndex;
    startStudyRange(start, end, generationIndex
      ? { type: 'generation', generationIndex: Number(generationIndex) }
      : { type: 'batch' });
  });

  document.getElementById('progressButton').addEventListener('click', () => {
    const panel = document.getElementById('progressPanel');
    const isOpening = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !isOpening);
    document.getElementById('progressButton').setAttribute('aria-expanded', String(isOpening));
    if (isOpening) {
      renderProgressOverview();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  document.getElementById('closeProgressButton').addEventListener('click', () => {
    document.getElementById('progressPanel').classList.add('hidden');
    document.getElementById('progressButton').setAttribute('aria-expanded', 'false');
  });

  document.getElementById('showHintButton').addEventListener('click', showStudyHint);
  document.getElementById('showAnswerButton').addEventListener('click', revealStudyAnswer);

  document.querySelectorAll('.segment').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.segment').forEach((segment) => segment.classList.toggle('active', segment === button));
      state.mode = button.dataset.mode;
      if (studyQueue.length && document.getElementById('studyComplete').classList.contains('hidden')) {
        updateStudyCard();
      }
    });
  });

  document.querySelectorAll('.score-button').forEach((button) => {
    button.addEventListener('click', () => {
      const score = Number(button.dataset.score || 1);
      registerStudyFeedback(score);
    });
  });

  document.getElementById('clearProgressButton').addEventListener('click', () => {
    state.progress = {};
    saveState();
    renderWordTable();
    if (!document.getElementById('progressPanel').classList.contains('hidden')) renderProgressOverview();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    const installButton = document.getElementById('installButton');
    installButton.hidden = false;
    installButton.addEventListener('click', () => {
      event.prompt();
      installButton.hidden = true;
    }, { once: true });
  });
}

async function init() {
  state.selectedNumber = Math.min(1025, Math.max(1, Number(state.selectedNumber) || 25));
  attachEvents();
  try {
    await loadPokemonNames();
  } catch (error) {
    console.error('Could not load Pokémon names.', error);
    window.alert('Non è stato possibile caricare i nomi Pokémon. Ricarica la pagina per riprovare.');
    return;
  }
  updateStudyOptions();
  renderWordTable();
  updateWordPreview(state.selectedNumber);
  installServiceWorker();
}

init();
