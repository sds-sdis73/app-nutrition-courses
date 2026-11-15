// ---------------------------------------------------------------------------
// Aujourd'hui : fil chronologique de la journée du membre choisi (repas, eau, activités, rappels).
// ---------------------------------------------------------------------------
const SLOT_TIME = { 'petit-dejeuner': '07:30', collation: '10:30', midi: '12:30', gouter: '16:30', soir: '19:30' };
const WATER_POINTS = [['10:00', 0.25, 'Matinée'], ['13:00', 0.5, 'Midi'], ['16:30', 0.7, 'Après-midi'], ['19:30', 0.85, 'Soirée'], ['21:30', 1, 'Avant de dormir']];
// Délai après l'horaire indicatif avant de considérer un repas comme « rien de noté » (chacun mange à son rythme).
const plusMin = (t, m) => { const [h, mi] = t.split(':').map(Number); const x = Math.min(23 * 60 + 59, h * 60 + mi + m); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const lateAfter = (slot, t) => (slot === 'petit-dejeuner' ? '11:00' : plusMin(t, 150));
function renderToday() {
  const today = new Date();
  const iso = isoDate(today);
  const di = dayIndex(today);
  const now = nowHM();
  const members = state.members;
  const greet = today.getHours() < 12 ? 'Bonjour' : today.getHours() < 18 ? 'Bon après-midi' : 'Bonsoir';
  const me = journalMember();
  const head = `<p class="muted" style="margin:0 0 10px">${greet} · ${today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>`;
  if (!me) return `${head}<div class="card" style="padding:12px"><p class="muted small" style="margin:0 0 8px">Ajoutez les membres du foyer pour suivre repas, hydratation et activités.</p><button class="btn primary small" data-act="foyer">${ICON.users} Configurer le foyer</button></div>`;
  const c = companionOf(me);
  const md = memberDay(me, today);
  const nd = needs(me, today);
  const ex = expense(me, today);
  const water = waterTotal(me, today);
  const wGoal = waterGoal(me, today);
  const past = (t) => t <= now;
  const kcalOf = (list) => Math.round(list.reduce((t, e) => t + (e.n.kcal || 0), 0));
  const eatenSoFar = kcalOf(md.entries.filter((e) => e.type === 'journal' || past(SLOT_TIME[e.slot] || '12:00')));
  const items = [];

  // Repas
  for (const [slot, label] of SLOTS) {
    const entries = md.entries.filter((e) => e.slot === slot);
    if (slot === 'collation' && !entries.length) continue;
    // Collation : placée à l'heure réelle de la première saisie.
    const first = slot === 'collation' && state.journal.find((j) => entries.some((e) => e.id === j.id))?.created_at;
    const t = first ? new Date(first).toTimeString().slice(0, 5) : SLOT_TIME[slot];
    const meal = di >= 0 && ['midi', 'soir'].includes(slot) ? state.plan.find((x) => x.day === di && x.slot === slot && mealEaters(x).some((y) => y.id === me.id)) : null;
    const r = meal && recipeById(meal.recipe_id);
    const done = entries.some((e) => e.type === 'journal') || (r && past(t));
    let body = '';
    if (r) {
      const img = safeUrl(r.photo_url);
      body += `<div class="tl-recipe">${img ? `<img class="sthumb" src="${esc(img)}" alt="">` : `<span class="sthumb">${ICON.chef}</span>`}
        <span class="grow"><b>${esc(r.title)}</b><span class="meta">${ICON.users} ${esc(mealWho(meal))}${meal.reste_id ? '<span class="tag ahead">Reste</span>' : ''}${totalMin(r) && !meal.reste_id ? `<span>${ICON.clock} ${totalMin(r)} min</span>` : ''}</span></span>
        <button class="icon-btn" data-act="open-recipe" data-id="${r.id}" aria-label="Voir la recette">${ICON.chef}</button>${!meal.reste_id && !past(t) ? `<button class="icon-btn" data-act="cook-mode" data-id="${r.id}" aria-label="Mode cuisine">${ICON.play}</button>` : ''}</div>`;
    }
    const journal = entries.filter((e) => e.type === 'journal');
    if (journal.length) body += `<div class="tl-list">${journal.map((e) => `<div class="tl-food"><button class="grow tl-edit" data-act="journal-edit" data-id="${e.id}" aria-label="Corriger ${esc(e.label)}">${esc(e.label)}${e.detail ? ` <span class="muted">· ${esc(e.detail)}</span>` : ''}</button><b>${Math.round(e.n.kcal || 0)}</b><button class="icon-btn" data-act="journal-del" data-id="${e.id}" aria-label="Supprimer">${ICON.trash}</button></div>`).join('')}</div>`;
    let actions = '';
    const late = past(lateAfter(slot, t));
    const yIso = isoDate(addDays(today, -1));
    const ySure = mondayOf(addDays(today, -1)).getTime() === state.week.getTime();
    const likeY = !entries.length && (!ySure || state.journal.some((j) => j.date === yIso && j.member_id === me.id && j.slot === slot)) ? `<button class="btn small" data-act="journal-like-yesterday" data-slot="${slot}">↺ Comme hier</button>` : '';
    if (!entries.length && late) actions = `<span class="muted small grow">Rien de noté</span>${likeY}<button class="btn small soft" data-act="journal-add" data-slot="${slot}">${ICON.plus} Noter</button>`;
    else if (!entries.length && ['midi', 'soir'].includes(slot) && di >= 0) actions = `<button class="btn small primary" data-act="journal-add" data-slot="${slot}">${ICON.plus} Noter</button>${likeY}<button class="btn small" data-act="suggest">${ICON.sparkle} Une idée ?</button><button class="btn small soft" data-act="slot" data-d="${di}" data-s="${slot}">Planifier</button>`;
    else if (!entries.length) actions = `<span class="muted small grow">${past(t) ? 'À noter quand tu veux' : 'À venir'}</span>${likeY}<button class="btn small soft" data-act="journal-add" data-slot="${slot}">${ICON.plus} Noter</button>`;
    else actions = `<button class="btn small" data-act="journal-add" data-slot="${slot}" style="margin-left:auto">${ICON.plus} Ajouter</button>`;
    const k = kcalOf(entries);
    items.push({ t, kind: 'repas', state: done ? 'done' : late ? 'missed' : 'next', icon: slot === 'petit-dejeuner' ? '☕' : slot === 'gouter' || slot === 'collation' ? '🍎' : '🍽️',
      title: label, side: k ? `${k} kcal` : '', body: body + `<div class="tl-actions">${actions}</div>` });
  }

  // Activités
  for (const a of dayActs(me.id, iso).filter((x) => x.kind === 'seance')) {
    const t = a.heure || '18:00';
    const planned = a.statut === 'prevu';
    items.push({ t, kind: 'sport', state: planned ? (past(t) ? 'missed' : 'next') : 'done', icon: '🏃', title: esc(a.label || 'Activité'),
      side: `${Math.round(Number(a.kcal) || 0)} kcal`,
      body: a.source === 'forme' ? `<div class="tl-actions"><span class="muted small grow">${a.minutes ? `${a.minutes} min · ` : ''}${planned ? 'séance du plan' : 'faite'}</span>${formeTodayActions(a)}</div>` : `<div class="tl-actions"><span class="muted small grow">${a.minutes ? `${a.minutes} min · ` : ''}${planned ? (past(t) ? 'prévue, c\'est fait ?' : 'prévue') : 'faite'}</span>${planned ? `<button class="btn small primary" data-act="activite-done" data-id="${a.id}">C'est fait</button>` : ''}<button class="icon-btn" data-act="activite-del" data-id="${a.id}" aria-label="Supprimer">${ICON.trash}</button></div>` });
  }

  // Hydratation : repères au fil de la journée, avec les boissons de la plage
  const drinks = waterDay(me, today);
  let prev = '00:00';
  for (const [t, frac, moment] of WATER_POINTS) {
    const inWin = drinks.filter((x) => x.heure > prev && x.heure <= t);
    const upTo = drinks.filter((x) => x.heure <= t).reduce((s2, x) => s2 + x.ml, 0);
    const target = Math.round((wGoal * frac) / 50) * 50;
    const isNext = !past(t) && past(prev);
    prev = t;
    if (!past(t) && !isNext) { items.push({ t, kind: 'eau', state: 'later', icon: '💧', title: `Hydratation · ${moment}`, side: `objectif ${fmtL(target)}`, body: '' }); continue; }
    const ok = upTo >= target * 0.9;
    items.push({ t, kind: 'eau', state: isNext ? 'next' : ok ? 'done' : 'missed', icon: '💧', title: `Hydratation · ${moment}`,
      side: `${fmtL(upTo)} / ${fmtL(target)}`,
      body: `<div class="tl-actions">${inWin.length ? `<span class="muted small grow">${inWin.length} boisson${inWin.length > 1 ? 's' : ''} · ${fmtL(inWin.reduce((s2, x) => s2 + x.ml, 0))}</span>` : `<span class="muted small grow">${isNext ? `Encore ${fmtL(Math.max(0, target - upTo))}` : 'Aucune boisson notée'}</span>`}${isNext || !ok ? `<button class="btn small soft" data-act="eau-add" data-ml="250">+250 ml</button>` : ''}</div>` });
  }

  // Rappels : reste à sortir du congélateur pour demain, restes du frigo à finir
  const tomorrow = dayIndex(addDays(today, 1));
  if (tomorrow >= 0) for (const meal of state.plan.filter((x) => x.day === tomorrow && x.reste_id)) {
    const rs = state.restes.find((x) => x.id === meal.reste_id);
    const r = rs && rs.stockage === 'congel' && recipeById(rs.recipe_id);
    if (r) items.push({ t: '19:00', kind: 'rappel', state: past('19:00') ? 'missed' : 'next', icon: '❄️', title: 'Sortir du congélateur', side: '', body: `<p class="muted small" style="margin:0">${esc(r.title)} pour ${meal.slot === 'midi' ? 'le déjeuner' : 'le dîner'} de demain.</p>` });
  }
  const frigo = restesFor(today).filter((x) => x.stockage === 'frigo' && x.dlc <= iso);
  for (const x of frigo) { const r = recipeById(x.recipe_id); if (r) items.push({ t: '12:00', kind: 'rappel', state: 'next', icon: '🥡', title: 'Reste à finir aujourd\'hui', side: '', body: `<p class="muted small" style="margin:0">${esc(r.title)} · ${esc(resteLabel(x))}</p>` }); }

  // Module Forme : conseils croisés (féculents la veille d'une grosse séance, protéines après le renfo)
  items.push(...formeTodayItems(me, today, past));

  // Bilan du soir
  const cr = dayCriteria(me, today);
  const okCount = cr.items.filter((x) => x.ok).length;
  items.push({ t: '21:45', kind: 'bilan', state: past('21:45') ? 'done' : 'later', icon: '🌙', title: 'Bilan de la journée', side: `${okCount} / ${cr.items.length}`,
    body: `<div class="tl-actions"><span class="muted small grow">${cr.items.filter((x) => x.ok).map((x) => x.label).slice(0, 3).join(' · ') || 'Les objectifs se remplissent au fil des repas'}</span><button class="btn small" data-act="tab" data-tab="suivi">Détail</button></div>` });

  // Ce qui est déjà fait passe avant « Maintenant », même si l'horaire indicatif est plus tard (repas noté en avance).
  for (const x of items) { x.ord = x.t; if (x.state === 'done' && x.t > now) x.t = now; }
  items.sort((a, b) => a.t.localeCompare(b.t) || a.ord.localeCompare(b.ord) || (a.kind === 'repas' ? -1 : 1));
  const nowIdx = items.findIndex((x) => x.t > now);
  const nowMark = '<li class="tl-now"><span class="tl-dot"></span><span class="tl-now-line">Maintenant</span></li>';
  const li = (x) => `<li class="tl-item ${x.kind} ${x.state}"><span class="tl-dot">${x.icon}</span>
    <div class="tl-card"><div class="row"><b class="grow">${x.title}</b>${x.side ? `<span class="small muted">${x.side}</span>` : ''}${x.state === 'done' ? '<span class="tl-check">✓</span>' : ''}</div>${x.body}</div></li>`;
  const timeline = items.map((x, i) => (i === nowIdx ? nowMark : '') + li(x)).join('') + (nowIdx < 0 ? nowMark : '');

  const mood = c ? companionMood(me, c) : 'content';
  const nextMeal = di >= 0 && ['midi', 'soir'].map((sl) => state.plan.find((x) => x.day === di && x.slot === sl && SLOT_TIME[sl] > now)).find(Boolean);
  const nextAct = dayActs(me.id, iso).find((a) => a.statut === 'prevu' && (a.heure || '') > now);
  Pet.lines = c && c.messages !== false ? [pick(mood, c), ...PET_MSG.idle,
    water < wGoal ? `Encore ${fmtL(wGoal - water)} d'eau pour ton objectif. On trinque ? 💧` : 'Objectif d\'eau atteint, bravo !',
    nextMeal ? `Au menu ${nextMeal.slot === 'midi' ? 'ce midi' : 'ce soir'} : ${recipeById(nextMeal.recipe_id)?.title || 'surprise'}. J'ai hâte !` : '',
    nextAct ? `${nextAct.label} à ${nextAct.heure} : je viens avec toi !` : '',
    c.coquillages >= 20 ? `On a ${c.coquillages} coquillages… un petit tour à la boutique ?` : ''].filter(Boolean) : [];
  const scene = c ? `<div class="scene" data-scene>${sceneSvg(c.fond || 'jardin')}
      <div class="scene-top"><span class="pill" data-shells>${c.coquillages} 🐚</span><span class="pill">🔥 ${c.serie} j</span><span class="pill name">${esc(c.nom)}</span></div>
      ${c.messages === false ? '' : `<div class="scene-bubble" data-bubble>${esc(pick(mood, c))}</div>`}
      <div class="comp-walk"><button class="comp-tap" data-act="pet" aria-label="Faire un câlin à ${esc(c.nom)}">${companionSvg(c, mood, 190)}</button></div></div>
    <div class="pet-actions"><button class="btn" data-act="nourrir">🍓 Nourrir</button><button class="btn" data-act="boutique">🎀 Boutique</button></div>`
    : `<div class="scene">${sceneSvg('jardin')}<div class="scene-bubble">Un compagnon pour ${esc(me.nom)} ? Il t'encourage et ne gronde jamais.</div><div class="comp-walk still" style="opacity:.9">${companionSvg({ espece: 'loutre' }, 'matin', 170)}</div></div>
    <div class="pet-actions" style="grid-template-columns:1fr"><button class="btn primary" data-act="adopt">${ICON.sparkle} Adopter un compagnon · ${WELCOME_SHELLS} 🐚 offerts</button></div>`;
  const hero = `<div class="hero hero-pet">${scene}
      <div class="rings">${ring(eatenSoFar, nd.kcal, 'var(--primary)', `${eatenSoFar} / ${nd.kcal} kcal`, 'mangé')}${ring(ex.active, Number(me.objectif_kcal_actives) || 300, 'var(--mango-strong)', `${ex.active} / ${me.objectif_kcal_actives || 300} kcal`, 'activité')}${ring(water / 1000, wGoal / 1000, 'var(--sky)', `${fmtL(water)} / ${fmtL(wGoal)}`, 'eau')}</div>
      ${members.length > 1 ? `<div class="famille">${members.map((x) => { const cx = companionOf(x); return `<button class="fam ${x.id === me.id ? 'on' : ''}" data-act="famille" data-m="${x.id}">${cx ? companionSvg(cx, 'content', 40) : `<span class="thumb ph" style="width:40px;height:40px;border-radius:50%">${esc(x.nom[0])}</span>`}<span>${esc(x.nom)}</span></button>`; }).join('')}</div>` : ''}</div>`;
  WidgetSync.schedule(me, { date: iso, nom: me.nom, kcal: eatenSoFar, besoin: nd.kcal, actif: ex.active, actifObj: Number(me.objectif_kcal_actives) || 300, eau: water, eauObj: wGoal,
    prochain: nextMeal ? `${nextMeal.slot === 'midi' ? 'Midi' : 'Soir'} : ${recipeById(nextMeal.recipe_id)?.title || ''}` : '',
    compagnon: c ? { nom: c.nom, espece: c.espece, coquillages: c.coquillages, serie: c.serie, humeur: mood, message: c.messages === false ? '' : pick(mood, c) } : null });
  if (c && !Pet.greeted) { Pet.greeted = true; Pet.play('hello', `${greet} ${me.nom} ! ${today.getHours() < 11 ? 'Bien dormi ?' : 'Content·e de te voir !'}`); }
  return `${head}${hero}
    <div class="quick3"><button class="btn" data-act="journal-add" data-slot="${defaultSlot()}">🍽️ Repas</button><button class="btn" data-act="eau-add" data-ml="250">💧 +250 ml</button><button class="btn" data-act="activite-add">🏃 Activité</button></div>
    <h3 class="tl-head">La journée de ${esc(me.nom)}</h3>
    <ol class="timeline">${timeline}</ol>`;
}
// Widget iPhone (Scriptable) : l'app publie le résumé du jour dans resume_jour (table facultative), au plus toutes les 4 s et seulement s'il change.
const WidgetSync = {
  last: '', timer: null, off: false,
  schedule(m, data) {
    if (this.off || state.offline || !m) return;
    const json = JSON.stringify(data);
    if (json === this.last) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try {
        const { error } = await db.from(T.resume).upsert({ ...own(), member_id: m.id, date: data.date, data: { ...data, maj: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'member_id,date' });
        if (error) { if (/relation|does not exist|schema cache/i.test(error.message)) this.off = true; return; }
        this.last = json;
      } catch { /* hors ligne : on réessaiera au prochain affichage */ }
    }, 4000);
  },
};
const WIDGET_URL = 'widget/miam-et-moi.js';
// Liaison Monsieur Cuisine (lecture seule) : la fonction serveur « monsieur-cuisine » garde les jetons chiffrés
// et synchronise planning, liste de courses et recettes toutes les heures dans mc_planning, mc_courses, mc_recettes.
function mcSheet() {
  const el = openSheet(`${sheetHead('Monsieur Cuisine')}<div data-body><div class="spinner"></div></div>`);
  const body = () => $('[data-body]', el);
  const fmtDate = (d) => (d ? new Date(d).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais');
  const draw = async () => {
    const [c, p] = await Promise.all([
      db.from('mc_connexions').select('*').eq('foyer_id', foyer()).maybeSingle(),
      db.from('mc_planning').select('date,titre').eq('foyer_id', foyer()).gte('date', isoDate(new Date())).order('date').limit(5),
    ]);
    if (c.error && /does not exist|schema cache/i.test(c.error.message)) { body().innerHTML = '<p class="muted">La liaison n\'est pas encore activée sur le serveur (migration 2026-11-15_monsieur_cuisine.sql).</p>'; return; }
    const x = c.data;
    const ok = x && ['ok', 'erreur'].includes(x.statut);
    body().innerHTML = ok ? `
      <p><b>Relié</b>${x.compte ? ` à ${esc(x.compte)}` : ''}. Dernière synchronisation : ${esc(fmtDate(x.derniere_synchro))}.</p>
      ${x.statut === 'erreur' ? `<p class="small warn">Dernière erreur : ${esc(x.erreur || '')}</p>` : ''}
      <p class="muted small">${x.stats?.planning ?? 0} repas planifiés · ${x.stats?.courses ?? 0} articles de courses · ${x.stats?.recettes ?? 0} recettes</p>
      ${p.data?.length ? `<div class="ntable"><div class="nt-title">À venir</div>${p.data.map((r) => `<div class="nt-row"><span>${esc(r.titre)}</span><b class="muted small">${esc(fmtDay(isoToDate(r.date)))}</b></div>`).join('')}</div>` : ''}
      <div class="grid2" style="margin-top:12px"><button class="btn primary" data-x="sync">Synchroniser maintenant</button><button class="btn" data-x="off">Déconnecter</button></div>
      <p class="muted small">Synchronisation automatique toutes les heures. Lecture seule : rien n'est modifié dans Monsieur Cuisine.</p>`
      : `${x?.statut === 'deconnecte' && x.erreur ? `<p class="small warn">${esc(x.erreur)}</p>` : ''}
      <p>Reliez votre compte Monsieur Cuisine pour retrouver ici votre planning, votre liste de courses et vos recettes.</p>
      <ol class="small" style="padding-left:18px">
        <li><b>Sur ordinateur, dans Chrome</b> (sur iPhone, l'appli Monsieur Cuisine intercepterait la suite). Touchez « Ouvrir la page Lidl ».</li>
        <li><b>Avant de vous connecter</b>, dans l'onglet Lidl : ouvrez les outils de développement (⌥ ⌘ I), onglet « Network » (Réseau), cochez « Preserve log » (Conserver le journal).</li>
        <li>Connectez-vous (e-mail, mot de passe, captcha) et acceptez les conditions de Lidl si elles s'affichent. À la fin, la page semble ne plus rien faire : c'est normal.</li>
        <li>Dans le filtre de l'onglet Network, tapez <code>code=</code>. Cliquez sur la ligne trouvée : dans « Headers », l'en-tête <code>location</code> contient une adresse qui commence par <code>lidl-com.monsieur-cuisine.Companion://</code>. Copiez-la (clic droit › Copy value).</li>
        <li>Collez-la ci-dessous et validez.</li>
      </ol>
      <button class="btn primary block" data-x="start">Ouvrir la page Lidl</button>
      <form class="stack" data-x="fin" style="margin-top:12px" hidden><textarea class="input" name="adresse" rows="3" placeholder="lidl-com.monsieur-cuisine.Companion://login/prod?code=…" required></textarea><button class="btn primary">Valider la connexion</button></form>
      <p class="muted small">Votre mot de passe n'est jamais vu par Tribu &amp; Toutous. Liaison non officielle : elle peut cesser de fonctionner si Monsieur Cuisine change son service.</p>`;
  };
  draw().catch((e) => fail(e));
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b || b.tagName === 'FORM') return;
    try {
      if (b.dataset.x === 'start') {
        const w = window.open('', '_blank');
        const r = await Foyer.invoke('monsieur-cuisine', { action: 'debut' });
        if (w) w.location = r.url; else location.href = r.url;
        $('[data-x="fin"]', el).hidden = false;
      }
      if (b.dataset.x === 'sync') { b.disabled = true; b.textContent = 'Synchronisation…'; const r = await Foyer.invoke('monsieur-cuisine', { action: 'synchro' }); toast(`${r.stats.planning} repas, ${r.stats.courses} articles, ${r.stats.recettes} recettes`); await draw(); }
      if (b.dataset.x === 'off' && await confirmSheet('Déconnecter Monsieur Cuisine ? Les données déjà copiées restent visibles.', 'Déconnecter')) { await Foyer.invoke('monsieur-cuisine', { action: 'deconnecter' }); await draw(); }
    } catch (err) { fail(err); draw().catch(() => {}); }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = $('button', f);
    btn.disabled = true; btn.textContent = 'Connexion et première synchronisation…';
    try {
      const r = await Foyer.invoke('monsieur-cuisine', { action: 'fin', adresse: f.adresse.value });
      toast(`Monsieur Cuisine relié : ${r.stats.planning} repas, ${r.stats.courses} articles, ${r.stats.recettes} recettes`);
      await draw();
    } catch (err) { btn.disabled = false; btn.textContent = 'Valider la connexion'; fail(err); }
  });
}
function widgetSheet() {
  const el = openSheet(`${sheetHead('Widget iPhone')}
    <p class="muted small" style="margin-top:0">Le widget affiche ton compagnon, les calories, l'eau et l'activité du jour sur l'écran d'accueil, avec des boutons Noter et +250 ml. Il passe par l'app gratuite <b>Scriptable</b> : rien à publier sur l'App Store.</p>
    <ol class="steps">
      <li>Installe <b>Scriptable</b> depuis l'App Store (gratuit).</li>
      <li>Touche <b>Copier le script</b> ci-dessous.</li>
      <li>Dans Scriptable : <b>+</b> en haut à droite, colle le texte, nomme le script <b>Miam &amp; moi</b>, puis touche ▶︎. Saisis ton e-mail et ton mot de passe Tribu &amp; Toutous (ils restent dans le trousseau de ton iPhone).</li>
      <li>Sur l'écran d'accueil : appui long, <b>+</b>, <b>Scriptable</b>, taille <b>moyenne</b>, puis appui long sur le widget › <b>Modifier le widget</b> › Script : <b>Miam &amp; moi</b>.</li>
    </ol>
    <button class="btn primary block" data-x="copy">Copier le script</button>
    <p class="muted small">Le widget se met à jour quand iOS le décide (en général toutes les 15 à 30 minutes) et à chaque ouverture de Tribu &amp; Toutous. « +250 ml » s'enregistre directement depuis le widget ; « Noter » ouvre l'app.</p>`);
  $('[data-x="copy"]', el).addEventListener('click', async () => {
    try {
      const txt = await (await fetch(WIDGET_URL, { cache: 'no-store' })).text();
      await navigator.clipboard.writeText(txt);
      toast('Script copié : colle-le dans Scriptable');
    } catch { window.open(WIDGET_URL, '_blank'); }
  });
}
// Actions demandées par adresse (widget, raccourcis) : ?action=noter | eau | activite | peser
function runUrlAction(action) {
  if (!action) return;
  state.tab = 'aujourdhui'; render();
  if (action === 'noter') journalAdd(defaultSlot());
  if (action === 'eau') addWater(250);
  if (action === 'activite') activiteSheet();
  if (action === 'peser') { switchTab('suivi'); peseeSheet(); }
}

// Propose des recettes pour le dîner : restes d'abord, puis rapides, aimées, non cuisinées récemment, sans aversion.
function suggestSheet() {
  const today = new Date();
  const di = dayIndex(today);
  const slot = today.getHours() < 14 ? 'midi' : 'soir';
  if (di < 0) { toast('Revenez à la semaine en cours pour planifier ce repas'); return; }
  const existing = state.plan.find((x) => x.day === di && x.slot === slot);
  const restes = restesFor(today);
  const score = (r) => (r.avis === 'adore' || r.favorite ? 3 : 0) + (totalMin(r) && totalMin(r) <= 30 ? 2 : 0) + (r.avis === 'a_tester' ? 1 : 0) + Math.min(3, (Date.now() - new Date(r.derniere_cuisson || '2000-01-01')) / (14 * 864e5)) + Math.random();
  const cands = state.recipes.filter((r) => r.avis !== 'jamais' && !conflictsFor(state.members, r).length).sort((a, b) => score(b) - score(a)).slice(0, 5);
  const el = openSheet(`${sheetHead(`On mange quoi ce ${slot === 'midi' ? 'midi' : 'soir'} ?`)}
    ${existing ? `<p class="muted small" style="margin-top:0">Déjà prévu : <b>${esc(recipeById(existing.recipe_id)?.title || '')}</b>. Choisir ci-dessous le remplacera.</p>` : ''}
    ${restes.length ? `<h3 style="margin:0 0 6px">Finir un reste</h3>${restes.map((x) => { const r = recipeById(x.recipe_id); return r ? `<button class="prod-row" data-reste="${x.id}"><div class="thumb ph">${ICON.flame}</div><div class="grow"><div class="prod-name">${esc(r.title)}</div><div class="muted small">${esc(resteLabel(x))}</div></div></button>` : ''; }).join('')}` : ''}
    <h3 style="margin:12px 0 6px">Idées</h3>
    ${cands.map((r) => `<button class="prod-row" data-rid="${r.id}">${safeUrl(r.photo_url) ? `<img class="thumb" src="${esc(safeUrl(r.photo_url))}" alt="" style="object-fit:cover">` : `<div class="thumb ph">${ICON.chef}</div>`}<div class="grow"><div class="prod-name">${esc(r.title)}</div><div class="meta">${totalMin(r) ? `<span>${ICON.clock} ${totalMin(r)} min</span>` : ''}${avisBadge(r)}${r.derniere_cuisson ? `<span>le ${fmtDay(isoToDate(r.derniere_cuisson))}</span>` : '<span>jamais cuisinée</span>'}</div></div></button>`).join('') || '<p class="muted">Aucune recette compatible. Ajoutez des recettes ou vérifiez les aversions.</p>'}`);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rid],[data-reste]');
    if (!b) return;
    closeSheet();
    try {
      if (b.dataset.reste) {
        const x = state.restes.find((y) => y.id === b.dataset.reste);
        await Data.setMeal(di, slot, x.recipe_id, state.settings.default_servings, { reste_id: x.id });
        const meal = state.plan.find((y) => y.day === di && y.slot === slot);
        await Data.updateReste(x.id, { portions: Math.max(0, Math.round((Number(x.portions) - mealServings(meal)) * 100) / 100) });
      } else await Data.setMeal(di, slot, b.dataset.rid, state.settings.default_servings, existing ? { ...existing, reste_id: null } : {});
      render(); toast(`${slot === 'midi' ? 'Déjeuner' : 'Dîner'} planifié`);
    } catch (err) { fail(err); }
  });
}

