// ---------------------------------------------------------------------------
// Ingrédients : analyse, rayons, unités
// ---------------------------------------------------------------------------
const UNITS = ['', 'g', 'kg', 'ml', 'cl', 'l', 'pièce', 'c. à s.', 'c. à c.', 'pincée', 'gousse', 'tranche', 'botte', 'sachet', 'boîte', 'pot', 'verre'];
const AISLES = ['Fruits & légumes', 'Boucherie & poissonnerie', 'Crèmerie & œufs', 'Fromages', 'Boulangerie', 'Épicerie salée', 'Épicerie sucrée', 'Conserves', 'Surgelés', 'Boissons', 'Herbes & épices', 'Entretien & maison', 'Hygiène & beauté', 'Bébé & animaux', 'Autres'];
const AISLE_WORDS = {
  'Fruits & légumes': 'oignon, echalote, ail, carotte, courgette, tomate, poivron, aubergine, pomme, poire, banane, citron, orange, salade, laitue, epinard, brocoli, chou, poireau, celeri, concombre, champignon, pomme de terre, patate, avocat, fraise, framboise, myrtille, kiwi, mangue, ananas, radis, navet, betterave, potiron, butternut, courge, haricot vert, petit pois, mais, fenouil, artichaut, asperge, raisin, peche, abricot, gingembre, citron vert',
  'Boucherie & poissonnerie': 'boeuf, veau, porc, poulet, cuisse de poulet, dinde, canard, agneau, steak, hache, viande, escalope, filet, saumon, cabillaud, thon, crevette, poisson, moule, lardon, jambon, chorizo, saucisse, bacon, merguez',
  'Crèmerie & œufs': 'lait, beurre, creme, oeuf, yaourt, fromage blanc, skyr, margarine',
  'Fromages': 'fromage, emmental, gruyere, comte, parmesan, mozzarella, feta, chevre, reblochon, raclette, beaufort, tomme, cheddar, ricotta, mascarpone',
  'Boulangerie': 'pain, baguette, brioche, tortilla, wrap, pain de mie, pita',
  'Épicerie salée': 'pate, spaghetti, coquillette, tagliatelle, riz, quinoa, semoule, boulgour, lentille, pois chiche, farine, huile, vinaigre, moutarde, sauce soja, bouillon, chapelure, fecule, maizena, olive, cornichon',
  'Épicerie sucrée': 'sucre, chocolat, miel, confiture, levure, cacao, vanille, sirop, biscuit, cereale, flocon, avoine, amande, noisette, noix',
  'Conserves': 'conserve, coulis, concentre de tomate, tomate pelee, pulpe de tomate, haricot rouge, lait de coco',
  'Surgelés': 'surgele, glace',
  'Boissons': 'eau, jus, vin, biere, soda, cafe, the',
  'Entretien & maison': 'lessive, adoucissant, liquide vaisselle, pastille lave vaisselle, tablette lave vaisselle, eponge, essuie tout, sopalin, papier toilette, sac poubelle, nettoyant, javel, vinaigre blanc, desinfectant, serpilliere, aluminium, film alimentaire, papier cuisson, ampoule, pile, allumette, bougie, mouchoir',
  'Hygiène & beauté': 'shampoing, apres shampoing, gel douche, dentifrice, brosse a dent, savon, deodorant, coton, coton tige, rasoir, mousse a raser, creme hydratante, serviette hygienique, tampon, protege slip, maquillage, demaquillant, creme solaire',
  'Bébé & animaux': 'couche, lingette, lait infantile, petit pot, croquette, patee, litiere',
  'Herbes & épices': 'sel, poivre, persil, basilic, coriandre, ciboulette, thym, laurier, romarin, cumin, curry, paprika, muscade, cannelle, piment, herbes de provence, origan, curcuma, estragon, menthe',
};
const AISLE_INDEX = Object.entries(AISLE_WORDS)
  .flatMap(([aisle, words]) => words.split(',').map((w) => [ingKey(w), aisle]))
  .sort((a, b) => b[0].length - a[0].length);

function guessAisle(name) {
  const n = ` ${ingKey(name)} `;
  for (const [w, aisle] of AISLE_INDEX) if (n.includes(` ${w} `)) return aisle;
  for (const [w, aisle] of AISLE_INDEX) if (w.length >= 4 && n.includes(` ${w}`)) return aisle;
  return 'Autres';
}

const UNIT_RE = /^(kg|g|mg|l|cl|dl|ml|litres?|grammes?|cuill[eè]res?\s+[àa]\s+soupe|cuill\.?\s*[àa]\s*s\.?|c\.?\s*[àa]\s*s\.?|cas|cuill[eè]res?\s+[àa]\s+caf[eé]|cuill\.?\s*[àa]\s*c\.?|c\.?\s*[àa]\s*c\.?|cac|pinc[ée]es?|gousses?|tranches?|bottes?|sachets?|bo[iî]tes?|pots?|verres?|brins?|feuilles?|morceaux?)\b\.?/i;
function mapUnit(u) {
  const x = norm(u);
  if (!x) return '';
  if (/^(kg)$/.test(x)) return 'kg';
  if (/^(g|grammes?)$/.test(x)) return 'g';
  if (x === 'mg') return 'g';
  if (/^(l|litres?)$/.test(x)) return 'l';
  if (x === 'cl') return 'cl';
  if (x === 'dl') return 'cl';
  if (x === 'ml') return 'ml';
  if (/soupe|^c a s|^cas$|^cuill a s/.test(x)) return 'c. à s.';
  if (/cafe|^c a c|^cac$|^cuill a c/.test(x)) return 'c. à c.';
  if (/pincee/.test(x)) return 'pincée';
  if (/gousse/.test(x)) return 'gousse';
  if (/tranche/.test(x)) return 'tranche';
  if (/botte/.test(x)) return 'botte';
  if (/sachet/.test(x)) return 'sachet';
  if (/boite/.test(x)) return 'boîte';
  if (/pot/.test(x)) return 'pot';
  if (/verre/.test(x)) return 'verre';
  return 'pièce';
}
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
function parseQty(s) {
  const m = String(s).match(/^\s*(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+(?:[.,]\d+)?)\s*([½¼¾⅓⅔])?|([½¼¾⅓⅔]))/);
  if (!m) return null;
  let v;
  if (m[1]) v = Number(m[1]) + Number(m[2]) / Number(m[3]);
  else if (m[4]) v = Number(m[4]) / Number(m[5]);
  else if (m[6]) v = Number(m[6].replace(',', '.')) + (m[7] ? FRAC[m[7]] : 0);
  else v = FRAC[m[8]];
  return isFinite(v) ? { v, len: m[0].length } : null;
}
function parseIngredientLine(line) {
  let s = String(line).replace(/\s+/g, ' ').trim();
  let qty = '';
  let unit = '';
  const q = parseQty(s);
  if (q && q.len) {
    qty = fmtNum(q.v).replace(',', '.');
    s = s.slice(q.len).trim();
    const u = s.match(UNIT_RE);
    if (u) { unit = mapUnit(u[0]); s = s.slice(u[0].length).trim(); if (norm(u[0]) === 'mg') qty = String(Number(qty) / 1000); if (norm(u[0]) === 'dl') qty = String(Number(qty) * 10); }
    else unit = 'pièce';
  }
  s = s.replace(/^(de la |de l'|de l’|d'|d’|de |des |du )/i, '').trim();
  const name = s.charAt(0).toUpperCase() + s.slice(1);
  return { name, qty, unit, aisle: guessAisle(name) };
}

const STEP_ACTIONS = {
  prep: 'Épluchage & découpe',
  four: 'Cuisson au four',
  feculent: 'Féculents & céréales',
  cuisson: 'Cuisson poêle / casserole',
  sauce: 'Sauce, marinade, assaisonnement',
  autre: 'Autre',
};
function detectAction(text) {
  const t = norm(text);
  if (/\d+\s?°/.test(text) || /\b(four|enfourn\w*|gratin\w*|thermostat|th \d+|rotir|\d+ degres)\b/.test(t)) return 'four';
  if (/\b(pates|riz|quinoa|semoule|boulgour|lentilles|pommes de terre|pomme de terre|patates|coquillettes|spaghetti)\b/.test(t) && /\b(cuire|cuisson|bouillir|eau bouillante|egoutter)/.test(t)) return 'feculent';
  if (/\b(eplucher|peler|couper|emincer|hacher|ciseler|raper|tailler|laver|detailler|cubes?|rondelles?|lamelles?|epepiner)/.test(t)) return 'prep';
  if (/\b(sauce|vinaigrette|marinade|mariner|assaisonn|pesto|mayonnaise|emulsionner)/.test(t)) return 'sauce';
  if (/\b(cuire|poele|revenir|saisir|mijoter|dorer|sauter|frire|bouillir|cocotte|casserole|wok|braiser)/.test(t)) return 'cuisson';
  return 'autre';
}
const AHEAD_DEFAULT = new Set(['prep', 'feculent', 'sauce', 'four', 'cuisson']);

