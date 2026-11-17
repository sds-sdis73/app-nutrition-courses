// ---------------------------------------------------------------------------
// Accès aux données (Supabase)
// ---------------------------------------------------------------------------
// Tables réservées à l'utilisateur connecté (la sécurité RLS filtre par user_id).
const T = {
  settings: 'reglages',
  recipes: 'recettes',
  plan: 'planning_repas',
  scans: 'historique_scans',
  links: 'liens_produits',
  checks: 'courses_coches',
  extras: 'courses_ajouts',
  members: 'foyer_membres',
  journal: 'journal',
  placards: 'placards',
  restes: 'restes',
  favoris: 'aliments_favoris',
  perso: 'produits_perso',
  activites: 'activites',
  eau: 'hydratation',
  compagnons: 'compagnons',
  bilans: 'bilans',
  pesees: 'pesees',
  resume: 'resume_jour',
};
const PHOTO_BUCKET = 'photos-recettes';
const me = () => state.user?.id;
const foyer = () => state.foyer?.id;
// Colonnes d'appartenance posées sur chaque ligne créée.
const own = () => ({ user_id: me(), foyer_id: foyer() });

const Data = {
  async loadAll() {
    const [s, r, l, sc, mb, pl, rs, fv, pp, cp] = await Promise.all([
      db.from(T.settings).select('*').eq('foyer_id', foyer()).maybeSingle(),
      db.from(T.recipes).select('*').eq('foyer_id', foyer()).order('updated_at', { ascending: false }),
      db.from(T.links).select('*').eq('foyer_id', foyer()),
      db.from(T.scans).select('*').eq('foyer_id', foyer()).order('scanned_at', { ascending: false }).limit(150),
      db.from(T.members).select('*').eq('foyer_id', foyer()).order('ordre').order('created_at'),
      db.from(T.placards).select('*').eq('foyer_id', foyer()).order('name'),
      db.from(T.restes).select('*').eq('foyer_id', foyer()).order('dlc'),
      db.from(T.favoris).select('*').eq('foyer_id', foyer()).order('created_at'),
      db.from(T.perso).select('*').eq('foyer_id', foyer()).order('name'),
      db.from(T.compagnons).select('*').eq('foyer_id', foyer()),
    ]);
    for (const res of [s, r, l, sc, mb, pl, rs, fv, pp, cp]) if (res.error) throw res.error;
    state.favoris = fv.data;
    state.perso = pp.data;
    state.compagnons = cp.data;
    state.members = mb.data;
    state.placards = pl.data;
    state.restes = rs.data;
    if (!state.placards.some((x) => x.type === 'basique')) await Data.seedBasiques().catch((e) => console.warn(e));
    if (s.data) state.settings = s.data;
    else {
      // Nouveau foyer : aucun magasin choisi (l'appli le demande à la première connexion).
      const ins = await db.from(T.settings).insert({ ...own(), store_name: '', store_slug: '' }).select().single();
      if (ins.error) throw ins.error;
      state.settings = ins.data;
    }
    state.recipes = r.data;
    state.links = Object.fromEntries(l.data.map((x) => [x.ingredient, x]));
    state.scans = sc.data;
    await Data.loadPesees().catch(() => { state.peseesOk = false; });
  },
  async loadWeek() {
    const week = isoDate(state.week);
    const [p, c, x, j, ac, bl, eu] = await Promise.all([
      db.from(T.plan).select('*').eq('foyer_id', foyer()).eq('week', week),
      db.from(T.checks).select('*').eq('foyer_id', foyer()).eq('week', week),
      db.from(T.extras).select('*').eq('foyer_id', foyer()).eq('week', week).order('created_at'),
      db.from(T.journal).select('*').eq('foyer_id', foyer()).gte('date', week).lte('date', isoDate(addDays(state.week, 6))).order('created_at'),
      db.from(T.activites).select('*').eq('foyer_id', foyer()).gte('date', isoDate(addDays(state.week, -7))).lte('date', isoDate(addDays(state.week, 6))).order('date'),
      db.from(T.bilans).select('*').eq('foyer_id', foyer()).gte('date', isoDate(addDays(state.week, -7))).lte('date', isoDate(addDays(state.week, 6))),
      db.from(T.eau).select('*').eq('foyer_id', foyer()).gte('date', isoDate(addDays(state.week, -7))).lte('date', isoDate(addDays(state.week, 6))).order('heure'),
    ]);
    for (const res of [p, c, x, j, ac, bl, eu]) if (res.error) throw res.error;
    state.eau = eu.data;
    state.activites = ac.data;
    state.bilans = bl.data;
    state.plan = p.data;
    state.checks = Object.fromEntries(c.data.map((r) => [r.item, r.checked]));
    state.extras = x.data;
    state.journal = j.data;
    if (state.loaded) Offline.saveWeek();
  },
  async saveMember(m) {
    const { data, error } = await db.from(T.members).upsert({ ...m, ...own() }).select().single();
    if (error) throw error;
    const i = state.members.findIndex((x) => x.id === data.id);
    if (i >= 0) state.members[i] = data; else state.members.push(data);
    return data;
  },
  async deleteMember(id) {
    const { error } = await db.from(T.members).delete().eq('id', id);
    if (error) throw error;
    state.members = state.members.filter((x) => x.id !== id);
    state.journal = state.journal.filter((x) => x.member_id !== id);
  },
  async addJournal(entry) {
    const row = { ...entry, ...own() };
    try {
      const { data, error } = await db.from(T.journal).insert(row).select().single();
      if (error) throw error;
      state.journal.push(data);
      Rewards.journal(data);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      const lid = `local:${uid()}`;
      Queue.push({ type: 'journal', row, lid });
      state.journal.push({ ...row, id: lid });
      state.offline = true;
      toast('Hors ligne : saisie enregistrée, elle sera synchronisée');
    }
    Offline.saveWeek();
  },
  async deleteJournal(id) {
    if (String(id).startsWith('local:')) { Queue.remove(id); state.journal = state.journal.filter((x) => x.id !== id); Offline.saveWeek(); return; }
    const { error } = await db.from(T.journal).delete().eq('id', id);
    if (error) throw error;
    state.journal = state.journal.filter((x) => x.id !== id);
  },
  async addExtra(name, qty, aisle) {
    const { data, error } = await db.from(T.extras).insert({ ...own(), week: isoDate(state.week), name, qty: qty || null, aisle }).select().single();
    if (error) throw error;
    state.extras.push(data);
  },
  async setExtraChecked(id, checked) {
    const { error } = await db.from(T.extras).update({ checked }).eq('id', id);
    if (error) throw error;
    const e = state.extras.find((x) => x.id === id);
    if (e) e.checked = checked;
  },
  async deleteExtra(id) {
    const { error } = await db.from(T.extras).delete().eq('id', id);
    if (error) throw error;
    state.extras = state.extras.filter((x) => x.id !== id);
  },
  async saveRecipe(r) {
    const row = { ...r, ...own(), updated_at: new Date().toISOString() };
    const { data, error } = await db.from(T.recipes).upsert(row).select().single();
    if (error) throw error;
    const i = state.recipes.findIndex((x) => x.id === data.id);
    if (i >= 0) state.recipes.splice(i, 1);
    state.recipes.unshift(data);
    return data;
  },
  async deleteRecipe(id) {
    const { error } = await db.from(T.recipes).delete().eq('id', id);
    if (error) throw error;
    state.recipes = state.recipes.filter((r) => r.id !== id);
    state.plan = state.plan.filter((m) => m.recipe_id !== id);
  },
  async setMeal(day, slot, recipe_id, servings, extra = {}) {
    const row = { ...own(), week: isoDate(state.week), day, slot, recipe_id, servings, eaters: extra.eaters ?? null, guests: extra.guests ?? 0, reste_id: extra.reste_id ?? null };
    const { data, error } = await db.from(T.plan).upsert(row, { onConflict: 'foyer_id,week,day,slot' }).select().single();
    if (error) throw error;
    state.plan = state.plan.filter((m) => !(m.day === day && m.slot === slot));
    state.plan.push(data);
  },
  async updateMeal(id, patch) {
    const { data, error } = await db.from(T.plan).update(patch).eq('id', id).select().single();
    if (error) throw error;
    const i = state.plan.findIndex((m) => m.id === id);
    if (i >= 0) state.plan[i] = data; else state.plan.push(data);
  },
  async removeMeals(ids, { keepRestes = false } = {}) {
    if (!ids.length) return;
    const back = keepRestes ? [] : state.plan.filter((m) => ids.includes(m.id) && m.reste_id).map((m) => ({ reste_id: m.reste_id, portions: mealServings(m) }));
    const { error } = await db.from(T.plan).delete().in('id', ids);
    if (error) throw error;
    state.plan = state.plan.filter((m) => !ids.includes(m.id));
    // Un reste retiré du planning redevient disponible.
    for (const b of back) {
      const r = state.restes.find((x) => x.id === b.reste_id);
      if (r) await Data.updateReste(r.id, { portions: Math.round((Number(r.portions) + b.portions) * 100) / 100 }).catch(() => {});
    }
  },
  async saveCompagnon(row) {
    const { created_at, ...r } = row;
    const { data, error } = await db.from(T.compagnons).upsert({ ...r, ...own() }, { onConflict: 'member_id' }).select().single();
    if (error) throw error;
    const i = state.compagnons.findIndex((x) => x.member_id === data.member_id);
    if (i >= 0) state.compagnons[i] = data; else state.compagnons.push(data);
    return data;
  },
  async saveBilan(row) {
    const { data, error } = await db.from(T.bilans).upsert({ ...own(), ...row }, { onConflict: 'member_id,date' }).select().single();
    if (error) throw error;
    state.bilans = [...state.bilans.filter((b) => !(b.member_id === data.member_id && b.date === data.date)), data];
  },
  async addActivite(row) {
    const { data, error } = await db.from(T.activites).upsert({ ...own(), ...row }, { onConflict: 'member_id,date,source,ref' }).select().single();
    if (error) throw error;
    state.activites = [...state.activites.filter((a) => a.id !== data.id), data];
    Rewards.sport(data);
    return data;
  },
  async updateActivite(id, patch) {
    const { data, error } = await db.from(T.activites).update(patch).eq('id', id).select().single();
    if (error) throw error;
    state.activites = state.activites.map((a) => (a.id === id ? data : a));
    Rewards.sport(data);
  },
  async addEau(row) {
    const { data, error } = await db.from(T.eau).insert({ ...own(), ...row }).select().single();
    if (error) throw error;
    state.eau.push(data);
    Rewards.eau(data);
  },
  async deleteEau(id) {
    const { error } = await db.from(T.eau).delete().eq('id', id);
    if (error) throw error;
    state.eau = state.eau.filter((x) => x.id !== id);
  },
  async deleteActivite(id) {
    const { error } = await db.from(T.activites).delete().eq('id', id);
    if (error) throw error;
    state.activites = state.activites.filter((a) => a.id !== id);
  },
  async addFavori(row) {
    const { data, error } = await db.from(T.favoris).insert({ ...own(), ...row }).select().single();
    if (error) throw error;
    state.favoris.push(data);
    return data;
  },
  async deleteFavori(id) {
    const { error } = await db.from(T.favoris).delete().eq('id', id);
    if (error) throw error;
    state.favoris = state.favoris.filter((x) => x.id !== id);
  },
  async savePerso(row) {
    const { data, error } = await db.from(T.perso).upsert({ ...row, ...own(), updated_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    const i = state.perso.findIndex((x) => x.id === data.id);
    if (i >= 0) state.perso[i] = data; else state.perso.push(data);
    return data;
  },
  async deletePerso(id) {
    const { error } = await db.from(T.perso).delete().eq('id', id);
    if (error) throw error;
    state.perso = state.perso.filter((x) => x.id !== id);
  },
  // Entrées de journal récentes d'un membre (toutes semaines), pour la saisie rapide.
  async recentJournal(memberId, limit = 120) {
    const { data, error } = await db.from(T.journal).select('label,source,ref,grams,portions,n,slot,date').eq('foyer_id', foyer()).eq('member_id', memberId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  },
  async updateJournal(id, patch) {
    const { data, error } = await db.from(T.journal).update(patch).eq('id', id).select().single();
    if (error) throw error;
    const inWeek = data.date >= isoDate(state.week) && data.date <= isoDate(addDays(state.week, 6));
    state.journal = state.journal.filter((x) => x.id !== id);
    if (inWeek) state.journal.push(data);
    Offline.saveWeek();
    return data;
  },
  // Pesées : table facultative (créée par supabase/migrations/2026-10-28_pesees_resume_jour.sql) ; sans elle, le suivi du poids reste masqué.
  async loadPesees() {
    const { data, error } = await db.from(T.pesees).select('*').eq('foyer_id', foyer()).gte('date', isoDate(addDays(new Date(), -180))).order('date');
    if (error) { state.peseesOk = false; state.pesees = []; return; }
    state.peseesOk = true;
    state.pesees = data;
  },
  async addPesee(member_id, date, poids_kg) {
    const { data, error } = await db.from(T.pesees).upsert({ ...own(), member_id, date, poids_kg }, { onConflict: 'member_id,date' }).select().single();
    if (error) throw error;
    state.pesees = [...state.pesees.filter((x) => !(x.member_id === member_id && x.date === date)), data].sort((a, b) => a.date.localeCompare(b.date));
    // Le dernier poids alimente le calcul des besoins.
    const m = memberById(member_id);
    const last = state.pesees.filter((x) => x.member_id === member_id).pop();
    if (m && last?.id === data.id && Number(m.poids_kg) !== Number(poids_kg)) await Data.saveMember({ ...m, poids_kg: Number(poids_kg) });
    return data;
  },
  async deletePesee(id) {
    const { error } = await db.from(T.pesees).delete().eq('id', id);
    if (error) throw error;
    state.pesees = state.pesees.filter((x) => x.id !== id);
  },
  async journalOn(date, memberIds) {
    const { data, error } = await db.from(T.journal).select('*').eq('foyer_id', foyer()).eq('date', date).in('member_id', memberIds);
    if (error) throw error;
    return data;
  },
  async addPlacard(row) {
    const { data, error } = await db.from(T.placards).insert({ ...own(), ...row }).select().single();
    if (error) throw error;
    state.placards.push(data);
    return data;
  },
  async deletePlacard(id) {
    const { error } = await db.from(T.placards).delete().eq('id', id);
    if (error) throw error;
    state.placards = state.placards.filter((x) => x.id !== id);
  },
  async seedBasiques() {
    const rows = [...DEFAULT_BASIQUES, '__init__'].map((n) => ({ ...own(), name: n === '__init__' ? '(initialisé)' : n, ing_key: n === '__init__' ? '__init__' : ingKey(n), type: 'basique' }));
    const { data, error } = await db.from(T.placards).insert(rows).select();
    if (error) throw error;
    state.placards.push(...data);
  },
  async addReste(row) {
    const { data, error } = await db.from(T.restes).insert({ ...own(), ...row }).select().single();
    if (error) throw error;
    state.restes.push(data);
    state.restes.sort((a, b) => a.dlc.localeCompare(b.dlc));
    return data;
  },
  async updateReste(id, patch) {
    // Reste épuisé : supprimé, sauf s'il est encore utilisé par un repas planifié (le rappel « sortir du congélateur » en a besoin).
    if (patch.portions != null && patch.portions <= 0.05) {
      if (!state.plan.some((m) => m.reste_id === id)) return this.deleteReste(id);
      patch = { ...patch, portions: 0 };
    }
    const { data, error } = await db.from(T.restes).update(patch).eq('id', id).select().single();
    if (error) throw error;
    const i = state.restes.findIndex((x) => x.id === id);
    if (i >= 0) state.restes[i] = data;
  },
  async deleteReste(id) {
    const { error } = await db.from(T.restes).delete().eq('id', id);
    if (error) throw error;
    state.restes = state.restes.filter((x) => x.id !== id);
  },
  async addScan(p, score) {
    const row = { ...own(), ean: p.code, name: p.product_name_fr || p.product_name || null, brand: p.brands || null, image_url: p.image_front_small_url || p.image_front_url || null, score };
    try {
      await db.from(T.scans).delete().eq('ean', p.code);
      const { data, error } = await db.from(T.scans).insert(row).select().single();
      if (error) throw error;
      state.scans = [data, ...state.scans.filter((s) => s.ean !== p.code)];
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      Queue.push({ type: 'scan', row });
      state.scans = [{ ...row, id: `local:${uid()}`, scanned_at: new Date().toISOString() }, ...state.scans.filter((s) => s.ean !== p.code)];
    }
    Offline.saveAll();
  },
  async clearScans() {
    const { error } = await db.from(T.scans).delete().eq('foyer_id', foyer());
    if (error) throw error;
    state.scans = [];
  },
  async saveLink(ingredient, url, label, extra = {}) {
    const prev = state.links[ingredient] || {};
    const row = { ...own(), ingredient, url, label, prix: prev.prix ?? null, prix_source: prev.prix_source ?? null, prix_date: prev.prix_date ?? null, ean: prev.ean ?? null, pid: prev.pid ?? null, ...extra, updated_at: new Date().toISOString() };
    const { error } = await db.from(T.links).upsert(row, { onConflict: 'foyer_id,ingredient' });
    if (error) throw error;
    state.links[ingredient] = row;
    return row;
  },
  async deleteLink(ingredient) {
    const { error } = await db.from(T.links).delete().eq('ingredient', ingredient);
    if (error) throw error;
    delete state.links[ingredient];
  },
  async setCheck(item, checked) {
    const { error } = await db.from(T.checks).upsert({ ...own(), week: isoDate(state.week), item, checked }, { onConflict: 'foyer_id,week,item' });
    if (error) throw error;
    state.checks[item] = checked;
  },
  async saveSettings(patch) {
    const { data, error } = await db.from(T.settings).upsert({ ...patch, ...own(), updated_at: new Date().toISOString() }, { onConflict: 'foyer_id' }).select().single();
    if (error) throw error;
    state.settings = data;
  },
};

