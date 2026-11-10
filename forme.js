// Module « Forme » de Miam & moi : course à pied, renfo, planification, suivi.
// Chargé avant le script principal ; ne touche aux globales de l'application (state, db, ACTIONS…) qu'à l'exécution.
// Les données sont propres à chaque compte : le membre « je suis » du compte connecté (state.compte.member_id).

// ---------------------------------------------------------------------------
// Moteur (fonctions pures, testées dans tests/unit/forme.test.js)
// ---------------------------------------------------------------------------
const FORME_NIVEAUX = { debutant: 'Débutant', reprise: 'Reprise', regulier: 'Régulier', confirme: 'Confirmé' };
const FORME_TERRAINS = { plat: 'Plutôt plat', vallonne: 'Vallonné', montagne: 'Montagne' };
const FORME_OBJECTIFS = { perte: 'Perdre du poids', forme: 'Être en forme', endurance: 'Endurance / trail', course: 'Préparer une course' };
const FORME_MATERIEL = { halteres: 'Haltères', kettlebell: 'Kettlebell', step: 'Step', 'barre-traction': 'Barre de traction', velo: 'Vélo d\'appartement', 'ski-erg': 'Ski-erg', rameur: 'Rameur' };
const FORME_ZONES = { jambes: 'Jambes', fessiers: 'Fessiers', tronc: 'Tronc', dos: 'Dos', pectoraux: 'Pectoraux', epaules: 'Épaules', bras: 'Bras', 'mollets-chevilles': 'Mollets & chevilles', hanches: 'Hanches', cardio: 'Cardio', mobilite: 'Mobilité' };
const FORME_GENES = { genou: 'Genoux', cheville: 'Chevilles', dos: 'Bas du dos', epaule: 'Épaules', hanche: 'Hanches', poignet: 'Poignets' };
// Exercices écartés d'office selon la gêne déclarée (par motif de mouvement et par zone).
const FORME_GENE_RULES = { genou: { zones: [], patterns: ['genou'], sauts: true }, cheville: { zones: ['mollets-chevilles'], patterns: ['pieds'], sauts: true }, dos: { zones: ['dos'], patterns: ['hanche'], sauts: false }, epaule: { zones: ['epaules'], patterns: ['pousser', 'tirer'], sauts: false }, hanche: { zones: ['hanches'], patterns: [], sauts: true }, poignet: { zones: [], patterns: ['pousser'], sauts: false } };
const FORME_FORMATS = {
  circuit: { label: 'Circuit', info: 'Enchaînement d\'exercices, plusieurs tours' },
  coureur: { label: 'Renfo coureur', info: 'Gainage, chevilles, fessiers, excentrique' },
  force: { label: 'Force', info: 'Séries × répétitions avec charges' },
  amrap: { label: 'AMRAP', info: 'Un maximum de tours dans le temps' },
  emom: { label: 'EMOM', info: 'Un exercice au début de chaque minute' },
  tabata: { label: 'Tabata', info: '8 × (20 s d\'effort, 10 s de repos)' },
  mobilite: { label: 'Mobilité', info: 'Étirements et mobilité, en douceur' },
};
const FORME_INTENS = { facile: { travail: 30, repos: 30, tour: 75, reps: 0.75, label: 'Facile' }, moyen: { travail: 40, repos: 20, tour: 60, reps: 1, label: 'Moyen' }, dur: { travail: 45, repos: 15, tour: 45, reps: 1.25, label: 'Dur' } };
const FORME_COURSE = {
  ef: { label: 'Footing en endurance', type: 'course', met: 8.3, dur: false, zone: 'ef' },
  sl: { label: 'Sortie longue', type: 'course', met: 8.8, dur: true, zone: 'ef' },
  fartlek: { label: 'Fartlek', type: 'course', met: 9.5, dur: true, zone: 'seuil' },
  seuil: { label: 'Seuil', type: 'course', met: 10, dur: true, zone: 'seuil' },
  vma: { label: 'Fractionné VMA', type: 'course', met: 10.5, dur: true, zone: 'vma' },
  velo: { label: 'Vélo d\'appartement', type: 'cardio', met: 6.8, dur: false, zone: 'ef', materiel: 'velo' },
  rameur: { label: 'Rameur', type: 'cardio', met: 7, dur: false, zone: 'ef', materiel: 'rameur' },
  'ski-erg': { label: 'Ski-erg', type: 'cardio', met: 7, dur: false, zone: 'ef', materiel: 'ski-erg' },
  renfo: { label: 'Renfo', type: 'renfo', met: 6, dur: false },
  mobilite: { label: 'Mobilité', type: 'mobilite', met: 2.5, dur: false },
};

// Hasard reproductible (mulberry32) : même graine, même séance.
function formeRng(seed) {
  let a = (typeof seed === 'number' ? seed : formeHash(String(seed))) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function formeHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const formeLib = () => (typeof FORME_EXOS !== 'undefined' ? FORME_EXOS : []);
const formeExo = (id, perso = []) => formeLib().find((e) => e.id === id) || perso.find((e) => e.id === id) || null;
const formeIsJump = (e) => /saut|jump|burpee|bondi|pli?om|corde/i.test(`${e.id} ${e.nom}`);
// Exercices autorisés : matériel du lieu, exclusions, gênes.
function formePool(p) {
  const genes = p.genes || [];
  return [...formeLib(), ...(p.perso || [])].filter((e) => {
    if ((p.exclus || []).includes(e.id)) return false;
    if (!(e.materiel || []).every((m) => (p.materiel || []).includes(m))) return false;
    for (const g of genes) {
      const r = FORME_GENE_RULES[g];
      if (!r) continue;
      if (r.patterns.includes(e.pattern) && (e.niveau || 1) > 1) return false;
      if ((e.zones || []).some((z) => r.zones.includes(z)) && (e.niveau || 1) > 1) return false;
      if (r.sauts && formeIsJump(e)) return false;
    }
    return true;
  });
}
function formeTarget(e, I, niveau = 2) {
  const f = I.reps * (niveau === 1 ? 0.85 : niveau === 3 ? 1.15 : 1);
  return e.mode === 'temps' ? Math.max(15, Math.round(((e.base || 30) * f) / 5) * 5) : Math.max(4, Math.round((e.base || 10) * f));
}
// Durée estimée d'une séance générée, en secondes.
function formeSeanceSecondes(s) {
  let t = 0;
  for (const b of s.blocs || []) {
    if (b.kind === 'liste') t += b.items.reduce((x, i) => x + (i.travail || 0) + (i.repos || 0), 0);
    if (b.kind === 'tours') t += b.tours * b.items.reduce((x, i) => x + i.travail + i.repos, 0) - b.items[b.items.length - 1].repos * b.tours + b.reposTour * (b.tours - 1);
    if (b.kind === 'amrap') t += b.duree;
    if (b.kind === 'emom') t += b.minutes * 60;
    if (b.kind === 'tabata') t += b.items.length * 240 + (b.items.length - 1) * 60;
    if (b.kind === 'force') t += b.items.reduce((x, i) => x + i.series * (i.reps * 3.5 + i.repos), 0);
    if (b.kind === 'intervalles') t += b.steps.reduce((x, st) => x + st.s, 0);
  }
  return Math.round(t);
}

// Générateur de renfo : tirage équilibré (pousser/tirer, jambes, tronc), échauffement et retour au calme, durée respectée.
function genSeance(p, seed = 1) {
  const R = formeRng(seed);
  const I = FORME_INTENS[p.intensite] || FORME_INTENS.moyen;
  const format = FORME_FORMATS[p.format] ? p.format : 'circuit';
  const total = Math.max(8, Math.round(Number(p.duree) || 30)) * 60;
  const pool = formePool(p);
  const fav = new Set(p.favoris || []);
  const niveau = Number(p.niveau) || 2;
  const used = new Set();
  const pickFrom = (list) => {
    const avail = list.filter((e) => !used.has(e.id));
    if (!avail.length) return null;
    const w = avail.map((e) => (fav.has(e.id) ? 3 : 1) * (Math.abs((e.niveau || 2) - niveau) === 0 ? 2 : Math.abs((e.niveau || 2) - niveau) === 1 ? 1 : 0.3));
    let r = R() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < avail.length; i++) { r -= w[i]; if (r <= 0) { used.add(avail[i].id); return avail[i]; } }
    used.add(avail[avail.length - 1].id);
    return avail[avail.length - 1];
  };
  const has = (e, f) => (e.formats || []).includes(f);
  const liste = (fmt, secs, each) => {
    const items = [];
    const src = pool.filter((e) => has(e, fmt) || (fmt === 'retour-calme' && has(e, 'mobilite')));
    // Bibliothèque épuisée : on reprend les exercices déjà tirés, dans l'ordre.
    for (let t = 0, k = 0; t + each <= secs + 5; k++) { const e = pickFrom(src) || (items.length ? { id: items[k % items.length].exo } : null); if (!e) break; items.push({ exo: e.id, travail: each, repos: 0 }); t += each; }
    return items;
  };
  if (format === 'mobilite') {
    const items = liste('mobilite', total, total >= 30 * 60 ? 90 : 60);
    return { format, titre: `Mobilité ${Math.round(total / 60)} min`, duree_min: Math.round(total / 60), intensite: 'facile', blocs: [{ nom: 'Mobilité', kind: 'liste', items }] };
  }
  const warm = total >= 20 * 60 ? 300 : total >= 12 * 60 ? 180 : 0;
  const cool = total >= 20 * 60 ? 240 : total >= 12 * 60 ? 120 : 0;
  const main = total - warm - cool;
  let src = pool.filter((e) => e.pattern !== 'mobilite' && (format === 'coureur' ? has(e, 'coureur') : !(e.formats || []).every((f) => ['mobilite', 'echauffement', 'retour-calme'].includes(f))));
  if (format === 'force') src = src.filter((e) => e.mode === 'reps' && e.pattern !== 'cardio');
  if (p.zones?.length) { const z = src.filter((e) => (e.zones || []).some((x) => p.zones.includes(x))); if (z.length >= 3) src = z; }
  const ORDER = format === 'coureur' ? ['pieds', 'hanche', 'tronc', 'genou', 'pieds', 'tronc', 'hanche', 'genou'] : ['genou', 'pousser', 'hanche', 'tirer', 'tronc', 'cardio', 'genou', 'pousser', 'tronc', 'hanche'];
  const n = { circuit: main <= 15 * 60 ? 5 : 6, coureur: 6, amrap: 4, emom: 4, tabata: clampF(Math.floor((main + 60) / 300), 2, 10), force: main >= 35 * 60 ? 5 : 4 }[format];
  const picked = [];
  for (let k = 0; picked.length < n && k < ORDER.length * 2; k++) { const e = pickFrom(src.filter((x) => x.pattern === ORDER[k % ORDER.length])); if (e) picked.push(e); }
  while (picked.length < n) { const e = pickFrom(src); if (!e) break; picked.push(e); }
  const blocs = [];
  if (warm) blocs.push({ nom: 'Échauffement', kind: 'liste', items: liste('echauffement', warm, 45) });
  if (format === 'circuit' || format === 'coureur') {
    const items = picked.map((e) => ({ exo: e.id, travail: I.travail, repos: I.repos }));
    const tour = items.reduce((x, i) => x + i.travail + i.repos, 0) - I.repos;
    const tours = Math.max(1, Math.round((main + I.tour) / (tour + I.tour)));
    blocs.push({ nom: 'Corps de séance', kind: 'tours', tours, reposTour: I.tour, items });
  } else if (format === 'amrap') {
    blocs.push({ nom: 'AMRAP', kind: 'amrap', duree: main, items: picked.map((e) => ({ exo: e.id, cible: formeTarget(e, I, niveau) })) });
  } else if (format === 'emom') {
    blocs.push({ nom: 'EMOM', kind: 'emom', minutes: Math.max(4, Math.floor(main / 60)), items: picked.map((e) => ({ exo: e.id, cible: Math.max(3, Math.round(formeTarget(e, I, niveau) * (e.mode === 'temps' ? 0.6 : 0.7))) })) });
  } else if (format === 'tabata') {
    const count = clampF(Math.floor((main + 60) / 300), 1, picked.length);
    blocs.push({ nom: 'Tabata', kind: 'tabata', items: picked.slice(0, count).map((e) => ({ exo: e.id })) });
  } else if (format === 'force') {
    const repos = p.intensite === 'dur' ? 90 : 75;
    let items = picked.map((e) => ({ exo: e.id, series: 3, reps: formeTarget(e, I, niveau), repos, charge: p.last?.[e.id]?.charge ?? null }));
    const cost = () => items.reduce((x, i) => x + i.series * (i.reps * 3.5 + i.repos), 0);
    while (cost() > main * 1.08 && items.length > 2) items = items.slice(0, -1);
    for (const i of items) if (cost() + (i.reps * 3.5 + i.repos) <= main * 1.05) i.series = 4;
    for (const i of items) { const pr = formeProgression(formeExo(i.exo, p.perso), p.last?.[i.exo]); if (pr) Object.assign(i, pr); }
    blocs.push({ nom: 'Force', kind: 'force', items });
  }
  if (cool) blocs.push({ nom: 'Retour au calme', kind: 'liste', items: liste('retour-calme', cool, 60) });
  const s = { format, intensite: p.intensite || 'moyen', titre: `${FORME_FORMATS[format].label} ${Math.round(total / 60)} min`, duree_min: Math.round(total / 60), blocs };
  s.duree_min = Math.round(formeSeanceSecondes(s) / 60) || s.duree_min;
  return s;
}
const clampF = (v, a, b) => Math.max(a, Math.min(b, v));
// Remplace un exercice par un autre du même motif (ou de la variante demandée).
function formeSwap(s, blocIdx, itemIdx, p, seed, variante) {
  const b = s.blocs[blocIdx];
  const it = b?.items?.[itemIdx];
  if (!it) return s;
  const cur = formeExo(it.exo, p.perso);
  const inSeance = new Set(s.blocs.flatMap((x) => (x.items || []).map((i) => i.exo)));
  let next = null;
  if (variante && cur?.variantes?.[variante]) { const v = formeExo(cur.variantes[variante], p.perso); if (v && formePool(p).some((e) => e.id === v.id)) next = v; }
  if (!next) {
    const R = formeRng(seed);
    const pool = formePool(p).filter((e) => !inSeance.has(e.id) && e.pattern === cur?.pattern && (b.kind !== 'force' || e.mode === 'reps'));
    next = pool.length ? pool[Math.floor(R() * pool.length)] : null;
  }
  if (!next) return s;
  const copy = JSON.parse(JSON.stringify(s));
  copy.blocs[blocIdx].items[itemIdx] = { ...it, exo: next.id };
  return copy;
}
// Progression d'une fois sur l'autre : d'abord des répétitions, puis de la charge.
function formeProgression(e, last) {
  if (!e || !last || !last.reps?.length) return null;
  const cible = last.cible || e.base || 10;
  const ok = last.reps.every((r) => r >= cible);
  if (!ok) return { reps: cible, charge: last.charge ?? null };
  if (last.charge && cible >= (e.base || 10) + 4) return { reps: e.base || 10, charge: Math.round((last.charge + ((e.materiel || []).includes('kettlebell') ? 4 : 2)) * 2) / 2 };
  return { reps: cible + 2, charge: last.charge ?? null };
}

// Repères d'intensité : RPE, fréquence cardiaque (zones saisies, sinon Karvonen), allure (VMA).
function formeZonesFC(pr) {
  const r = Number(pr?.fc_repos), m = Number(pr?.fc_max);
  const k = (a, b) => (r && m ? [Math.round(r + (m - r) * a), Math.round(r + (m - r) * b)] : null);
  return {
    recup: k(0.5, 0.6), ef: pr?.fc_ef_min && pr?.fc_ef_max ? [pr.fc_ef_min, pr.fc_ef_max] : k(0.6, 0.75),
    seuil: pr?.fc_seuil_min && pr?.fc_seuil_max ? [pr.fc_seuil_min, pr.fc_seuil_max] : k(0.8, 0.88), vma: k(0.92, 1),
  };
}
const FORME_PCT_VMA = { recup: [0.55, 0.62], ef: [0.62, 0.72], seuil: [0.82, 0.88], vma: [0.95, 1.02] };
const FORME_RPE = { recup: 'RPE 2', ef: 'RPE 3–4, tu peux parler', seuil: 'RPE 6–7, phrases courtes', vma: 'RPE 8–9, très soutenu' };
const formePace = (kmh) => { const s = Math.round(3600 / kmh); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function formeIntensite(zone, pr, modes = ['rpe']) {
  const out = [];
  if (modes.includes('rpe')) out.push(FORME_RPE[zone] || '');
  if (modes.includes('fc')) { const z = formeZonesFC(pr)[zone]; if (z) out.push(`FC ${z[0]}–${z[1]}`); }
  if (modes.includes('allure') && Number(pr?.vma_kmh)) { const v = Number(pr.vma_kmh), [a, b] = FORME_PCT_VMA[zone] || FORME_PCT_VMA.ef; out.push(`${formePace(v * b)}–${formePace(v * a)} /km`); }
  return out.filter(Boolean).join(' · ');
}
// Séance de course ou de cardio sur machine, découpée en blocs pour le minuteur.
function genCourse(sous, minutes, opts = {}) {
  const C = FORME_COURSE[sous] || FORME_COURSE.ef;
  const total = Math.max(10, Math.round(minutes)) * 60;
  const st = (label, s, zone) => ({ label, s: Math.round(s), zone });
  let steps;
  if (sous === 'fartlek') {
    steps = [st('Échauffement tranquille', 900, 'ef')];
    const reps = Math.max(4, Math.floor((total - 1500) / 180));
    for (let i = 0; i < reps; i++) steps.push(st('1 min plus vite', 60, 'seuil'), st('2 min tranquille', 120, 'ef'));
    steps.push(st('Retour au calme', Math.max(300, total - 900 - reps * 180), 'recup'));
  } else if (sous === 'seuil') {
    const n = total >= 50 * 60 ? 3 : 2;
    steps = [st('Échauffement', 900, 'ef')];
    for (let i = 0; i < n; i++) { steps.push(st(`Bloc seuil ${i + 1}/${n}`, 480, 'seuil')); if (i < n - 1) steps.push(st('Récupération trot', 120, 'recup')); }
    steps.push(st('Retour au calme', Math.max(300, total - 900 - n * 480 - (n - 1) * 120), 'recup'));
  } else if (sous === 'vma') {
    steps = [st('Échauffement', 1200, 'ef')];
    for (let s2 = 0; s2 < 2; s2++) { for (let i = 0; i < 8; i++) steps.push(st(`30 s vite (${i + 1}/8)`, 30, 'vma'), st('30 s trot', 30, 'recup')); if (!s2) steps.push(st('Récupération entre séries', 180, 'recup')); }
    steps.push(st('Retour au calme', Math.max(300, total - 1200 - 16 * 60 - 180), 'recup'));
  } else if (C.type === 'cardio') {
    const blocks = Math.max(1, Math.floor((total - 600) / 300));
    steps = [st('Échauffement', 300, 'recup')];
    for (let i = 0; i < blocks; i++) steps.push(st(i % 2 ? '5 min un peu plus soutenu' : '5 min régulier', 300, i % 2 ? 'seuil' : 'ef'));
    steps.push(st('Retour au calme', Math.max(120, total - 300 - blocks * 300), 'recup'));
  } else {
    steps = [st(sous === 'sl' ? 'Sortie longue, allure facile' : 'Footing en aisance', total, 'ef')];
  }
  const dplus = C.type === 'course' ? Math.round((opts.dplus ?? formeDplus(sous, minutes, opts.terrain)) / 10) * 10 : 0;
  return { type: C.type, sous, titre: `${C.label} ${formeFmtMin(Math.round(total / 60))}`, duree_min: Math.round(total / 60), dplus_m: dplus, blocs: [{ nom: C.label, kind: 'intervalles', steps }] };
}
const formeDplus = (sous, min, terrain) => (terrain === 'montagne' ? (sous === 'sl' ? 6 : sous === 'ef' ? 3 : 0) : terrain === 'vallonne' ? (sous === 'sl' ? 3 : sous === 'ef' ? 1.5 : 0) : 0) * min;
const formeFmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`);

// Point de départ du planificateur, d'après le questionnaire.
function formeDepart(pr) {
  const d = pr?.depart || {};
  const niveau = pr?.niveau || 'reprise';
  const course = Math.max(0, Number(d.course) || 0);
  const longue = Number(d.longue_km) || 0;
  const per = clampF(longue ? longue * 6.5 : { debutant: 25, reprise: 35, regulier: 45, confirme: 55 }[niveau], 20, 90);
  const ref = Math.round(Math.max(course, niveau === 'debutant' ? 1 : 1) * per * (course ? 1 : 0.8));
  const nb = { debutant: 2, reprise: 2, regulier: 3, confirme: 4 }[niveau] || 2;
  return { ref: clampF(ref, 30, 400), nbCourse: nb, renfo: Number(d.renfo) >= 2 ? 2 : 1 };
}
const formeWeeksBetween = (a, b) => Math.round((isoToDateF(b) - isoToDateF(a)) / (7 * 864e5));
function isoToDateF(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
const isoF = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDaysF = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Planificateur hebdomadaire : cycles 3 semaines de montée + 1 allégée, +10 % au plus, ~80 % en endurance,
// jamais deux séances dures de suite, sortie longue sur la plus grande disponibilité.
function planWeek(input) {
  const pr = input.profil || {};
  const dep = formeDepart(pr);
  const cycle = clampF(Number(input.cycleSemaine) || 1, 1, 4);
  const prevRef = Number(input.prevRef) || 0;
  let ref = prevRef ? Math.round(prevRef * (input.prevDeload ? 1 : 1.1)) : dep.ref;
  if (prevRef && input.prevDone != null && input.prevDone < 0.6) ref = prevRef; // semaine précédente peu tenue : on ne monte pas
  let volume = cycle === 4 ? Math.round(ref * 0.7) : ref;
  const obj = input.objectif;
  let taper = 0;
  if (obj?.date) { const w = formeWeeksBetween(input.lundi, obj.date); if (w >= 0 && w <= 1) taper = 0.6; else if (w === 2) taper = 0.8; if (taper) volume = Math.round(ref * taper); }
  const dispos = (input.dispos || []).filter((d) => d.minutes > 0).map((d) => ({ ...d })).sort((a, b) => a.day - b.day);
  const out = [];
  if (!dispos.length) return { cycle_semaine: cycle, ref, volume_min: 0, seances: [] };
  let nbCourse = Math.min(dep.nbCourse + (ref >= 150 && pr.niveau !== 'debutant' ? 1 : 0), dispos.length, 5);
  const free = new Set(dispos.map((d) => d.day));
  const dayOf = (day) => dispos.find((d) => d.day === day);
  const hardDays = new Set();
  const adjHard = (day) => hardDays.has(day - 1) || hardDays.has(day + 1);
  const add = (day, sous, minutes, extra = {}) => {
    const d = dayOf(day);
    const s = { day, heure: d.heure || '18:00', sous, type: FORME_COURSE[sous].type, duree_min: Math.round(minutes), ...extra };
    if (s.type === 'course') s.dplus_m = Math.round(formeDplus(sous, minutes, pr.terrain) / 10) * 10;
    s.titre = `${FORME_COURSE[sous].label} ${formeFmtMin(s.duree_min)}`;
    out.push(s); free.delete(day);
    if (FORME_COURSE[sous].dur) hardDays.add(day);
    return s;
  };
  // 1. Sortie longue : plus grande disponibilité, de préférence le week-end.
  const byLen = [...dispos].sort((a, b) => b.minutes - a.minutes || b.day - a.day);
  const slDay = byLen[0];
  // La sortie longue reste la plus longue séance : 55 % du volume à 2 courses, 40 % au-delà.
  const slMin = nbCourse >= 2 ? Math.min(slDay.minutes, Math.max(35, Math.round(volume * (nbCourse === 2 ? 0.55 : 0.4)))) : Math.min(slDay.minutes, volume);
  add(slDay.day, nbCourse >= 2 ? 'sl' : 'ef', slMin);
  let rest = volume - slMin;
  // 2. Autres séances de course, réparties en évitant les jours voisins de la sortie longue.
  const others = Math.max(0, nbCourse - 1);
  const qualityOk = !taper && cycle !== 4 && others >= 1 && (pr.niveau === 'regulier' || pr.niveau === 'confirme' || (pr.niveau !== 'debutant' && ref >= 90));
  const qualSous = pr.niveau === 'confirme' ? (cycle % 2 ? 'seuil' : 'vma') : pr.niveau === 'regulier' ? 'seuil' : 'fartlek';
  for (let i = 0; i < others; i++) {
    const cands = dispos.filter((d) => free.has(d.day)).sort((a, b) => (adjHard(a.day) - adjHard(b.day)) || b.minutes - a.minutes);
    const d = cands[0];
    if (!d) break;
    const want = Math.max(20, Math.round(rest / (others - i)));
    const quality = qualityOk && i === 0 && !adjHard(d.day);
    const m = Math.min(d.minutes, quality ? Math.max(35, want) : want);
    add(d.day, quality ? qualSous : 'ef', m);
    rest -= m;
  }
  // 3. Renfo (court) puis mobilité sur les disponibilités restantes ; sinon renfo court accolé à un footing.
  let renfo = input.renfo ?? dep.renfo;
  for (const d of dispos.filter((x) => free.has(x.day)).sort((a, b) => adjHard(a.day) - adjHard(b.day))) {
    if (renfo > 0) { add(d.day, 'renfo', Math.min(d.minutes, 30), { format: 'coureur' }); renfo--; } else add(d.day, 'mobilite', Math.min(d.minutes, 20));
  }
  if (renfo > 0) {
    const ef = out.find((s) => s.sous === 'ef' && dayOf(s.day).minutes >= s.duree_min + 15);
    if (ef) out.push({ day: ef.day, heure: ef.heure, sous: 'renfo', type: 'renfo', duree_min: 15, format: 'coureur', titre: 'Renfo coureur 15 min', apres: true });
  }
  out.sort((a, b) => a.day - b.day || (a.apres ? 1 : 0) - (b.apres ? 1 : 0));
  return { cycle_semaine: cycle, ref, volume_min: out.filter((s) => s.type === 'course').reduce((t, s) => t + s.duree_min, 0), taper: !!taper, seances: out };
}
const formeIsHard = (s) => !!FORME_COURSE[s.prevu?.sous || s.sous]?.dur;

// Check-in avant séance : séance maintenue, allégée ou remplacée.
function checkinDecision(c) {
  const v = (k, d = 3) => clampF(Number(c?.[k]) || d, 1, 5);
  if (v('fatigue') >= 5 || v('courbatures') >= 5 || (v('fatigue') >= 4 && v('sommeil') <= 2)) return 'remplacer';
  const score = v('sommeil') + v('motivation') - v('fatigue') - v('courbatures');
  if (v('fatigue') >= 4 || v('courbatures') >= 4 || score <= -1) return 'alleger';
  return 'maintenir';
}
// Plan B : une séance ratée. La sortie longue est déplacée sur un footing à venir (sans coller une séance dure) ;
// une séance dure ratée n'est pas rattrapée ; un footing ou un renfo va sur un jour libre s'il y en a un.
function replanAfterMiss(seances, missedId, todayIso, dispos = [], lundiIso) {
  const missed = seances.find((s) => s.id === missedId);
  if (!missed) return [];
  const changes = [{ id: missed.id, patch: { statut: 'rate' } }];
  const sous = missed.prevu?.sous || missed.sous;
  const future = seances.filter((s) => s.statut === 'prevu' && s.id !== missed.id && s.date > todayIso).sort((a, b) => a.date.localeCompare(b.date));
  const hardDates = new Set(seances.filter((s) => s.statut !== 'rate' && s.id !== missed.id && formeIsHard(s)).map((s) => s.date));
  const adj = (iso) => hardDates.has(isoF(addDaysF(isoToDateF(iso), -1))) || hardDates.has(isoF(addDaysF(isoToDateF(iso), 1)));
  if (sous === 'sl') {
    const t = future.find((s) => (s.prevu?.sous || s.sous) === 'ef' && !adj(s.date));
    if (t) changes.push({ id: t.id, patch: { convert: 'sl', duree_min: Math.max(t.duree_min || 0, Math.round((missed.duree_min || 60) * 0.9)) } });
    return changes;
  }
  if (FORME_COURSE[sous]?.dur) return changes;
  if (lundiIso) {
    const used = new Set(seances.filter((s) => s.statut !== 'rate').map((s) => s.date));
    const d = dispos.map((x) => ({ ...x, iso: isoF(addDaysF(isoToDateF(lundiIso), x.day)) })).find((x) => x.minutes > 0 && x.iso > todayIso && !used.has(x.iso) && (missed.type === 'renfo' || !adj(x.iso)));
    if (d) changes.push({ move: missed.id, date: d.iso, heure: d.heure || missed.heure });
  }
  return changes;
}

// Charge d'entraînement : sRPE = durée × RPE ; ratio aigu (7 j) / chronique (moyenne hebdomadaire sur 28 j).
function formeCharge(seances, todayIso) {
  const t = isoToDateF(todayIso);
  const done = seances.filter((s) => s.statut === 'fait' && s.rpe && s.duree_min);
  const sum = (from) => done.filter((s) => { const d = isoToDateF(s.date); return d > addDaysF(t, -from) && d <= t; }).reduce((x, s) => x + s.duree_min * s.rpe, 0);
  const aigue = sum(7);
  const chronique = Math.round(sum(28) / 4);
  const first = done.map((s) => s.date).sort()[0];
  const assez = first && (t - isoToDateF(first)) / 864e5 >= 14;
  const ratio = chronique ? Math.round((aigue / chronique) * 100) / 100 : null;
  return { aigue, chronique, ratio: assez ? ratio : null, alerte: !assez || ratio == null ? null : ratio > 1.3 ? 'haute' : ratio < 0.8 ? 'basse' : null };
}
function formeVolumes(seances, lundiIso, n = 8) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const l = addDaysF(isoToDateF(lundiIso), -7 * i);
    const a = isoF(l), b = isoF(addDaysF(l, 6));
    const w = seances.filter((s) => s.statut === 'fait' && s.date >= a && s.date <= b);
    out.push({ lundi: a, km: Math.round(w.filter((s) => s.type === 'course').reduce((x, s) => x + (s.distance_m || 0), 0) / 100) / 10, dplus: w.reduce((x, s) => x + (s.dplus_m || 0), 0), min: w.reduce((x, s) => x + (s.duree_min || 0), 0), n: w.length });
  }
  return out;
}
function formeRecords(seances) {
  const c = seances.filter((s) => s.statut === 'fait' && s.type === 'course');
  const max = (k) => c.reduce((b, s) => ((s[k] || 0) > (b?.[k] || 0) ? s : b), null);
  const charges = {};
  for (const s of seances.filter((x) => x.statut === 'fait' && x.realise?.items)) for (const it of s.realise.items) if (it.charge && (!charges[it.exo] || it.charge > charges[it.exo].charge)) charges[it.exo] = { charge: it.charge, date: s.date };
  return { distance: max('distance_m'), dplus: max('dplus_m'), duree: max('duree_min'), charges };
}
// Dépense d'une séance : MET × poids × heures, modulé par la FC (réserve cardiaque) ou à défaut par le RPE.
function formeKcal(s, poids, pr) {
  const C = FORME_COURSE[s.sous] || FORME_COURSE[s.type] || FORME_COURSE.renfo;
  let met = s.type === 'renfo' ? (s.format === 'mobilite' ? 2.5 : s.intensite === 'dur' || ['tabata', 'amrap'].includes(s.format) ? 8 : 6) : C.met;
  let f = 1;
  const r = Number(pr?.fc_repos), m = Number(pr?.fc_max);
  if (s.fc_moy && r && m && m > r) f = clampF(0.55 + ((s.fc_moy - r) / (m - r)) * 0.75, 0.7, 1.3);
  else if (s.rpe) f = clampF(0.7 + s.rpe * 0.06, 0.8, 1.3);
  if (s.type === 'course' && s.distance_m && s.duree_min) { const kmh = s.distance_m / 1000 / (s.duree_min / 60); met = clampF(kmh * 1.0 + (s.dplus_m || 0) / Math.max(1, s.distance_m) * 60, 6, 14); f = s.fc_moy ? f : 1; }
  return Math.round(met * (Number(poids) || 70) * ((s.duree_min || 0) / 60) * f);
}
// Bonus de budget calorique : part des kcal actives faites rendue au besoin du jour, selon l'objectif.
const FORME_BUDGET = { perte: 0.5, maintien: 1, prise: 1 };
function formeBonus(kcalActives, objectif, regle) {
  const r = { ...FORME_BUDGET, ...(regle || {}) };
  const f = Number(r[objectif] ?? 1);
  return Math.round((Number(kcalActives) || 0) * clampF(f, 0, 1.5));
}
// Météo (Open-Meteo, horaire) : alerte pluie forte, orage ou chaleur sur un créneau.
function formeMeteoAlerte(h, iso, heure) {
  if (!h?.time) return null;
  const k = h.time.indexOf(`${iso}T${String(heure || '18:00').slice(0, 2)}:00`);
  if (k < 0) return null;
  const code = h.weathercode?.[k], pluie = h.precipitation?.[k] || 0, temp = h.temperature_2m?.[k];
  const alerte = code >= 95 ? 'Orage prévu' : pluie >= 2 ? `Pluie forte (${fmtF(pluie)} mm/h)` : temp >= 30 ? `Chaleur (${Math.round(temp)} °C)` : null;
  if (!alerte) return null;
  // Meilleur créneau du même jour : le plus proche de l'heure prévue, sans pluie, orage ni chaleur.
  const h0 = Number(String(heure || '18').slice(0, 2));
  let mieux = null, best = 99;
  for (let hh = 7; hh <= 21; hh++) {
    const j = h.time.indexOf(`${iso}T${String(hh).padStart(2, '0')}:00`);
    const ok = j >= 0 && (h.weathercode?.[j] || 0) < 95 && (h.precipitation?.[j] || 0) < 0.5 && (h.temperature_2m?.[j] ?? 20) < 28;
    if (ok && Math.abs(hh - h0) < best) { best = Math.abs(hh - h0); mieux = `${String(hh).padStart(2, '0')}:00`; }
  }
  return { alerte, mieux };
}
const fmtF = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
// Étapes du minuteur à partir d'une séance (renfo ou course).
function formeSteps(s) {
  const steps = [];
  for (const b of s.blocs || []) {
    if (b.kind === 'liste') for (const i of b.items) steps.push({ kind: 'travail', exo: i.exo, s: i.travail, bloc: b.nom });
    if (b.kind === 'tours') for (let t = 1; t <= b.tours; t++) {
      b.items.forEach((i, k) => { steps.push({ kind: 'travail', exo: i.exo, s: i.travail, bloc: `${b.nom} · tour ${t}/${b.tours}` }); if (k < b.items.length - 1 && i.repos) steps.push({ kind: 'repos', s: i.repos, next: b.items[k + 1].exo }); });
      if (t < b.tours) steps.push({ kind: 'repos', s: b.reposTour, next: b.items[0].exo, long: true });
    }
    if (b.kind === 'amrap') steps.push({ kind: 'amrap', s: b.duree, items: b.items, bloc: b.nom });
    if (b.kind === 'emom') for (let m = 0; m < b.minutes; m++) { const i = b.items[m % b.items.length]; steps.push({ kind: 'emom', exo: i.exo, cible: i.cible, s: 60, bloc: `${b.nom} · minute ${m + 1}/${b.minutes}` }); }
    if (b.kind === 'tabata') b.items.forEach((i, k) => { for (let r = 1; r <= 8; r++) { steps.push({ kind: 'travail', exo: i.exo, s: 20, bloc: `Tabata · ${r}/8` }); steps.push({ kind: 'repos', s: 10, next: r < 8 ? i.exo : b.items[k + 1]?.exo }); } if (k < b.items.length - 1) steps.push({ kind: 'repos', s: 60, next: b.items[k + 1].exo, long: true }); });
    if (b.kind === 'force') b.items.forEach((i, k) => { for (let r = 1; r <= i.series; r++) { steps.push({ kind: 'serie', exo: i.exo, reps: i.reps, charge: i.charge, serie: r, series: i.series, bloc: `${b.nom} · série ${r}/${i.series}` }); if (r < i.series || k < b.items.length - 1) steps.push({ kind: 'repos', s: i.repos, next: r < i.series ? i.exo : b.items[k + 1].exo }); } });
    if (b.kind === 'intervalles') for (const st of b.steps) steps.push({ kind: 'course', label: st.label, zone: st.zone, s: st.s, bloc: b.nom });
  }
  return steps.filter((x) => x.kind !== 'repos' || x.s > 0);
}

// ---------------------------------------------------------------------------
// Données : chargement par compte, enregistrement hors ligne (file d'attente), miroir dans « activites »
// ---------------------------------------------------------------------------
const FORME_AMBIANCES = [['topo', 'Carte au 25 000'], ['lauze', 'Granite et lauze'], ['alti', 'Altimètre']];
const FORME_AMB_DEFAULT = 'topo';
const Forme = {
  TABLES: { profil: 'forme_profil', lieux: 'forme_lieux', exos: 'forme_exercices', objectifs: 'forme_objectifs', semaines: 'forme_semaines', seances: 'forme_seances', mens: 'mensurations' },
  CONFLICT: { profil: 'member_id', semaines: 'member_id,lundi', mens: 'member_id,date' },
  member: () => memberById(state.compte?.member_id) || null,
  blank() { return { ok: null, user: null, err: null, loading: null, profil: null, lieux: [], exos: [], objectifs: [], semaines: [], seances: [], mens: [], view: store.get('forme:view', 'semaine'), week: mondayOf(new Date()), draft: null, q: { step: 0, data: {} }, editDispos: false, meteo: null }; },
  cacheKey: () => `cache:forme:${me()}`,
  missing: (e) => ['42P01', 'PGRST205', 'PGRST202', 'PGRST200'].includes(e?.code) || /does not exist|Could not find the table|schema cache/i.test(e?.message || ''),
  cache() { const F = state.forme; store.set(this.cacheKey(), { profil: F.profil, lieux: F.lieux, exos: F.exos, objectifs: F.objectifs, semaines: F.semaines, seances: F.seances, mens: F.mens }); },
  async load(force = false) {
    const m = this.member();
    if (!m || !me()) return;
    if (state.forme.user !== me()) state.forme = { ...this.blank(), view: state.forme.view };
    const F = state.forme;
    if (F.ok !== null && !force) return;
    if (F.loading) return F.loading;
    F.loading = (async () => {
      try {
        const q = (k) => db.from(this.TABLES[k]).select('*').eq('member_id', m.id);
        const res = await Promise.all([q('profil').maybeSingle(), q('lieux').order('ordre'), q('exos'), q('objectifs').order('date'),
          q('semaines').gte('lundi', isoDate(addDays(mondayOf(new Date()), -84))), q('seances').gte('date', isoDate(addDays(new Date(), -140))).order('date'), q('mens').order('date')]);
        const err = res.find((r) => r.error)?.error;
        if (err) { if (this.missing(err)) { F.ok = false; F.user = me(); return; } throw err; }
        const [p, l, x, o, w, s, mm] = res.map((r) => r.data);
        Object.assign(F, { ok: true, user: me(), err: null, profil: p, lieux: l || [], exos: x || [], objectifs: o || [], semaines: w || [], seances: (s || []).sort(this.bySeance), mens: mm || [] });
        this.cache();
      } catch (e) {
        const c = store.get(this.cacheKey(), null);
        if (c && isNetworkError(e)) Object.assign(F, c, { ok: true, user: me() });
        else { console.warn('forme', e); F.ok = false; F.user = me(); F.err = e.message || String(e); }
      } finally { F.loading = null; }
    })();
    return F.loading;
  },
  bySeance: (a, b) => a.date.localeCompare(b.date) || String(a.heure || '').localeCompare(String(b.heure || '')),
  local(k, row) {
    const F = state.forme;
    if (k === 'profil') { F.profil = row; return; }
    const key = k === 'semaines' ? 'lundi' : k === 'mens' ? 'date' : 'id';
    F[k] = [...F[k].filter((x) => x[key] !== row[key]), row];
    if (k === 'seances') F.seances.sort(this.bySeance);
    if (k === 'mens' || k === 'objectifs') F[k].sort((a, b) => a.date.localeCompare(b.date));
    if (k === 'lieux') F.lieux.sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  },
  async put(k, row) {
    const full = { ...own(), member_id: this.member().id, ...row };
    if (k !== 'profil' && !full.id) full.id = uid();
    if (['seances', 'semaines', 'profil'].includes(k)) full.updated_at = new Date().toISOString();
    this.local(k, full);
    try {
      if (!navigator.onLine) throw new Error('Failed to fetch');
      const { data, error } = await db.from(this.TABLES[k]).upsert(full, { onConflict: this.CONFLICT[k] || 'id' }).select().single();
      if (error) throw error;
      this.local(k, data);
      this.cache();
      return data;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      Queue.push({ type: 'forme', table: this.TABLES[k], row: full, onConflict: this.CONFLICT[k] || 'id' });
      this.cache();
      return full;
    }
  },
  async del(k, id) {
    const F = state.forme;
    F[k] = F[k].filter((x) => x.id !== id);
    try {
      if (!navigator.onLine) throw new Error('Failed to fetch');
      const { error } = await db.from(this.TABLES[k]).delete().eq('id', id);
      if (error) throw error;
    } catch (e) { if (!isNetworkError(e)) throw e; Queue.push({ type: 'forme-del', table: this.TABLES[k], id }); }
    this.cache();
  },
  poids() { const m = this.member(); const p = (state.pesees || []).filter((x) => x.member_id === m?.id).sort((a, b) => b.date.localeCompare(a.date))[0]; return Number(p?.poids_kg) || Number(m?.poids_kg) || 70; },
  kcal(s) { const p = s.prevu || {}; return formeKcal({ ...s, sous: p.sous || s.type, format: p.format, intensite: p.intensite }, this.poids(), state.forme.profil); },
  titre: (s) => s.prevu?.titre || FORME_COURSE[s.prevu?.sous]?.label || FORME_COURSE[s.type]?.label || 'Séance',
  // Chaque séance du module a sa ligne dans « activites » (source 'forme') : fil du jour, bilan, dépense, budget calorique.
  async syncAct(s) {
    const m = this.member();
    const ref = `forme:${s.id}`;
    state.activites = state.activites.filter((a) => !(a.source === 'forme' && a.ref === ref && (s.statut === 'rate' || a.date !== s.date)));
    try {
      if (navigator.onLine) {
        let q = db.from(T.activites).delete().eq('member_id', m.id).eq('source', 'forme').eq('ref', ref);
        if (s.statut !== 'rate') q = q.neq('date', s.date);
        const { error } = await q;
        if (error) throw error;
      } else if (s.statut === 'rate') Queue.push({ type: 'act-del', member_id: m.id, ref });
    } catch (e) { console.warn('activités forme', e); }
    if (s.statut === 'rate') return;
    const row = { ...own(), member_id: m.id, date: s.date, heure: s.heure || '18:00', statut: s.statut === 'fait' ? 'fait' : 'prevu', source: 'forme', kind: 'seance', ref, label: this.titre(s),
      kcal: Math.round(s.kcal ?? this.kcal(s)), minutes: s.duree_min || null, distance_m: s.distance_m || null, raw: { type: s.type, sous: s.prevu?.sous || null, dplus: s.dplus_m || 0 } };
    try {
      if (!navigator.onLine) throw new Error('Failed to fetch');
      const { data, error } = await db.from(T.activites).upsert(row, { onConflict: 'member_id,date,source,ref' }).select().single();
      if (error) throw error;
      state.activites = [...state.activites.filter((a) => !(a.source === 'forme' && a.ref === ref)), data];
    } catch (e) {
      if (!isNetworkError(e)) { console.warn('activités forme', e); return; }
      Queue.push({ type: 'act', row });
      state.activites = [...state.activites.filter((a) => !(a.source === 'forme' && a.ref === ref)), { ...row, id: `local:${uid()}` }];
    }
  },
  async saveSeance(row) { const s = await this.put('seances', row); await this.syncAct(s); return s; },
  semaine: (iso) => state.forme.semaines.find((w) => w.lundi === iso) || null,
  weekSeances(lundi) { const a = isoDate(lundi), b = isoDate(addDays(lundi, 6)); return state.forme.seances.filter((s) => s.date >= a && s.date <= b); },
  prefs() { return state.forme.profil?.prefs || {}; },
  async savePrefs(patch) { const p = state.forme.profil; await this.put('profil', { ...p, prefs: { ...(p?.prefs || {}), ...patch } }); },
  lieu(id) { return state.forme.lieux.find((l) => l.id === id) || state.forme.lieux[0] || { nom: 'Sans matériel', materiel: [] }; },
  persoExos() { return state.forme.exos.filter((x) => x.data?.kind === 'perso').map((x) => ({ ...x.data, id: `perso-${x.id}`, row: x.id })); },
  genParams(extra = {}) {
    const pr = state.forme.profil || {};
    const pf = pr.prefs || {};
    const lieu = this.lieu(extra.lieu || pf.lieu);
    const last = {};
    for (const s of state.forme.seances.filter((x) => x.statut === 'fait' && x.realise?.items)) for (const it of s.realise.items) last[it.exo] = it;
    return { materiel: lieu.materiel || [], exclus: pf.exclus || [], favoris: pf.favoris || [], perso: this.persoExos(), genes: Object.keys(pr.genes?.zones || {}).filter((k) => pr.genes.zones[k]), niveau: { debutant: 1, reprise: 2, regulier: 2, confirme: 3 }[pr.niveau] || 2, last, ...extra, lieu: lieu.id };
  },
  // Génère et enregistre le plan de la semaine à partir des disponibilités saisies.
  async generateWeek(lundi, dispos) {
    const F = state.forme;
    const iso = isoDate(lundi);
    const prevIso = isoDate(addDays(lundi, -7));
    const prev = this.semaine(prevIso);
    const prevS = this.weekSeances(addDays(lundi, -7)).filter((s) => s.prevu?.plan);
    const prevDone = prevS.length ? prevS.filter((s) => s.statut === 'fait').length / prevS.length : null;
    const cur = this.semaine(iso);
    const cycle = cur?.cycle_semaine && cur.plan?.ref ? cur.cycle_semaine : prev?.cycle_semaine ? (prev.cycle_semaine % 4) + 1 : 1;
    const objectif = F.objectifs.find((o) => o.date >= iso) || null;
    const plan = planWeek({ lundi: iso, dispos, profil: F.profil, cycleSemaine: cycle, prevRef: prev?.plan?.ref, prevDeload: prev?.cycle_semaine === 4, prevDone, objectif, renfo: this.prefs().renfo });
    for (const s of this.weekSeances(lundi).filter((x) => x.statut === 'prevu' && x.prevu?.plan && x.date >= isoDate(new Date()))) { await this.del('seances', s.id); await this.syncAct({ ...s, statut: 'rate' }); }
    await this.put('semaines', { ...(cur || {}), lundi: iso, dispos, plan: { ref: plan.ref, volume_min: plan.volume_min, taper: plan.taper }, cycle_semaine: plan.cycle_semaine });
    const today = isoDate(new Date());
    for (const x of plan.seances) {
      const date = isoDate(addDays(lundi, x.day));
      if (date < today) continue;
      const prevu = x.type === 'course' ? { ...genCourse(x.sous, x.duree_min, { terrain: F.profil?.terrain, dplus: x.dplus_m }) } : { sous: x.sous, type: x.type, titre: x.titre, format: x.format || (x.type === 'mobilite' ? 'mobilite' : 'coureur'), duree_min: x.duree_min, intensite: 'moyen' };
      prevu.plan = true;
      await this.saveSeance({ date, heure: x.heure, type: x.type, statut: 'prevu', prevu, duree_min: x.duree_min, dplus_m: x.dplus_m || null });
    }
    return plan;
  },
  // Récompenses en coquillages et records après une séance faite.
  async reward(s, before) {
    const m = this.member();
    const n = state.forme.seances.filter((x) => x.statut === 'fait' && x.date === s.date).length;
    if (s.date === isoDate(new Date())) { Pet.play('sport'); if (n <= 2) await Rewards.earn(m, `forme-seance:${n}`, 8); }
    const r = formeRecords(state.forme.seances);
    const msgs = [];
    if (s.type === 'course' && before.distance && r.distance?.id === s.id && s.distance_m > (before.distance.distance_m || 0)) { msgs.push(`Record de distance : ${fmtNum(s.distance_m / 1000)} km !`); await Rewards.earn(m, 'forme-record:distance', 10); }
    if (s.type === 'course' && before.dplus && r.dplus?.id === s.id && s.dplus_m > (before.dplus.dplus_m || 0)) { msgs.push(`Record de dénivelé : ${s.dplus_m} m !`); await Rewards.earn(m, 'forme-record:dplus', 10); }
    const lundi = mondayOf(isoToDate(s.date));
    const plan = this.weekSeances(lundi).filter((x) => x.prevu?.plan);
    if (plan.length && plan.every((x) => x.statut === 'fait')) { msgs.push('Semaine tenue en entier, bravo !'); await Rewards.earn(m, 'forme-semaine', 15, isoDate(lundi)); }
    return msgs;
  },
  async meteo() {
    const pf = this.prefs();
    if (!pf.lat || !pf.lon) return null;
    const k = `forme:meteo:${pf.lat},${pf.lon}`;
    const c = store.get(k, null);
    if (c && Date.now() - c.t < 3 * 36e5) return c.h;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pf.lat}&longitude=${pf.lon}&hourly=temperature_2m,precipitation,weathercode&forecast_days=8&timezone=auto`);
      if (!r.ok) return c?.h || null;
      const h = (await r.json()).hourly;
      store.set(k, { t: Date.now(), h });
      return h;
    } catch { return c?.h || null; }
  },
};
// Bonus de budget calorique du jour (utilisé par needs()) : seulement les activités faites.
function activeBonus(m, date = new Date()) {
  if (!m || !state?.activites) return 0;
  const iso = isoDate(date);
  const kcal = state.activites.filter((a) => a.member_id === m.id && a.date === iso && a.kind === 'seance' && a.statut === 'fait').reduce((t, a) => t + (Number(a.kcal) || 0), 0);
  if (!kcal) return 0;
  const pr = state.forme?.profil && state.forme.profil.member_id === m.id ? state.forme.profil : null;
  if (pr?.prefs?.budget === false) return 0;
  return formeBonus(kcal, m.objectif || 'maintien', pr?.regle_budget);
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------
const fChips = (name, opts, sel, type = 'radio') => `<div class="f-chips">${Object.entries(opts).map(([k, v]) => `<label class="f-chip"><input type="${type}" name="${name}" value="${esc(k)}" ${(Array.isArray(sel) ? sel.includes(k) : sel === k) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;
const fField = (label, inner, hint = '') => `<label class="field"><span>${label}</span>${inner}${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
const fNum = (name, v, attrs = '') => `<input class="input" type="number" inputmode="decimal" name="${name}" value="${v ?? ''}" ${attrs}>`;
const fDate = (iso) => isoToDate(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
function fPicto(exo, big = false) {
  const key = exo?.picto;
  const svg = (typeof FORME_PICTOS !== 'undefined' && FORME_PICTOS[key]) || (typeof FORME_PICTOS !== 'undefined' && FORME_PICTOS[Object.keys(FORME_PICTOS)[0]]) || '';
  return `<span class="fpicto ${big ? 'big' : ''}" aria-label="${esc(exo?.nom || '')}">${svg}</span>`;
}
function fDosage(it, b) {
  const e = formeExo(it.exo, Forme.persoExos());
  const side = e?.unilateral ? ' · chaque côté' : '';
  if (b.kind === 'force') return `${it.series} × ${it.reps}${it.charge ? ` · ${fmtNum(it.charge)} kg` : ''}${side}`;
  if (b.kind === 'amrap' || b.kind === 'emom') return `${it.cible}${e?.mode === 'temps' ? ' s' : ' reps'}${side}`;
  if (b.kind === 'tabata') return '8 × 20 s';
  return `${it.travail} s${it.repos ? ` · repos ${it.repos} s` : ''}${side}`;
}
// Profil de dénivelé : réel (import GPX/FIT) ou stylisé d'après le D+ prévu.
function fProfil(s, w = 120, h = 34) {
  let pts = s.realise?.profil;
  const dplus = s.dplus_m || s.prevu?.dplus_m || 0;
  if (!pts?.length) {
    if (!dplus) return '';
    const R = formeRng(s.id || 1);
    const n = 24;
    let alt = 0;
    pts = Array.from({ length: n }, (_, i) => { alt += (i < n * 0.55 ? 1 : -0.9) * (0.4 + R()) * dplus / (n * 0.5); return [i, Math.max(0, alt)]; });
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || 1, y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (x) => ((x - x0) / (x1 - x0 || 1)) * w, Y = (y) => h - 2 - ((y - y0) / (y1 - y0 || 1)) * (h - 6);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ');
  return `<svg class="f-profil" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d} L${w} ${h} L0 ${h}Z" class="fill"/><path d="${d}" class="line"/></svg>`;
}
function fHero() {
  const F = state.forme;
  const lundi = F.week;
  const w = Forme.semaine(isoDate(lundi));
  const ss = Forme.weekSeances(lundi);
  const run = ss.filter((s) => s.type === 'course' && s.statut !== 'rate');
  const min = run.reduce((t, s) => t + (s.duree_min || 0), 0);
  const dplus = run.reduce((t, s) => t + (s.dplus_m || s.prevu?.dplus_m || 0), 0);
  const done = ss.filter((s) => s.statut === 'fait').length;
  const obj = F.objectifs.find((o) => o.date >= isoDate(new Date()));
  const c = companionOf(Forme.member());
  return `<div class="f-hero">
    <div class="grow"><small>${w?.cycle_semaine ? `Cycle · semaine ${w.cycle_semaine}/4${w.cycle_semaine === 4 ? ' (allégée)' : ''}` : 'Ma forme'}${w?.plan?.taper ? ' · affûtage' : ''}</small>
    <h2>Semaine du ${lundi.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</h2>
    <p>${ss.length ? `${done}/${ss.length} séance${ss.length > 1 ? 's' : ''} · ${formeFmtMin(min)} de course${dplus ? ` · D+ ${dplus} m` : ''}` : 'Pas encore de plan cette semaine'}</p>
    ${obj ? `<p class="f-obj">🏁 ${esc(obj.nom)} dans ${Math.max(0, Math.round((isoToDate(obj.date) - new Date()) / 864e5))} j</p>` : ''}</div>
    ${c ? `<div class="f-hero-pet">${companionSvg(c, done ? 'sportif' : 'content', 74)}</div>` : ''}</div>
    <div class="seg f-seg">${[['semaine', 'Semaine'], ['seance', 'Séance'], ['suivi', 'Suivi'], ['reglages', 'Réglages']].map(([k, l]) => `<button data-act="forme-view" data-v="${k}" aria-pressed="${F.view === k}">${l}</button>`).join('')}</div>`;
}
function renderForme() {
  const F = state.forme;
  const m = Forme.member();
  const amb = F.profil?.prefs?.ambiance || store.get('forme:amb', FORME_AMB_DEFAULT);
  const wrap = (inner) => `<div class="forme" data-amb="${esc(amb)}">${inner}</div>`;
  if (!m) return wrap(`<div class="card f-pad"><h3>Qui es-tu dans le foyer ?</h3><p class="muted">Le module Forme suit les séances de <b>ton</b> membre. Indique d'abord quel membre du foyer tu es (Foyer › Comptes › « Je suis »).</p><button class="btn primary" data-act="foyer">${ICON.users} Choisir mon membre</button></div>`);
  if (F.user !== me() || F.ok === null) { Forme.load().then(() => { if (state.tab === 'forme') render(); }); return wrap('<div class="spinner"></div>'); }
  if (F.ok === false) return wrap(F.err ? `<div class="card f-pad"><p>Impossible de charger le module Forme.</p><p class="muted small">${esc(F.err)}</p><button class="btn" data-act="forme-reload">Réessayer</button></div>`
    : '<div class="card f-pad"><h3>Module Forme bientôt prêt</h3><p class="muted">Le serveur n\'a pas encore les tables du module. Elles seront créées par l\'administrateur (fichier <code>supabase/migrations/2026-11-10_module_forme.sql</code>), puis tout s\'active ici automatiquement.</p><button class="btn" data-act="forme-reload">Vérifier à nouveau</button></div>');
  if (!F.profil?.questionnaire_fait_le) return wrap(fQuestionnaire());
  const view = { semaine: fViewSemaine, seance: fViewSeance, suivi: fViewSuivi, reglages: fViewReglages }[F.view] || fViewSemaine;
  return wrap(fHero() + view());
}

// --- Questionnaire de départ (une fois par compte, modifiable dans Réglages) ---
function fQuestionnaire() {
  const F = state.forme;
  const d = { niveau: 'reprise', objectif_forme: 'forme', terrain: 'vallonne', course: 1, renfo: 1, longue_km: '', genes: [], genes_txt: '', montre: 'aucune', materiel: [], ...(F.profil ? fQFromProfil(F.profil) : {}), ...F.q.data };
  const step = F.q.step;
  const steps = [
    `<h3>Ton point de départ</h3>${fField('Où en es-tu ?', fChips('niveau', FORME_NIVEAUX, d.niveau))}${fField('Ton objectif principal', fChips('objectif_forme', FORME_OBJECTIFS, d.objectif_forme))}${fField('Où peux-tu courir ?', fChips('terrain', FORME_TERRAINS, d.terrain))}`,
    `<h3>Ta pratique actuelle</h3><div class="grid2">${fField('Courses par semaine', `<select class="input" name="course">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option ${Number(d.course) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}${fField('Renfo par semaine', `<select class="input" name="renfo">${[0, 1, 2, 3].map((n) => `<option ${Number(d.renfo) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}</div>
      ${fField('Plus longue sortie récente sans douleur (km)', fNum('longue_km', d.longue_km, 'min="0" max="200" step="0.5" placeholder="ex. 10"'))}
      ${fField('Gênes ou douleurs', fChips('genes', FORME_GENES, d.genes, 'checkbox'), 'Les exercices qui sollicitent ces zones sont écartés. En cas de douleur, demande l\'avis d\'un médecin : l\'appli ne donne pas de conseil médical.')}
      ${fField('Précisions (facultatif)', `<input class="input" name="genes_txt" value="${esc(d.genes_txt)}" maxlength="200">`)}`,
    `<h3>Ton matériel</h3>${fField('Montre', `<select class="input" name="montre">${['aucune', 'Garmin', 'Coros', 'Suunto', 'Polar', 'autre'].map((x) => `<option ${d.montre === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`, 'Saisie manuelle ou import de fichier GPX/FIT, sans connexion à la montre.')}
      ${fField('Matériel à la maison', fChips('materiel', FORME_MATERIEL, d.materiel, 'checkbox'))}
      <p class="muted small">Tu pourras ajouter d'autres lieux (salle, hôtel…) et tes repères cardio dans Réglages.</p>`,
  ];
  return `<div class="f-hero"><div class="grow"><small>Bienvenue dans Forme</small><h2>Faisons connaissance</h2><p>3 questions rapides pour un plan à ta mesure.</p></div></div>
    <form class="card f-pad stack" data-form="forme-q">${steps[step]}
    <div class="f-dots">${steps.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
    <div class="grid2">${step ? '<button type="button" class="btn" data-act="forme-q-back">Retour</button>' : '<span></span>'}<button class="btn primary">${step < 2 ? 'Suivant' : 'C\'est parti'}</button></div></form>`;
}
const fQFromProfil = (p) => ({ niveau: p.niveau, objectif_forme: p.objectif_forme, terrain: p.terrain, course: p.depart?.course, renfo: p.depart?.renfo, longue_km: p.depart?.longue_km, genes: Object.keys(p.genes?.zones || {}).filter((k) => p.genes.zones[k]), genes_txt: p.genes?.texte || '', montre: p.montre });
function fReadQ(f) {
  const fd = new FormData(f);
  const d = {};
  for (const k of new Set(fd.keys())) { const all = fd.getAll(k); d[k] = ['genes', 'materiel'].includes(k) ? all : all[0]; }
  for (const k of ['genes', 'materiel']) if (f.querySelector(`[name="${k}"]`) && !d[k]) d[k] = [];
  return d;
}
async function fSubmitQ(f) {
  const F = state.forme;
  F.q.data = { ...F.q.data, ...fReadQ(f) };
  if (F.q.step < 2) { F.q.step++; render(); return; }
  const d = F.q.data;
  const first = !F.profil;
  await Forme.put('profil', { ...(F.profil || {}), niveau: d.niveau, objectif_forme: d.objectif_forme, terrain: d.terrain, montre: d.montre,
    depart: { course: Number(d.course) || 0, renfo: Number(d.renfo) || 0, longue_km: Number(d.longue_km) || null },
    genes: { zones: Object.fromEntries((d.genes || []).map((g) => [g, true])), texte: d.genes_txt || '' }, questionnaire_fait_le: isoDate(new Date()),
    modes_intensite: F.profil?.modes_intensite || ['rpe'], regle_budget: F.profil?.regle_budget || FORME_BUDGET, prefs: { bips: true, vibration: true, wakelock: true, ambiance: FORME_AMB_DEFAULT, ...(F.profil?.prefs || {}) } });
  if (!F.lieux.length) {
    await Forme.put('lieux', { nom: 'Maison', materiel: d.materiel || [], ordre: 0 });
    await Forme.put('lieux', { nom: 'Extérieur', materiel: [], ordre: 1 });
    await Forme.put('lieux', { nom: 'Hôtel', materiel: [], ordre: 2 });
  } else if (d.materiel) { const maison = F.lieux.find((l) => l.nom === 'Maison'); if (maison) await Forme.put('lieux', { ...maison, materiel: d.materiel }); }
  F.q = { step: 0, data: {} };
  F.view = 'semaine';
  if (first) Rewards.earn(Forme.member(), 'forme-bienvenue', 10, '2000-01-01');
  toast('Profil enregistré. Saisis tes disponibilités pour ta première semaine !');
  render();
}

// --- Semaine : disponibilités, plan, séances ---
function fViewSemaine() {
  const F = state.forme;
  const lundi = F.week;
  const iso = isoDate(lundi);
  const w = Forme.semaine(iso);
  const nav = `<div class="week-nav"><button class="icon-btn" data-act="forme-week" data-d="-1" aria-label="Semaine précédente">${ICON.back}</button><strong>${fmtDay(lundi)} – ${fmtDay(addDays(lundi, 6))}</strong><button class="icon-btn" data-act="forme-week" data-d="1" aria-label="Semaine suivante">${ICON.next}</button></div>`;
  const ss = Forme.weekSeances(lundi);
  const past = isoDate(addDays(lundi, 6)) < isoDate(new Date());
  if ((!w?.dispos?.length && !ss.length && !past) || F.editDispos) return nav + fDisposForm(lundi, w);
  if (F.meteo === null) { F.meteo = 'chargement'; Forme.meteo().then((h) => { F.meteo = h || false; if (h && state.tab === 'forme' && F.view === 'semaine') render(); }); }
  const cards = ss.length ? ss.map(fSeanceCard).join('') : `<div class="empty"><p>Aucune séance cette semaine.</p></div>`;
  return `${nav}<div class="f-list">${cards}</div>
    <div class="grid2" style="margin-top:12px">${past ? '' : '<button class="btn" data-act="forme-dispos">📅 Mes dispos</button>'}<button class="btn" data-act="forme-add">${ICON.plus} Ajouter une séance</button></div>`;
}
function fDisposForm(lundi, w) {
  const prev = Forme.semaine(isoDate(addDays(lundi, -7)));
  const base = w?.dispos?.length ? w.dispos : prev?.dispos?.length ? prev.dispos : [{ day: 1, minutes: 45, heure: '18:30' }, { day: 3, minutes: 45, heure: '18:30' }, { day: 5, minutes: 90, heure: '09:30' }];
  const today = isoDate(new Date());
  const rows = DAYS.map((d, i) => {
    const x = base.find((b) => b.day === i);
    const gone = isoDate(addDays(lundi, i)) < today;
    return `<div class="f-dispo ${gone ? 'gone' : ''}"><label class="check"><input type="checkbox" name="on${i}" ${x && !gone ? 'checked' : ''} ${gone ? 'disabled' : ''}><b>${d}</b></label>
      <select class="input" name="min${i}" aria-label="Durée disponible ${d}">${[20, 30, 45, 60, 75, 90, 120, 150, 180].map((m) => `<option value="${m}" ${(x?.minutes || 45) === m ? 'selected' : ''}>${formeFmtMin(m)}</option>`).join('')}</select>
      <input class="input" type="time" name="h${i}" value="${x?.heure || '18:30'}" aria-label="Heure ${d}"></div>`;
  }).join('');
  return `<form class="card f-pad stack" data-form="forme-dispos"><h3>Mes disponibilités de la semaine</h3>
    <p class="muted small">Coche les jours où tu peux t'entraîner et le temps dont tu disposes. Le plan répartit course (surtout en endurance), renfo et mobilité, sans enchaîner deux séances dures.</p>
    ${rows}<div class="grid2">${state.forme.editDispos ? '<button type="button" class="btn" data-act="forme-dispos-cancel">Annuler</button>' : '<span></span>'}<button class="btn primary">${ICON.sparkle} Générer ma semaine</button></div></form>`;
}
async function fSubmitDispos(f) {
  const F = state.forme;
  const dispos = DAYS.map((_, i) => (f[`on${i}`]?.checked ? { day: i, minutes: Number(f[`min${i}`].value), heure: f[`h${i}`].value || '18:30' } : null)).filter(Boolean);
  if (!dispos.length) { toast('Coche au moins un jour'); return; }
  $('button.primary', f).disabled = true;
  try {
    const plan = await Forme.generateWeek(F.week, dispos);
    F.editDispos = false;
    toast(`Semaine prête : ${plan.seances.length} séance${plan.seances.length > 1 ? 's' : ''}`);
    render();
  } catch (e) { $('button.primary', f).disabled = false; fail(e); }
}
function fSeanceCard(s) {
  const p = s.prevu || {};
  const C = FORME_COURSE[p.sous] || FORME_COURSE[s.type] || FORME_COURSE.renfo;
  const pr = state.forme.profil;
  const today = isoDate(new Date());
  const meta = [formeFmtMin(s.duree_min || p.duree_min || 0)];
  if (s.type === 'course' && (s.dplus_m || p.dplus_m)) meta.push(`D+ ${s.dplus_m || p.dplus_m} m`);
  if (s.statut === 'fait' && s.distance_m) meta.push(`${fmtNum(s.distance_m / 1000)} km`);
  if (s.statut === 'fait' && s.rpe) meta.push(`RPE ${s.rpe}`);
  if (s.type === 'renfo' && p.format) meta.push(FORME_FORMATS[p.format]?.label || '');
  const intens = s.type === 'course' || s.type === 'cardio' ? formeIntensite(C.zone || 'ef', pr, pr?.modes_intensite || ['rpe']) : '';
  const met = state.forme.meteo && s.statut === 'prevu' && s.type === 'course' && s.date >= today ? formeMeteoAlerte(state.forme.meteo, s.date, s.heure) : null;
  const st = { prevu: s.date < today ? '<span class="tag warn">à faire ?</span>' : '', fait: '<span class="tag ahead">✓ faite</span>', rate: '<span class="tag">ratée</span>' }[s.statut];
  const actions = s.statut === 'prevu'
    ? `<button class="btn small primary" data-act="forme-start" data-id="${s.id}">${ICON.play} Lancer</button><button class="btn small" data-act="forme-log" data-id="${s.id}">Saisir</button><button class="icon-btn" data-act="forme-menu" data-id="${s.id}" aria-label="Plus d'actions">${ICON.dots}</button>`
    : `<button class="btn small" data-act="forme-log" data-id="${s.id}">${ICON.edit} Détails</button>`;
  return `<article class="f-card t-${s.type} ${s.statut}" data-seance="${s.id}">
    <div class="f-card-top"><span class="f-day">${esc(fDate(s.date))}${s.heure ? ` · ${s.heure}` : ''}</span>${st}</div>
    <div class="row"><div class="grow"><h4>${esc(Forme.titre(s))}</h4><p class="muted small">${meta.filter(Boolean).map(esc).join(' · ')}</p>${intens ? `<p class="f-intens">${esc(intens)}</p>` : ''}</div>${fProfil(s)}</div>
    ${met ? `<p class="f-meteo">⛈️ ${esc(met.alerte)}${met.mieux ? ` · plutôt vers ${met.mieux}` : ''} <button class="btn small" data-act="forme-machine" data-id="${s.id}">Sur machine</button></p>` : ''}
    ${s.checkin ? `<p class="muted small">Check-in : ${esc({ maintenir: 'séance maintenue', alleger: 'séance allégée', remplacer: 'séance remplacée' }[s.checkin.decision] || '')}</p>` : ''}
    <div class="tl-actions">${actions}</div></article>`;
}

// --- Séance maintenant : générateur de renfo, course/cardio, saisie d'une sortie ---
function fViewSeance() {
  const F = state.forme;
  const pf = Forme.prefs();
  const g = F.gen || { lieu: pf.lieu || F.lieux[0]?.id, duree: 30, format: 'circuit', zones: [], intensite: 'moyen' };
  const draft = F.draft ? fDraftHtml(F.draft) : '';
  return `${draft}
    <form class="card f-pad stack" data-form="forme-gen"><h3>💪 Renfo maintenant</h3>
      <div class="grid2">${fField('Lieu', `<select class="input" name="lieu">${F.lieux.map((l) => `<option value="${l.id}" ${l.id === g.lieu ? 'selected' : ''}>${esc(l.nom)}</option>`).join('')}</select>`)}${fField('Durée (min)', fNum('duree', g.duree, 'min="8" max="120" required'))}</div>
      ${fField('Format', fChips('format', Object.fromEntries(Object.entries(FORME_FORMATS).map(([k, v]) => [k, v.label])), g.format))}
      ${fField('Zones (facultatif)', fChips('zones', FORME_ZONES, g.zones, 'checkbox'))}
      ${fField('Intensité', fChips('intensite', Object.fromEntries(Object.entries(FORME_INTENS).map(([k, v]) => [k, v.label])), g.intensite))}
      <button class="btn primary block">${ICON.shuffle} Générer ma séance</button></form>
    <form class="card f-pad stack" data-form="forme-gen-course"><h3>🏃 Course ou cardio</h3>
      <div class="grid2">${fField('Type', `<select class="input" name="sous">${Object.entries(FORME_COURSE).filter(([, v]) => v.type !== 'renfo' && v.type !== 'mobilite').map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>`)}${fField('Durée (min)', fNum('duree', 40, 'min="10" max="300" required'))}</div>
      <button class="btn block">${ICON.play} Préparer la séance</button></form>
    <div class="card f-pad"><h3>📝 Une sortie déjà faite ?</h3><p class="muted small">Saisis-la en 20 secondes ou importe le fichier de ta montre (GPX ou FIT).</p><button class="btn block" data-act="forme-log">Saisir une sortie</button></div>`;
}
function fDraftHtml(d) {
  const persos = Forme.persoExos();
  const blocs = d.blocs.map((b, bi) => {
    if (b.kind === 'intervalles') return `<div class="f-bloc"><h4>${esc(b.nom)}</h4><ol class="f-steps">${b.steps.map((st) => `<li class="z-${st.zone}"><span class="grow">${esc(st.label)}</span><b>${formeFmtMin(Math.round(st.s / 60)) || `${st.s} s`}</b></li>`).join('')}</ol></div>`;
    const head = b.kind === 'tours' ? `${b.tours} tour${b.tours > 1 ? 's' : ''} · repos ${b.reposTour} s entre les tours` : b.kind === 'amrap' ? `${Math.round(b.duree / 60)} min : un maximum de tours` : b.kind === 'emom' ? `${b.minutes} min, un exercice par minute` : '';
    return `<div class="f-bloc"><h4>${esc(b.nom)}${head ? ` <small class="muted">· ${esc(head)}</small>` : ''}</h4>${b.items.map((it, ii) => {
      const e = formeExo(it.exo, persos);
      const main = !['Échauffement', 'Retour au calme', 'Mobilité'].includes(b.nom);
      return `<div class="f-exo">${fPicto(e)}<button class="grow f-exo-name" data-act="forme-exo" data-exo="${esc(it.exo)}">${esc(e?.nom || it.exo)}<small class="muted">${esc(fDosage(it, b))}</small></button>
        ${main ? `${e?.variantes?.facile ? `<button class="icon-btn small" data-act="forme-var" data-b="${bi}" data-i="${ii}" data-v="facile" aria-label="Plus facile">−</button>` : ''}${e?.variantes?.difficile ? `<button class="icon-btn small" data-act="forme-var" data-b="${bi}" data-i="${ii}" data-v="difficile" aria-label="Plus difficile">+</button>` : ''}` : ''}
        <button class="icon-btn small" data-act="forme-swap" data-b="${bi}" data-i="${ii}" aria-label="Remplacer ${esc(e?.nom || '')}">${ICON.swap}</button></div>`;
    }).join('')}</div>`;
  }).join('');
  return `<div class="card f-pad f-draft"><div class="row"><h3 class="grow">${esc(d.titre)}</h3><button class="icon-btn" data-act="forme-draft-close" aria-label="Fermer la séance">${ICON.close}</button></div>
    <p class="muted small">≈ ${formeFmtMin(Math.round(formeSeanceSecondes(d) / 60))}${d.dplus_m ? ` · D+ ${d.dplus_m} m` : ''}${state.forme.draftFor ? ' · séance du plan' : ''}</p>${blocs}
    <div class="grid2">${d.type === 'renfo' || !d.type ? `<button class="btn" data-act="forme-regen">${ICON.shuffle} Tout relancer</button>` : '<span></span>'}<button class="btn primary" data-act="forme-play">${ICON.play} Lancer</button></div></div>`;
}
function fExoSheet(id) {
  const e = formeExo(id, Forme.persoExos());
  if (!e) return;
  const pf = Forme.prefs();
  const fav = (pf.favoris || []).includes(id), excl = (pf.exclus || []).includes(id);
  const video = safeUrl(pf.videos?.[id] || e.video || '');
  const el = openSheet(`${sheetHead(e.nom)}<div class="forme" data-amb="${esc(pf.ambiance || FORME_AMB_DEFAULT)}" style="background:none"><div class="f-exo-big">${fPicto(e, true)}</div>
    <p class="muted small">${(e.zones || []).map((z) => FORME_ZONES[z] || z).join(' · ')}${e.materiel?.length ? ` · ${e.materiel.map((m) => FORME_MATERIEL[m] || m).join(', ')}` : ' · sans matériel'}</p>
    <h4>Comment faire</h4><ul>${(e.consignes || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    ${e.erreurs?.length ? `<h4>À éviter</h4><ul>${e.erreurs.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    ${video ? `<p><a class="btn block" href="${esc(video)}" target="_blank" rel="noopener">${ICON.ext} Ma vidéo</a></p>` : ''}
    <label class="field"><span>Lien vers une vidéo (facultatif)</span><input class="input" type="url" data-x="video" value="${esc(pf.videos?.[id] || '')}" placeholder="https://…"></label>
    <div class="grid2"><button class="btn" data-x="fav">${fav ? '★ Favori' : '☆ Mettre en favori'}</button><button class="btn" data-x="excl">${excl ? '✓ Exclu' : '🚫 Ne plus proposer'}</button></div></div>`);
  el.addEventListener('click', async (ev) => {
    const x = ev.target.closest('[data-x]')?.dataset.x;
    if (!['fav', 'excl'].includes(x)) return;
    const key = x === 'fav' ? 'favoris' : 'exclus';
    const list = new Set(Forme.prefs()[key] || []);
    if (list.has(id)) list.delete(id); else list.add(id);
    try { await Forme.savePrefs({ [key]: [...list] }); closeSheet(); fExoSheet(id); toast(x === 'fav' ? 'Favoris mis à jour' : 'Exercices exclus mis à jour'); } catch (err) { fail(err); }
  });
  $('[data-x="video"]', el).addEventListener('change', async (ev) => {
    const v = ev.target.value.trim();
    if (v && !safeUrl(v)) { toast('Lien invalide'); return; }
    try { await Forme.savePrefs({ videos: { ...(Forme.prefs().videos || {}), [id]: v } }); toast('Lien enregistré'); } catch (err) { fail(err); }
  });
}
// Saisie d'une sortie (ou correction d'une séance) : manuelle ou fichier GPX/FIT.
function fLogSheet(id) {
  const F = state.forme;
  const s = id ? F.seances.find((x) => x.id === id) : null;
  const p = s?.prevu || {};
  const now = new Date();
  const v = { date: s?.date || isoDate(now), heure: s?.heure || now.toTimeString().slice(0, 5), sous: p.sous || (s?.type === 'renfo' ? 'renfo' : s?.type === 'mobilite' ? 'mobilite' : 'ef'), duree: s?.duree_min || p.duree_min || 45, km: s?.distance_m ? s.distance_m / 1000 : '', dplus: s?.dplus_m ?? p.dplus_m ?? '', fc: s?.fc_moy || '', rpe: s?.rpe || 5, note: s?.realise?.note || '' };
  let profil = s?.realise?.profil || null;
  const el = openSheet(`${sheetHead(s ? Forme.titre(s) : 'Saisir une sortie')}
    <form class="stack" data-x="log">
      <label class="btn block f-file">${ICON.upload} Importer un fichier GPX ou FIT<input type="file" accept=".gpx,.fit,application/gpx+xml,application/octet-stream" data-x="file" hidden></label>
      <p class="muted small" data-x="fileinfo">${profil ? 'Profil importé.' : 'Exporte la sortie depuis l\'appli de ta montre (Garmin Connect, Coros, Suunto…).'}</p>
      <div class="grid2">${fField('Date', `<input class="input" type="date" name="date" value="${v.date}" required>`)}${fField('Heure', `<input class="input" type="time" name="heure" value="${v.heure}">`)}</div>
      ${fField('Type', `<select class="input" name="sous">${Object.entries(FORME_COURSE).map(([k, c]) => `<option value="${k}" ${k === v.sous ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`)}
      <div class="grid2">${fField('Durée (min)', fNum('duree', v.duree, 'min="1" max="1440" required'))}${fField('Distance (km)', fNum('km', v.km, 'min="0" max="400" step="0.01"'))}</div>
      <div class="grid2">${fField('D+ (m)', fNum('dplus', v.dplus, 'min="0" max="15000"'))}${fField('FC moyenne', fNum('fc', v.fc, 'min="40" max="230"'))}</div>
      ${fField(`Ressenti (RPE) : <b data-x="rpev">${v.rpe}</b>/10`, `<input type="range" name="rpe" min="1" max="10" value="${v.rpe}" class="f-range">`, '1 = très facile · 5 = soutenu mais confortable · 10 = maximal')}
      ${fField('Note', `<input class="input" name="note" value="${esc(v.note)}" maxlength="300">`)}
      <button class="btn primary block">${s?.statut === 'fait' ? 'Enregistrer' : 'C\'est fait !'}</button>
      ${s ? '<button type="button" class="btn block" data-x="del" style="color:var(--danger)">Supprimer la séance</button>' : ''}</form>`);
  const f = $('form', el);
  f.rpe.addEventListener('input', () => { $('[data-x="rpev"]', el).textContent = f.rpe.value; });
  $('[data-x="file"]', el).addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const r = importActivityFile(file.name, await file.arrayBuffer());
      f.date.value = r.date; f.heure.value = r.heure; f.duree.value = r.duree_min; f.km.value = Math.round(r.distance_m / 10) / 100; f.dplus.value = r.dplus_m;
      if (r.fc_moy) f.fc.value = r.fc_moy;
      if (r.dplus_m >= 150 && f.sous.value === 'ef') f.sous.value = r.duree_min >= 75 ? 'sl' : 'ef';
      profil = elevationProfile(r.points, 60);
      $('[data-x="fileinfo"]', el).textContent = `${file.name} : ${fmtNum(r.distance_m / 1000)} km, D+ ${r.dplus_m} m, ${formeFmtMin(r.duree_min)}${r.fc_moy ? `, FC ${r.fc_moy}` : ''}.`;
    } catch (err) { toast(err.message); }
  });
  $('[data-x="del"]', el)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Supprimer cette séance ?', 'Supprimer'))) return;
    try { await Forme.syncAct({ ...s, statut: 'rate' }); await Forme.del('seances', s.id); closeSheet(); render(); } catch (err) { fail(err); }
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const sous = f.sous.value;
    const C = FORME_COURSE[sous];
    const before = formeRecords(F.seances);
    const row = { ...(s || {}), date: f.date.value, heure: f.heure.value || null, type: C.type, statut: 'fait', duree_min: Number(f.duree.value), distance_m: f.km.value ? Math.round(Number(String(f.km.value).replace(',', '.')) * 1000) : null,
      dplus_m: f.dplus.value === '' ? null : Number(f.dplus.value), fc_moy: f.fc.value ? Number(f.fc.value) : null, rpe: Number(f.rpe.value),
      prevu: s?.prevu || { sous, type: C.type, titre: C.label }, realise: { ...(s?.realise || {}), note: f.note.value.trim(), profil } };
    if (s?.prevu && (s.prevu.sous || s.type) !== sous) row.prevu = { ...s.prevu, sous, type: C.type, titre: C.label };
    row.kcal = Forme.kcal(row);
    try {
      const saved = await Forme.saveSeance(row);
      closeSheet();
      const msgs = await Forme.reward(saved, before);
      toast(msgs[0] || 'Séance enregistrée, bravo !');
      render();
    } catch (err) { fail(err); }
  });
}
function fMenuSheet(id) {
  const s = state.forme.seances.find((x) => x.id === id);
  if (!s) return;
  const el = openSheet(`${sheetHead(Forme.titre(s))}<div class="stack">
    ${fField('Déplacer au', `<div class="grid2"><input class="input" type="date" data-x="date" value="${s.date}"><input class="input" type="time" data-x="heure" value="${s.heure || '18:30'}"></div>`)}
    <button class="btn block" data-x="move">${ICON.move} Déplacer</button>
    ${s.type === 'course' ? `<button class="btn block" data-x="machine">🚴 Remplacer par du cardio sur machine</button>` : ''}
    <button class="btn block" data-x="miss">😕 Je n'ai pas pu la faire (plan B)</button>
    <button class="btn block" data-x="del" style="color:var(--danger)">${ICON.trash} Supprimer</button></div>`);
  el.addEventListener('click', async (ev) => {
    const x = ev.target.closest('[data-x]')?.dataset.x;
    if (!x || ['date', 'heure'].includes(x)) return;
    try {
      if (x === 'move') { await Forme.saveSeance({ ...s, date: $('[data-x="date"]', el).value, heure: $('[data-x="heure"]', el).value }); toast('Séance déplacée'); }
      if (x === 'machine') await fToMachine(s);
      if (x === 'miss') await fPlanB(s);
      if (x === 'del') { await Forme.syncAct({ ...s, statut: 'rate' }); await Forme.del('seances', s.id); toast('Séance supprimée'); }
      closeSheet();
      render();
    } catch (err) { fail(err); }
  });
}
async function fToMachine(s) {
  const lieux = state.forme.lieux.flatMap((l) => l.materiel || []);
  const sous = ['velo', 'rameur', 'ski-erg'].find((m) => lieux.includes(m));
  if (!sous) { toast('Aucune machine cardio dans tes lieux : ajoute-la dans Réglages › Lieux'); return; }
  const prevu = { ...genCourse(sous, s.duree_min || 40), plan: s.prevu?.plan };
  await Forme.saveSeance({ ...s, type: 'cardio', prevu, dplus_m: null });
  toast(`Remplacée par : ${prevu.titre}`);
}
async function fPlanB(s) {
  const F = state.forme;
  const lundi = mondayOf(isoToDate(s.date));
  const w = Forme.semaine(isoDate(lundi));
  const changes = replanAfterMiss(Forme.weekSeances(lundi).map((x) => ({ ...x, sous: x.prevu?.sous })), s.id, isoDate(new Date()), w?.dispos || [], isoDate(lundi));
  const msgs = [];
  for (const c of changes) {
    if (c.move) { const x = F.seances.find((y) => y.id === c.move); await Forme.saveSeance({ ...x, date: c.date, heure: c.heure }); msgs.push(`${Forme.titre(x)} déplacée au ${fDate(c.date)}`); continue; }
    const x = F.seances.find((y) => y.id === c.id);
    if (c.patch.convert) { const prevu = { ...genCourse(c.patch.convert, c.patch.duree_min, { terrain: F.profil?.terrain }), plan: true }; await Forme.saveSeance({ ...x, prevu, duree_min: prevu.duree_min, dplus_m: prevu.dplus_m }); msgs.push(`La sortie longue passe au ${fDate(x.date)}`); continue; }
    await Forme.saveSeance({ ...x, ...c.patch });
  }
  toast(msgs[0] || 'Pas grave : on ne rattrape pas une séance dure, la semaine continue.');
}
function fAddSheet() {
  const el = openSheet(`${sheetHead('Ajouter une séance')}<form class="stack">
    ${fField('Type', `<select class="input" name="sous">${Object.entries(FORME_COURSE).map(([k, c]) => `<option value="${k}">${esc(c.label)}</option>`).join('')}</select>`)}
    <div class="grid2">${fField('Date', `<input class="input" type="date" name="date" value="${isoDate(new Date())}" required>`)}${fField('Heure', `<input class="input" type="time" name="heure" value="18:30">`)}</div>
    ${fField('Durée (min)', fNum('duree', 40, 'min="10" max="300" required'))}<button class="btn primary block">Ajouter</button></form>`);
  $('form', el).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const sous = f.sous.value;
    const C = FORME_COURSE[sous];
    const minutes = Number(f.duree.value);
    const prevu = C.type === 'course' || C.type === 'cardio' ? genCourse(sous, minutes, { terrain: state.forme.profil?.terrain }) : { sous, type: C.type, titre: `${C.label} ${formeFmtMin(minutes)}`, format: C.type === 'mobilite' ? 'mobilite' : 'circuit', duree_min: minutes, intensite: 'moyen' };
    try { await Forme.saveSeance({ date: f.date.value, heure: f.heure.value, type: C.type, statut: 'prevu', prevu, duree_min: minutes, dplus_m: prevu.dplus_m || null }); closeSheet(); toast('Séance ajoutée'); render(); } catch (err) { fail(err); }
  });
}
// Check-in avant de lancer une séance prévue.
function fCheckinSheet(id) {
  const s = state.forme.seances.find((x) => x.id === id);
  if (!s) return;
  const Q = [['sommeil', 'Sommeil', 'mauvais', 'excellent'], ['fatigue', 'Fatigue', 'en forme', 'épuisé·e'], ['courbatures', 'Courbatures', 'aucune', 'fortes'], ['motivation', 'Motivation', 'faible', 'au top']];
  const el = openSheet(`${sheetHead('Check-in avant la séance')}<form class="stack">
    <p class="muted small">${esc(Forme.titre(s))} · 10 secondes pour adapter la séance à ta forme du jour.</p>
    ${Q.map(([k, l, a, b]) => `<div class="f-q"><b>${l}</b><div class="f-scale">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${k}" value="${n}" ${n === 3 ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div><small class="muted">${a} → ${b}</small></div>`).join('')}
    <p class="f-decision" data-x="dec"></p><button class="btn primary block">${ICON.play} C'est parti</button></form>`);
  const f = $('form', el);
  const read = () => Object.fromEntries(Q.map(([k]) => [k, Number(f[k].value)]));
  const LBL = { maintenir: '✅ Séance maintenue telle quelle.', alleger: '🌤️ Séance allégée : un peu plus courte et tout en endurance.', remplacer: '🛋️ Journée de récupération : la séance est remplacée par de la mobilité ou du cardio doux.' };
  const show = () => { $('[data-x="dec"]', el).textContent = LBL[checkinDecision(read())]; };
  f.addEventListener('change', show);
  show();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const c = read();
    const decision = checkinDecision(c);
    let row = { ...s, checkin: { ...c, decision, at: new Date().toISOString() } };
    const p = s.prevu || {};
    if (decision === 'alleger') {
      const m = Math.max(15, Math.round((s.duree_min || p.duree_min || 30) * 0.7));
      row.prevu = s.type === 'course' ? { ...genCourse('ef', m, { terrain: state.forme.profil?.terrain }), plan: p.plan } : { ...p, duree_min: m, intensite: 'facile', titre: `${FORME_COURSE[p.sous]?.label || 'Séance'} ${formeFmtMin(m)}` };
      row.duree_min = m;
      row.dplus_m = row.prevu.dplus_m || null;
    }
    if (decision === 'remplacer') {
      const mach = ['velo', 'rameur', 'ski-erg'].find((x) => state.forme.lieux.some((l) => (l.materiel || []).includes(x)));
      const m = 20;
      row.prevu = s.type === 'course' && mach ? { ...genCourse(mach, 25), plan: p.plan } : { sous: 'mobilite', type: 'mobilite', titre: 'Mobilité 20 min', format: 'mobilite', duree_min: m, intensite: 'facile', plan: p.plan };
      row.type = row.prevu.type;
      row.duree_min = row.prevu.duree_min;
      row.dplus_m = null;
    }
    try {
      const saved = await Forme.saveSeance(row);
      Rewards.earn(Forme.member(), 'forme-checkin', 2);
      closeSheet();
      fStartSeance(saved);
    } catch (err) { fail(err); }
  });
}
// Lance une séance du plan : course/cardio → minuteur ; renfo/mobilité → tirage au lieu choisi, puis minuteur.
function fStartSeance(s) {
  const F = state.forme;
  const p = s.prevu || {};
  if (s.type === 'course' || s.type === 'cardio') { if (!p.blocs) Object.assign(p, genCourse(p.sous || 'ef', s.duree_min || 40)); F.draft = { ...p, type: s.type }; F.draftFor = s.id; fPlayer(F.draft); return; }
  const pf = Forme.prefs();
  const params = Forme.genParams({ duree: s.duree_min || p.duree_min || 25, format: p.format || 'coureur', intensite: p.intensite || 'moyen', zones: [] });
  F.gen = { lieu: params.lieu, duree: params.duree, format: params.format, zones: [], intensite: params.intensite };
  F.genSeed = Date.now();
  F.draft = { ...genSeance(params, F.genSeed), type: s.type };
  F.draftFor = s.id;
  F.view = 'seance';
  store.set('forme:view', 'seance');
  if (state.tab !== 'forme') switchTab('forme'); else render();
  window.scrollTo({ top: 0 });
  toast(`Séance tirée pour « ${Forme.lieu(pf.lieu).nom} » : ajuste-la puis lance-la`);
}

// --- Lecteur de séance : minuteur guidé, bips, saisie des séries, compagnon ---
const FORME_ENCOURAGE = ['Tu gères ! On respire et on continue.', 'Chaque répétition compte.', 'Regarde-toi aller !', 'Garde une belle posture, c\'est parfait.', 'Encore un peu, je suis avec toi !', 'Souffle, relâche les épaules, c\'est reparti.', 'Le plus dur, c\'est de commencer : c\'est fait !'];
async function fPlayer(d) {
  const F = state.forme;
  const pf = Forme.prefs();
  const steps = formeSteps(d);
  if (!steps.length) { toast('Séance vide'); return; }
  const persos = Forme.persoExos();
  const c = companionOf(Forme.member());
  let i = 0, remaining = steps[0].s || 0, paused = false, timer = null, lock = null, rounds = 0, ctx = null;
  const started = Date.now();
  const log = {};
  try { if (pf.wakelock !== false) lock = await navigator.wakeLock?.request('screen'); } catch { /* non supporté */ }
  try { ctx = pf.bips === false ? null : new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
  const beep = (f = 880, len = 0.12) => { if (!ctx) return; try { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = f; g.gain.value = 0.25; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + len); } catch { /* audio indisponible */ } };
  const buzz = (p) => { if (pf.vibration !== false) navigator.vibrate?.(p); };
  const el = document.createElement('div');
  el.className = 'fplayer forme';
  el.dataset.amb = pf.ambiance || FORME_AMB_DEFAULT;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Séance en cours');
  document.body.append(el);
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
  const stop = () => { clearInterval(timer); timer = null; };
  const close = () => { stop(); try { lock?.release(); } catch { /* déjà libéré */ } try { ctx?.close(); } catch { /* fermé */ } el.remove(); };
  const say = () => FORME_ENCOURAGE[Math.floor((Date.now() - started) / 20000) % FORME_ENCOURAGE.length];
  const go = (n) => { i = n; if (i >= steps.length) return end(); remaining = steps[i].s || 0; beep(i % 2 ? 660 : 990, 0.18); buzz(120); draw(); };
  const tick = () => {
    if (paused) return;
    const st = steps[i];
    if (!st?.s) return;
    remaining--;
    if (remaining > 0 && remaining <= 3) beep(740, 0.08);
    if (remaining <= 0) { beep(1040, 0.35); buzz([200, 80, 200]); go(i + 1); return; }
    const t = $('[data-t]', el);
    if (t) t.textContent = fmt(remaining);
    const ring = $('[data-ring]', el);
    if (ring) ring.style.setProperty('--p', String(1 - remaining / st.s));
  };
  const draw = () => {
    const st = steps[i];
    const e = st.exo ? formeExo(st.exo, persos) : null;
    const nx = st.next ? formeExo(st.next, persos) : null;
    let mid = '';
    if (st.kind === 'repos') mid = `<p class="f-p-kind">${st.long ? 'Récupération' : 'Repos'}</p><div class="f-p-ring" data-ring style="--p:0"><b data-t>${fmt(remaining)}</b></div>${nx ? `<p class="f-p-next">Ensuite : ${fPicto(nx)} <b>${esc(nx.nom)}</b></p>` : ''}`;
    else if (st.kind === 'serie') {
      const l = log[st.exo];
      mid = `${fPicto(e, true)}<h2>${esc(e?.nom || '')}</h2><p class="f-p-kind">Série ${st.serie}/${st.series}${e?.unilateral ? ' · chaque côté' : ''}</p>
        <div class="grid2 f-p-inputs"><label class="field"><span>Répétitions</span><input class="input" type="number" inputmode="numeric" data-x="reps" value="${l?.reps?.[st.serie - 2] ?? st.reps}"></label><label class="field"><span>Charge (kg)</span><input class="input" type="number" inputmode="decimal" step="0.5" data-x="charge" value="${l?.charge ?? st.charge ?? ''}" placeholder="—"></label></div>
        <button class="btn primary block big" data-p="serie">✓ Série faite</button>`;
    } else if (st.kind === 'amrap') mid = `<p class="f-p-kind">AMRAP · un maximum de tours</p><div class="f-p-ring" data-ring style="--p:0"><b data-t>${fmt(remaining)}</b></div>
        <ol class="f-p-amrap">${st.items.map((it) => { const x = formeExo(it.exo, persos); return `<li>${fPicto(x)}<span class="grow">${esc(x?.nom || '')}</span><b>${it.cible}${x?.mode === 'temps' ? ' s' : ''}</b></li>`; }).join('')}</ol>
        <div class="f-p-rounds"><button class="icon-btn" data-p="r-">−</button><b data-x="rounds">${rounds}</b> tour${rounds > 1 ? 's' : ''}<button class="icon-btn" data-p="r+">+</button></div>`;
    else if (st.kind === 'course') mid = `<p class="f-p-kind z-${st.zone}">${esc(formeIntensite(st.zone, F.profil, F.profil?.modes_intensite || ['rpe']))}</p><h2>${esc(st.label)}</h2><div class="f-p-ring" data-ring style="--p:0"><b data-t>${fmt(remaining)}</b></div>`;
    else mid = `${fPicto(e, true)}<h2>${esc(e?.nom || '')}</h2><p class="f-p-kind">${st.kind === 'emom' ? `${st.cible}${e?.mode === 'temps' ? ' s' : ' reps'} puis repos jusqu'à la minute` : e?.unilateral ? 'Change de côté à mi-temps' : 'Effort'}</p><div class="f-p-ring" data-ring style="--p:0"><b data-t>${fmt(remaining)}</b></div>
        ${e?.consignes?.[0] ? `<p class="f-p-tip">${esc(e.consignes[0])}</p>` : ''}`;
    el.innerHTML = `<div class="f-p-top"><button class="icon-btn" data-p="close" aria-label="Quitter la séance">${ICON.close}</button><span class="grow">${esc(st.bloc || d.titre || '')}</span><span class="muted">${i + 1}/${steps.length}</span></div>
      <div class="progress"><i style="width:${((i + 1) / steps.length) * 100}%"></i></div>
      <div class="f-p-mid">${mid}</div>
      ${c ? `<div class="f-p-pet">${companionSvg(c, 'sportif', 64)}<span class="bubble">${esc(say())}</span></div>` : ''}
      <div class="f-p-nav"><button class="btn" data-p="prev" ${i === 0 ? 'disabled' : ''}>${ICON.back}</button><button class="btn" data-p="pause">${paused ? `${ICON.play} Reprendre` : '⏸ Pause'}</button><button class="btn" data-p="next">${ICON.next}</button></div>`;
    $$('.fpicto', el).forEach((p) => p.classList.toggle('paused', paused));
  };
  const end = () => {
    stop();
    const dur = Math.max(1, Math.round((Date.now() - started) / 60000));
    const isRun = d.type === 'course' || d.type === 'cardio';
    el.innerHTML = `<div class="f-p-top"><span class="grow"><b>Séance terminée !</b></span></div><div class="f-p-end">
      ${c ? companionSvg(c, 'ravi', 120) : '<div style="font-size:64px">🎉</div>'}<h2>Bravo !</h2>
      <form class="stack" data-x="end">${fField('Durée réelle (min)', fNum('duree', dur, 'min="1" max="600"'))}
      ${isRun ? `<div class="grid2">${fField('Distance (km)', fNum('km', '', 'step="0.01" min="0"'))}${fField('D+ (m)', fNum('dplus', d.dplus_m || '', 'min="0"'))}</div>${fField('FC moyenne', fNum('fc', '', 'min="40" max="230"'))}` : ''}
      ${fField('Ressenti (RPE) : <b data-x="rpev">6</b>/10', '<input type="range" name="rpe" min="1" max="10" value="6" class="f-range">')}
      ${fField('Note', '<input class="input" name="note" maxlength="300" placeholder="Sensations, douleurs, météo…">')}
      <button class="btn primary block big">Enregistrer</button><button type="button" class="btn block" data-p="close">Ne pas enregistrer</button></form></div>`;
    const f = $('form', el);
    f.rpe.addEventListener('input', () => { $('[data-x="rpev"]', el).textContent = f.rpe.value; });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const before = formeRecords(F.seances);
      const link = F.draftFor ? F.seances.find((x) => x.id === F.draftFor) : null;
      const now = new Date();
      const items = Object.entries(log).map(([exo, v]) => ({ exo, ...v }));
      const type = d.type || 'renfo';
      const row = { ...(link || {}), date: link?.date && link.date <= isoDate(now) ? link.date : isoDate(now), heure: link?.heure || now.toTimeString().slice(0, 5), type: type === 'cardio' || type === 'course' ? type : d.format === 'mobilite' ? 'mobilite' : 'renfo', statut: 'fait',
        prevu: link?.prevu ? { ...link.prevu, ...d, plan: link.prevu.plan } : { ...d, sous: d.sous || (d.format === 'mobilite' ? 'mobilite' : 'renfo') }, realise: { items, rounds: rounds || null, note: f.note.value.trim() },
        duree_min: Number(f.duree.value) || dur, rpe: Number(f.rpe.value), distance_m: f.km?.value ? Math.round(Number(String(f.km.value).replace(',', '.')) * 1000) : null, dplus_m: f.dplus?.value ? Number(f.dplus.value) : null, fc_moy: f.fc?.value ? Number(f.fc.value) : null };
      row.kcal = Forme.kcal(row);
      try {
        const saved = await Forme.saveSeance(row);
        close();
        F.draft = null; F.draftFor = null;
        const msgs = await Forme.reward(saved, before);
        toast(msgs[0] || `Séance enregistrée : ${Math.round(saved.kcal || 0)} kcal`);
        render();
      } catch (err) { fail(err); }
    });
  };
  el.addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-p]')?.dataset.p;
    if (!p) return;
    if (p === 'close') { if (el.querySelector('[data-x="end"]') || i === 0) close(); else confirmSheet('Quitter la séance ? Elle ne sera pas enregistrée.', 'Quitter').then((ok) => ok && close()); return; }
    if (p === 'pause') { paused = !paused; draw(); return; }
    if (p === 'prev') return go(Math.max(0, i - 1));
    if (p === 'next') return go(i + 1);
    if (p === 'r+' || p === 'r-') { rounds = Math.max(0, rounds + (p === 'r+' ? 1 : -1)); $('[data-x="rounds"]', el).textContent = rounds; return; }
    if (p === 'serie') {
      const st = steps[i];
      const l = (log[st.exo] ||= { reps: [], charge: null, cible: st.reps });
      l.reps[st.serie - 1] = Number($('[data-x="reps"]', el).value) || 0;
      const ch = Number(String($('[data-x="charge"]', el).value).replace(',', '.'));
      if (ch) l.charge = ch;
      go(i + 1);
    }
  });
  timer = setInterval(tick, 1000);
  draw();
}

// --- Suivi : volume, charge, régularité, records, poids et mensurations ---
function fViewSuivi() {
  const F = state.forme;
  const today = isoDate(new Date());
  const lundi = isoDate(mondayOf(new Date()));
  const vols = formeVolumes(F.seances, lundi, 8);
  const maxKm = Math.max(1, ...vols.map((v) => v.km)), maxD = Math.max(1, ...vols.map((v) => v.dplus));
  const bars = `<div class="f-bars" role="img" aria-label="Kilomètres et dénivelé des 8 dernières semaines">${vols.map((v) => `<div class="f-bar"><span class="km" style="height:${(v.km / maxKm) * 100}%"></span><span class="dp" style="height:${(v.dplus / maxD) * 100}%"></span><b>${v.km ? fmtNum(v.km) : '·'}</b><small>${isoToDate(v.lundi).getDate()}/${isoToDate(v.lundi).getMonth() + 1}</small></div>`).join('')}</div>
    <p class="muted small"><span class="f-key km"></span> km · <span class="f-key dp"></span> D+ (max ${maxD} m)</p>`;
  const ch = formeCharge(F.seances, today);
  const pos = ch.ratio == null ? 0 : clampF((ch.ratio - 0.5) / 1.2, 0, 1);
  const charge = `<div class="f-gauge"><div class="f-gauge-bar"><i class="lo"></i><i class="ok"></i><i class="hi"></i><b style="left:${pos * 100}%"></b></div><div class="row small muted"><span>0,5</span><span class="grow" style="text-align:center">0,8 – 1,3 : zone sûre</span><span>1,7</span></div></div>
    <p>${ch.ratio == null ? 'Il faut deux semaines de séances avec ressenti (RPE) pour calculer ta charge.' : `Ratio aigu/chronique : <b>${fmtNum(ch.ratio)}</b> (7 jours : ${ch.aigue}, moyenne 4 semaines : ${ch.chronique}).`}</p>
    ${ch.alerte === 'haute' ? '<p class="f-alert">⚠️ Tu as beaucoup augmenté ta charge : prévois une séance plus calme ou un jour de repos.</p>' : ch.alerte === 'basse' ? '<p class="f-alert soft">Ta charge baisse : normal en semaine allégée, sinon reprends en douceur.</p>' : ''}`;
  const weeks = Array.from({ length: 8 }, (_, k) => addDays(mondayOf(new Date()), -7 * (7 - k)));
  const cal = `<div class="f-cal">${weeks.map((l) => `<div class="f-cal-w">${DAYS.map((_, j) => { const iso = isoDate(addDays(l, j)); const ss = F.seances.filter((s) => s.date === iso); const st = ss.some((s) => s.statut === 'fait') ? 'fait' : ss.some((s) => s.statut === 'rate' || (s.statut === 'prevu' && iso < today)) ? 'rate' : ss.length ? 'prevu' : ''; return `<i class="${st} ${iso === today ? 'today' : ''}" title="${iso}"></i>`; }).join('')}</div>`).join('')}</div>`;
  let tenues = 0, serie = 0;
  for (const l of weeks.slice(0, -1)) { const p = Forme.weekSeances(l).filter((s) => s.prevu?.plan); const ok = p.length && p.filter((s) => s.statut === 'fait').length / p.length >= 0.8; if (ok) { tenues++; serie++; } else if (p.length) serie = 0; }
  const rec = formeRecords(F.seances);
  const persos = Forme.persoExos();
  const topCharges = Object.entries(rec.charges).slice(0, 4).map(([id, v]) => `<li>${esc(formeExo(id, persos)?.nom || id)} : <b>${fmtNum(v.charge)} kg</b></li>`).join('');
  const m = Forme.member();
  const mens = F.mens.slice(-1)[0];
  const MK = [['tour_taille_cm', 'Taille', 'cm'], ['tour_hanches_cm', 'Hanches', 'cm'], ['tour_cuisse_cm', 'Cuisse', 'cm'], ['tour_bras_cm', 'Bras', 'cm'], ['masse_grasse_pct', 'Masse grasse', '%'], ['masse_musculaire_kg', 'Muscle', 'kg']];
  const first = F.mens[0];
  return `<div class="card f-pad"><h3>Volume par semaine</h3>${bars}</div>
    <div class="card f-pad"><h3>Charge d'entraînement</h3>${charge}</div>
    <div class="card f-pad"><h3>Régularité</h3>${cal}<p class="small"><b>${tenues}</b> semaine${tenues > 1 ? 's' : ''} tenue${tenues > 1 ? 's' : ''} sur les 7 dernières · série en cours : <b>${serie}</b></p></div>
    <div class="card f-pad"><h3>Records</h3><ul class="f-rec">${rec.distance ? `<li>Plus longue sortie : <b>${fmtNum(rec.distance.distance_m / 1000)} km</b> (${fDate(rec.distance.date)})</li>` : ''}${rec.dplus?.dplus_m ? `<li>Plus gros D+ : <b>${rec.dplus.dplus_m} m</b> (${fDate(rec.dplus.date)})</li>` : ''}${rec.duree ? `<li>Plus longue durée : <b>${formeFmtMin(rec.duree.duree_min)}</b></li>` : ''}${topCharges}</ul>${!rec.distance && !topCharges ? '<p class="muted small">Tes records apparaîtront après tes premières séances.</p>' : ''}</div>
    ${state.peseesOk && typeof weightCard === 'function' ? weightCard(m) : ''}
    <div class="card f-pad"><div class="row"><h3 class="grow">Mensurations</h3><button class="btn small" data-act="forme-mens">${ICON.plus} Mesurer</button></div>
      ${mens ? `<div class="f-mens">${MK.filter(([k]) => mens[k] != null).map(([k, l, u]) => { const dlt = first && first !== mens && first[k] != null ? Number(mens[k]) - Number(first[k]) : null; return `<div><small>${l}</small><b>${fmtF(Number(mens[k]))} ${u}</b>${dlt ? `<em class="${dlt < 0 ? 'down' : 'up'}">${dlt > 0 ? '+' : ''}${fmtF(dlt)}</em>` : ''}</div>`; }).join('')}</div><p class="muted small">Dernière mesure le ${fDate(mens.date)}${first !== mens ? ` · écart depuis le ${fDate(first.date)}` : ''}</p>` : '<p class="muted small">Tour de taille, hanches, cuisse, bras, % de masse grasse : tout est facultatif. Une mesure toutes les 2 à 4 semaines suffit.</p>'}</div>`;
}
function fMensSheet() {
  const last = state.forme.mens.slice(-1)[0] || {};
  const MK = [['tour_taille_cm', 'Tour de taille (cm)'], ['tour_hanches_cm', 'Tour de hanches (cm)'], ['tour_cuisse_cm', 'Tour de cuisse (cm)'], ['tour_bras_cm', 'Tour de bras (cm)'], ['masse_grasse_pct', 'Masse grasse (%)'], ['masse_musculaire_kg', 'Masse musculaire (kg)']];
  const el = openSheet(`${sheetHead('Mensurations')}<form class="stack">${fField('Date', `<input class="input" type="date" name="date" value="${isoDate(new Date())}" required>`)}
    <div class="grid2">${MK.map(([k, l]) => fField(l, fNum(k, '', `step="0.1" min="0" placeholder="${last[k] ?? ''}"`))).join('')}</div>${fField('Note', '<input class="input" name="note" maxlength="200">')}<button class="btn primary block">Enregistrer</button></form>`);
  $('form', el).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const row = { date: f.date.value, note: f.note.value.trim() || null };
    for (const [k] of MK) row[k] = f[k].value ? Number(String(f[k].value).replace(',', '.')) : null;
    if (MK.every(([k]) => row[k] == null)) { toast('Saisis au moins une mesure'); return; }
    const ex = state.forme.mens.find((x) => x.date === row.date);
    try { await Forme.put('mens', { ...(ex || {}), ...row }); closeSheet(); toast('Mensurations enregistrées'); render(); } catch (err) { fail(err); }
  });
}

// --- Réglages du module ---
function fViewReglages() {
  const F = state.forme;
  const pr = F.profil || {};
  const pf = pr.prefs || {};
  const modes = pr.modes_intensite || ['rpe'];
  const rb = { ...FORME_BUDGET, ...(pr.regle_budget || {}) };
  const pct = (k) => `<select class="input" name="b_${k}">${[0, 0.25, 0.5, 0.75, 1].map((v) => `<option value="${v}" ${Number(rb[k]) === v ? 'selected' : ''}>${v * 100} %</option>`).join('')}</select>`;
  const persos = Forme.persoExos();
  const nomOf = (id) => formeExo(id, persos)?.nom || id;
  const zf = formeZonesFC(pr);
  return `<form class="card f-pad stack" data-form="forme-reperes"><h3>Mes repères</h3>
      <div class="grid2">${fField('FC repos', fNum('fc_repos', pr.fc_repos, 'min="30" max="120"'))}${fField('FC max', fNum('fc_max', pr.fc_max, 'min="120" max="230"'))}</div>
      <div class="grid2">${fField('Endurance : FC min', fNum('fc_ef_min', pr.fc_ef_min, 'min="60" max="220"'))}${fField('Endurance : FC max', fNum('fc_ef_max', pr.fc_ef_max, 'min="60" max="220"'))}</div>
      <div class="grid2">${fField('Seuil : FC min', fNum('fc_seuil_min', pr.fc_seuil_min, 'min="60" max="230"'))}${fField('Seuil : FC max', fNum('fc_seuil_max', pr.fc_seuil_max, 'min="60" max="230"'))}</div>
      ${fField('VMA (km/h)', fNum('vma_kmh', pr.vma_kmh, 'min="6" max="25" step="0.1"'), Number(pr.vma_kmh) ? `Endurance ${formeIntensite('ef', pr, ['allure'])} · seuil ${formeIntensite('seuil', pr, ['allure'])}` : 'Si tu ne la connais pas, laisse vide : l\'appli utilise le ressenti.')}
      ${zf.ef ? `<p class="muted small">Zones calculées : endurance ${zf.ef.join('–')} · seuil ${zf.seuil.join('–')} bpm</p>` : ''}
      ${fField('Intensité affichée', fChips('modes', { rpe: 'Ressenti (RPE)', fc: 'Fréquence cardiaque', allure: 'Allure' }, modes, 'checkbox'))}
      <button class="btn primary">Enregistrer mes repères</button></form>
    <div class="card f-pad"><div class="row"><h3 class="grow">Mes lieux</h3><button class="btn small" data-act="forme-lieu">${ICON.plus} Lieu</button></div>
      ${F.lieux.map((l) => `<div class="entry"><div class="grow"><div class="nm">${esc(l.nom)}</div><div class="muted small">${l.materiel?.length ? l.materiel.map((m) => FORME_MATERIEL[m] || m).join(', ') : 'Sans matériel'}</div></div><button class="icon-btn" data-act="forme-lieu" data-id="${l.id}" aria-label="Modifier ${esc(l.nom)}">${ICON.edit}</button></div>`).join('')}</div>
    <div class="card f-pad"><div class="row"><h3 class="grow">Exercices</h3><button class="btn small" data-act="forme-perso">${ICON.plus} Exercice perso</button></div>
      <p class="small"><b>Favoris :</b> ${(pf.favoris || []).map(nomOf).map(esc).join(', ') || '<span class="muted">aucun</span>'}</p>
      <p class="small"><b>Exclus :</b> ${(pf.exclus || []).map(nomOf).map(esc).join(', ') || '<span class="muted">aucun</span>'}</p>
      ${persos.length ? `<p class="small"><b>Perso :</b> ${persos.map((p) => `<button class="chip" data-act="forme-perso" data-id="${p.row}">${esc(p.nom)}</button>`).join(' ')}</p>` : ''}
      <button class="btn block" data-act="forme-biblio">Parcourir la bibliothèque (${formeLib().length})</button></div>
    <form class="card f-pad stack" data-form="forme-prefs"><h3>Séances et budget</h3>
      <label class="check"><input type="checkbox" name="bips" ${pf.bips !== false ? 'checked' : ''}><span>Bips du minuteur</span></label>
      <label class="check"><input type="checkbox" name="vibration" ${pf.vibration !== false ? 'checked' : ''}><span>Vibrations</span></label>
      <label class="check"><input type="checkbox" name="wakelock" ${pf.wakelock !== false ? 'checked' : ''}><span>Garder l'écran allumé pendant la séance</span></label>
      ${fField('Renfo par semaine dans le plan', `<select class="input" name="renfo">${[0, 1, 2].map((n) => `<option ${Number(pf.renfo ?? formeDepart(pr).renfo) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}
      <label class="check"><input type="checkbox" name="budget" ${pf.budget !== false ? 'checked' : ''}><span><b>Le budget calorique du jour suit mes séances faites</b></span></label>
      <div class="grid3">${fField('Perte', pct('perte'))}${fField('Maintien', pct('maintien'))}${fField('Prise', pct('prise'))}</div>
      <p class="muted small">Part des calories de tes séances ajoutée à ton besoin du jour, selon ton objectif (${esc(OBJECTIF[Forme.member()?.objectif]?.label || 'maintien')}). Le conseil de poids (±100 kcal) corrige ensuite sur la durée.</p>
      ${fField('Ambiance du module', fChips('ambiance', Object.fromEntries(FORME_AMBIANCES), pf.ambiance || FORME_AMB_DEFAULT))}
      <button class="btn primary">Enregistrer</button></form>
    <div class="card f-pad"><h3>Météo</h3><p class="muted small">${pf.lat ? `Position : ${esc(pf.ville || `${fmtNum(pf.lat)}, ${fmtNum(pf.lon)}`)}. Les sorties sont signalées en cas d'orage, de pluie forte ou de chaleur.` : 'Indique où tu cours pour être prévenu·e d\'un orage, de pluie forte ou de chaleur.'}</p>
      <form class="row" data-form="forme-ville" style="gap:8px"><input class="input grow" name="ville" placeholder="Ville (ex. Chambéry)" value="${esc(pf.ville || '')}"><button class="btn">OK</button></form>
      <button class="btn block small" data-act="forme-geo" style="margin-top:8px">📍 Utiliser ma position</button></div>
    <div class="card f-pad"><div class="row"><h3 class="grow">Course cible</h3><button class="btn small" data-act="forme-objectif">${ICON.plus} Ajouter</button></div>
      ${F.objectifs.length ? F.objectifs.map((o) => `<div class="entry"><div class="grow"><div class="nm">🏁 ${esc(o.nom)}</div><div class="muted small">${fDate(o.date)}${o.distance_km ? ` · ${fmtNum(Number(o.distance_km))} km` : ''}${o.dplus_m ? ` · D+ ${o.dplus_m} m` : ''}</div></div><button class="icon-btn" data-act="forme-objectif-del" data-id="${o.id}" aria-label="Supprimer">${ICON.trash}</button></div>`).join('') : '<p class="muted small">Facultatif : le plan s\'allège les deux dernières semaines avant la course.</p>'}</div>
    <div class="card f-pad stack"><h3>Mon profil Forme</h3><p class="muted small">${esc(FORME_NIVEAUX[pr.niveau] || '')} · ${esc(FORME_OBJECTIFS[pr.objectif_forme] || '')} · ${esc(FORME_TERRAINS[pr.terrain] || '')}</p>
      <button class="btn block" data-act="forme-q-redo">Refaire le questionnaire</button><button class="btn block" data-act="forme-reset" style="color:var(--danger)">Réinitialiser le module</button></div>`;
}
function fLieuSheet(id) {
  const l = id ? state.forme.lieux.find((x) => x.id === id) : null;
  const el = openSheet(`${sheetHead(l ? l.nom : 'Nouveau lieu')}<form class="stack">${fField('Nom', `<input class="input" name="nom" value="${esc(l?.nom || '')}" required maxlength="40" placeholder="Salle, chalet…">`)}
    ${fField('Matériel disponible', fChips('materiel', FORME_MATERIEL, l?.materiel || [], 'checkbox'))}<button class="btn primary block">Enregistrer</button>${l ? '<button type="button" class="btn block" data-x="del" style="color:var(--danger)">Supprimer ce lieu</button>' : ''}</form>`);
  const f = $('form', el);
  f.addEventListener('submit', async (ev) => { ev.preventDefault(); try { await Forme.put('lieux', { ...(l || { ordre: state.forme.lieux.length }), nom: f.nom.value.trim(), materiel: new FormData(f).getAll('materiel') }); closeSheet(); render(); } catch (err) { fail(err); } });
  $('[data-x="del"]', el)?.addEventListener('click', async () => { if (state.forme.lieux.length < 2) { toast('Garde au moins un lieu'); return; } try { await Forme.del('lieux', l.id); closeSheet(); render(); } catch (err) { fail(err); } });
}
function fPersoSheet(rowId) {
  const row = rowId ? state.forme.exos.find((x) => x.id === rowId) : null;
  const e = row?.data || { nom: '', consignes: [], materiel: [], zones: [], formats: ['circuit'], mode: 'reps', base: 12, pattern: 'tronc', video: '' };
  const el = openSheet(`${sheetHead(row ? e.nom : 'Exercice perso')}<form class="stack">${fField('Nom', `<input class="input" name="nom" value="${esc(e.nom)}" required maxlength="60">`)}
    ${fField('Consignes (une par ligne)', `<textarea class="input" name="consignes" rows="3">${esc((e.consignes || []).join('\n'))}</textarea>`)}
    ${fField('Matériel', fChips('materiel', FORME_MATERIEL, e.materiel, 'checkbox'))}${fField('Zones', fChips('zones', FORME_ZONES, e.zones, 'checkbox'))}
    ${fField('Formats', fChips('formats', Object.fromEntries(Object.entries(FORME_FORMATS).map(([k, v]) => [k, v.label])), e.formats, 'checkbox'))}
    ${fField('Mouvement', `<select class="input" name="pattern">${Object.entries({ genou: 'Jambes (genou)', hanche: 'Hanche / fessiers', pousser: 'Pousser', tirer: 'Tirer', tronc: 'Tronc / gainage', pieds: 'Pieds / chevilles', cardio: 'Cardio', mobilite: 'Mobilité' }).map(([k, v]) => `<option value="${k}" ${e.pattern === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
    <div class="grid2">${fField('Compté en', `<select class="input" name="mode"><option value="reps" ${e.mode === 'reps' ? 'selected' : ''}>répétitions</option><option value="temps" ${e.mode === 'temps' ? 'selected' : ''}>secondes</option></select>`)}${fField('Référence', fNum('base', e.base, 'min="1" max="300"'))}</div>
    ${fField('Lien vidéo', `<input class="input" type="url" name="video" value="${esc(e.video || '')}" placeholder="https://…">`)}
    <button class="btn primary block">Enregistrer</button>${row ? '<button type="button" class="btn block" data-x="del" style="color:var(--danger)">Supprimer</button>' : ''}</form>`);
  const f = $('form', el);
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(f);
    const data = { kind: 'perso', nom: f.nom.value.trim(), consignes: f.consignes.value.split('\n').map((x) => x.trim()).filter(Boolean), erreurs: [], materiel: fd.getAll('materiel'), zones: fd.getAll('zones'), formats: fd.getAll('formats').length ? fd.getAll('formats') : ['circuit'],
      pattern: f.pattern.value, mode: f.mode.value, base: Number(f.base.value) || 10, niveau: 2, unilateral: false, picto: { genou: 'squat', hanche: 'pont-fessier', pousser: 'pompe', tirer: 'rowing', tronc: 'gainage-planche', pieds: 'mollets', cardio: 'saut', mobilite: 'etirement' }[f.pattern.value], variantes: { facile: null, difficile: null }, video: safeUrl(f.video.value.trim()) || '' };
    try { await Forme.put('exos', { ...(row || {}), data }); closeSheet(); toast('Exercice enregistré'); render(); } catch (err) { fail(err); }
  });
  $('[data-x="del"]', el)?.addEventListener('click', async () => { try { await Forme.del('exos', row.id); closeSheet(); render(); } catch (err) { fail(err); } });
}
function fBiblioSheet() {
  const el = openSheet(`${sheetHead('Bibliothèque d\'exercices')}<input class="input" data-x="q" placeholder="Rechercher (squat, gainage, kettlebell…)" autocomplete="off"><div data-x="list" class="f-biblio"></div>`, { full: true });
  const pf = Forme.prefs();
  const draw = () => {
    const q = norm($('[data-x="q"]', el).value);
    const list = [...formeLib(), ...Forme.persoExos()].filter((e) => !q || norm(`${e.nom} ${(e.zones || []).join(' ')} ${(e.materiel || []).join(' ')}`).includes(q)).slice(0, 80);
    $('[data-x="list"]', el).innerHTML = list.map((e) => `<button class="f-exo" data-exo="${esc(e.id)}">${fPicto(e)}<span class="grow f-exo-name">${esc(e.nom)}<small class="muted">${(e.materiel || []).map((m) => FORME_MATERIEL[m] || m).join(', ') || 'sans matériel'}</small></span>${(pf.favoris || []).includes(e.id) ? '★' : ''}${(pf.exclus || []).includes(e.id) ? '🚫' : ''}</button>`).join('') || '<p class="muted">Aucun exercice.</p>';
  };
  $('[data-x="q"]', el).addEventListener('input', draw);
  el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-exo]'); if (b) fExoSheet(b.dataset.exo); });
  draw();
}
function fObjectifSheet() {
  const el = openSheet(`${sheetHead('Course cible')}<form class="stack">${fField('Nom', '<input class="input" name="nom" required maxlength="60" placeholder="Trail des Bauges">')}
    ${fField('Date', `<input class="input" type="date" name="date" required min="${isoDate(new Date())}">`)}<div class="grid2">${fField('Distance (km)', fNum('km', '', 'step="0.1" min="1"'))}${fField('D+ (m)', fNum('dplus', '', 'min="0"'))}</div><button class="btn primary block">Ajouter</button></form>`);
  $('form', el).addEventListener('submit', async (ev) => { ev.preventDefault(); const f = ev.target; try { await Forme.put('objectifs', { nom: f.nom.value.trim(), date: f.date.value, distance_km: f.km.value ? Number(f.km.value) : null, dplus_m: f.dplus.value ? Number(f.dplus.value) : null }); closeSheet(); toast('Course cible ajoutée : le plan en tiendra compte'); render(); } catch (err) { fail(err); } });
}

// --- Accueil : bloc séance du jour et conseils croisés (appelé par renderToday) ---
function formeTodayItems(me, today, past) {
  const F = state.forme;
  if (!F?.ok || me?.id !== Forme.member()?.id) return [];
  const items = [];
  const iso = isoDate(today);
  const tom = isoDate(addDays(today, 1));
  const hardTomorrow = F.seances.find((s) => s.date === tom && s.statut === 'prevu' && (formeIsHard(s) || (s.duree_min || 0) >= 75));
  if (hardTomorrow) items.push({ t: '18:30', kind: 'rappel', state: past('18:30') ? 'done' : 'next', icon: '🍝', title: `Demain : ${esc(Forme.titre(hardTomorrow))}`, side: '', body: '<p class="muted small" style="margin:0">Prévois des féculents ce soir (pâtes, riz, pommes de terre) pour avoir du carburant, et bois bien.</p>' });
  const renfo = F.seances.find((s) => s.date === iso && s.statut === 'fait' && s.type === 'renfo');
  if (renfo) items.push({ t: '19:30', kind: 'rappel', state: 'next', icon: '🥚', title: 'Récupération musculaire', side: '', body: '<p class="muted small" style="margin:0">Après ton renfo : une source de protéines au prochain repas (œufs, poisson, légumineuses, laitages).</p>' });
  return items;
}
// Bouton d'une séance Forme dans le fil du jour.
function formeTodayActions(a) {
  const id = String(a.ref || '').replace(/^forme:/, '');
  return a.statut === 'prevu' ? `<button class="btn small primary" data-act="forme-go" data-id="${id}">${ICON.play} Check-in & lancer</button><button class="btn small" data-act="forme-go" data-id="${id}" data-log="1">Saisir</button>` : '';
}

// ---------------------------------------------------------------------------
// Actions et formulaires
// ---------------------------------------------------------------------------
const FORME_ACTIONS = {
  'forme-view': (b) => { state.forme.view = b.dataset.v; store.set('forme:view', b.dataset.v); render(); },
  'forme-reload': async () => { state.forme.ok = null; await Forme.load(true); render(); },
  'forme-week': (b) => { state.forme.week = addDays(state.forme.week, 7 * Number(b.dataset.d)); state.forme.editDispos = false; render(); },
  'forme-dispos': () => { state.forme.editDispos = true; render(); },
  'forme-dispos-cancel': () => { state.forme.editDispos = false; render(); },
  'forme-q-back': () => { state.forme.q.step = Math.max(0, state.forme.q.step - 1); render(); },
  'forme-q-redo': () => { state.forme.q = { step: 0, data: {} }; state.forme.profil = { ...state.forme.profil, questionnaire_fait_le: null }; render(); },
  'forme-add': () => fAddSheet(),
  'forme-log': (b) => fLogSheet(b.dataset.id),
  'forme-menu': (b) => fMenuSheet(b.dataset.id),
  'forme-start': (b) => fCheckinSheet(b.dataset.id),
  'forme-machine': async (b) => { const s = state.forme.seances.find((x) => x.id === b.dataset.id); try { await fToMachine(s); render(); } catch (e) { fail(e); } },
  'forme-go': async (b) => {
    while (sheets.length) closeSheet();
    if (state.forme.ok === null) await Forme.load();
    state.forme.view = 'semaine';
    state.forme.week = mondayOf(new Date());
    switchTab('forme');
    if (state.forme.seances.some((s) => s.id === b.dataset.id)) { if (b.dataset.log) fLogSheet(b.dataset.id); else fCheckinSheet(b.dataset.id); }
  },
  'forme-exo': (b) => fExoSheet(b.dataset.exo),
  'forme-swap': (b) => { const F = state.forme; F.draft = { ...formeSwap(F.draft, Number(b.dataset.b), Number(b.dataset.i), Forme.genParams(F.gen || {}), Date.now()), type: F.draft.type }; render(); },
  'forme-var': (b) => { const F = state.forme; const before = JSON.stringify(F.draft); F.draft = { ...formeSwap(F.draft, Number(b.dataset.b), Number(b.dataset.i), Forme.genParams(F.gen || {}), Date.now(), b.dataset.v), type: F.draft.type }; if (JSON.stringify(F.draft) === before) toast('Pas de variante disponible avec ce matériel'); render(); },
  'forme-regen': () => { const F = state.forme; F.genSeed = Date.now(); F.draft = { ...genSeance(Forme.genParams(F.gen || {}), F.genSeed), type: F.draft?.type || 'renfo' }; render(); },
  'forme-play': () => { if (state.forme.draft) fPlayer(state.forme.draft); },
  'forme-draft-close': () => { state.forme.draft = null; state.forme.draftFor = null; render(); },
  'forme-mens': () => fMensSheet(),
  'forme-lieu': (b) => fLieuSheet(b.dataset.id),
  'forme-perso': (b) => fPersoSheet(b.dataset.id),
  'forme-biblio': () => fBiblioSheet(),
  'forme-objectif': () => fObjectifSheet(),
  'forme-objectif-del': async (b) => { try { await Forme.del('objectifs', b.dataset.id); render(); } catch (e) { fail(e); } },
  'forme-geo': () => {
    if (!navigator.geolocation) { toast('Position indisponible : saisis ta ville'); return; }
    navigator.geolocation.getCurrentPosition(async (p) => { try { await Forme.savePrefs({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100, ville: null }); state.forme.meteo = null; toast('Position enregistrée'); render(); } catch (e) { fail(e); } }, () => toast('Position refusée : saisis ta ville'), { timeout: 10000 });
  },
  'forme-reset': async () => {
    if (!(await confirmSheet('Effacer toutes tes données Forme (profil, séances, lieux, mensurations) ?', 'Tout effacer'))) return;
    const m = Forme.member();
    try {
      for (const t of Object.values(Forme.TABLES)) { const { error } = await db.from(t).delete().eq('member_id', m.id); if (error) throw error; }
      await db.from(T.activites).delete().eq('member_id', m.id).eq('source', 'forme');
      state.activites = state.activites.filter((a) => a.source !== 'forme');
      store.set(Forme.cacheKey(), null);
      state.forme = { ...Forme.blank(), view: 'semaine' };
      toast('Module réinitialisé');
      render();
    } catch (e) { fail(e); }
  },
};
async function formeOnSubmit(e) {
  const f = e.target;
  const k = f.dataset?.form;
  if (!k?.startsWith('forme-')) return;
  e.preventDefault();
  const F = state.forme;
  try {
    if (k === 'forme-q') return await fSubmitQ(f);
    if (k === 'forme-dispos') return await fSubmitDispos(f);
    if (k === 'forme-gen') {
      const fd = new FormData(f);
      F.gen = { lieu: f.lieu.value, duree: Number(f.duree.value) || 30, format: fd.get('format') || 'circuit', zones: fd.getAll('zones'), intensite: fd.get('intensite') || 'moyen' };
      if (f.lieu.value !== Forme.prefs().lieu) Forme.savePrefs({ lieu: f.lieu.value }).catch(() => {});
      F.genSeed = Date.now();
      F.draft = { ...genSeance(Forme.genParams(F.gen), F.genSeed), type: F.gen.format === 'mobilite' ? 'mobilite' : 'renfo' };
      F.draftFor = null;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (k === 'forme-gen-course') { F.draft = genCourse(f.sous.value, Number(f.duree.value) || 40, { terrain: F.profil?.terrain }); F.draftFor = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (k === 'forme-reperes') {
      const n = (x) => (f[x].value === '' ? null : Number(String(f[x].value).replace(',', '.')));
      const modes = new FormData(f).getAll('modes');
      await Forme.put('profil', { ...F.profil, fc_repos: n('fc_repos'), fc_max: n('fc_max'), fc_ef_min: n('fc_ef_min'), fc_ef_max: n('fc_ef_max'), fc_seuil_min: n('fc_seuil_min'), fc_seuil_max: n('fc_seuil_max'), vma_kmh: n('vma_kmh'), modes_intensite: modes.length ? modes : ['rpe'] });
      toast('Repères enregistrés');
      return render();
    }
    if (k === 'forme-prefs') {
      const fd = new FormData(f);
      await Forme.put('profil', { ...F.profil, regle_budget: { perte: Number(f.b_perte.value), maintien: Number(f.b_maintien.value), prise: Number(f.b_prise.value) },
        prefs: { ...(F.profil.prefs || {}), bips: f.bips.checked, vibration: f.vibration.checked, wakelock: f.wakelock.checked, budget: f.budget.checked, renfo: Number(f.renfo.value), ambiance: fd.get('ambiance') || FORME_AMB_DEFAULT } });
      store.set('forme:amb', fd.get('ambiance'));
      toast('Réglages enregistrés');
      return render();
    }
    if (k === 'forme-ville') {
      const v = f.ville.value.trim();
      if (!v) return;
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(v)}&count=1&language=fr&format=json`).then((x) => x.json());
      const g = r.results?.[0];
      if (!g) { toast('Ville introuvable'); return; }
      await Forme.savePrefs({ lat: Math.round(g.latitude * 100) / 100, lon: Math.round(g.longitude * 100) / 100, ville: `${g.name}${g.admin1 ? `, ${g.admin1}` : ''}` });
      F.meteo = null;
      toast(`Météo : ${g.name}`);
      return render();
    }
  } catch (err) { fail(err); }
}

// Branché par le script principal, une fois ACTIONS, T et state définis.
Forme.install = function install() {
  state.forme = this.blank();
  Object.assign(T, { forme_seances: 'forme_seances' });
  Object.assign(ACTIONS, FORME_ACTIONS);
  document.addEventListener('submit', formeOnSubmit);
};
