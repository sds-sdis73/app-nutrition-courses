// ---------------------------------------------------------------------------
// Compagnon animal : rendu SVG, humeurs, messages, bilan quotidien, coquillages, boutique
// ---------------------------------------------------------------------------
const ESPECES = { loutre: { label: 'Loutre', nom: 'Noisette' }, herisson: { label: 'Hérisson', nom: 'Pico' }, renard: { label: 'Renard', nom: 'Rouxy' } };
const ACCESSOIRES = [['bonnet', 'Bonnet', 20], ['echarpe', 'Écharpe', 20], ['lunettes', 'Lunettes', 25], ['noeud', 'Nœud', 25], ['casquette', 'Casquette', 30], ['couronne', 'Couronne de fleurs', 45], ['tablier', 'Tablier de chef', 50], ['medaille', 'Médaille', 60], ['cape', 'Cape de héros', 80], ['bandeau', 'Bandeau de trail', 30], ['frontale', 'Frontale', 40], ['dossard', 'Dossard', 35]];
const FONDS = [['jardin', 'Jardin', 0], ['plage', 'Plage', 60], ['foret', 'Forêt', 60], ['montagne', 'Montagne', 80], ['cuisine', 'Cuisine', 80], ['espace', 'Espace', 120], ['sommet', 'Sommet', 90]];
const FRIANDISES = [['pomme', '🍎', 'Pomme', 5], ['fraise', '🍓', 'Fraises', 5], ['carotte', '🥕', 'Carotte', 5], ['poisson', '🐟', 'Poisson', 8], ['smoothie', '🥤', 'Smoothie', 8], ['cupcake', '🧁', 'Cupcake', 12]];
const FAVORI = { loutre: 'poisson', herisson: 'fraise', renard: 'pomme' };
const WELCOME_SHELLS = 100;
const companionOf = (m) => (m ? state.compagnons.find((c) => c.member_id === m.id) : null) || null;
const worn = (c) => (c?.accessoires || []).filter((a) => !a.startsWith('!'));
const owned = (c) => (c?.accessoires || []).map((a) => a.replace(/^!/, ''));

// Dessin : corps par espèce, visage selon l'humeur, accessoires par-dessus.
function companionSvg(c, mood = 'content', size = 140) {
  const sp = c?.espece || 'loutre';
  const acc = worn(c);
  const eyes = {
    content: '<circle cx="42" cy="46" r="3.2" fill="#2b2320"/><circle cx="58" cy="46" r="3.2" fill="#2b2320"/><circle cx="43" cy="45" r="1" fill="#fff"/><circle cx="59" cy="45" r="1" fill="#fff"/>',
    ravi: '<path d="M38 47q4-5 8 0M54 47q4-5 8 0" stroke="#2b2320" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    fier: '<path d="M38 47q4-5 8 0M54 47q4-5 8 0" stroke="#2b2320" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M22 28l2 4 4 1-4 2-2 4-2-4-4-2 4-1zM78 22l1.5 3 3 .8-3 1.5-1.5 3-1.5-3-3-1.5 3-.8z" fill="#f0c04a"/>',
    faim: '<circle cx="42" cy="46" r="3" fill="#2b2320"/><circle cx="58" cy="46" r="3" fill="#2b2320"/><path d="M69 36q3 4 0 7q-3-3 0-7" fill="#8fc1e3"/>',
    dodo: '<path d="M38 47h8M54 47h8" stroke="#2b2320" stroke-width="2.4" stroke-linecap="round"/><text x="70" y="30" font-size="11" font-weight="800" fill="#7a8a7d">z</text><text x="78" y="22" font-size="9" font-weight="800" fill="#7a8a7d">z</text>',
    sportif: '<circle cx="42" cy="46" r="3.2" fill="#2b2320"/><circle cx="58" cy="46" r="3.2" fill="#2b2320"/><path d="M30 36h40" stroke="#dd5b3e" stroke-width="5" stroke-linecap="round"/>',
    matin: '<circle cx="42" cy="46" r="3.2" fill="#2b2320"/><circle cx="58" cy="46" r="3.2" fill="#2b2320"/><circle cx="84" cy="16" r="6" fill="#f0c04a"/>',
    rassasie: '<path d="M38 46q4 3 8 0M54 46q4 3 8 0" stroke="#2b2320" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  }[mood] || '';
  const mouth = { ravi: '<path d="M43 56q7 8 14 0" stroke="#2b2320" stroke-width="2.4" fill="#b8443a" stroke-linejoin="round"/>', fier: '<path d="M43 56q7 8 14 0" stroke="#2b2320" stroke-width="2.4" fill="#b8443a"/>', faim: '<path d="M44 58h12" stroke="#2b2320" stroke-width="2.4" stroke-linecap="round"/>', dodo: '<circle cx="50" cy="58" r="2" fill="#2b2320"/>', sportif: '<ellipse cx="50" cy="58" rx="4" ry="3" fill="#2b2320"/>', rassasie: '<path d="M45 57q5 3 10 0" stroke="#2b2320" stroke-width="2.4" fill="none" stroke-linecap="round"/>' }[mood] || '<path d="M45 56q5 5 10 0" stroke="#2b2320" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
  const body = {
    loutre: '<ellipse cx="50" cy="78" rx="26" ry="20" fill="#8a6a4f"/><ellipse cx="50" cy="82" rx="15" ry="13" fill="#d9c3a5"/><circle cx="50" cy="48" r="22" fill="#8a6a4f"/><circle cx="31" cy="34" r="6" fill="#8a6a4f"/><circle cx="69" cy="34" r="6" fill="#8a6a4f"/><ellipse cx="50" cy="56" rx="12" ry="9" fill="#d9c3a5"/><ellipse cx="50" cy="52" rx="3.5" ry="2.5" fill="#2b2320"/><path d="M26 84q-3 10 6 10M74 84q3 10-6 10" stroke="#6f533d" stroke-width="5" fill="none" stroke-linecap="round"/>',
    herisson: '<path d="M22 70l6-10 7 8 6-11 6 10 6-11 6 11 7-8 6 10q8 12 2 24H22q-6-12 0-24z" fill="#6b4f3a"/><ellipse cx="50" cy="84" rx="22" ry="14" fill="#8f7357"/><ellipse cx="52" cy="54" rx="22" ry="18" fill="#e8d6bd"/><path d="M28 50l-10 6 12 2z" fill="#e8d6bd"/><circle cx="18" cy="56" r="3" fill="#2b2320"/><path d="M32 42l5-9 5 8 5-9 5 8 5-9 5 8" stroke="#6b4f3a" stroke-width="6" fill="none" stroke-linejoin="round"/><path d="M34 96v6M48 96v6M62 96v6" stroke="#6f533d" stroke-width="4" stroke-linecap="round"/>',
    renard: '<ellipse cx="50" cy="80" rx="24" ry="18" fill="#d8864a"/><ellipse cx="50" cy="84" rx="13" ry="11" fill="#f6e9d6"/><path d="M28 40l4-22 12 14zM72 40l-4-22-12 14z" fill="#d8864a"/><path d="M31 36l2-12 7 9zM69 36l-2-12-7 9z" fill="#f0c7b0"/><circle cx="50" cy="48" r="22" fill="#d8864a"/><path d="M34 54q16 20 32 0q-8 6-16 6t-16-6z" fill="#f6e9d6"/><ellipse cx="50" cy="53" rx="3.5" ry="2.5" fill="#2b2320"/><path d="M30 86q-4 8 4 10M70 86q4 8-4 10" stroke="#b86a35" stroke-width="5" fill="none" stroke-linecap="round"/>',
  }[sp];
  const access = {
    bonnet: '<path d="M30 32q20-18 40 0v6H30z" fill="#dd5b3e"/><rect x="29" y="34" width="42" height="7" rx="3" fill="#f6e9d6"/><circle cx="50" cy="16" r="5" fill="#f6e9d6"/>',
    echarpe: '<path d="M30 66q20 10 40 0v8q-20 10-40 0z" fill="#5f8a67"/><path d="M62 70l6 18h8l-8-18z" fill="#5f8a67"/>',
    lunettes: '<circle cx="42" cy="46" r="7" stroke="#2b2320" stroke-width="2.2" fill="rgba(255,255,255,.25)"/><circle cx="58" cy="46" r="7" stroke="#2b2320" stroke-width="2.2" fill="rgba(255,255,255,.25)"/><path d="M49 46h2M35 44l-6-2M65 44l6-2" stroke="#2b2320" stroke-width="2"/>',
    noeud: '<path d="M60 26l12-6v14zM60 26l-12-6v14z" fill="#c4553f"/><circle cx="60" cy="26" r="3" fill="#9a3f2e"/>',
    couronne: '<path d="M28 34q22-12 44 0" stroke="#5f8a67" stroke-width="4" fill="none"/>' + [32, 42, 52, 62, 70].map((x, i) => `<circle cx="${x}" cy="${[33, 28, 27, 28, 33][i]}" r="3.5" fill="${['#f4a3b5', '#f0c04a', '#f4a3b5', '#fff', '#f0c04a'][i]}"/>`).join(''),
    tablier: '<path d="M38 70h24l4 26H34z" fill="#f6e9d6"/><path d="M42 70v-6h16v6" stroke="#f6e9d6" stroke-width="3" fill="none"/><path d="M44 80h12" stroke="#5f8a67" stroke-width="2"/>',
    cape: '<path d="M26 66q24 12 48 0l4 36H22z" fill="#6a7fd1" opacity=".9"/><path d="M30 66q20 6 40 0" stroke="#f0c04a" stroke-width="3" fill="none"/>',
  };
  access.bandeau = '<path d="M28 36q22-10 44 0v6q-22-10-44 0z" fill="#2fb3a3"/><path d="M68 38l10-4-2 8z" fill="#2fb3a3"/>';
  access.frontale = '<path d="M29 37q21-12 42 0" stroke="#27233a" stroke-width="3.5" fill="none"/><rect x="43" y="25" width="14" height="9" rx="3" fill="#f0c04a" stroke="#27233a" stroke-width="1.5"/><path d="M50 22l-3-6M50 22v-7M50 22l3-6" stroke="#ffe07a" stroke-width="1.6" stroke-linecap="round"/>';
  access.dossard = '<rect x="38" y="70" width="24" height="16" rx="2" fill="#fff" stroke="#27233a" stroke-width="1.5"/><text x="50" y="82" font-size="9" font-weight="800" text-anchor="middle" fill="#dc3a3a">73</text>';
  access.casquette = '<path d="M29 37q21-24 42 0z" fill="#5b7fc7"/><path d="M62 35q16-3 22 5H62z" fill="#3f5fa3"/><circle cx="50" cy="22" r="2.5" fill="#3f5fa3"/>';
  access.medaille = '<path d="M43 62l7 11 7-11" stroke="#dd5b3e" stroke-width="3" fill="none"/><circle cx="50" cy="77" r="6.5" fill="#f0c04a" stroke="#c99a2a" stroke-width="1.5"/><path d="M50 73.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="#fff6c9"/>';
  const tail = { loutre: '<path d="M74 86q14 2 16-10" stroke="#8a6a4f" stroke-width="8" fill="none" stroke-linecap="round"/>', renard: '<path d="M72 84q18 2 16-14q-4 4-8 4" fill="#d8864a"/><path d="M84 72q6 4 4-2" fill="#f6e9d6"/>' }[sp] || '';
  const cheeks = mood === 'dodo' ? '' : '<circle cx="35" cy="55" r="3.6" fill="#f4a3b5" opacity=".55"/><circle cx="65" cy="55" r="3.6" fill="#f4a3b5" opacity=".55"/>';
  const closed = ['ravi', 'fier', 'dodo', 'rassasie'].includes(mood);
  const behind = acc.includes('cape') ? access.cape : '';
  const front = acc.filter((a) => a !== 'cape').map((a) => access[a] || '').join('');
  return `<svg class="comp comp-${mood}" viewBox="0 0 100 104" width="${size}" height="${size * 1.04}" aria-label="${esc(c?.nom || 'Compagnon')}"><g class="tail">${tail}</g>${behind}${body}${cheeks}<g class="eyes${closed ? ' closed' : ''}">${eyes}</g>${mouth}${front}</svg>`;
}

// Décors : ciel selon l'heure, paysage selon le fond choisi.
let sceneSeq = 0;
const periodOf = (h = new Date().getHours()) => (h < 6 || h >= 21 ? 'nuit' : h < 10 ? 'matin' : h < 17 ? 'jour' : 'soir');
function sceneSvg(fond = 'jardin', period = periodOf()) {
  const id = `sk${++sceneSeq}`;
  const sky = { matin: ['#ffd9b0', '#d7ecf5'], jour: ['#9fd3f0', '#e6f5fb'], soir: ['#f3a37a', '#f8dcaa'], nuit: ['#16203c', '#3a4a78'] }[fond === 'espace' ? 'nuit' : period];
  const night = period === 'nuit' || fond === 'espace';
  const stars = night ? [[30, 30], [80, 60], [130, 22], [170, 70], [215, 35], [260, 80], [300, 20], [350, 64], [380, 30], [110, 100], [240, 110], [60, 120]].map(([x, y], i) => `<circle class="star" style="animation-delay:${i * 0.4}s" cx="${x}" cy="${y}" r="${i % 3 ? 1.3 : 2}" fill="#fff"/>`).join('') : '';
  const astre = night ? '<circle cx="330" cy="52" r="18" fill="#f4f1de"/><circle cx="338" cy="46" r="15" fill="' + sky[0] + '"/>' : period === 'matin' ? '<circle cx="64" cy="96" r="24" fill="#ffd36b"/>' : period === 'soir' ? '<circle cx="300" cy="112" r="28" fill="#ff9a5a" opacity=".9"/>' : '<circle cx="322" cy="52" r="26" fill="#ffe07a"/><circle cx="322" cy="52" r="36" fill="#ffe07a" opacity=".25"/>';
  const clouds = night ? '' : '<g class="clouds" fill="#fff" opacity=".85"><ellipse cx="90" cy="48" rx="34" ry="11"/><ellipse cx="110" cy="40" rx="20" ry="10"/><ellipse cx="230" cy="74" rx="28" ry="9"/></g>';
  const land = {
    jardin: '<path d="M0 170q70-40 150-10t140-12 110 8V290H0z" fill="#7ee0b5"/><path d="M0 205q100-26 200-6t200-4V290H0z" fill="#4cc38a"/><rect x="44" y="120" width="10" height="70" rx="4" fill="#8a6a4f"/><circle cx="49" cy="112" r="30" fill="#6fa463"/><circle cx="32" cy="124" r="18" fill="#6fa463"/><circle cx="66" cy="124" r="18" fill="#7cb06e"/><g stroke="#e9dcc4" stroke-width="4"><path d="M300 205v-34M326 205v-34M352 205v-34M378 205v-34"/><path d="M292 180h100M292 194h100" stroke-width="3"/></g>' + [[110, 250, '#f4a3b5'], [150, 262, '#f0c04a'], [250, 255, '#fff'], [290, 268, '#f4a3b5'], [350, 250, '#f0c04a'], [70, 270, '#fff']].map(([x, y, col]) => `<circle cx="${x}" cy="${y}" r="5" fill="${col}"/><circle cx="${x}" cy="${y}" r="2" fill="#e8a33d"/>`).join(''),
    plage: '<rect y="165" width="400" height="50" fill="#5fb0d3"/><path class="wave" d="M-20 180q20-6 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/><path d="M0 205q100-14 200 0t200-4V290H0z" fill="#f1dcae"/><path d="M340 140v100" stroke="#8a6a4f" stroke-width="4"/><path d="M296 150q44-44 88 0z" fill="#dd5b3e"/><path d="M318 150q22-44 44 0z" fill="#fff" opacity=".8"/><circle cx="80" cy="262" r="6" fill="#f4a3b5"/><path d="M110 250l8 6-8 6" fill="#f0c04a"/>',
    foret: '<path d="M0 190V290H400V190z" fill="#79a565"/>' + [20, 75, 140, 200, 265, 330, 385].map((x, i) => `<path d="M${x} ${70 + (i % 3) * 14}l-30 ${110 - (i % 3) * 10}h60z" fill="#5d8a5a"/>`).join('') + [50, 160, 310, 370].map((x) => `<path d="M${x} 120l-34 100h68z" fill="#3f6b45"/><rect x="${x - 4}" y="220" width="8" height="12" fill="#6b4f3a"/>`).join('') + '<path d="M0 222q200-12 400 0V290H0z" fill="#6c9858"/><rect x="236" y="246" width="6" height="12" fill="#f6e9d6"/><path d="M228 248q11-14 22 0z" fill="#dd5b3e"/><circle cx="235" cy="244" r="1.6" fill="#fff"/><circle cx="244" cy="245" r="1.6" fill="#fff"/>',
    montagne: '<path d="M-10 200L90 70l60 70 60-90 90 110 50-50 70 90z" fill="#8a9bb0"/><path d="M90 70l-22 28 14-4 8 8 10-12 12 10zM210 50l-24 30 14-4 10 10 10-10 12 8z" fill="#fff"/><path d="M0 205q100-30 200-8t200 0V290H0z" fill="#93bf7d"/><path d="M0 238q120-16 240 0t160 0V290H0z" fill="#7fae6c"/>',
    cuisine: '<rect width="400" height="290" fill="#f7ecd9"/><rect x="36" y="34" width="120" height="100" rx="8" fill="url(#' + id + ')" stroke="#c69a6b" stroke-width="6"/><path d="M96 34v100M36 84h120" stroke="#c69a6b" stroke-width="4"/>' + (night ? '<circle cx="128" cy="58" r="9" fill="#f4f1de"/>' : '<circle cx="128" cy="60" r="12" fill="#ffe07a"/>') + '<g fill="#e7dcc8">' + Array.from({ length: 10 }, (_, i) => `<rect x="${i * 40}" y="150" width="38" height="38" rx="3"/>`).join('') + '</g><rect y="200" width="400" height="90" fill="#c69a6b"/><rect y="196" width="400" height="12" fill="#e0bd8f"/><path d="M230 60v40M262 60v34M294 60v44" stroke="#8a6a4f" stroke-width="3"/><circle cx="230" cy="106" r="8" fill="none" stroke="#7a7f88" stroke-width="4"/><rect x="256" y="94" width="12" height="18" rx="3" fill="#7a7f88"/><path d="M288 104h12l-2 12h-8z" fill="#7a7f88"/><path d="M318 168h56v28h-56z" fill="#5f8a67"/><rect x="312" y="164" width="68" height="8" rx="3" fill="#4b7353"/><path class="steam" d="M334 156q-6-8 0-16M350 156q-6-8 0-16M366 156q-6-8 0-16" stroke="#fff" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/>',
    sommet: '<path d="M-10 230L70 120l40 40 90-130 80 110 40-30 90 130z" fill="#7b8fa6"/><path d="M200 30l-30 42 16-6 14 14 12-16 18 12z" fill="#fff"/><path d="M200 30v-22" stroke="#27233a" stroke-width="2.5"/><path d="M200 8l22 6-22 7z" fill="#dc3a3a"/><path d="M0 240q90-26 200-8t200 0V290H0z" fill="#93bf7d"/><path d="M40 290q60-60 140-70" stroke="#e9dcc4" stroke-width="5" fill="none" stroke-dasharray="2 9" stroke-linecap="round"/>',
    espace: '<circle cx="90" cy="80" r="30" fill="#e8a33d"/><ellipse cx="90" cy="80" rx="50" ry="10" fill="none" stroke="#f4d58a" stroke-width="4" transform="rotate(-18 90 80)"/><path d="M0 214q200-50 400 0V290H0z" fill="#c9c6d6"/><ellipse cx="80" cy="250" rx="22" ry="7" fill="#aaa6bd"/><ellipse cx="300" cy="236" rx="16" ry="5" fill="#aaa6bd"/><ellipse cx="220" cy="270" rx="12" ry="4" fill="#aaa6bd"/><path d="M340 214v-40" stroke="#7a7f88" stroke-width="3"/><path d="M340 174h28l-6 8 6 8h-28z" fill="#dd5b3e"/>',
  }[fond] || '';
  const indoor = fond === 'cuisine';
  const dark = night && !indoor && fond !== 'espace' ? '<rect width="400" height="290" fill="#0b1430" opacity=".32"/>' : '';
  return `<svg class="scene-bg" viewBox="0 0 400 290" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
    ${indoor ? '' : `<rect width="400" height="290" fill="url(#${id})"/>${stars}${astre}${clouds}`}${land}${dark}${indoor ? '' : ''}</svg>`;
}

// Compagnon vivant : petits gestes au repos, réactions aux saisies, caresses, bulles qui changent.
const ACTS = ['act-hop', 'act-wiggle', 'act-look', 'act-spin', 'act-eat', 'act-drink'];
const PET_MSG = {
  caresse: ['Hihi, ça chatouille !', 'Encore, encore !', 'Je t\'adore, tu sais.', 'Un câlin, ça recharge les batteries.', 'Ronron… euh, je ne suis pas un chat.'],
  repas: ['Miam, c\'est noté ! Merci de prendre soin de toi.', 'Bien joué, un repas de plus dans le carnet.', 'Ça sent bon d\'ici !'],
  boire: ['Glou glou ! Ça hydrate.', 'Un verre de plus, bravo !', 'L\'eau, c\'est la vie. Et toi aussi.'],
  sport: ['Bravo pour cette activité ! Je suis épaté·e.', 'Quelle énergie ! On fait une petite danse ?', 'Ton corps te dit merci.'],
  miam: ['Délicieux ! Merci beaucoup.', 'Miam miam, c\'était trop bon !', 'Tu me gâtes !'],
  favori: ['Mon plat préféré ! Tu me connais par cœur.', 'Ooooh ! C\'est mon péché mignon !'],
  idle: ['Tu m\'as manqué !', 'Touche-moi, j\'adore les câlins.', 'Je me demande ce qu\'on mange ce soir…', 'On forme une super équipe, toi et moi.', 'Petit à petit, on avance. Je suis fier·e de toi.'],
};
const rnd = (l) => l[Math.floor(Math.random() * l.length)];
const Pet = {
  queue: [],
  lines: [],
  timer: null,
  greeted: false,
  el: () => document.querySelector('[data-scene]'),
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.idle(), 6500);
  },
  stop() { clearInterval(this.timer); this.timer = null; this.greeted = false; this.queue = []; this.lines = []; },
  idle() {
    const sc = this.el();
    if (!sc || document.hidden || sheets.length) return;
    const r = Math.random();
    if (r < 0.5) this.act(rnd(['act-hop', 'act-wiggle', 'act-look', 'act-look', 'act-spin']));
    if (r > 0.45 && this.lines.length) this.say(rnd(this.lines));
  },
  act(cls, ms = 1200) {
    const t = this.el()?.querySelector('.comp-tap');
    if (!t) return;
    t.classList.remove(...ACTS);
    void t.offsetWidth;
    t.classList.add(cls);
    clearTimeout(this.actT);
    this.actT = setTimeout(() => t.classList.remove(cls), ms);
  },
  say(text) {
    const b = this.el()?.querySelector('[data-bubble]');
    if (!b || !text) return;
    b.classList.add('fade');
    setTimeout(() => { b.textContent = text; b.classList.remove('fade'); }, 220);
  },
  fx(txt, { n = 1, cls = 'fx-up', spread = 24 } = {}) {
    const sc = this.el();
    if (!sc) return;
    const walk = sc.querySelector('.comp-walk');
    const x = walk ? walk.getBoundingClientRect().left - sc.getBoundingClientRect().left + walk.offsetWidth / 2 : sc.offsetWidth / 2;
    for (let i = 0; i < n; i++) {
      const s2 = document.createElement('span');
      s2.className = `fx ${cls}`;
      s2.textContent = txt;
      s2.style.left = `${x - 14 + (Math.random() - 0.5) * spread * 2}px`;
      s2.style.animationDelay = `${i * 0.18}s`;
      sc.appendChild(s2);
      setTimeout(() => s2.remove(), 2200 + i * 180);
    }
  },
  // Les réactions sont mises en file puis jouées sur la scène affichée (après le prochain rendu).
  play(kind, arg) {
    this.queue = [...this.queue.filter((q) => Date.now() - q[2] < 60000), [kind, arg, Date.now()]].slice(-4);
    setTimeout(() => this.flush(), 80);
  },
  flush() {
    if (!this.el() || !this.queue.length) return;
    const q = this.queue.splice(0);
    q.forEach(([k, a], i) => setTimeout(() => this.run(k, a), 250 + i * 1100));
  },
  run(kind, arg) {
    const c = companionOf(journalMember());
    if (kind === 'gain') {
      this.fx(`+${arg} 🐚`, { cls: 'fx-gain', spread: 4 });
      const chip = this.el()?.querySelector('[data-shells]');
      if (chip && c) { chip.textContent = `${c.coquillages} 🐚`; chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop'); }
      return;
    }
    if (kind === 'hello') { this.act('act-hop'); this.fx('👋'); this.say(arg); return; }
    if (kind === 'pet') { this.act('act-hop'); this.fx('❤️', { n: 3 }); this.say(rnd(PET_MSG.caresse)); return; }
    if (kind === 'repas') { this.act('act-eat', 1500); this.fx('✨', { n: 2 }); this.say(rnd(PET_MSG.repas)); return; }
    if (kind === 'boire') { this.act('act-drink', 1500); this.fx('💧', { n: 3 }); this.say(rnd(PET_MSG.boire)); return; }
    if (kind === 'sport') { this.act('act-spin'); this.fx('⭐', { n: 3 }); this.say(rnd(PET_MSG.sport)); return; }
    if (kind === 'miam') { this.fx(arg.emoji, { cls: 'fx-drop', spread: 0 }); setTimeout(() => { this.act('act-eat', 1600); this.fx(arg.fav ? '💖' : '❤️', { n: arg.fav ? 4 : 2 }); }, 900); this.say(rnd(arg.fav ? PET_MSG.favori : PET_MSG.miam)); return; }
    if (kind === 'achat') { this.act('act-spin'); this.fx('✨', { n: 4 }); this.say(arg); }
  },
  pet() {
    const m = journalMember();
    this.run('pet');
    const k = `caresses:${isoDate(new Date())}:${m?.id}`;
    const n = store.get(k, 0) + 1;
    store.set(k, n);
    if (n <= 3) Rewards.earn(m, `caresse:${n}`, 1);
  },
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && Pet.el()) Pet.act('act-hop'); });

// Coquillages : un gain par (membre, jour, clé), enregistré côté serveur (fonction gagner).
const Rewards = {
  today: () => isoDate(new Date()),
  async earn(m, cle, n, date = isoDate(new Date())) {
    if (!m || !companionOf(m) || state.offline) return 0;
    try {
      const { data, error } = await db.rpc('gagner', { p_member: m.id, p_date: date, p_cle: cle, p_n: n });
      if (error || data == null) return 0;
      companionOf(m).coquillages = data;
      if (m.id === journalMember()?.id) Pet.play('gain', n);
      return n;
    } catch { return 0; }
  },
  journal(row) {
    const m = memberById(row.member_id);
    if (!m || row.date !== this.today()) return;
    if (m.id === journalMember()?.id) Pet.play('repas');
    this.earn(m, `repas:${row.slot}`, 3);
  },
  eau(row) {
    const m = memberById(row.member_id);
    if (!m || row.date !== this.today()) return;
    if (m.id === journalMember()?.id) Pet.play('boire');
    const n = waterDay(m, new Date()).length;
    if (n <= 8) this.earn(m, `eau:${n}`, 1);
    if (waterTotal(m, new Date()) >= waterGoal(m)) this.earn(m, 'eau-objectif', 5);
  },
  sport(a) {
    const m = memberById(a.member_id);
    if (!m || a.kind !== 'seance' || a.statut === 'prevu' || a.date !== this.today()) return;
    if (m.id === journalMember()?.id) Pet.play('sport');
    const n = dayActs(m.id, a.date).filter((x) => x.kind === 'seance' && x.statut !== 'prevu').length;
    if (n <= 3) this.earn(m, `activite:${n}`, 5);
  },
  // Cadeau de bienvenue (une fois par compagnon) et visite du jour.
  async daily() {
    const me = journalMember();
    for (const m of state.members) {
      if (!companionOf(m)) continue;
      const got = await this.earn(m, 'bienvenue', WELCOME_SHELLS, '2000-01-01');
      if (got && m.id === me?.id) toast(`Cadeau de bienvenue : ${WELCOME_SHELLS} coquillages pour ${companionOf(m).nom} !`);
    }
    if (me) await this.earn(me, 'visite', 5);
  },
};

// Critères du jour : atteindre sans dépasser.
function dayCriteria(m, date) {
  const md = memberDay(m, date);
  const nd = needs(m, date);
  const ex = expense(m, date);
  const t = md.total;
  const ratio = nd.kcal ? t.kcal / nd.kcal : 0;
  const items = [
    { key: 'cible', label: 'Calories dans la cible (90–105 %)', ok: ratio >= 0.9 && ratio <= 1.05, detail: `${Math.round(t.kcal)} / ${nd.kcal} kcal (${Math.round(ratio * 100)} %)`, over: ratio > 1.05, under: ratio < 0.9 },
    { key: 'proteines', label: 'Assez de protéines', ok: t.prot >= nd.prot * 0.9, detail: `${fmtNum(t.prot)} / ${nd.prot} g` },
    { key: 'fibres', label: 'Assez de fibres', ok: t.fib >= nd.fib * 0.8, detail: `${fmtNum(t.fib)} / ${nd.fib} g` },
    { key: 'sucres', label: 'Sucres sous le repère', ok: t.kcal > 0 && t.suc <= nd.suc, detail: `${fmtNum(t.suc)} / ≤ ${nd.suc} g` },
    { key: 'sel', label: 'Sel sous le repère', ok: t.kcal > 0 && t.sel <= nd.sel, detail: `${fmtNum(t.sel)} / ≤ ${nd.sel} g` },
    { key: 'journal', label: 'Journée renseignée', ok: md.entries.length >= 3, detail: `${md.entries.length} entrée(s)` },
    { key: 'bouge', label: 'Bouger', ok: ex.active >= (Number(m.objectif_kcal_actives) || 300), detail: `${ex.active} / ${Number(m.objectif_kcal_actives) || 300} kcal actives`, na: !ex.seances.length },
    { key: 'eau', label: 'Bien hydraté·e', ok: waterTotal(m, date) >= waterGoal(m, date) * 0.9, detail: `${fmtL(waterTotal(m, date))} / ${fmtL(waterGoal(m, date))}`, na: !waterDay(m, date).length },
  ];
  const counted = items.filter((i) => !i.na);
  const score = counted.filter((i) => i.ok).length;
  const cible = items[0].ok;
  const shells = score * 2 + (cible && score >= 5 ? 5 : 0);
  return { items, counted, score, max: counted.length, cible, shells, empty: md.entries.length === 0 };
}
const MSG = {
  cible: ['Pile dans la cible, sans en faire trop : c\'est exactement ça.', 'Objectif atteint et respecté. Tu n\'as rien forcé, tu as juste bien fait.', 'Équilibre parfait aujourd\'hui. Ta régularité vaut plus que n\'importe quel exploit.'],
  under: ['Journée légère. Pas de souci : demain, pense à un vrai petit-déjeuner.', 'Un peu en dessous. Ton corps a besoin d\'énergie pour tenir : on ajuste doucement.'],
  over: ['Un peu au-dessus aujourd\'hui, et alors ? Une journée ne fait pas une semaine.', 'Repas copieux ? Ça arrive à tout le monde. Demain repart à zéro, sans compensation.'],
  faim: ['Rien noté depuis ce matin… tu as mangé ? Note-le vite, même à peu près.', 'Mon ventre gargouille pour toi. Un tap sur le journal et c\'est réglé.'],
  matin: ['Bonjour ! Un bon petit-déjeuner et la journée est lancée.', 'Nouvelle journée, nouvelle page. On y va tranquillement.'],
  content: ['Belle journée en cours, on continue comme ça.', 'Tout roule. Pense à boire un verre d\'eau.'],
  rassasie: ['Bien nourri·e ! Le reste de la journée peut être léger.', 'Le compteur est déjà bien rempli : une soirée douce fera l\'affaire.'],
  sportif: ['Tu as bien bougé aujourd\'hui ! Tes muscles méritent des protéines.', 'Quelle énergie ! N\'oublie pas de bien manger pour récupérer.'],
  dodo: ['Il est tard, je m\'endors. À demain pour le bilan !', 'Zzz… une bonne nuit, c\'est aussi de la santé.'],
  fier: ['{serie} jours de suite dans la cible. Je suis tellement fier·e de toi !', 'Une série de {serie} jours ! On ne lâche rien.'],
};
const pick = (k, c) => { const l = MSG[k] || MSG.content; return l[Math.floor(Date.now() / 36e5) % l.length].replace('{serie}', c?.serie ?? 0); };
function companionMood(m, c) {
  const h = new Date().getHours();
  const date = new Date();
  const cr = dayCriteria(m, date);
  const ex = expense(m, date);
  if (h >= 22) return 'dodo';
  if ((c?.serie || 0) >= 7 && h < 11) return 'fier';
  if (ex.active >= (Number(m.objectif_kcal_actives) || 300) * 1.3) return 'sportif';
  if (h < 11 && cr.empty) return 'matin';
  if (h >= 14 && cr.empty) return 'faim';
  const ratio = cr.items[0].over ? 'rassasie' : cr.items[0].ok || h < 19 ? 'content' : 'content';
  return cr.cible && h >= 19 ? 'ravi' : ratio;
}

// Bilan de la veille : calcule, enregistre, met à jour coquillages et série, puis affiche une fois par jour.
async function evaluateYesterday() {
  const y = addDays(new Date(), -1);
  const iso = isoDate(y);
  const todo = state.members.filter((m) => companionOf(m) && !state.bilans.some((b) => b.member_id === m.id && b.date === iso));
  if (!todo.length) return;
  // La veille peut appartenir à la semaine précédente (lundi) : on charge alors son journal et son planning à part.
  let swap = null;
  if (mondayOf(y).getTime() !== state.week.getTime()) {
    const wk = isoDate(mondayOf(y));
    const [j, p] = await Promise.all([
      db.from(T.journal).select('*').eq('foyer_id', foyer()).eq('date', iso),
      db.from(T.plan).select('*').eq('foyer_id', foyer()).eq('week', wk),
    ]);
    if (j.error || p.error) return;
    swap = { week: state.week, plan: state.plan, journal: state.journal };
    Object.assign(state, { week: mondayOf(y), plan: p.data, journal: j.data });
  }
  const crits = new Map();
  try { for (const m of todo) crits.set(m.id, dayCriteria(m, y)); } finally { if (swap) Object.assign(state, swap); }
  const results = [];
  for (const m of todo) {
    const c = companionOf(m);
    const cr = crits.get(m.id);
    if (!cr || cr.empty) continue;
    const serie = cr.score >= 3 ? (c.serie || 0) + 1 : 0;
    try {
      await Data.saveBilan({ member_id: m.id, date: iso, score: cr.score, criteres: Object.fromEntries(cr.items.map((i) => [i.key, i.ok])), coquillages: cr.shells });
      await Data.saveCompagnon({ ...c, coquillages: (c.coquillages || 0) + cr.shells, serie, meilleure_serie: Math.max(c.meilleure_serie || 0, serie) });
      results.push({ m, c: companionOf(m), cr, serie });
    } catch (e) { console.warn('bilan', e); }
  }
  if (!results.length || store.get(`bilanShown:${iso}`, false)) return;
  store.set(`bilanShown:${iso}`, true);
  const me = results.find((r) => r.m.id === journalMember()?.id) || results[0];
  bilanSheet(me, y);
  render();
}
function bilanSheet({ m, c, cr, serie }, date) {
  const msg = cr.cible ? pick('cible') : cr.items[0].over ? pick('over') : pick('under');
  const confetti = cr.cible ? `<div class="confetti">${Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 7) * 0.15}s;background:${['#5f8a67', '#f0c04a', '#f4a3b5', '#8fc1e3', '#dd5b3e'][i % 5]}"></i>`).join('')}</div>` : '';
  openSheet(`${confetti}<div style="text-align:center;padding-top:4px">${companionSvg(c, cr.cible ? 'ravi' : cr.score >= 3 ? 'content' : 'rassasie', 120)}
    <h2 style="margin:4px 0 2px">Bilan de ${date.toLocaleDateString('fr-FR', { weekday: 'long' })} · ${esc(m.nom)}</h2>
    <p class="bubble" style="display:inline-block">${esc(msg)}</p></div>
    <div class="macro-strip" style="grid-template-columns:repeat(3,1fr);margin:10px 0"><div><b>${cr.score}/${cr.max}</b><span>objectifs</span></div><div><b>+${cr.shells}</b><span>coquillages</span></div><div><b>${serie}</b><span>jour${serie > 1 ? 's' : ''} de suite</span></div></div>
    <div class="ntable">${cr.items.filter((i) => !i.na).map((i) => `<div class="nt-row"><span>${i.ok ? '✅' : '◻️'} ${i.label}</span><b class="muted small">${esc(i.detail)}</b></div>`).join('')}</div>
    ${cr.cible && cr.score >= 5 ? '<p class="small" style="text-align:center;color:var(--primary-strong)"><b>Bonus +5</b> : objectif atteint sans le dépasser, avec une journée équilibrée.</p>' : ''}
    <div class="grid2" style="margin-top:8px"><button class="btn" data-act="boutique">Boutique</button><button class="btn primary" data-act="close-sheet">Merci !</button></div>`);
}

function adoptSheet(m) {
  let espece = 'loutre';
  const el = openSheet(`${sheetHead(`Un compagnon pour ${m.nom}`)}
    <p class="muted small" style="margin-top:0">Il t'encourage, fête tes objectifs atteints sans excès et ne te gronde jamais. Cadeau d'arrivée : ${WELCOME_SHELLS} 🐚 pour le personnaliser tout de suite.</p>
    <div class="grid3" data-especes>${Object.entries(ESPECES).map(([k, e]) => `<button type="button" class="card espece" aria-pressed="${k === espece}" data-e="${k}">${companionSvg({ espece: k }, 'content', 80)}<b>${e.label}</b></button>`).join('')}</div>
    <form class="stack" data-form="adopt" style="margin-top:12px"><label class="field"><span>Son prénom</span><input class="input" name="nom" maxlength="30" value="${ESPECES[espece].nom}" required></label>
    <button class="btn primary block">Adopter</button></form>`);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-e]');
    if (!b) return;
    espece = b.dataset.e;
    $$('[data-e]', el).forEach((x) => x.setAttribute('aria-pressed', x.dataset.e === espece));
    const inp = $('[name="nom"]', el);
    if (Object.values(ESPECES).some((x) => x.nom === inp.value)) inp.value = ESPECES[espece].nom;
  });
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const c = await Data.saveCompagnon({ member_id: m.id, espece, nom: e.target.nom.value.trim() || ESPECES[espece].nom });
      closeSheet(); render();
      await Rewards.earn(m, 'bienvenue', WELCOME_SHELLS, '2000-01-01');
      toast(`${c.nom} rejoint la famille avec ${WELCOME_SHELLS} coquillages de bienvenue !`);
      boutiqueSheet(m, 'accessoires');
    } catch (err) { fail(err); }
  });
}
function boutiqueSheet(m, tab = 'friandises') {
  const c = companionOf(m);
  if (!c) return adoptSheet(m);
  const el = openSheet(`${sheetHead('Boutique')}<div data-body></div>`);
  const draw = () => {
    const cc = companionOf(m);
    const has = owned(cc);
    const card = (inner, label, btn) => `<div class="bq-item">${inner}<b>${label}</b>${btn}</div>`;
    const price = (k, prix, kind) => `<button class="btn small ${cc.coquillages < prix ? '' : 'primary'}" data-buy="${k}" data-kind="${kind}" ${cc.coquillages < prix ? 'disabled' : ''}>${prix} 🐚</button>`;
    const panes = {
      friandises: FRIANDISES.map(([k, emo, l, prix]) => card(`<span class="bq-emo">${emo}</span>`, `${l}${FAVORI[cc.espece] === k ? ' 💖' : ''}`, price(k, prix, 'friandise'))).join(''),
      accessoires: ACCESSOIRES.map(([k, l, prix]) => card(companionSvg({ ...cc, accessoires: [k] }, 'content', 70), l, has.includes(k) ? `<button class="btn small ${worn(cc).includes(k) ? 'primary' : 'soft'}" data-wear="${k}">${worn(cc).includes(k) ? 'Porté ✓' : 'Mettre'}</button>` : price(k, prix, 'accessoire'))).join(''),
      fonds: FONDS.map(([k, l, prix]) => card(`<span class="bq-fond">${sceneSvg(k, 'jour')}</span>`, l, prix === 0 || has.includes(`fond:${k}`) ? `<button class="btn small ${cc.fond === k ? 'primary' : 'soft'}" data-fond="${k}">${cc.fond === k ? 'Choisi ✓' : 'Choisir'}</button>` : price(`fond:${k}`, prix, 'fond'))).join(''),
    };
    $('[data-body]', el).innerHTML = `<div class="scene scene-mini">${sceneSvg(cc.fond || 'jardin')}<div class="comp-walk still">${companionSvg(cc, 'content', 120)}</div><div class="scene-top"><span class="pill">${cc.coquillages} 🐚</span></div></div>
      <div class="seg bq-tabs" role="tablist" style="margin:10px 0">${[['friandises', '🍓 Friandises'], ['accessoires', '🎀 Tenues'], ['fonds', '🏞️ Décors']].map(([k, l]) => `<button data-tab-shop="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div>
      <div class="bq-grid">${panes[tab]}</div>
      <p class="muted small">Gagner des coquillages : visite du jour +5, chaque repas noté +3, chaque verre d'eau +1 (objectif d'eau +5), activité faite +5, câlins +1, et le bilan du soir (2 par objectif, +5 si les calories sont dans la cible).</p>`;
  };
  draw();
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab-shop]');
    if (t) { tab = t.dataset.tabShop; draw(); return; }
    const b = e.target.closest('[data-buy],[data-wear],[data-fond]');
    if (!b) return;
    const cc = companionOf(m);
    try {
      if (b.dataset.kind === 'friandise') {
        const [k, emoji, , prix] = FRIANDISES.find((f) => f[0] === b.dataset.buy);
        if (cc.coquillages < prix) return;
        await Data.saveCompagnon({ ...cc, coquillages: cc.coquillages - prix, friandises: (cc.friandises || 0) + 1 });
        closeSheet(); render();
        Pet.play('miam', { emoji, fav: FAVORI[cc.espece] === k });
        return;
      }
      if (b.dataset.buy) {
        const prix = b.dataset.kind === 'fond' ? FONDS.find((f) => `fond:${f[0]}` === b.dataset.buy)[2] : ACCESSOIRES.find((a) => a[0] === b.dataset.buy)[2];
        if (cc.coquillages < prix) return;
        const patch = { coquillages: cc.coquillages - prix, accessoires: [...(cc.accessoires || []), b.dataset.buy] };
        if (b.dataset.kind === 'fond') patch.fond = b.dataset.buy.slice(5);
        await Data.saveCompagnon({ ...cc, ...patch });
        Pet.play('achat', b.dataset.kind === 'fond' ? 'Waouh, quel nouveau décor !' : 'Je suis trop beau·belle comme ça !');
      } else if (b.dataset.fond) await Data.saveCompagnon({ ...cc, fond: b.dataset.fond });
      else { const k = b.dataset.wear; const acc = (cc.accessoires || []).map((a) => (a.replace(/^!/, '') === k ? (a.startsWith('!') ? k : `!${k}`) : a)); await Data.saveCompagnon({ ...cc, accessoires: acc }); }
      draw(); render();
    } catch (err) { fail(err); }
  });
}
function compagnonSettings() {
  const m = journalMember();
  const c = companionOf(m);
  if (!c) return adoptSheet(m);
  const el = openSheet(`${sheetHead(`Compagnon de ${m.nom}`)}
    <form class="stack" data-form="comp"><div class="grid2"><label class="field"><span>Prénom</span><input class="input" name="nom" value="${esc(c.nom)}" maxlength="30" required></label>
      <label class="field"><span>Espèce</span><select class="input" name="espece">${Object.entries(ESPECES).map(([k, e]) => `<option value="${k}" ${k === c.espece ? 'selected' : ''}>${e.label}</option>`).join('')}</select></label></div>
      <label class="check"><input type="checkbox" name="messages" ${c.messages ? 'checked' : ''}> Afficher ses messages sur l'accueil</label>
      <button class="btn primary block">Enregistrer</button>
      <button type="button" class="btn danger block" data-x="reset">Réinitialiser coquillages et série</button></form>`);
  $('form', el).addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target; try { await Data.saveCompagnon({ ...c, nom: f.nom.value.trim(), espece: f.espece.value, messages: f.messages.checked }); closeSheet(); render(); } catch (err) { fail(err); } });
  $('[data-x="reset"]', el).addEventListener('click', async () => { if (await confirmSheet('Remettre les coquillages et la série à zéro ?', 'Réinitialiser')) { try { await Data.saveCompagnon({ ...c, coquillages: 0, serie: 0, meilleure_serie: 0, accessoires: [] }); closeSheet(); render(); } catch (err) { fail(err); } } });
}
// Anneau de progression SVG.
function ring(value, max, color, label, sub) {
  const pct = max ? clamp(value / max, 0, 1) : 0;
  const r = 26; const circ = 2 * Math.PI * r;
  return `<div class="ring"><svg viewBox="0 0 64 64" width="72" height="72"><circle cx="32" cy="32" r="${r}" stroke="var(--ring-track)" stroke-width="9" fill="none"/>
    <circle cx="32" cy="32" r="${r}" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="${(pct * circ).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 32 32)"/>
    <text x="32" y="36" text-anchor="middle" font-size="13" font-weight="800" fill="var(--text)">${value < 10 && value % 1 ? fmtNum(Math.round(value * 10) / 10) : Math.round(value)}</text></svg><b>${label}</b><span class="muted small">${sub}</span></div>`;
}

