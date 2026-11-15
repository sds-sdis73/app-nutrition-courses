// ---------------------------------------------------------------------------
// Registre des modules, navigation à 5 onglets et points d'extension partagés
// (fil de l'Accueil, bouton « + » d'ajout rapide, agenda). Mode d'emploi : src/js/modules/LISEZMOI.md.
// ---------------------------------------------------------------------------
const ONGLETS = [
  { id: 'accueil', libelle: 'Accueil', icone: I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>') },
  { id: 'famille', libelle: 'Famille', icone: I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>') },
  { id: 'cuisine', libelle: 'Cuisine', icone: I('<path d="M6 13.9A4 4 0 0 1 7.5 6a5 5 0 0 1 9 0A4 4 0 0 1 18 13.9V21H6z"/><path d="M6 17h12"/>') },
  { id: 'forme', libelle: 'Forme', icone: I('<path d="m3 20 6.5-11 4 6.5L16 12l5 8z"/><path d="m8 11.5 1.5 1.5 1.6-1.6"/><circle cx="17.5" cy="5" r="1.8"/>') },
  { id: 'plus', libelle: 'Plus', icone: I('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>') },
];
const CHAMPS_MODULE = ['id', 'onglet', 'segment', 'ordre', 'libelle', 'icone', 'description', 'rendu', 'ouvrir', 'actions', 'charger', 'tables', 'expose',
  'sourcesAccueil', 'ajoutRapide', 'agenda', 'notifications', 'masquable', 'visible'];

const Modules = {
  liste: [],
  par: {},
  // Enregistre un module (ou un écran du cœur). Renvoie la définition normalisée.
  register(def) {
    if (!def || !/^[a-z][a-z0-9-]*$/.test(def.id || '')) throw new Error(`module : identifiant invalide « ${def?.id} »`);
    if (this.par[def.id]) throw new Error(`module « ${def.id} » enregistré deux fois`);
    if (!ONGLETS.some((o) => o.id === def.onglet)) throw new Error(`module « ${def.id} » : onglet inconnu « ${def.onglet} »`);
    const inconnus = Object.keys(def).filter((k) => !CHAMPS_MODULE.includes(k));
    if (inconnus.length) throw new Error(`module « ${def.id} » : champ(s) inconnu(s) ${inconnus.join(', ')}`);
    const m = { ordre: 100, libelle: def.segment || def.id, ...def };
    for (const [nom, fn] of Object.entries(m.actions || {})) {
      if (ACTIONS[nom] && ACTIONS[nom] !== fn) throw new Error(`module « ${m.id} » : action « ${nom} » déjà définie`);
      ACTIONS[nom] = fn;
    }
    for (const [cle, table] of Object.entries(m.tables || {})) {
      if (T[cle] && T[cle] !== table) throw new Error(`module « ${m.id} » : table « ${cle} » déjà définie`);
      T[cle] = table;
    }
    if (m.sourcesAccueil) Accueil.sources.push({ module: m.id, fn: m.sourcesAccueil });
    if (m.agenda) Agenda.sources.push({ module: m.id, fn: m.agenda });
    for (const a of [].concat(m.ajoutRapide || [])) AjoutRapide.ajouter({ module: m.id, ...a });
    this.liste.push(m);
    this.par[m.id] = m;
    return m;
  },
  get(id) { return this.par[id] || null; },
  masques() { return store.get('masques', []); },
  masquer(id, oui) { const s = new Set(this.masques()); if (oui) s.add(id); else s.delete(id); store.set('masques', [...s]); },
  visible(m) { if (!m) return false; if (m.masquable && this.masques().includes(m.id)) return false; try { return m.visible ? !!m.visible() : true; } catch { return false; } },
  // Écrans d'un onglet, dans l'ordre (ceux qui ont un libellé de segment).
  vues(onglet) { return this.liste.filter((m) => m.onglet === onglet && m.segment && this.visible(m)).sort((a, b) => a.ordre - b.ordre); },
  titre(m) { return typeof m.libelle === 'function' ? m.libelle() : m.libelle; },
  // Chargement des données de chaque module (démarrage, retour en ligne) ; une erreur n'empêche pas les autres.
  async charger(force = true, ctx = {}) {
    const res = await Promise.allSettled(this.liste.filter((m) => m.charger).map((m) => Promise.resolve().then(() => m.charger(force, ctx))));
    res.forEach((r, i) => { if (r.status === 'rejected') console.warn('chargement du module', this.liste.filter((m) => m.charger)[i].id, r.reason); });
  },
  // Fonctions pures exposées par chaque module (tests unitaires : app.modules.<id>).
  exposes() { return Object.fromEntries(this.liste.filter((m) => m.expose).map((m) => [m.id, m.expose])); },
  // Types de notifications déclarés par les modules (pour l'écran Notifications).
  notifications() { return this.liste.flatMap((m) => (m.notifications || []).map((n) => ({ module: m.id, defaut: true, ...n }))); },
  // Petit cache local par module et par foyer (lecture hors ligne).
  cache(id) {
    const k = (cle) => `cache:${foyer() || 'x'}:mod:${id}:${cle}`;
    return { get: (cle, def = null) => store.get(k(cle), def), set: (cle, v) => store.set(k(cle), v) };
  },
  // Écran d'attente d'un module pas encore construit.
  bientot(titre, texte = '', extra = '') {
    return `<section class="bientot card"><div class="bientot-ico">${ICON.sparkle}</div><h2>${esc(titre)}</h2><p><b>Bientôt ici.</b></p>${texte ? `<p class="muted">${esc(texte)}</p>` : ''}${extra}</section>`;
  },
};

// Écriture tolérante au hors-ligne pour les tables des modules : en cas de coupure réseau,
// l'opération part dans la file d'attente et sera rejouée au retour du réseau.
const Sync = {
  connue(table) { return Object.values(T).includes(table); },
  async upsert(table, row, { onConflict = 'id' } = {}) {
    if (!this.connue(table)) throw new Error(`table « ${table} » non déclarée (champ tables du module)`);
    const ligne = { ...own(), ...row, id: row.id || uid() };
    try {
      const { data, error } = await db.from(table).upsert(ligne, { onConflict }).select().single();
      if (error) throw error;
      return data;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      Queue.push({ type: 'upsert', table, row: ligne, onConflict });
      return ligne;
    }
  },
  async supprimer(table, id) {
    if (!this.connue(table)) throw new Error(`table « ${table} » non déclarée (champ tables du module)`);
    try {
      const { error } = await db.from(table).delete().eq('id', id);
      if (error) throw error;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      Queue.push({ type: 'delete', table, id });
    }
  },
};

// (a) Fil de l'Accueil : chaque module fournit les éléments du jour.
// Source : (ctx) => [{ heure: 'HH:MM' | null, titre, detail?, icone?, act?, data?: {clé: valeur}, priorite?: 0-3 }]
// ctx = { date: Date, iso: 'AAAA-MM-JJ', membre: membre courant, famille: vrai pour le fil de la famille }
const Accueil = {
  sources: [],
  async elements(ctx = {}) {
    const date = ctx.date || new Date();
    const c = { date, iso: isoDate(date), membre: null, famille: false, ...ctx };
    const lots = await Promise.all(this.sources.map(async (s) => {
      try { return (await s.fn(c) || []).map((e) => ({ ...e, module: s.module })); } catch (e) { console.warn('fil de l\'Accueil', s.module, e); return []; }
    }));
    return lots.flat().sort((a, b) => (a.heure || '99:99').localeCompare(b.heure || '99:99') || (b.priorite || 0) - (a.priorite || 0));
  },
};

// (c) Agenda : éléments datés que les modules veulent montrer dans l'agenda familial.
// Source : (debut: Date, fin: Date) => [{ id, date: 'AAAA-MM-JJ', heure?, heureFin?, titre, detail?, membres?: [member_id], couleur?, act?, data? }]
const Agenda = {
  sources: [],
  async elements(debut, fin) {
    const lots = await Promise.all(this.sources.map(async (s) => {
      try { return (await s.fn(debut, fin) || []).map((e) => ({ ...e, source: s.module })); } catch (e) { console.warn('agenda', s.module, e); return []; }
    }));
    const a = isoDate(debut), b = isoDate(fin);
    return lots.flat().filter((e) => e.date >= a && e.date <= b)
      .sort((x, y) => x.date.localeCompare(y.date) || (x.heure || '').localeCompare(y.heure || ''));
  },
};

// (b) Bouton « + » : une phrase libre, analysée dans le téléphone par les analyseurs des modules.
// Analyseur : { type, libelle?, analyser(texte, ctx) => { score 0-1, resume, donnees } | null,
//               enregistrer?(donnees, ctx) => Promise<message | void>, ouvrir(texte, ctx) }
const AjoutRapide = {
  TYPES: [['evenement', 'Événement'], ['tache', 'Tâche'], ['article', 'Article'], ['repas', 'Repas'], ['seance', 'Séance']],
  analyseurs: [],
  ajouter(a) {
    if (!this.TYPES.some(([t]) => t === a.type)) throw new Error(`ajout rapide : type inconnu « ${a.type} »`);
    if (typeof a.ouvrir !== 'function') throw new Error(`ajout rapide « ${a.type} » : ouvrir(texte) est obligatoire`);
    this.analyseurs.push(a);
  },
  ctx() { return { maintenant: new Date(), membre: typeof journalMember === 'function' ? journalMember() : null, membres: state.members }; },
  // Propositions triées (meilleur score d'abord), sans doublon de type.
  analyser(texte, ctx = this.ctx()) {
    const t = String(texte || '').trim();
    if (!t) return [];
    const out = [];
    for (const a of this.analyseurs) {
      if (typeof a.analyser !== 'function') continue;
      try { const r = a.analyser(t, ctx); if (r && r.score > 0) out.push({ ...r, analyseur: a, type: a.type }); } catch (e) { console.warn('ajout rapide', a.type, e); }
    }
    out.sort((x, y) => y.score - x.score);
    return out.filter((p, i) => out.findIndex((q) => q.type === p.type) === i);
  },
  // Analyseur d'un type pour le bouton de type : celui d'un module passe devant celui du cœur (enregistré plus tard).
  pour(type) { for (let i = this.analyseurs.length - 1; i >= 0; i--) if (this.analyseurs[i].type === type) return this.analyseurs[i]; return null; },
  async choisir(p, texte) {
    const ctx = this.ctx();
    if (p.analyseur.enregistrer) {
      const msg = await p.analyseur.enregistrer(p.donnees, ctx);
      toast(msg || 'Ajouté');
      render();
    } else p.analyseur.ouvrir(texte, ctx);
  },
  ouvrir(texte = '') {
    const types = this.TYPES.map(([t, l]) => `<button type="button" class="btn small" data-x="type" data-t="${t}" ${this.pour(t) ? '' : 'disabled title="Bientôt ici"'}>${esc(this.pour(t)?.libelle || l)}</button>`).join('');
    const el = openSheet(`${sheetHead('Ajouter')}
      <form data-form="ajout-rapide" class="stack">
        <textarea class="input" name="txt" rows="2" maxlength="300" placeholder="« judo Zoé mercredi 14 h », « lait, œufs », « 30 min de course »…" aria-label="Phrase libre">${esc(texte)}</textarea>
        <div data-props class="stack"></div>
        <div class="muted small">Ou choisis ce que tu ajoutes :</div>
        <div class="ajout-types">${types}</div>
      </form>`);
    const champ = $('[name="txt"]', el);
    let props = [];
    const dessiner = () => {
      props = this.analyser(champ.value);
      $('[data-props]', el).innerHTML = props.slice(0, 3).map((p, i) => `<button type="button" class="btn block ajout-prop" data-x="prop" data-i="${i}">
        <span class="grow"><b>${esc(p.analyseur.libelle || this.TYPES.find(([t]) => t === p.type)[1])}</b> · ${esc(p.resume || '')}</span>${ICON.next}</button>`).join('');
    };
    champ.addEventListener('input', dessiner);
    $('form', el).addEventListener('submit', (e) => { e.preventDefault(); if (props[0]) { closeSheet(); this.choisir(props[0], champ.value).catch(fail); } });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      const txt = champ.value.trim();
      if (b.dataset.x === 'prop') { closeSheet(); this.choisir(props[Number(b.dataset.i)], txt).catch(fail); }
      if (b.dataset.x === 'type') { const a = this.pour(b.dataset.t); if (a) { closeSheet(); a.ouvrir(txt, this.ctx()); } }
    });
    dessiner();
    setTimeout(() => champ.focus(), 50);
    return el;
  },
};

// Analyse d'une phrase libre en français : date, heure, membres cités, texte restant. Fonction pure.
// analysePhrase('judo Zoé mercredi 14 h', { maintenant, membres }) → { date: 'AAAA-MM-JJ', heure: '14:00', membres: [id], texte: 'judo' }
const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function analysePhrase(texte, { maintenant = new Date(), membres = [] } = {}) {
  let t = ` ${String(texte || '').replace(/\s+/g, ' ').trim()} `;
  // Texte aplati caractère par caractère : même longueur, les positions restent valables dans t.
  const aplatir = (s) => s.split('').map((c) => c.toLowerCase().normalize('NFD')[0] || c).join('');
  const n = () => aplatir(t);
  const retirer = (re) => { const m = n().match(re); if (!m) return null; t = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`; return m; };
  const jour0 = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  let date = null;
  let heure = null;
  let m;
  if ((m = retirer(/ apres[- ]demain /))) date = addDays(jour0, 2);
  else if ((m = retirer(/ demain /))) date = addDays(jour0, 1);
  else if ((m = retirer(/ (aujourd['’ ]?hui|ce soir|ce midi|ce matin) /))) {
    date = jour0;
    if (/soir/.test(m[1])) heure = '19:00';
    else if (/midi/.test(m[1])) heure = '12:00';
    else if (/matin/.test(m[1])) heure = '09:00';
  } else if ((m = retirer(/ (?:le )?(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))? /))) {
    const an = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : jour0.getFullYear();
    date = new Date(an, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && date < jour0) date.setFullYear(an + 1);
  } else if ((m = retirer(new RegExp(` (?:le )?(1er|\\d{1,2}) (${MOIS_FR.join('|')})(?: (\\d{4}))? `)))) {
    const an = m[3] ? Number(m[3]) : jour0.getFullYear();
    date = new Date(an, MOIS_FR.indexOf(m[2]), m[1] === '1er' ? 1 : Number(m[1]));
    if (!m[3] && date < jour0) date.setFullYear(an + 1);
  } else if ((m = retirer(new RegExp(` (?:ce |le )?(${JOURS_FR.join('|')})( prochain)? `)))) {
    let d = (JOURS_FR.indexOf(m[1]) - jour0.getDay() + 7) % 7;
    if (m[2] && d === 0) d = 7;
    date = addDays(jour0, d);
  }
  if ((m = retirer(/ (?:a |vers )?(\d{1,2}) ?(?:h|:) ?(\d{2})? /))) {
    const h = Number(m[1]), mi = Number(m[2] || 0);
    if (h < 24 && mi < 60) heure = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  } else if ((m = retirer(/ a midi /))) heure = '12:00';
  const ids = [];
  for (const mb of membres) {
    const nom = sansAccents(mb.nom).trim();
    if (!nom) continue;
    const re = new RegExp(` (?:pour |avec )?${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `);
    if (re.test(n())) { ids.push(mb.id); retirer(re); }
  }
  return { date: date ? isoDate(date) : null, heure, membres: ids, texte: t.replace(/\s+/g, ' ').trim() };
}

// Construction de la barre d'onglets, des segments et du menu « Plus ».
const Nav = {
  construire() {
    const nav = $('.tabbar');
    if (!nav) return;
    nav.innerHTML = ONGLETS.map((o) => `<button data-act="tab" data-tab="${o.id}" aria-label="${o.libelle}">${o.icone}<span>${o.libelle}</span></button>`).join('');
  },
  onglet(vue) { return Modules.get(vue)?.onglet || null; },
  // Résout une cible (onglet ou écran) vers l'écran à afficher.
  resoudre(cible) {
    if (Modules.get(cible) && Modules.visible(Modules.get(cible))) return cible;
    if (cible === 'plus') return 'plus';
    if (ONGLETS.some((o) => o.id === cible)) {
      const vues = Modules.vues(cible);
      const der = store.get(`vue:${cible}`, null);
      return vues.some((v) => v.id === der) ? der : vues[0]?.id || 'aujourdhui';
    }
    return 'aujourdhui';
  },
  marquer(onglet) { $$('.tabbar button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === onglet ? 'page' : 'false')); },
  // Barre de segments de l'onglet courant (ou retour vers « Plus »).
  segments(m) {
    if (m.onglet === 'plus') return m.id === 'plus' ? '' : `<button class="btn small plus-retour" data-act="tab" data-tab="plus">${ICON.back} Plus</button>`;
    const vues = Modules.vues(m.onglet);
    if (vues.length < 2) return '';
    const o = ONGLETS.find((x) => x.id === m.onglet);
    return `<nav class="segbar" aria-label="Sections ${esc(o.libelle)}">${vues.map((v) => `<button data-act="tab" data-tab="${v.id}" aria-pressed="${v.id === m.id}">${esc(v.segment)}</button>`).join('')}</nav>`;
  },
  // Après chaque rendu : la barre de segments (reconstruite, donc revenue au début) est ramenée sur le segment actif,
  // sans faire défiler la page ; un fondu sur le bord indique qu'elle défile.
  centrerSegment(racine = document) {
    const bar = racine?.querySelector?.('.segbar');
    if (!bar) return;
    const b = bar.querySelector('[aria-pressed="true"]');
    if (b) {
      const rb = b.getBoundingClientRect(), rr = bar.getBoundingClientRect();
      bar.scrollLeft = Math.max(0, bar.scrollLeft + (rb.left + rb.width / 2) - (rr.left + rr.width / 2));
    }
    const bords = () => {
      const max = bar.scrollWidth - bar.clientWidth;
      bar.classList.toggle('fondu-gauche', max > 1 && bar.scrollLeft > 1);
      bar.classList.toggle('fondu-droite', max > 1 && bar.scrollLeft < max - 1);
    };
    bords();
    bar.addEventListener('scroll', bords, { passive: true });
  },
  menuPlus() {
    const lignes = Modules.vues('plus').map((v) => `<button class="plus-ligne" data-act="plus-ouvrir" data-id="${v.id}">
      <span class="plus-ico">${v.icone || ICON.next}</span><span class="grow"><b>${esc(v.segment)}</b>${v.description ? `<br><span class="muted small">${esc(v.description)}</span>` : ''}</span>${ICON.next}</button>`).join('');
    const masquables = Modules.liste.filter((m) => m.masquable);
    const affichage = masquables.length ? `<h3 class="plus-titre">Affichage</h3><div class="card plus-liste">${masquables.map((m) => `<label class="check plus-check"><input type="checkbox" data-afficher="${m.id}" ${Modules.masques().includes(m.id) ? '' : 'checked'}> Afficher « ${esc(m.segment)} » dans ${esc(ONGLETS.find((o) => o.id === m.onglet).libelle)}</label>`).join('')}</div>` : '';
    return `<div class="card plus-liste">${lignes}</div>${affichage}`;
  },
};
