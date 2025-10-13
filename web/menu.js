const q = (s)=>document.querySelector(s);
const levelsEl = q('#levels');

let allPuzzles = []; // {id, data, w, h}
let selectedId = null;

function fingerprint(p) {
  return `${p.puzzle.length}x${p.puzzle[0].length}-${p.puzzle[0]}`;
}

function getStats() {
  try {
    const raw = localStorage.getItem('crossword:stats');
    if (!raw) return { completed: [], perLevel:{} };
    const obj = JSON.parse(raw);
    obj.completed = Array.isArray(obj.completed) ? obj.completed : [];
    obj.perLevel = obj.perLevel && typeof obj.perLevel==='object' ? obj.perLevel : {};
    return obj;
  } catch { return { completed: [], perLevel:{} }; }
}

async function loadAll() {
  levelsEl.innerHTML = '<div style="color:#fff;opacity:.8">Loading…</div>';
  let text = null;
  for (const path of ['./grids.jsonl', '../grids.jsonl']) {
    try {
      const res = await fetch(path);
      if (res.ok) { text = await res.text(); break; }
    } catch {}
  }
  if (!text) { levelsEl.innerHTML = '<div style="color:#fff;opacity:.8">Failed to load grids.jsonl</div>'; return; }
  const lines = text.split('\n').filter(l=>l.trim().length>0);
  allPuzzles = lines.map((l, idx) => {
    let data = null; try { data = JSON.parse(l); } catch {}
    const id = data ? fingerprint(data) : `p${idx}`;
    const w = data?.puzzle?.[0]?.length || 0;
    const h = data?.puzzle?.length || 0;
    return { id, data, w, h };
  });
  renderLevels();
}

function renderLevels() {
  levelsEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  const stats = getStats();
  if (!allPuzzles.length) { levelsEl.textContent = 'No puzzles.'; return; }
  // Deterministic selection anchored to 2025-10-14 (UTC) as day 0
  const nowDays = Math.floor(Date.now() / 86400000);
  const epochDays = Math.floor(Date.UTC(2025, 9, 13) / 86400000); // month is 0-based
  const dayIndex = nowDays - epochDays; // 0 => 2025-10-14, 1 => next day, etc.
  const N = allPuzzles.length;
  const idxToday = ((dayIndex % N) + N) % N;         // day 0 -> first puzzle
  const idxYest  = (((dayIndex - 1) % N) + N) % N;   // previous day

  const row = document.createElement('div');
  row.className = 'row';

  const makeBtn = (p, label) => {
    const btn = document.createElement('button');
    btn.className = 'level-btn';
    btn.textContent = label;
    btn.title = `${p.w}×${p.h}`;
    if (stats.completed.includes(p.id)) {
      const badge = document.createElement('div');
      badge.className = 'level-badge';
      badge.textContent = '✔';
      btn.style.position = 'relative';
      btn.appendChild(badge);
    }
    btn.addEventListener('click', () => {
      selectedId = p.id;
      localStorage.setItem('crossword:selected', JSON.stringify(p.data));
      window.location.href = './index.html';
    });
    return btn;
  };

  row.appendChild(makeBtn(allPuzzles[idxToday], "Joue à celui d'aujourd'hui"));
  row.appendChild(makeBtn(allPuzzles[idxYest], "Joue à celui d'hier"));
  frag.appendChild(row);
  levelsEl.appendChild(frag);
}

loadAll();


