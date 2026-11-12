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
let verifiedWordMap = {};
const noVerifiedWordMessage = 'Nessuna parola verificata';

const defaultState = {
  mode: 'number',
  selectedNumber: 149,
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

async function loadVerifiedWordMap() {
  const response = await fetch('./mnemonic-words.json?v=9');
  if (!response.ok) throw new Error(`Unable to load mnemonic words: ${response.status}`);
  const words = await response.json();
  if (!words || Array.isArray(words) || typeof words !== 'object'
    || Object.entries(words).some(([code, candidates]) =>
      !/^\d{3}$/.test(code)
      || !Array.isArray(candidates)
      || candidates.some((word) => typeof word !== 'string' || encodeWord(word) !== code))) {
    throw new Error('Mnemonic word data is incomplete or invalid');
  }
  verifiedWordMap = words;
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

function buildCandidateWords(number) {
  const target = String(number).padStart(3, '0');
  return verifiedWordMap[target] || [];
}

function generateWordForNumber(number) {
  const custom = normalizeWord(state.customWords[number]);
  if (custom) {
    return custom;
  }

  return buildCandidateWords(number)[0] || noVerifiedWordMessage;
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
  const wordOptions = getWordAlternatives(number);
  if (!wordOptions.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Non ho trovato una parola del dizionario con questa corrispondenza esatta. Puoi inserirne una tua.';
    alternatives.appendChild(empty);
  }
  wordOptions.forEach((candidate) => {
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

async function saveWord(number, word) {
  const normalized = normalizeWord(word);
  const previousWord = state.customWords[number];
  state.customWords[number] = normalized || undefined;
  if (!normalized) delete state.customWords[number];
  const status = document.getElementById('saveStatus');
  try {
    saveState();
  } catch (error) {
    if (previousWord === undefined) delete state.customWords[number];
    else state.customWords[number] = previousWord;
    console.error('Could not save the custom mnemonic word.', error);
    status.textContent = 'Non è stato possibile salvare la parola in questo browser. Controlla lo spazio disponibile.';
    status.classList.add('error');
    return;
  }

  updateWordPreview(number);
  renderWordTable();

  try {
    const storage = navigator.storage;
    if (!storage || typeof storage.persist !== 'function') {
      status.textContent = 'Parola salvata in questo browser. Il browser non offre la protezione dai rilasci automatici dei dati.';
      status.classList.remove('error');
      return;
    }

    const alreadyPersistent = typeof storage.persisted === 'function' && await storage.persisted();
    const persistent = alreadyPersistent || await storage.persist();
    status.textContent = persistent
      ? 'Parola salvata in questo browser con protezione dalla rimozione automatica dei dati.'
      : 'Parola salvata in questo browser, ma il browser potrebbe rimuovere i dati se lo spazio scarseggia.';
    status.classList.remove('error');
  } catch (error) {
    console.error('Could not request persistent browser storage.', error);
    status.textContent = 'Parola salvata in questo browser, ma non è stato possibile attivare la protezione dalla rimozione automatica.';
    status.classList.remove('error');
  }
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

  for (let index = queue.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [queue[index], queue[randomIndex]] = [queue[randomIndex], queue[index]];
  }

  return queue;
}

function formatStudyRange(start, end) {
  return `#${formatPokedexNumber(start)}–#${formatPokedexNumber(end)}`;
}

function startStudyRange(start, end, session) {
  studyQueue = buildStudyQueue(start, end);
  currentStudyIndex = 0;
  studySession = { ...session, start, end };
  document.getElementById('studyPanel').classList.remove('hidden');
  document.getElementById('studyComplete').classList.add('hidden');
  document.getElementById('studyCard').classList.remove('hidden');
  updateStudyCard();
  document.getElementById('studyPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateStudyOptions() {
  const scope = document.getElementById('studyScope').value;
  document.getElementById('generationOption').classList.toggle('hidden', scope !== 'generation');
  document.getElementById('customRangeOption').classList.toggle('hidden', scope !== 'custom');
  const button = document.getElementById('studyButton');
  button.textContent = scope === 'batch'
    ? `Studia i prossimi 50 casuali · ${formatStudyRange(studyNextStart, Math.min(studyNextStart + studyBatchSize - 1, pokemonNames.length))}`
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
  const hint = document.getElementById('studyHint');
  const answer = document.getElementById('studyAnswer');
  const progress = document.getElementById('studyProgress');

  if (!studyQueue.length) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  document.getElementById('studyComplete').classList.add('hidden');
  studyStage = 'question';
  studyCardEntry = studyQueue[currentStudyIndex];
  const number = studyCardEntry;
  const name = getPokemonBaseName(number);
  progress.textContent = `Pokémon ${currentStudyIndex + 1} di ${studyQueue.length} · ${formatStudyRange(studySession.start, studySession.end)}`;

  if (state.mode === 'number') {
    label.textContent = 'Numero';
    frontText.textContent = `#${formatPokedexNumber(number)}`;
    hideStudySprite();
  } else {
    label.textContent = 'Pokémon';
    frontText.textContent = name;
    loadStudySprite(number);
  }

  hint.classList.add('hidden');
  answer.classList.add('hidden');
  document.getElementById('studyRevealActions').classList.remove('hidden');
  document.querySelectorAll('.score-button').forEach((button) => button.classList.add('hidden'));
  face.setAttribute('aria-label', state.mode === 'number' ? 'Indovina il Pokémon associato al numero' : 'Indovina il numero associato al Pokémon');
}

function hideStudySprite() {
  const sprite = document.getElementById('studySprite');
  sprite.hidden = true;
  sprite.dataset.requestedSrc = '';
  sprite.onload = null;
  sprite.onerror = null;
}

function loadStudySprite(number) {
  const sprite = document.getElementById('studySprite');
  const source = getPokemonSprite(number);
  sprite.hidden = true;
  sprite.dataset.requestedSrc = source;
  sprite.alt = `${getPokemonBaseName(number)} sprite`;
  sprite.onload = () => {
    if (sprite.dataset.requestedSrc === source) sprite.hidden = false;
  };
  sprite.onerror = () => {
    if (sprite.dataset.requestedSrc === source) sprite.hidden = true;
  };
  sprite.src = source;
  if (sprite.complete && sprite.naturalWidth > 0) sprite.hidden = false;
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
  const answerText = document.getElementById('studyAnswerText');

  if (state.mode === 'number') {
    answerText.textContent = name;
    loadStudySprite(number);
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
    const batchStart = studySession.start;
    const batchEnd = studySession.end;
    let nextStart = null;
    let nextEnd = null;
    let nextLabel = '';
    if (studySession.type === 'batch') {
      studyNextStart = batchEnd + 1;
      if (studyNextStart > pokemonNames.length) studyNextStart = 1;
      nextStart = studyNextStart;
      nextEnd = Math.min(nextStart + studyBatchSize - 1, pokemonNames.length);
      nextLabel = `Studia i prossimi 50 casuali · ${formatStudyRange(nextStart, nextEnd)}`;
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
    document.getElementById('previewPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  if (state.startupPokemonDefaultMigrated !== true) {
    if (Number(state.selectedNumber) === 25) state.selectedNumber = 149;
    state.startupPokemonDefaultMigrated = true;
    saveState();
  }
  state.selectedNumber = Math.min(1025, Math.max(1, Number(state.selectedNumber) || 149));
  attachEvents();
  try {
    await Promise.all([loadPokemonNames(), loadVerifiedWordMap()]);
  } catch (error) {
    console.error('Could not load Pokémon or mnemonic word data.', error);
    window.alert('Non è stato possibile caricare i dati. Ricarica la pagina per riprovare.');
    return;
  }
  updateStudyOptions();
  renderWordTable();
  updateWordPreview(state.selectedNumber);
  installServiceWorker();
}

init();
