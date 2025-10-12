const q = (s) => document.querySelector(s);
const gridEl = q('#grid');
const statusEl = q('#status-text');
const toggleDarkEl = q('#toggle-dark');
const curDirEl = q('#current-dir');
const curNumEl = q('#current-num');
const curTextEl = q('#current-text');
const oskEl = q('#osk');
const isTouchDevice = (("ontouchstart" in window) || (navigator.maxTouchPoints||0) > 0);

let puzzle = null; // { puzzle:[], solution:[], clues }
let W = 0, H = 0;
let focus = { y:0, x:0, dir:'across' };
let filled = []; // current user letters
let numbers = []; // numbering matrix
let entries = { across:[], down:[] };
let solNorm = [];
let hintCount = 0;
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

function isValidPuzzle(p) {
  return p && Array.isArray(p.puzzle) && p.puzzle.length && typeof p.puzzle[0] === 'string';
}

function computeNumbers() {
  numbers = Array.from({length:H}, ()=>Array(W).fill(null));
  let n = 1;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
    if (puzzle.puzzle[y][x] === '#') continue;
    const startAcross = (x===0 || puzzle.puzzle[y][x-1] === '#') && (x+1<W && puzzle.puzzle[y][x+1] !== '#');
    const startDown = (y===0 || puzzle.puzzle[y-1][x] === '#') && (y+1<H && puzzle.puzzle[y+1][x] !== '#');
    if (startAcross || startDown) numbers[y][x] = n++;
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
  const wrap = document.querySelector('.grid-wrap');
  const panel = document.querySelector('.grid-panel');
  const containerWidth = Math.max(wrap?.clientWidth||0, panel?.clientWidth||0, window.innerWidth*0.9);
  const maxWidth = containerWidth - 24;
  let cell = 45;
  const needed = W * (cell + 2);
  if (needed > maxWidth) cell = Math.max(28, Math.floor(maxWidth / W) - 2);
  gridEl.style.setProperty('--cell-size', `${cell}px`);
  gridEl.style.setProperty('--cell-font', `${Math.round(cell*0.4)}px`);
  gridEl.style.gridTemplateColumns = `repeat(${W}, ${cell}px)`;
  for (let y=0;y<H;y++) {
    for (let x=0;x<W;x++) {
      const cellEl = document.createElement('div');
      const isBlock = puzzle.puzzle[y][x] === '#';
      let cls = 'cell';
      if (isBlock) cls += ' block';
      cellEl.className = cls;
      if (!isBlock) {
        const num = numbers[y][x];
        if (num) { const n = document.createElement('div'); n.className = 'num'; n.textContent = num; cellEl.appendChild(n); }
        const ltr = document.createElement('div');
        ltr.className = 'ltr';
        ltr.textContent = filled[y][x] || '';
        cellEl.appendChild(ltr);
        cellEl.addEventListener('click', ()=>focusCell(y,x));
      }
      gridEl.appendChild(cellEl);
    }
  }
  highlightFocus();
}

function toggleDirection() {
  focus.dir = (focus.dir === 'across') ? 'down' : 'across';
  highlightFocus();
}

function focusCell(y,x) {
  if (puzzle.puzzle[y][x] === '#') return;
  if (focus.y === y && focus.x === x) { toggleDirection(); return; }
  focus.y = y; focus.x = x;
  highlightFocus();
}

function scrollFocusIntoView() {
  if (window.innerWidth > 900) return;
  const idx = focus.y*W + focus.x;
  const cell = gridEl.children[idx];
  if (cell?.scrollIntoView) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function highlightFocus() {
  const cells = [...gridEl.children];
  cells.forEach(c=>{ c.classList.remove('focus','run','correct'); });
  const idx = focus.y*W + focus.x;
  const cur = cells[idx];
  if (cur) cur.classList.add('focus');
  if (focus.dir === 'across') {
    let x = focus.x; while (x>=0 && puzzle.puzzle[focus.y][x] !== '#') x--; x++;
    for (;x<W && puzzle.puzzle[focus.y][x] !== '#'; x++) cells[focus.y*W + x].classList.add('run');
  } else {
    let y = focus.y; while (y>=0 && puzzle.puzzle[y][focus.x] !== '#') y--; y++;
    for (;y<H && puzzle.puzzle[y][focus.x] !== '#'; y++) cells[y*W + focus.x].classList.add('run');
  }
  markCorrectWords();
  updateCurrentClue();
  scrollFocusIntoView();
}

function updateCurrentClue() {
  const list = (focus.dir==='across') ? entries.across : entries.down;
  let entry = null;
  for (const e of list) {
    if (focus.dir==='across') { if (e.row===focus.y && focus.x>=e.col && focus.x<e.col+e.len) { entry = e; break; } }
    else { if (e.col===focus.x && focus.y>=e.row && focus.y<e.row+e.len) { entry = e; break; } }
  }
  curDirEl.textContent = focus.dir==='across'?'Across':'Down';
  curNumEl.textContent = entry?.number ?? '—';
  curTextEl.textContent = entry?.clue ?? '';
}

function markCorrectWords() {
  const cells = [...gridEl.children];
  for (let y=0;y<H;y++) {
    let x=0; while (x<W) {
      if (puzzle.puzzle[y][x] !== '#' && (x===0 || puzzle.puzzle[y][x-1]==='#')) {
        let sx=x; let ok=true; while (x<W && puzzle.puzzle[y][x] !== '#') { const want=(solNorm[y][x]||'').toUpperCase(); const got=normalizeChar(filled[y][x]||''); if (!want || want!==got) ok=false; x++; }
        const runLen = x - sx; if (ok && runLen >= 2) { for (let xx=sx; xx<x; xx++) cells[y*W+xx].classList.add('correct'); }
      } else { x++; }
    }
  }
  for (let x=0;x<W;x++) {
    let y=0; while (y<H) {
      if (puzzle.puzzle[y][x] !== '#' && (y===0 || puzzle.puzzle[y-1][x]==='#')) {
        let sy=y; let ok=true; while (y<H && puzzle.puzzle[y][x] !== '#') { const want=(solNorm[y][x]||'').toUpperCase(); const got=normalizeChar(filled[y][x]||''); if (!want || want!==got) ok=false; y++; }
        const runLen = y - sy; if (ok && runLen >= 2) { for (let yy=sy; yy<y; yy++) cells[yy*W+x].classList.add('correct'); }
      } else { y++; }
    }
  }
}

function move(dx, dy) {
  let y = focus.y, x = focus.x;
  do { x += dx; y += dy; } while (x>=0 && x<W && y>=0 && y<H && puzzle.puzzle[y][x] === '#');
  if (x>=0 && x<W && y>=0 && y<H) { focus.y=y; focus.x=x; }
  highlightFocus();
}

document.addEventListener('keydown', (e)=>{
  if (isTouchDevice) return; // desktop only
  if (e.key === 'ArrowLeft') move(-1,0);
  else if (e.key === 'ArrowRight') move(1,0);
  else if (e.key === 'ArrowUp') move(0,-1);
  else if (e.key === 'ArrowDown') move(0,1);
  else if (e.key === 'Backspace') backspace();
  else if (e.key.length === 1) enterLetter(e.key);
});

function renderOnScreenKeyboard() {
  if (!oskEl) return;
  const rows = [ ['A','Z','E','R','T','Y','U','I','O','P'], ['Q','S','D','F','G','H','J','K','L','M'], ['W','X','C','V','B','N'] ];
  oskEl.innerHTML = '';
  const makeRow = (keys) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'osk-row';
    rowEl.style.gridTemplateColumns = `repeat(${keys.length}, 1fr)`;
    keys.forEach((k)=>{
      const btn = document.createElement('button');
      btn.className = 'osk-key';
      btn.textContent = k;
      btn.addEventListener('click', ()=> enterLetter(k));
      rowEl.appendChild(btn);
    });
    return rowEl;
  };
  rows.forEach(r => oskEl.appendChild(makeRow(r)));
  const ctrlRow = document.createElement('div');
  ctrlRow.className = 'osk-row';
  ctrlRow.style.gridTemplateColumns = '1fr 1fr';
  const mk = (label, handler) => { const b=document.createElement('button'); b.className = 'osk-key'; b.textContent=label; b.addEventListener('click', handler); return b; };
  ctrlRow.appendChild(mk('↕', toggleDirection));
  ctrlRow.appendChild(mk('⌫', backspace));
  oskEl.appendChild(ctrlRow);
}

function useHint() {
  if (!puzzle) return;
  // If current cell is a block or already correct, try to move to next editable cell
  if (puzzle.puzzle[focus.y][focus.x] === '#') return;
  const want = normalizeChar(solNorm?.[focus.y]?.[focus.x] || '');
  if (!filled[focus.y][focus.x]) {
    filled[focus.y][focus.x] = want;
    const idx = focus.y*W + focus.x;
    const cell = gridEl.children[idx];
    const ltr = cell?.querySelector('.ltr');
    if (ltr) ltr.textContent = want;
    hintCount += 1;
    if (statusEl) statusEl.textContent = `Hints: ${hintCount} — ${W}×${H}`;
    markCorrectWords();
  }
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
  } else {
    if (focus.dir==='across') move(-1,0); else move(0,-1);
    filled[focus.y][focus.x] = '';
    const cell = gridEl.children[focus.y*W+focus.x];
    const ltr = cell?.querySelector('.ltr');
    if (ltr) ltr.textContent='';
  }
  markCorrectWords();
}

async function loadRandom() {
  try {
    const saved = localStorage.getItem('crossword:selected');
    if (saved) { try { puzzle = JSON.parse(saved); } catch { puzzle = null; } }
    if (!isValidPuzzle(puzzle)) {
      let text = null;
      for (const path of ['./grids.jsonl', '../grids.jsonl']) { text = await fetchTextWithFallback(path); if (text) break; }
      if (text) {
        const lines = text.split('\n').filter(l=>l.trim().length>0);
        let parsed = null;
        for (let t=0; t<Math.min(50, lines.length); t++) {
          const i = Math.floor(Math.random()*lines.length);
          try { const obj = JSON.parse(lines[i]); if (isValidPuzzle(obj)) { parsed = obj; break; } } catch {}
        }
        if (!parsed) {
          for (const l of lines) { try { const obj = JSON.parse(l); if (isValidPuzzle(obj)) { parsed = obj; break; } } catch {} }
        }
        if (parsed) puzzle = parsed;
      }
    }
  } catch {}
  if (!isValidPuzzle(puzzle)) {
    puzzle = { puzzle: ["###........#.","##.#####.#.#.",".#.#####.#.#.",".#.#...#.#.#.","....##.#.#...",".#.###.#.#.#.","#...........#","#.####.###.##",".........#.##","#.####.##.###","#.........###","#########.###","#.........###"], solution: ["###APPAREIL#B","##P#####R#J#",".#.#####M#L#",".#.#ULM#RL#.","BLOC##E#ILOU",".#.###.#.#.#","#AMOUREUSE.#","#L####.###.##","GRIMPETTE#.##","#.####.##.###","#GOUGOUTTE###","#########.###","#AMOUREUSE###"], clues: { across:[], down:[] } };
  }
  try {
    H = puzzle.puzzle.length; W = puzzle.puzzle[0].length;
    filled = Array.from({length:H}, ()=>Array(W).fill(''));
    solNorm = Array.from({length:H}, (_,y)=>Array.from({length:W}, (_,x)=>{ const ch = (puzzle.solution?.[y]?.[x]) || ''; if (!ch || ch==="#") return ch; return normalizeChar(ch);}));
    computeNumbers();
    extractEntries();
    if (puzzle.clues) {
      const mapByNumber = (arr) => { const m = new Map(); for (const c of (arr||[])) { if (!c) continue; const n = Number(c.number)||0; const clueText = (c.clue||'').trim(); const valid = clueText.length >= 2 && (Number(c.len)||0) >= 2; if (n>0 && valid && !m.has(n)) m.set(n, clueText);} return m; };
      const acrossMap = mapByNumber(puzzle.clues.across);
      const downMap = mapByNumber(puzzle.clues.down);
      for (const e of entries.across) { if (acrossMap.has(e.number)) e.clue = acrossMap.get(e.number); }
      for (const e of entries.down) { if (downMap.has(e.number)) e.clue = downMap.get(e.number); }
    }
    renderGrid();
    renderOnScreenKeyboard();
    if (statusEl) statusEl.textContent = `Hints: ${hintCount} — ${W}×${H}`;
  } catch {
    if (statusEl) statusEl.textContent = 'Failed to render grid';
  }
}

// UI wiring
const menuBtn = q('#btn-menu');
if (menuBtn) menuBtn.addEventListener('click', ()=>{ window.location.href = './menu.html'; });
const hintBtn = q('#btn-hint');
if (hintBtn) hintBtn.addEventListener('click', useHint);

toggleDarkEl?.addEventListener('change', (e)=>{ document.body.classList.toggle('light', !e.target.checked); });
// Default to LIGHT theme
if (toggleDarkEl) { toggleDarkEl.checked = false; document.body.classList.add('light'); }

function relayout() { renderGrid(); }
window.addEventListener('resize', ()=>{ clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, 120); });
window.addEventListener('orientationchange', ()=>{ clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, 120); });

loadRandom();


