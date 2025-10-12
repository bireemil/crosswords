const q = (s) => document.querySelector(s);
const gridEl = q('#grid');
const cluesAcrossEl = q('#clues-across');
const cluesDownEl = q('#clues-down');
const statusEl = q('#status-text');
const toggleDarkEl = q('#toggle-dark');
const curDirEl = q('#current-dir');
const curNumEl = q('#current-num');
const curTextEl = q('#current-text');
const mobileInputEl = q('#mobile-input');

let puzzle = null; // { puzzle:[], solution:[], clues }
let W = 0, H = 0;
let focus = { y:0, x:0, dir:'across' };
let filled = []; // current user letters
let numbers = []; // numbering matrix
let entries = { across:[], down:[] };
let solNorm = [];
let hintCount = 0;
let lastMobileValue = '';
let resizeTimer = null;

async function fetchTextWithFallback(path) {
  const bust = `${path}?v=${Date.now()}`;
  try {
    const res = await fetch(bust, { cache: 'no-store' });
    if (res.ok) return await res.text();
  } catch {}
  try {
    const res = await fetch(path);
    if (res.ok) return await res.text();
  } catch {}
  return null;
}

function normalizeChar(ch) {
  if (!ch) return '';
  const upper = ch.toUpperCase();
  // Strip accents/diacritics
  return upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function computeNumbers() {
  numbers = Array.from({length:H}, ()=>Array(W).fill(null));
  let n = 1;
  for (let y=0;y<H;y++) {
    for (let x=0;x<W;x++) {
      if (puzzle.puzzle[y][x] === '#') continue;
      const startAcross = (x===0 || puzzle.puzzle[y][x-1] === '#') && (x+1<W && puzzle.puzzle[y][x+1] !== '#');
      const startDown = (y===0 || puzzle.puzzle[y-1][x] === '#') && (y+1<H && puzzle.puzzle[y+1][x] !== '#');
      if (startAcross || startDown) numbers[y][x] = n++;
    }
  }
}

function extractEntries() {
  const across = [];
  for (let y=0;y<H;y++) {
    let x = 0;
    while (x < W) {
      if (puzzle.puzzle[y][x] !== '#' && (x===0 || puzzle.puzzle[y][x-1] === '#')) {
        const sx = x; let ans = '';
        while (x < W && puzzle.puzzle[y][x] !== '#') { ans += solNorm[y][x] || '.'; x++; }
        const num = numbers[y][sx] || 0;
        across.push({ number:num, row:y, col:sx, len: ans.length, answer: ans, clue: null });
      } else { x++; }
    }
  }
  const down = [];
  for (let x=0;x<W;x++) {
    let y = 0;
    while (y < H) {
      if (puzzle.puzzle[y][x] !== '#' && (y===0 || puzzle.puzzle[y-1][x] === '#')) {
        const sy = y; let ans = '';
        while (y < H && puzzle.puzzle[y][x] !== '#') { ans += solNorm[y][x] || '.'; y++; }
        const num = numbers[sy][x] || 0;
        down.push({ number:num, row:sy, col:x, len: ans.length, answer: ans, clue: null });
      } else { y++; }
    }
  }
  entries = { across, down };
}

function renderGrid() {
  gridEl.innerHTML = '';
  // Compute responsive cell size to fit available width if needed
  const wrap = document.querySelector('.grid-wrap');
  // Make grid column take more space: use panel width (section) if larger
  const panel = document.querySelector('.grid-panel');
  const containerWidth = Math.max(wrap?.clientWidth||0, panel?.clientWidth||0, window.innerWidth*0.55);
  const maxWidth = containerWidth - 32; // padding
  let cell = 45; // base size
  const needed = W * (cell + 2); // cell plus borders approx
  if (needed > maxWidth) {
    cell = Math.max(28, Math.floor((maxWidth) / W) - 2);
  }
  gridEl.style.setProperty('--cell-size', `${cell}px`);
  gridEl.style.setProperty('--cell-font', `${Math.round(cell*0.4)}px`);
  gridEl.style.gridTemplateColumns = `repeat(${W}, ${cell}px)`;
  for (let y=0;y<H;y++) {
    for (let x=0;x<W;x++) {
      const cell = document.createElement('div');
      const isBlock = puzzle.puzzle[y][x] === '#';
      let cls = 'cell';
      if (isBlock) cls += ' block';
      cell.className = cls;
      if (!isBlock) {
        const num = numbers[y][x];
        if (num) {
          const n = document.createElement('div');
          n.className = 'num'; n.textContent = num; cell.appendChild(n);
        }
        const ltr = document.createElement('div');
        ltr.className = 'ltr';
        ltr.textContent = filled[y][x] || '';
        cell.appendChild(ltr);
        cell.addEventListener('click', ()=>focusCell(y,x));
      }
      gridEl.appendChild(cell);
    }
  }
  highlightFocus();
}

function focusCell(y,x) {
  if (puzzle.puzzle[y][x] === '#') return;
  // toggle dir if already on same cell
  if (focus.y === y && focus.x === x) {
    focus.dir = (focus.dir === 'across') ? 'down' : 'across';
  } else {
    focus.y = y; focus.x = x;
  }
  if (mobileInputEl) {
    mobileInputEl.value = '';
    lastMobileValue = '';
    try { mobileInputEl.focus({ preventScroll: true }); } catch { mobileInputEl.focus(); }
  }
  highlightFocus();
}

function scrollFocusIntoView() {
  if (window.innerWidth > 900) return;
  // Skip auto-scroll if the hidden input (keyboard) is focused
  if (document.activeElement === mobileInputEl) return;
  const idx = focus.y*W + focus.x;
  const cell = gridEl.children[idx];
  if (cell && typeof cell.scrollIntoView === 'function') {
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function highlightFocus() {
  const cells = [...gridEl.children];
  cells.forEach(c=>{ c.classList.remove('focus','run','correct'); });
  const idx = focus.y*W + focus.x;
  const cur = cells[idx];
  if (cur) cur.classList.add('focus');
  // highlight run
  if (focus.dir === 'across') {
    let x = focus.x; while (x>=0 && puzzle.puzzle[focus.y][x] !== '#') x--; x++;
    for (;x<W && puzzle.puzzle[focus.y][x] !== '#'; x++) cells[focus.y*W + x].classList.add('run');
  } else {
    let y = focus.y; while (y>=0 && puzzle.puzzle[y][focus.x] !== '#') y--; y++;
    for (;y<H && puzzle.puzzle[y][focus.x] !== '#'; y++) cells[y*W + focus.x].classList.add('run');
  }
  renderClues();
  markCorrectWords();
  updateCurrentClue();
  scrollFocusIntoView();
}

function renderClues() {
  const clues = entries;
  const mark = (dir) => {
    const listEl = dir==='across' ? cluesAcrossEl : cluesDownEl;
    listEl.innerHTML = '';
    // Show only numbered entries with len >= 2; never treat answer as clue
    for (const c of clues[dir].filter(it => it.number > 0 && it.len >= 2)) {
      const li = document.createElement('li');
      const clueText = (c.clue && c.clue.trim().length>=2) ? c.clue : '—';
      li.textContent = `${c.number}. ${clueText}`;
      li.addEventListener('click', ()=>{ focusCell(c.row, c.col); focus.dir = dir; highlightFocus(); });
      // active if matches focus start
      if (c.row===focus.y && c.col===focus.x && dir===focus.dir) li.classList.add('active');
      listEl.appendChild(li);
    }
  };
  mark('across'); mark('down');
}

function move(dx, dy) {
  let y = focus.y, x = focus.x;
  do { x += dx; y += dy; } while (x>=0 && x<W && y>=0 && y<H && puzzle.puzzle[y][x] === '#');
  if (x>=0 && x<W && y>=0 && y<H) { focus.y=y; focus.x=x; }
  highlightFocus();
}

function enterLetter(ch) {
  if (!/^[A-Za-z]$/.test(ch)) return;
  filled[focus.y][focus.x] = ch.toUpperCase();
  const idx = focus.y*W + focus.x;
  const cell = gridEl.children[idx];
  if (cell) {
    const ltr = cell.querySelector('.ltr');
    if (ltr) ltr.textContent = normalizeChar(ch);
  }
  // move forward in current dir
  if (focus.dir==='across') move(1,0); else move(0,1);
  markCorrectWords();
  updateCurrentClue();
}

function backspace() {
  if (filled[focus.y][focus.x]) {
    filled[focus.y][focus.x] = '';
    const cell = gridEl.children[focus.y*W+focus.x];
    const ltr = cell?.querySelector('.ltr');
    if (ltr) ltr.textContent='';
    return;
  }
  if (focus.dir==='across') move(-1,0); else move(0,-1);
  filled[focus.y][focus.x] = '';
  const cell = gridEl.children[focus.y*W+focus.x];
  const ltr = cell?.querySelector('.ltr');
  if (ltr) ltr.textContent='';
  markCorrectWords();
}

function check() {
  let errors = 0;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
    if (puzzle.puzzle[y][x] === '#') continue;
    const want = puzzle.solution[y][x];
    const got = filled[y][x] || '';
    if (want && got && want !== got) errors++;
  }
  statusEl.textContent = errors ? `Errors: ${errors}` : 'All correct so far!';
}

function reveal() {
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
    if (puzzle.puzzle[y][x] === '#') continue;
    filled[y][x] = solNorm[y][x] || '';
  }
  renderGrid();
  markCorrectWords();
}

function useHint() {
  // Reveal current cell if blank and not a block
  if (puzzle.puzzle[focus.y][focus.x] === '#') return;
  if (!filled[focus.y][focus.x]) {
    filled[focus.y][focus.x] = solNorm[focus.y][focus.x] || '';
    const idx = focus.y*W + focus.x;
    const cell = gridEl.children[idx];
    const ltr = cell?.querySelector('.ltr');
    if (ltr) ltr.textContent = filled[focus.y][focus.x];
    hintCount += 1;
    statusEl.textContent = `Hints: ${hintCount}`;
    markCorrectWords();
  }
}

async function loadRandom() {
  // Load random line from grids.jsonl if available
  try {
    // Prefer puzzle from menu selection
    const saved = localStorage.getItem('crossword:selected');
    if (saved) puzzle = JSON.parse(saved);
    if (!puzzle) {
      let text = null;
      for (const path of ['./grids.jsonl', '../grids.jsonl']) {
        text = await fetchTextWithFallback(path);
        if (text) break;
      }
      if (text) {
        const lines = text.split('\n').filter(l=>l.trim().length>0);
        if (lines.length) {
          const r = Math.floor(Math.random()*lines.length);
          puzzle = JSON.parse(lines[r]);
        }
      }
    }
  } catch {}
  if (!puzzle) {
    puzzle = {
      puzzle: ["###........#.","##.#####.#.#.",".#.#####.#.#.",".#.#...#.#.#.","....##.#.#...",".#.###.#.#.#.","#...........#","#.####.###.##",".........#.##","#.####.##.###","#.........###","#########.###","#.........###"],
      solution: ["###APPAREIL#B","##P#####R#J#",".#.#####M#L#",".#.#ULM#RL#.","BLOC##E#ILOU",".#.###.#.#.#","#AMOUREUSE.#","#L####.###.##","GRIMPETTE#.##","#.####.##.###","#GOUGOUTTE###","#########.###","#AMOUREUSE###"],
      clues: { across:[], down:[] }
    };
  }
  H = puzzle.puzzle.length; W = puzzle.puzzle[0].length;
  filled = Array.from({length:H}, ()=>Array(W).fill(''));
  // Build normalized solution
  solNorm = Array.from({length:H}, (_,y)=>Array.from({length:W}, (_,x)=>{
    const ch = (puzzle.solution?.[y]?.[x]) || '';
    if (!ch || ch==="#") return ch;
    return normalizeChar(ch);
  }));
  computeNumbers();
  extractEntries();
  // If puzzle provides clues, map them by number within direction (prefer reasonable-length clues)
  if (puzzle.clues) {
    const mapByNumber = (arr) => {
      const m = new Map();
      for (const c of (arr||[])) {
        if (!c) continue;
        const n = Number(c.number)||0;
        const clueText = (c.clue||'').trim();
        const valid = clueText.length >= 2 && (Number(c.len)||0) >= 2;
        if (n>0 && valid && !m.has(n)) m.set(n, clueText);
      }
      return m;
    };
    const acrossMap = mapByNumber(puzzle.clues.across);
    const downMap = mapByNumber(puzzle.clues.down);
    for (const e of entries.across) { if (acrossMap.has(e.number)) e.clue = acrossMap.get(e.number); }
    for (const e of entries.down) { if (downMap.has(e.number)) e.clue = downMap.get(e.number); }
  }
  renderGrid();
}

function updateCurrentClue() {
  const list = (focus.dir==='across') ? entries.across : entries.down;
  let entry = null;
  for (const e of list) {
    if (focus.dir==='across') {
      if (e.row===focus.y && focus.x>=e.col && focus.x<e.col+e.len) { entry = e; break; }
    } else {
      if (e.col===focus.x && focus.y>=e.row && focus.y<e.row+e.len) { entry = e; break; }
    }
  }
  curDirEl.textContent = focus.dir==='across'?'Across':'Down';
  curNumEl.textContent = entry?.number ?? '—';
  curTextEl.textContent = entry?.clue ?? '';
}

function markCorrectWords() {
  const cells = [...gridEl.children];
  // Across (only runs of length >= 2)
  for (let y=0;y<H;y++) {
    let x=0;
    while (x<W) {
      if (puzzle.puzzle[y][x] !== '#' && (x===0 || puzzle.puzzle[y][x-1]==='#')) {
        let sx=x; let ok=true;
        while (x<W && puzzle.puzzle[y][x] !== '#') {
          const want = (solNorm[y][x]||'').toUpperCase();
          const got = normalizeChar(filled[y][x]||'');
          if (!want || want!==got) ok=false;
          x++;
        }
        const runLen = x - sx;
        if (ok && runLen >= 2) {
          for (let xx=sx; xx<x; xx++) cells[y*W+xx].classList.add('correct');
        }
      } else { x++; }
    }
  }
  // Down (only runs of length >= 2)
  for (let x=0;x<W;x++) {
    let y=0;
    while (y<H) {
      if (puzzle.puzzle[y][x] !== '#' && (y===0 || puzzle.puzzle[y-1][x]==='#')) {
        let sy=y; let ok=true;
        while (y<H && puzzle.puzzle[y][x] !== '#') {
          const want = (solNorm[y][x]||'').toUpperCase();
          const got = normalizeChar(filled[y][x]||'');
          if (!want || want!==got) ok=false;
          y++;
        }
        const runLen = y - sy;
        if (ok && runLen >= 2) {
          for (let yy=sy; yy<y; yy++) cells[yy*W+x].classList.add('correct');
        }
      } else { y++; }
    }
  }
}

document.addEventListener('keydown', (e)=>{
  if (e.key === 'ArrowLeft') move(-1,0);
  else if (e.key === 'ArrowRight') move(1,0);
  else if (e.key === 'ArrowUp') move(0,-1);
  else if (e.key === 'ArrowDown') move(0,1);
  else if (e.key === 'Backspace') backspace();
  else if (e.key.length === 1) enterLetter(e.key);
});

// Mobile input handling
if (mobileInputEl) {
  mobileInputEl.value = '';
  mobileInputEl.addEventListener('beforeinput', (e)=>{
    if (e.inputType === 'deleteContentBackward') {
      backspace();
      e.preventDefault();
    }
  });
  mobileInputEl.addEventListener('input', (e)=>{
    const v = e.target.value || '';
    if (v.length > lastMobileValue.length) {
      const ch = v.slice(-1);
      enterLetter(ch);
    }
    lastMobileValue = v;
    // keep the input short so the keyboard stays in predictable state
    if (mobileInputEl.value.length > 1) mobileInputEl.value = mobileInputEl.value.slice(-1);
  });
  // Focus hidden input when tapping anywhere on the grid area
  document.addEventListener('click', (ev)=>{
    const t = ev.target;
    if (t && (t.closest?.('.grid') || t.closest?.('.grid-wrap'))) {
      try { mobileInputEl.focus({ preventScroll: true }); } catch { mobileInputEl.focus(); }
    }
  });
}

// Remove Reveal/Check/Random; add Menu and Hint only
const menuBtn = q('#btn-menu');
if (menuBtn) menuBtn.addEventListener('click', ()=>{ window.location.href = './menu.html'; });
const hintBtn = q('#btn-hint');
if (hintBtn) hintBtn.addEventListener('click', useHint);

// Theme toggle
toggleDarkEl.addEventListener('change', (e)=>{
  document.body.classList.toggle('light', !e.target.checked);
});

// Default to LIGHT theme
toggleDarkEl.checked = false;
document.body.classList.add('light');

// Relayout on resize/orientation change
function relayout() { renderGrid(); }
window.addEventListener('resize', ()=>{
  clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, 120);
});
window.addEventListener('orientationchange', ()=>{
  clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, 120);
});

loadRandom();


