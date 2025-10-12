const q = (s)=>document.querySelector(s);
const levelsEl = q('#levels');

let allPuzzles = []; // {id, data, w, h}
let selectedId = null;

function fingerprint(p) {
  return `${p.puzzle.length}x${p.puzzle[0].length}-${p.puzzle[0]}`;
}

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

async function loadAll() {
  levelsEl.innerHTML = '<div style="color:#fff;opacity:.8">Loading…</div>';
  let text = null;
  for (const path of ['./grids.jsonl', '../grids.jsonl']) {
    text = await fetchTextWithFallback(path);
    if (text) break;
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
  allPuzzles.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'level-btn';
    btn.textContent = String(i + 1);
    btn.title = `${p.w}×${p.h}`;
    btn.addEventListener('click', () => {
      selectedId = p.id;
      localStorage.setItem('crossword:selected', JSON.stringify(p.data));
      window.location.href = './index.html';
    });
    frag.appendChild(btn);
  });
  levelsEl.appendChild(frag);
}

loadAll();


