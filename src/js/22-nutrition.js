// ---------------------------------------------------------------------------
// Nutrition : table Ciqual (Anses), quantités en grammes, besoins du foyer
// ---------------------------------------------------------------------------
const NUTRI_KEYS = [
  { k: 'kcal', label: 'Énergie', unit: 'kcal', main: true },
  { k: 'prot', label: 'Protéines', unit: 'g', main: true },
  { k: 'gluc', label: 'Glucides', unit: 'g', main: true },
  { k: 'suc', label: 'dont sucres', unit: 'g', sub: true, max: true },
  { k: 'lip', label: 'Lipides', unit: 'g', main: true },
  { k: 'ags', label: 'dont AG saturés', unit: 'g', sub: true, max: true },
  { k: 'fib', label: 'Fibres', unit: 'g', main: true },
  { k: 'sel', label: 'Sel', unit: 'g', max: true },
  { k: 'ca', label: 'Calcium', unit: 'mg' },
  { k: 'fe', label: 'Fer', unit: 'mg' },
  { k: 'vitc', label: 'Vitamine C', unit: 'mg' },
];
const zeroN = () => Object.fromEntries(NUTRI_KEYS.map(({ k }) => [k, 0]));
function addN(a, b, f = 1) { for (const { k } of NUTRI_KEYS) a[k] += (Number(b?.[k]) || 0) * f; return a; }
const scaleN = (n, f) => addN(zeroN(), n, f);

const CQ = {
  list: [], byCode: new Map(), ready: false, loading: null,
  load() {
    if (this.loading) return this.loading;
    this.loading = fetch('aliments.json').then((r) => r.json()).then((d) => {
      const idx = Object.fromEntries(d.fields.map((f, i) => [f, i]));
      this.list = d.aliments.map((a) => {
        const n = {};
        for (const { k } of NUTRI_KEYS) n[k] = a[idx[k]] ?? 0;
        const key = ingKey(a[idx.nom]);
        return { code: a[idx.code], nom: a[idx.nom], groupe: a[idx.groupe], n, key, words: key.split(' '), noKcal: a[idx.kcal] == null };
      });
      this.byCode = new Map(this.list.map((x) => [x.code, x]));
      this.ready = true;
    }).catch((e) => { this.loading = null; this.failed = true; throw e; });
    return this.loading;
  },
  search(q, limit = 30) {
    const words = ingKey(q).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
    if (!words.length) return [];
    const pref = PREFERRED[ingKey(q)];
    return this.list
      .map((a) => ({ a, s: matchScore(words, a) + (a.nom === pref ? 100 : 0) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, limit)
      .map((x) => x.a);
  },
};
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'en', 'et', 'un', 'une', 'pour', 'avec', 'frais', 'fraiche', 'gros', 'petit', 'petite', 'grosse', 'bio', 'beau', 'belle', 'bien', 'mur', 'mure']);
const COMPOSITE = /plats composes|sandwich|pizza|feuilletes|soupes|entrees|desserts|viennoiseries|gateaux|biscuits|confiserie|aliments infantiles|sauces/;
function matchScore(words, a) {
  let s = 0;
  let hits = 0;
  for (const w of words) {
    if (a.words.includes(w)) { s += 3; hits++; }
    else if (a.words.some((x) => x.startsWith(w) && w.length >= 4)) { s += 1.5; hits++; }
  }
  if (!hits) return 0;
  if (a.words[0] === words[0]) s += 2.5;
  if (hits < words.length) s -= (words.length - hits) * 1.5;
  s -= Math.max(0, a.words.length - words.length) * 0.25;
  if (/\bcru\b|\bcrue\b/.test(a.key)) s += 1.2;
  if (/\bnature\b/.test(a.key)) s += 0.4;
  if (COMPOSITE.test(norm(a.groupe))) s -= 2;
  if (a.noKcal) s -= 3;
  // En recette, les légumineuses sont le plus souvent en conserve, prêtes à l'emploi.
  if (a.groupe === 'légumineuses' && /appertise/.test(a.key)) s += 2;
  return s;
}
// Plats (plats.json) : plats Ciqual et plats du quotidien composés d'ingrédients Ciqual, valeurs pour 100 g et portion type.
const PLAT_CATS = ['Petit-déjeuner', 'Plats', 'Sandwichs & burgers', 'Pizzas, tartes & crêpes', 'Salades', 'Soupes', 'Entrées & apéro', 'Goûter', 'Viennoiseries', 'Desserts & pâtisseries'];
const PL = {
  list: [], ready: false, loading: null,
  load() {
    if (this.loading) return this.loading;
    this.loading = fetch('plats.json').then((r) => r.json()).then((d) => {
      const idx = Object.fromEntries(d.fields.map((f, i) => [f, i]));
      this.list = d.plats.map((a) => {
        const n = {};
        for (const { k } of NUTRI_KEYS) n[k] = a[idx[k]] ?? 0;
        const key = ingKey(a[idx.nom]);
        return { id: a[idx.id], nom: a[idx.nom], cat: a[idx.cat], portion: a[idx.portion], src: a[idx.src], groupe: '', n, key, words: key.split(' '), noKcal: false };
      });
      this.ready = true;
    }).catch((e) => { this.loading = null; this.failed = true; throw e; });
    return this.loading;
  },
  search(q, cat, limit = 60) {
    const words = ingKey(q).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
    const pool = cat ? this.list.filter((a) => a.cat === cat) : this.list;
    if (!words.length) return [...pool].sort((a, b) => (a.src === b.src ? a.nom.localeCompare(b.nom, 'fr') : a.src === 'compose' ? -1 : 1)).slice(0, limit);
    return pool.map((a) => ({ a, s: matchScore(words, a) + (a.src === 'compose' ? 0.5 : 0) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, limit).map((x) => x.a);
  },
};
const platCatFor = (slot) => (slot === 'petit-dejeuner' ? 'Petit-déjeuner' : slot === 'gouter' || slot === 'collation' ? 'Goûter' : 'Plats');

// Saisie en texte libre : « 2 œufs, une tartine beurrée et un café » → lignes Ciqual / plats, à vérifier avant d'ajouter.
// Analyse 100 % locale : découpage, quantités (chiffres et mots), unités ménagères, recherche dans les plats et la table Ciqual.
const NLP_NUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, quelques: 3, demi: 0.5, 'une demi': 0.5, 'un demi': 0.5, 'la moitie d': 0.5, 'la moitie de': 0.5, 'un quart de': 0.25 };
const NLP_UNITS = { bol: 250, bols: 250, assiette: 300, assiettes: 300, tasse: 150, tasses: 150, mug: 250, mugs: 250, verre: 200, verres: 200, canette: 330, canettes: 330, bouteille: 500, bouteilles: 500, carre: 5, carres: 5, poignee: 30, poignees: 30, tranche: 30, tranches: 30, morceau: 30, morceaux: 30, cuillere: 15, cuilleres: 15, part: 0, parts: 0, portion: 0, portions: 0 };
const NLP_PREF = {
  cafe: 'Café, non instantané, sans sucres ajoutés, prêt à boire', expresso: 'Café expresso, non instantané, sans sucres ajoutés, prêt à boire', the: 'Thé infusé, sans sucres ajoutés',
  oeuf: 'Oeuf dur', oeufs: 'Oeuf dur', 'oeuf dur': 'Oeuf dur', 'oeufs durs': 'Oeuf dur', 'oeuf au plat': 'Oeuf au plat, sans matière grasse', 'oeufs brouilles': 'Oeuf brouillé, avec matière grasse',
  'jus d orange': "Jus d'orange, pur jus", yaourt: 'Yaourt ou lait fermenté, nature', yaourts: 'Yaourt ou lait fermenté, nature', pomme: 'Pomme, chair et peau, crue', pommes: 'Pomme, chair et peau, crue',
  banane: 'Banane, chair sans peau, crue', bananes: 'Banane, chair sans peau, crue', riz: 'Riz blanc, cuit, sans sel ajouté', pates: 'Pâtes sèches, standard, cuites, sans sel ajouté',
  pain: 'Pain blanc (par ex. : baguette, boule…)', baguette: 'Pain blanc (par ex. : baguette, boule…)', lait: 'Lait demi-écrémé (aliment moyen)', beurre: 'Beurre à 80% MG minimum, doux',
  confiture: 'Confiture de fraise (extra ou classique)', croissant: 'Croissant pur beurre, artisanal', 'pain au chocolat': 'Pain au chocolat, artisanal', chocolatine: 'Pain au chocolat, artisanal',
  coca: 'Cola, sucré', 'coca cola': 'Cola, sucré', soda: 'Cola, sucré', 'chocolat chaud': 'Chocolat chaud, boisson instantanée, sucrée, prête à boire (reconstituée avec du lait demi-écrémé)',
  steak: 'Boeuf, steak ou bifteck grillé/poêlé', jambon: 'Jambon cuit, supérieur', 'jambon blanc': 'Jambon cuit, supérieur', cereales: 'Céréales pour petit déjeuner (aliment moyen)',
  sucre: 'Sucre blanc', biscuit: 'Biscuit sec petit beurre', biscuits: 'Biscuit sec petit beurre', fromage: 'Emmental ou emmenthal', emmental: 'Emmental ou emmenthal', camembert: 'Camembert, sans précision sur le type de lait (pasteurisé ou cru)', comte: 'Comté',
  vin: 'Vin rouge', 'vin rouge': 'Vin rouge', biere: 'Bière "coeur de marché" (4-5° alcool)', compote: 'Compote de pomme, sans précision sur la teneur en sucres ni sur le rayon (aliment moyen)', 'steak hache': 'Boeuf, steak haché 15% MG cuit', frites: 'Frites de pommes de terre, surgelées, rôties/cuites au four', salade: 'Salade verte, crue, sans assaisonnement',
};
// Plats privilégiés pour les mots courants (noms exacts de plats.json).
const NLP_PREF_PLAT = { kebab: 'Sandwich grec ou kebab, pita, crudités', lasagnes: 'Lasagnes ou canellonis à la viande (bolognaise)', lasagne: 'Lasagnes ou canellonis à la viande (bolognaise)', 'croque monsieur': 'Croque-monsieur', 'croque madame': 'Croque-madame', hamburger: 'Hamburger, de restauration rapide', burger: 'Burger maison', pizza: 'Pizza au fromage ou pizza margherita', couscous: 'Couscous à la viande', quiche: 'Quiche lorraine' };
// Poids d'une pièce (g) pour les aliments comptés à l'unité, en plus de ceux des recettes.
const NLP_PIECE = { croissant: 60, 'pain au chocolat': 70, chocolatine: 70, brioche: 50, biscuit: 8, biscuits: 8, 'carre de chocolat': 5, tartine: 40, oeuf: 55, oeufs: 55, clementine: 60, mandarine: 60, fraise: 15, fraises: 15, noix: 5, amande: 1.2, amandes: 1.2, sucre: 5, camembert: 30, fromage: 30, 'tranche de jambon': 40, jambon: 40, yaourt: 125, yaourts: 125, compote: 100 };
// Unités ménagères dont le poids dépend de l'aliment (bol de céréales ≠ bol de soupe).
const NLP_UNIT_FOOD = { 'bol|cereales': 40, 'bols|cereales': 40, 'bol|muesli': 50, 'bol|flocons d avoine': 50, 'bol|riz': 200, 'tranche|jambon': 40, 'tranches|jambon': 40, 'tranche|pain': 30, 'tranches|pain': 30, 'tranche|fromage': 25, 'tranches|fromage': 25, 'carre|chocolat': 5, 'carres|chocolat': 5 };

// Expressions courantes décomposées en plusieurs aliments (grammes par unité).
const NLP_COMBOS = {
  'tartine beurree': [['pain', 40], ['beurre', 8]], 'tartines beurrees': [['pain', 40], ['beurre', 8]], 'tartine de pain beurree': [['pain', 40], ['beurre', 8]],
  'tartine beurre confiture': [['pain', 40], ['beurre', 8], ['confiture', 15]], 'tartine beurre et confiture': [['pain', 40], ['beurre', 8], ['confiture', 15]], 'tartine': [['pain', 40]], 'tartines': [['pain', 40]],
  'cafe au lait': [['cafe', 150], ['lait', 50]], 'cafe creme': [['cafe', 150], ['lait', 50]], 'cafe sucre': [['cafe', 150], ['sucre', 5]], 'the sucre': [['the', 200], ['sucre', 5]],
};
const NLP_WATER = /^(eau|verres? d eau|bouteilles? d eau|eau plate|eau gazeuse|eau petillante)$/;
function nlpFind(name) {
  const k = ingKey(name);
  const words = k.split(' ').filter((w) => w.length > 1 && !STOP.has(w));
  const ali = words.length ? CQ.search(name, 6).map((a) => ({ kind: 'aliment', food: a, s: matchScore(words, a) })).filter((x) => x.s > 0) : [];
  const pla = words.length && PL.ready ? PL.search(name, null, 6).map((a) => ({ kind: 'plat', food: a, s: matchScore(words, a) })).filter((x) => x.s > 0).map((x) => ({ ...x, s: x.s + 0.3 })) : [];
  let all = [...ali, ...pla].sort((x, y) => y.s - x.s);
  const n0 = norm(name).replace(/\s+/g, ' ').trim();
  const prefName = NLP_PREF[n0] || NLP_PREF[k];
  const platName = NLP_PREF_PLAT[n0] || NLP_PREF_PLAT[k];
  const prefA = prefName && CQ.list.find((a) => a.nom === prefName);
  const prefP = platName && PL.list.find((a) => a.nom === platName);
  const pref = prefA ? { kind: 'aliment', food: prefA, s: 99 } : prefP ? { kind: 'plat', food: prefP, s: 99 } : null;
  if (pref) all = [pref, ...all.filter((x) => x.food !== pref.food)];
  // Un résultat doit couvrir au moins la moitié des mots saisis, sinon il est jugé non reconnu.
  const best = all[0] && (all[0].s >= 99 || all[0].s >= Math.max(3, words.length * 1.5)) ? all[0] : null;
  return { best, alts: all.slice(0, 8) };
}
function nlpDefaultGrams(found, name) {
  if (found.kind === 'plat') return found.food.portion;
  const g = norm(found.food.groupe || '');
  if (/boisson|eaux|laits/.test(g)) return /cafe|the|infus/.test(norm(found.food.nom)) ? 150 : 200;
  const k = ingKey(name);
  if (NLP_PIECE[k] != null) return NLP_PIECE[k];
  const hit = Object.keys(NLP_PIECE).find((w) => k.startsWith(`${w} `) || k.endsWith(` ${w}`));
  return hit ? NLP_PIECE[hit] : defaultUnitGrams('pièce', name);
}
function parseMeal(text) {
  // Les virgules décimales (« 1,5 kg ») ne séparent pas les éléments.
  const src = String(text || '').replace(/(\d),(\d)/g, '$1.$2');
  const parts = src.split(/\s*(?:,|;|\+|\n|\bet\b|\bavec\b|\bpuis\b|\bplus\b)\s*/i).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (const raw0 of parts) {
    const raw = raw0.replace(/(\d)\.(\d)/g, '$1,$2');
    let t = ` ${raw0.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/[^a-z0-9.½¼¾ ]+/g, ' ')} `.replace(/\s+/g, ' ');
    let qty = null;
    for (const [w, v] of Object.entries(NLP_NUM).sort((a, b) => b[0].length - a[0].length)) {
      if (t.startsWith(` ${w} `)) { qty = v; t = ` ${t.slice(w.length + 2)}`; break; }
    }
    const num = t.match(/^ (\d+(?:[.,]\d+)?|½|¼|¾)\s*/);
    if (num && qty == null) { qty = num[1] === '½' ? 0.5 : num[1] === '¼' ? 0.25 : num[1] === '¾' ? 0.75 : parseFloat(num[1].replace(',', '.')); t = ` ${t.slice(num[0].length)}`; }
    if (/^ demi /.test(t)) { qty = (qty || 1) * 0.5; t = ` ${t.slice(6)}`; }
    // Unités de masse et de volume, puis unités ménagères.
    let grams = null;
    let unitG = null;
    let unitW = '';
    const mass = t.match(/^ (kg|g|grammes?|ml|cl|dl|l|litres?)\b\s*/);
    if (mass && qty != null) {
      const u = mass[1];
      grams = qty * (u === 'kg' ? 1000 : /^l|litre/.test(u) ? 1000 : u === 'cl' ? 10 : u === 'dl' ? 100 : 1);
      t = ` ${t.slice(mass[0].length)}`;
    } else {
      const hu = t.match(/^ ([a-z]+)\s+/);
      if (hu && hu[1] in NLP_UNITS) { unitG = NLP_UNITS[hu[1]]; unitW = hu[1]; t = ` ${t.slice(hu[0].length)}`; }
    }
    t = t.replace(/^ (de la|de l|des|du|de|d|le|la|les|l|mon|ma|mes|un|une)\s+/, ' ').trim();
    if (!t) continue;
    if (unitW && NLP_UNIT_FOOD[`${unitW}|${t}`] != null) unitG = NLP_UNIT_FOOD[`${unitW}|${t}`];
    if (NLP_WATER.test(t) || (unitG && t === 'eau')) { out.push({ text: raw, kind: 'eau', ml: Math.round(grams || (qty || 1) * (unitG || 200)) }); continue; }
    const combo = NLP_COMBOS[t];
    if (combo) {
      for (const [name, g] of combo) {
        const f = nlpFind(name);
        if (f.best) out.push({ text: raw, kind: f.best.kind, food: f.best.food, grams: Math.round(g * (qty || 1)), alts: f.alts });
      }
      continue;
    }
    const f = nlpFind(t);
    if (!f.best) { out.push({ text: raw, kind: 'inconnu', name: t, alts: f.alts }); continue; }
    const base = unitG === 0 ? (f.best.kind === 'plat' ? f.best.food.portion : 150) : unitG;
    if (grams == null) grams = (qty ?? 1) * (base ?? nlpDefaultGrams(f.best, t));
    out.push({ text: raw, kind: f.best.kind, food: f.best.food, grams: Math.round(grams), alts: f.alts });
  }
  return out;
}

// Aliment Ciqual retenu par défaut pour les noms courants mais ambigus.
const PREFERRED = {
  farine: 'Farine de blé tendre ou froment T55 (pour pains)',
  lait: 'Lait demi-écrémé (aliment moyen)',
  'creme fraiche': 'Crème 30% MG, épaisse, rayon frais',
  'creme fraiche epaisse': 'Crème 30% MG, épaisse, rayon frais',
  'creme liquide': 'Crème 30% MG, fluide, UHT',
  creme: 'Crème 30% MG, fluide, UHT',
  pain: 'Pain blanc (par ex. : baguette, boule…)',
  baguette: 'Pain blanc (par ex. : baguette, boule…)',
  beurre: 'Beurre à 80% MG minimum, doux',
  'beurre doux': 'Beurre à 80% MG minimum, doux',
  sucre: 'Sucre blanc',
};
const matchCache = new Map();
function autoMatch(name) {
  const k = ingKey(name);
  if (!matchCache.has(k)) {
    const pref = PREFERRED[k] && CQ.list.find((a) => a.nom === PREFERRED[k]);
    matchCache.set(k, pref || CQ.search(name, 1)[0] || null);
  }
  return matchCache.get(k);
}

// Poids moyens (g) d'une pièce ou d'une unité ménagère ; modifiables ingrédient par ingrédient.
const PIECE_G = [
  ['tomate cerise', 15], ['citron vert', 60], ['pomme de terre', 150], ['patate douce', 250], ['chou fleur', 600], ['cuisse de poulet', 200],
  ['blanc de poulet', 130], ['filet de poulet', 130], ['escalope', 130], ['steak', 125], ['oignon', 100], ['echalote', 25], ['ail', 5],
  ['carotte', 100], ['courgette', 200], ['tomate', 120], ['poivron', 150], ['aubergine', 250], ['citron', 100], ['orange', 150],
  ['pomme', 150], ['poire', 150], ['banane', 120], ['avocat', 170], ['concombre', 300], ['poireau', 150], ['oeuf', 55],
  ['champignon', 20], ['brocoli', 300], ['salade', 300], ['laitue', 300], ['yaourt', 125], ['saucisse', 60], ['kiwi', 80],
  ['peche', 150], ['abricot', 45], ['mangue', 300], ['navet', 120], ['betterave', 150], ['fenouil', 250], ['chou', 800],
];
const UNIT_G = { 'c. à s.': 15, 'c. à c.': 5, pincée: 0.5, gousse: 5, tranche: 30, botte: 50, sachet: 10, boîte: 400, pot: 125, verre: 200 };
function defaultUnitGrams(unit, name) {
  if (unit === 'pièce' || unit === '') {
    const k = ` ${ingKey(name)} `;
    const hit = PIECE_G.find(([w]) => k.includes(` ${ingKey(w)} `) || k.includes(` ${ingKey(w)}`));
    return hit ? hit[1] : 100;
  }
  return UNIT_G[unit] ?? 100;
}
const MASS_UNITS = { g: 1, kg: 1000, ml: 1, cl: 10, l: 1000 };
const qtyNum = (q) => { const v = parseFloat(String(q ?? '').replace(',', '.')); return isFinite(v) && v > 0 ? v : null; };
function ingGrams(ing) {
  const q = qtyNum(ing.qty);
  if (q == null) return null;
  if (ing.unit in MASS_UNITS) return q * MASS_UNITS[ing.unit];
  return q * (Number(ing.gpu) || defaultUnitGrams(ing.unit || '', ing.name));
}
// Valeurs pour 100 g : produit scanné (Open Food Facts) ou aliment Ciqual choisi / reconnu.
function ingSource(ing) {
  if (ing.n && ing.src !== 'ciqual') return { type: 'off', label: ing.name, n: ing.n };
  const a = ing.cq ? CQ.byCode.get(ing.cq) : autoMatch(ing.name);
  return a ? { type: 'ciqual', label: a.nom, n: a.n, code: a.code, auto: !ing.cq } : null;
}
function offPer100(p) {
  const n = p.nutriments || {};
  const v = (k, f = 1) => (typeof n[k] === 'number' ? n[k] * f : 0);
  return { kcal: v('energy-kcal_100g'), prot: v('proteins_100g'), gluc: v('carbohydrates_100g'), suc: v('sugars_100g'), lip: v('fat_100g'), ags: v('saturated-fat_100g'), fib: v('fiber_100g'), sel: v('salt_100g'), ca: v('calcium_100g', 1000), fe: v('iron_100g', 1000), vitc: v('vitamin-c_100g', 1000) };
}
function recipeNutrition(r) {
  const total = zeroN();
  const lines = (r.ingredients || []).map((ing) => {
    const g = ingGrams(ing);
    const src = ingSource(ing);
    const n = g != null && src ? scaleN(src.n, g / 100) : null;
    if (n) addN(total, n);
    return { ing, g, src, n };
  });
  const servings = r.servings || 1;
  return { total, perPortion: scaleN(total, 1 / servings), lines, missing: lines.filter((l) => !l.n).length };
}

// Nutri-Score 2023 (aliments généraux) à partir des valeurs pour 100 g.
const NS_COLORS = { A: '#038141', B: '#85bb2f', C: '#fecb02', D: '#ee8100', E: '#e63e11' };
const nsPoints = (v, th) => th.filter((t) => v > t).length;
function nutriScore(n100, fvlPct = 0) {
  const kj = n100.kcal * 4.184;
  const N = nsPoints(kj, [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]) + nsPoints(n100.suc, [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34])
    + nsPoints(n100.ags, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) + nsPoints(n100.sel, [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2]);
  const fvl = fvlPct > 80 ? 5 : fvlPct > 60 ? 2 : fvlPct > 40 ? 1 : 0;
  const fib = nsPoints(n100.fib, [3, 4.1, 5.2, 6.3, 7.4]);
  const prot = nsPoints(n100.prot, [2.4, 4.8, 7.2, 9.6, 12, 14, 17]);
  const P = fvl + fib + (N >= 11 && fvl < 5 ? 0 : prot);
  const score = N - P;
  const grade = score <= 0 ? 'A' : score <= 2 ? 'B' : score <= 10 ? 'C' : score <= 18 ? 'D' : 'E';
  return { score, grade, N, P };
}
const FVL_GROUPS = /^(légumes|fruits|légumineuses|fruits à coque et graines oléagineuses|herbes)$/;
function recipeNutriScore(r) {
  const rn = recipeNutrition(r);
  let grams = 0;
  let known = 0;
  let fvl = 0;
  for (const l of rn.lines) {
    if (l.g == null) continue;
    grams += l.g;
    if (!l.n) continue;
    known += l.g;
    if (l.src?.type === 'ciqual' && FVL_GROUPS.test(CQ.byCode.get(l.src.code)?.groupe || '')) fvl += l.g;
  }
  if (!known || known / Math.max(grams, 1) < 0.7) return null;
  const n100 = scaleN(rn.total, 100 / known);
  return { ...nutriScore(n100, (fvl / known) * 100), n100 };
}
const nsBadge = (g, small = false) => (g ? `<span class="ns ${small ? 'small' : ''}" style="background:${NS_COLORS[g.grade]}" title="Nutri-Score ${g.grade}">${g.grade}</span>` : '');

// Besoins : Mifflin-St Jeor (adultes) et équations EER de l'IOM (enfants), repères ANSES/EFSA pour les nutriments.
const ACTIVITY = {
  sedentaire: { label: 'Sédentaire', adult: 1.2, boy: 1.0, girl: 1.0 },
  leger: { label: 'Peu actif', adult: 1.375, boy: 1.06, girl: 1.08 },
  modere: { label: 'Modérément actif', adult: 1.55, boy: 1.13, girl: 1.16 },
  actif: { label: 'Actif', adult: 1.725, boy: 1.26, girl: 1.31 },
  tres_actif: { label: 'Très actif', adult: 1.9, boy: 1.42, girl: 1.56 },
};
const OBJECTIF = { perte: { label: 'Perte de poids', f: 0.85 }, maintien: { label: 'Maintien', f: 1 }, prise: { label: 'Prise de poids', f: 1.1 } };
const REF_KCAL = 2000; // une « portion standard » de recette correspond à un adulte à 2 000 kcal/jour
function ageOf(m, at = new Date()) {
  const b = new Date(m?.naissance || '');
  if (Number.isNaN(b.getTime())) return 30;
  return Math.max(0, (at - b) / (365.25 * 864e5));
}
function computedKcal(m) {
  const age = ageOf(m);
  const w = Number(m.poids_kg);
  const hCm = Number(m.taille_cm);
  const act = ACTIVITY[m.activite] || ACTIVITY.leger;
  let kcal;
  if (age < 3) kcal = 89 * w - 100 + 20;
  else if (age < 19) {
    const ht = hCm / 100;
    const a = Math.floor(age);
    kcal = m.sexe === 'H'
      ? 88.5 - 61.9 * a + act.boy * (26.7 * w + 903 * ht) + (a < 9 ? 20 : 25)
      : 135.3 - 30.8 * a + act.girl * (10 * w + 934 * ht) + (a < 9 ? 20 : 25);
  } else {
    kcal = (10 * w + 6.25 * hCm - 5 * age + (m.sexe === 'H' ? 5 : -161)) * act.adult;
  }
  return Math.round((kcal * (OBJECTIF[m.objectif]?.f || 1)) / 10) * 10;
}
const kcalNeed = (m) => Number(m.kcal_perso) || computedKcal(m);
// Activités manuelles : MET (dépense = MET × poids × heures).
const MET_CATS = {
  'Cardio & fitness': [['CrossFit', 8], ['HIIT / circuit training', 8], ['Fitness / cardio', 7], ['Musculation', 5], ['Musculation intense', 6], ['Body pump / renforcement', 6], ['Spinning / RPM', 8.5], ['Vélo d\'appartement', 6.8], ['Rameur', 7], ['Elliptique', 5], ['Step', 8.5], ['Zumba', 6.5], ['Corde à sauter', 11], ['Yoga / Pilates', 3], ['Stretching', 2.3], ['Gym douce', 3]],
  'Course & marche': [['Marche tranquille', 3], ['Marche rapide', 4.3], ['Marche nordique', 4.8], ['Randonnée', 6], ['Course à pied (9 km/h)', 8.8], ['Course à pied (12 km/h)', 11.5], ['Trail', 9], ['Marche avec poussette', 3.5]],
  'Vélo, glisse & plein air': [['Vélo loisir', 5.8], ['Vélo soutenu', 8.5], ['VTT', 8.5], ['Trottinette', 4], ['Roller', 7.5], ['Skateboard', 5], ['Ski', 6.5], ['Ski de fond', 9], ['Snowboard', 5.3], ['Patinage', 7], ['Surf', 3], ['Paddle', 6], ['Kayak / canoë', 5], ['Équitation', 5.5], ['Escalade', 7.5], ['Golf', 4.8]],
  'Dans l\'eau': [['Natation', 7], ['Natation intense', 9.8], ['Aquagym', 5.3], ['Aquabike', 6]],
  'Sports collectifs': [['Football', 7], ['Basket', 6.5], ['Handball', 8], ['Rugby', 8.3], ['Volley', 4], ['Hockey', 8]],
  'Raquettes': [['Tennis / padel', 7.3], ['Badminton', 5.5], ['Squash', 7.3], ['Ping-pong', 4]],
  'Combat & danse': [['Boxe', 9], ['Kickboxing', 7.3], ['Judo / karaté / taekwondo', 10.3], ['Escrime', 6], ['Danse', 5.5]],
  'Au quotidien': [['Jardinage', 3.8], ['Ménage', 3.3], ['Bricolage', 4], ['Jeux avec les enfants', 4], ['Autre (modéré)', 5]],
};
const MET = Object.entries(MET_CATS).flatMap(([cat, l]) => l.map(([label, v]) => [label, v, cat]));
function needs(m, date) {
  const kcal = kcalNeed(m) + activeBonus(m, date || new Date());
  const age = ageOf(m);
  const adult = age >= 18;
  return {
    kcal,
    prot: Math.round((kcal * 0.15) / 4),
    gluc: Math.round((kcal * 0.5) / 4),
    suc: Math.round((kcal * 0.1) / 4),
    lip: Math.round((kcal * 0.35) / 9),
    ags: Math.round((kcal * 0.12) / 9),
    fib: Math.round((kcal / 1000) * 14),
    sel: adult ? 5 : age < 4 ? 2 : age < 7 ? 3 : age < 11 ? 4 : 5,
    ca: age < 4 ? 450 : age < 11 ? 800 : age < 18 ? 1150 : age < 25 ? 1000 : 950,
    fe: age < 7 ? 7 : age < 12 ? 8 : m.sexe === 'F' && age >= 12 && age < 50 ? 16 : 11,
    vitc: age < 4 ? 20 : age < 7 ? 30 : age < 11 ? 45 : age < 15 ? 70 : age < 18 ? 100 : 110,
  };
}
// Dépense énergétique estimée : métabolisme de base × 1,2 + activités saisies et faites.
function bmrOf(m) {
  const age = ageOf(m);
  const w = Number(m.poids_kg);
  const h = Number(m.taille_cm);
  if (age < 19) return Math.round(computedKcal({ ...m, objectif: 'maintien' }) / (ACTIVITY[m.activite]?.adult || 1.375));
  return Math.round(10 * w + 6.25 * h - 5 * age + (m.sexe === 'H' ? 5 : -161));
}
const dayActs = (memberId, iso) => state.activites.filter((a) => a.member_id === memberId && a.date === iso);
function expense(m, date) {
  const seances = dayActs(m.id, isoDate(date)).filter((a) => a.kind === 'seance' && a.statut !== 'prevu');
  const active = seances.reduce((t, a) => t + (Number(a.kcal) || 0), 0);
  const minutes = seances.reduce((t, a) => t + (Number(a.minutes) || 0), 0);
  return { total: Math.round(bmrOf(m) * 1.2 + active), active: Math.round(active), minutes, seances };
}
// Poids : tendance lissée (moyenne mobile exponentielle) et pente en kg/semaine sur les 28 derniers jours (régression linéaire).
function weightTrend(list) {
  const pts = [...list].filter((x) => Number(x.poids_kg) > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!pts.length) return null;
  let ema = Number(pts[0].poids_kg);
  const smooth = pts.map((x) => { ema += 0.25 * (Number(x.poids_kg) - ema); return { date: x.date, kg: Number(x.poids_kg), trend: Math.round(ema * 10) / 10 }; });
  const last = pts[pts.length - 1];
  const t0 = isoToDate(last.date).getTime();
  const recent = pts.filter((x) => (t0 - isoToDate(x.date).getTime()) / 864e5 <= 28);
  const xs = recent.map((x) => (isoToDate(x.date).getTime() - t0) / 864e5);
  const ys = recent.map((x) => Number(x.poids_kg));
  const span = recent.length ? -Math.min(...xs) : 0;
  let slopeWeek = null;
  if (recent.length >= 4 && span >= 14) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const num = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0);
    const den = xs.reduce((t, x) => t + (x - mx) ** 2, 0);
    slopeWeek = den ? Math.round((num / den) * 7 * 100) / 100 : 0;
  }
  return { last: Number(last.poids_kg), lastDate: last.date, trend: smooth[smooth.length - 1].trend, slopeWeek, n: recent.length, span, points: smooth };
}
// Conseil doux : ±100 kcal seulement si la tendance de 2 semaines s'écarte nettement de l'objectif.
function weightAdvice(m, list) {
  const t = weightTrend(list);
  if (!t || t.slopeWeek == null) return null;
  const s = t.slopeWeek;
  let delta = 0;
  let why = '';
  if (m.objectif === 'perte') {
    if (s > -0.1) { delta = -100; why = 'Le poids ne baisse pas depuis 2 semaines.'; }
    else if (s < -1) { delta = 100; why = 'Le poids baisse vite (plus de 1 kg par semaine) : mieux vaut ralentir.'; }
  } else if (m.objectif === 'prise') {
    if (s < 0.05) { delta = 100; why = 'Le poids ne monte pas depuis 2 semaines.'; }
    else if (s > 0.6) { delta = -100; why = 'Le poids monte vite : on peut lever le pied.'; }
  } else if (Math.abs(s) > 0.3) {
    delta = s > 0 ? -100 : 100;
    why = s > 0 ? 'Le poids monte doucement depuis 2 semaines.' : 'Le poids descend doucement depuis 2 semaines.';
  }
  if (!delta) return null;
  const kcal = clamp(Math.round((kcalNeed(m) + delta) / 10) * 10, 900, 5000);
  return { delta, kcal, why, slopeWeek: s };
}

// Hydratation : repères EFSA pour les boissons (≈ 80 % de l'eau totale), + 500 ml par heure d'activité faite.
function waterGoal(m, date = new Date()) {
  if (Number(m.objectif_eau_ml)) return Number(m.objectif_eau_ml);
  const age = ageOf(m);
  const base = age >= 14 ? (m.sexe === 'H' ? 2000 : 1600) : age >= 9 ? (m.sexe === 'H' ? 1700 : 1500) : age >= 4 ? 1300 : 1000;
  return Math.round((base + (expense(m, date).minutes / 60) * 500) / 50) * 50;
}
const waterDay = (m, date) => state.eau.filter((x) => x.member_id === m.id && x.date === isoDate(date));
const waterTotal = (m, date) => waterDay(m, date).reduce((t, x) => t + x.ml, 0);
const fmtL = (ml) => (ml >= 1000 ? `${fmtNum(ml / 1000)} L` : `${ml} ml`);
const memberFactor = (m) => kcalNeed(m) / REF_KCAL;
const memberById = (id) => state.members.find((m) => m.id === id);
function mealEaters(meal) {
  if (!state.members.length) return [];
  if (!Array.isArray(meal.eaters)) return state.members;
  return state.members.filter((m) => meal.eaters.includes(m.id));
}
// Nombre de portions standard d'un repas : somme des parts de chaque mangeur + invités (1 portion chacun).
function mealServings(meal) {
  if (!state.members.length) return meal.servings || 1;
  return Math.max(0.25, mealEaters(meal).reduce((s, m) => s + memberFactor(m), 0) + (meal.guests || 0));
}
function mealWho(meal) {
  if (!state.members.length) return `${meal.servings} pers.`;
  const eaters = mealEaters(meal);
  const names = eaters.length === state.members.length ? 'Tout le foyer' : eaters.map((m) => m.nom).join(', ') || 'Personne';
  return `${names}${meal.guests ? ` + ${meal.guests} invité${meal.guests > 1 ? 's' : ''}` : ''}`;
}
const fmtPortions = (n) => `${fmtNum(n)} portion${n >= 2 ? 's' : ''}`;
const fmtN = (v, unit) => `${unit === 'kcal' ? Math.round(v) : fmtNum(v)} ${unit}`;

// Tableau de valeurs nutritionnelles (avec repères quotidiens si fournis).
function nutriTable(n, { need, title } = {}) {
  return `<div class="ntable">${title ? `<div class="nt-title">${esc(title)}</div>` : ''}
    ${NUTRI_KEYS.map(({ k, label, unit, sub, max }) => {
      const pct = need?.[k] ? Math.round((n[k] / need[k]) * 100) : null;
      return `<div class="nt-row ${sub ? 'sub' : ''}"><span>${label}</span><b>${fmtN(n[k] || 0, unit)}</b>${pct != null ? `<span class="pct ${max && pct > 100 ? 'over' : ''}">${pct} %</span>` : ''}</div>`;
    }).join('')}</div>`;
}
const isoToDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

