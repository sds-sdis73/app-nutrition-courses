// ---------------------------------------------------------------------------
// Feuilles modales
// ---------------------------------------------------------------------------
const sheets = [];
function openSheet(html, { full = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-act="close-sheet"></div><div class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true">${full ? '' : '<div class="sheet-grip"></div>'}${html}</div>`;
  document.body.append(wrap);
  sheets.push({ wrap, onClose });
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return wrap.querySelector('.sheet');
}
function closeSheet() {
  const s = sheets.pop();
  if (!s) return;
  s.onClose?.();
  s.wrap.classList.remove('open');
  setTimeout(() => s.wrap.remove(), 280);
}
const topSheet = () => sheets[sheets.length - 1]?.wrap.querySelector('.sheet');
const sheetHead = (title, extra = '') => `<div class="sheet-head"><h2>${esc(title)}</h2>${extra}<button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${ICON.close}</button></div>`;

function confirmSheet(message, okLabel = 'Confirmer', danger = true) {
  return new Promise((resolve) => {
    let done = false;
    const el = openSheet(`<p style="font-size:17px;font-weight:600;margin:4px 0 16px">${esc(message)}</p>
      <div class="grid2"><button class="btn" data-x="no">Annuler</button><button class="btn ${danger ? 'primary' : 'primary'}" data-x="yes" style="${danger ? 'background:var(--danger);border-color:var(--danger)' : ''}">${esc(okLabel)}</button></div>`,
      { onClose: () => { if (!done) resolve(false); } });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      done = true;
      resolve(b.dataset.x === 'yes');
      closeSheet();
    });
  });
}

