// ---------------------------------------------------------------------------
// Notation des produits (méthode Yuka : 60 % nutrition, 30 % additifs, 10 % bio)
// ---------------------------------------------------------------------------
// Niveau de risque : 0 sans risque, 1 risque limité, 2 risque modéré, 3 risque élevé.
const ADDITIVES = {
  E100: ['Curcumine', 0], E101: ['Riboflavine', 0], E102: ['Tartrazine', 3], E104: ['Jaune de quinoléine', 3], E110: ['Jaune orangé S', 3],
  E120: ['Carmin', 2], E122: ['Azorubine', 3], E124: ['Ponceau 4R', 3], E127: ['Érythrosine', 3], E129: ['Rouge allura AC', 3],
  E131: ['Bleu patenté V', 2], E132: ['Indigotine', 2], E133: ['Bleu brillant FCF', 2], E140: ['Chlorophylles', 0], E141: ['Complexes cuivriques de chlorophylles', 1],
  E150A: ['Caramel ordinaire', 0], E150B: ['Caramel de sulfite caustique', 2], E150C: ['Caramel ammoniacal', 3], E150D: ['Caramel au sulfite d\'ammonium', 3],
  E151: ['Noir brillant BN', 3], E153: ['Charbon végétal', 1], E160A: ['Caroténoïdes', 0], E160B: ['Rocou', 1], E160C: ['Extrait de paprika', 0],
  E161B: ['Lutéine', 0], E162: ['Rouge de betterave', 0], E163: ['Anthocyanes', 0], E170: ['Carbonate de calcium', 0], E171: ['Dioxyde de titane', 3],
  E172: ['Oxydes de fer', 1], E200: ['Acide sorbique', 1], E202: ['Sorbate de potassium', 1], E210: ['Acide benzoïque', 2], E211: ['Benzoate de sodium', 2],
  E212: ['Benzoate de potassium', 2], E220: ['Anhydride sulfureux', 2], E221: ['Sulfite de sodium', 2], E222: ['Sulfite acide de sodium', 2], E223: ['Disulfite de sodium', 2],
  E224: ['Disulfite de potassium', 2], E228: ['Sulfite acide de potassium', 2], E234: ['Nisine', 1], E235: ['Natamycine', 1], E239: ['Hexaméthylènetétramine', 3],
  E249: ['Nitrite de potassium', 3], E250: ['Nitrite de sodium', 3], E251: ['Nitrate de sodium', 3], E252: ['Nitrate de potassium', 3],
  E260: ['Acide acétique', 0], E262: ['Acétates de sodium', 0], E270: ['Acide lactique', 0], E280: ['Acide propionique', 1], E282: ['Propionate de calcium', 1],
  E290: ['Dioxyde de carbone', 0], E296: ['Acide malique', 0], E300: ['Acide ascorbique', 0], E301: ['Ascorbate de sodium', 0], E306: ['Tocophérols', 0],
  E307: ['Alpha-tocophérol', 0], E310: ['Gallate de propyle', 2], E316: ['Érythorbate de sodium', 0], E319: ['TBHQ', 3], E320: ['BHA', 3], E321: ['BHT', 3],
  E322: ['Lécithines', 0], E325: ['Lactate de sodium', 0], E330: ['Acide citrique', 0], E331: ['Citrates de sodium', 0], E332: ['Citrates de potassium', 0],
  E333: ['Citrates de calcium', 0], E334: ['Acide tartrique', 0], E338: ['Acide phosphorique', 2], E339: ['Phosphates de sodium', 2], E340: ['Phosphates de potassium', 2],
  E341: ['Phosphates de calcium', 2], E392: ['Extraits de romarin', 0], E401: ['Alginate de sodium', 0], E406: ['Agar-agar', 0], E407: ['Carraghénanes', 2],
  E407A: ['Algues Eucheuma transformées', 2], E410: ['Farine de graines de caroube', 0], E412: ['Gomme guar', 0], E414: ['Gomme arabique', 0], E415: ['Gomme xanthane', 0],
  E418: ['Gomme gellane', 0], E420: ['Sorbitol', 1], E421: ['Mannitol', 1], E422: ['Glycérol', 0], E425: ['Konjac', 1], E433: ['Polysorbate 80', 3],
  E440: ['Pectines', 0], E450: ['Diphosphates', 2], E451: ['Triphosphates', 2], E452: ['Polyphosphates', 2], E460: ['Cellulose', 0], E461: ['Méthylcellulose', 1],
  E464: ['Hydroxypropylméthylcellulose', 1], E466: ['Carboxyméthylcellulose', 2], E471: ['Mono- et diglycérides d\'acides gras', 1], E472E: ['Esters monoacétyltartriques', 1],
  E475: ['Esters polyglycériques', 1], E476: ['Polyricinoléate de polyglycérol', 1], E481: ['Stéaroyl-2-lactylate de sodium', 1], E491: ['Monostéarate de sorbitane', 1],
  E500: ['Carbonates de sodium', 0], E501: ['Carbonates de potassium', 0], E503: ['Carbonates d\'ammonium', 0], E504: ['Carbonates de magnésium', 0], E508: ['Chlorure de potassium', 0],
  E509: ['Chlorure de calcium', 0], E516: ['Sulfate de calcium', 0], E524: ['Hydroxyde de sodium', 0], E551: ['Dioxyde de silicium', 1], E553B: ['Talc', 1],
  E570: ['Acides gras', 0], E575: ['Glucono-delta-lactone', 0], E621: ['Glutamate monosodique', 2], E627: ['Guanylate disodique', 1], E631: ['Inosinate disodique', 1],
  E635: ['Ribonucléotides disodiques', 2], E901: ['Cire d\'abeille', 0], E903: ['Cire de carnauba', 0], E904: ['Shellac', 1], E920: ['L-cystéine', 1],
  E941: ['Azote', 0], E950: ['Acésulfame K', 3], E951: ['Aspartame', 3], E952: ['Cyclamates', 3], E954: ['Saccharine', 3], E955: ['Sucralose', 3],
  E960: ['Glycosides de stéviol', 1], E961: ['Néotame', 2], E962: ['Sel d\'aspartame-acésulfame', 3], E965: ['Maltitol', 1], E966: ['Lactitol', 1],
  E967: ['Xylitol', 1], E968: ['Érythritol', 1], E1400: ['Dextrines', 0], E1404: ['Amidon oxydé', 0], E1414: ['Phosphate de diamidon acétylé', 1],
  E1420: ['Amidon acétylé', 0], E1422: ['Adipate de diamidon acétylé', 1], E1442: ['Phosphate de diamidon hydroxypropylé', 1], E1450: ['Octényle succinate d\'amidon', 1],
  E1520: ['Propylène glycol', 1],
};
const RISK = [
  { label: 'Sans risque', lvl: 'excellent' },
  { label: 'Risque limité', lvl: 'bon' },
  { label: 'Risque modéré', lvl: 'mediocre' },
  { label: 'Risque élevé', lvl: 'mauvais' },
];

function additiveInfo(tag) {
  const code = String(tag).replace(/^[a-z]{2}:/, '').toUpperCase();
  const base = code.match(/^E\d+[A-Z]?/)?.[0] || code;
  const info = ADDITIVES[code] || ADDITIVES[base] || ADDITIVES[base.replace(/[A-Z]$/, '')];
  return { code: base, name: info ? info[0] : 'Additif', risk: info ? info[1] : 0, known: !!info };
}

const isOrganic = (p) => (p.labels_tags || []).some((l) => ['en:organic', 'en:eu-organic', 'fr:ab-agriculture-biologique', 'fr:agriculture-biologique'].includes(l));
const isBeverage = (p) => p.nutriscore_data?.is_beverage === 1 || p.nutriscore_data?.is_beverage === true || (p.categories_tags || []).includes('en:beverages');

function computeScore(p) {
  const grade = String(p.nutriscore_grade || '').toLowerCase();
  if (!/^[a-e]$/.test(grade)) return { total: null };
  const band = { a: [48, 60], b: [36, 47], c: [24, 35], d: [12, 23], e: [0, 11] }[grade];
  let nutri = { a: 60, b: 45, c: 30, d: 15, e: 0 }[grade];
  if (!isBeverage(p) && typeof p.nutriscore_score === 'number') nutri = Math.round((60 * (19 - p.nutriscore_score)) / 27);
  nutri = clamp(nutri, band[0], band[1]);

  const additives = [...new Set(p.additives_tags || [])].map(additiveInfo);
  let add = 30;
  let cap = 100;
  for (const a of additives) {
    if (a.risk === 3) { add = 0; cap = 49; }
    else if (a.risk === 2) add -= 10;
    else if (a.risk === 1) add -= 4;
  }
  add = clamp(add, 0, 30);
  const bio = isOrganic(p) ? 10 : 0;
  return { total: Math.min(cap, nutri + add + bio), nutri, add, bio, additives, grade };
}

function scoreLevel(total) {
  if (total == null) return { lvl: 'na', label: 'Non noté' };
  if (total >= 75) return { lvl: 'excellent', label: 'Excellent' };
  if (total >= 50) return { lvl: 'bon', label: 'Bon' };
  if (total >= 25) return { lvl: 'mediocre', label: 'Médiocre' };
  return { lvl: 'mauvais', label: 'Mauvais' };
}
const scoreHtml = (total, cls = 'score-line') => {
  const s = scoreLevel(total);
  return `<span class="${cls} lvl-${s.lvl}"><span class="dot"></span>${total == null ? s.label : `${total}/100 · ${s.label}`}</span>`;
};

// Seuils pour 100 g (solides) ou 100 ml (boissons).
const NUTRIENTS = [
  { key: 'energy-kcal_100g', label: 'Calories', unit: 'kcal', icon: 'flame', neg: true, t: [160, 360, 560], bev: [14, 35, 48], txt: ['Peu calorique', 'Faible impact', 'Un peu trop calorique', 'Trop calorique'] },
  { key: 'sugars_100g', label: 'Sucres', unit: 'g', icon: 'cube', neg: true, t: [9, 18, 31], bev: [1.5, 3, 7], txt: ['Peu sucré', 'Faible quantité de sucre', 'Un peu trop sucré', 'Trop sucré'] },
  { key: 'saturated-fat_100g', label: 'Graisses saturées', unit: 'g', icon: 'drop', neg: true, t: [2, 4, 7], bev: [1, 2, 4], txt: ['Peu de graisses saturées', 'Faible quantité', 'Un peu trop gras', 'Trop gras'] },
  { key: 'salt_100g', label: 'Sel', unit: 'g', icon: 'flask', neg: true, t: [0.46, 0.92, 1.62], bev: [0.2, 0.4, 0.7], txt: ['Peu salé', 'Faible quantité de sel', 'Un peu trop salé', 'Trop salé'] },
  { key: 'fiber_100g', label: 'Fibres', unit: 'g', icon: 'grain', neg: false, t: [1.9, 3.5], txt: ['Quelques fibres', 'Riche en fibres'] },
  { key: 'proteins_100g', label: 'Protéines', unit: 'g', icon: 'muscle', neg: false, t: [4.7, 8], txt: ['Quelques protéines', 'Excellente quantité de protéines'] },
  { key: 'fruits-vegetables-legumes-estimate-from-ingredients_100g', label: 'Fruits, légumes', unit: '%', icon: 'apple', neg: false, t: [40, 80], txt: ['Quelques fruits et légumes', 'Riche en fruits et légumes'] },
];

function gaugeHtml(value, th, neg) {
  const max = th[th.length - 1] * 1.5;
  const colors = neg ? ['excellent', 'bon', 'mediocre', 'mauvais'] : ['mauvais', 'bon', 'excellent'];
  const pos = clamp((value / max) * 100, 0, 98.5);
  return `<div class="gauge">${colors.map((c) => `<i style="background:var(--${c})"></i>`).join('')}<b style="left:${pos}%"></b></div>`;
}

function analyse(p, sc) {
  const defects = [];
  const qualities = [];
  const n = p.nutriments || {};
  const bev = isBeverage(p);
  for (const def of NUTRIENTS) {
    const v = n[def.key];
    if (typeof v !== 'number') continue;
    const th = bev && def.bev ? def.bev : def.t;
    const val = `${fmtNum(v)} ${def.unit}`;
    if (def.neg) {
      const lvl = v <= th[0] ? 0 : v <= th[1] ? 1 : v <= th[2] ? 2 : 3;
      const item = { icon: def.icon, label: def.label, sub: def.txt[lvl], val, lvl: RISK[lvl].lvl, gauge: gaugeHtml(v, th, true) };
      (lvl >= 2 ? defects : qualities).push(item);
    } else if (v >= th[0] && !bev) {
      const lvl = v >= th[1] ? 1 : 0;
      qualities.push({ icon: def.icon, label: def.label, sub: def.txt[lvl], val, lvl: lvl ? 'excellent' : 'bon', gauge: gaugeHtml(v, th, false) });
    }
  }
  const risky = sc.additives.filter((a) => a.risk > 0);
  if (risky.length) defects.unshift({ icon: 'flask', label: 'Additifs', sub: `${risky.length} additif${risky.length > 1 ? 's' : ''} à risque`, val: '', lvl: RISK[Math.max(...risky.map((a) => a.risk))].lvl });
  else if (!sc.additives.length) qualities.unshift({ icon: 'flask', label: 'Additifs', sub: 'Sans additifs', val: '', lvl: 'excellent' });
  if (sc.bio) qualities.unshift({ icon: 'leaf', label: 'Bio', sub: 'Produit naturel', val: '', lvl: 'excellent' });
  return { defects, qualities };
}

const critHtml = (c) => `<div class="crit"><div class="ico">${ICON[c.icon]}</div><div class="lbl">${esc(c.label)}</div>
  <div class="val lvl-${c.lvl}">${esc(c.val)}<span class="dot"></span></div><div class="sub">${esc(c.sub)}</div>${c.gauge || ''}</div>`;

