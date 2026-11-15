// ---------------------------------------------------------------------------
// Comptes utilisateurs
// ---------------------------------------------------------------------------
function renderAuth() {
  const signup = state.authMode === 'signup';
  document.body.classList.add('logged-out');
  $('#title').textContent = '';
  $('#main').innerHTML = `<section class="auth">
    <div class="logo logo-img"><img src="icon-192.png" alt="" width="76" height="76"></div>
    <h2>${esc(APP_NAME)}</h2>
    <p class="muted">${signup ? 'Créez votre compte pour retrouver vos données sur tous vos appareils.' : 'Connectez-vous pour accéder à votre espace.'}</p>
    <div class="seg" role="group" style="grid-template-columns:1fr 1fr">
      <button type="button" aria-pressed="${!signup}" data-auth-mode="login">Se connecter</button>
      <button type="button" aria-pressed="${signup}" data-auth-mode="signup">Créer un compte</button></div>
    <form class="stack" data-form="auth">
      <label class="field"><span>Adresse e-mail</span><input class="input" type="email" name="email" autocomplete="email" inputmode="email" required></label>
      <label class="field"><span>Mot de passe${signup ? ' (6 caractères minimum)' : ''}</span>
        <input class="input" type="password" name="password" minlength="6" maxlength="72" autocomplete="${signup ? 'new-password' : 'current-password'}" required></label>
      <label class="check"><input type="checkbox" data-show-pass> Afficher le mot de passe</label>
      ${signup ? '' : '<button type="button" class="btn block" data-forgot style="border:0;color:var(--primary-strong)">Mot de passe oublié ?</button>'}
      <button class="btn primary block">${signup ? 'Créer mon compte' : 'Se connecter'}</button>
    </form></section>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-auth-mode]');
  if (!b) return;
  state.authMode = b.dataset.authMode;
  const email = $('[data-form="auth"] [name="email"]')?.value || '';
  renderAuth();
  $('[data-form="auth"] [name="email"]').value = email;
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-forgot]')) return;
  openSheet(`${sheetHead('Mot de passe oublié')}
    <p>Par choix, l'application n'envoie pas d'e-mail. Un <b>administrateur de votre foyer</b> (la personne qui l'a créé) peut définir un nouveau mot de passe pour votre compte depuis <b>Paramètres › Mon foyer › Partage du foyer</b>, puis vous le communiquer.</p>
    <p class="muted small">Si vous êtes seul dans votre foyer, écrivez à la personne qui administre l'application.</p>
    <button class="btn primary block" data-act="close-sheet">Compris</button>`);
});
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-show-pass]')) $('[data-form="auth"] [name="password"]').type = e.target.checked ? 'text' : 'password';
});
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.dataset.form !== 'auth') return;
  e.preventDefault();
  const email = f.email.value.trim().toLowerCase();
  const password = f.password.value;
  const btn = $('button.primary', f);
  btn.disabled = true;
  try {
    if (state.authMode === 'signup') {
      const { error } = await db.functions.invoke('signup', { body: { email, password } });
      if (error) {
        let msg = 'Création du compte impossible';
        try { msg = (await error.context.json()).error || msg; } catch { /* réponse non JSON */ }
        throw new Error(msg);
      }
    }
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(/invalid/i.test(error.message) ? 'E-mail ou mot de passe incorrect' : error.message);
  } catch (err) {
    btn.disabled = false;
    toast(err.message || 'Connexion impossible');
  }
});

const Foyer = {
  genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => chars[b % chars.length]).join('');
  },
  // Rattache le compte à son foyer ; en crée un (et migre les anciennes données) au premier passage.
  async ensure() {
    const { data: c, error } = await db.from('foyer_comptes').select('*, foyers(*)').eq('user_id', me()).maybeSingle();
    if (error) throw error;
    if (c) {
      state.foyer = c.foyers;
      state.compte = c;
      if (c.email !== state.user.email) db.from('foyer_comptes').update({ email: state.user.email }).eq('user_id', me()).then(() => {});
      return;
    }
    const { data: f, error: e1 } = await db.from('foyers').insert({ nom: 'Mon foyer', code_invitation: this.genCode(), created_by: me() }).select().single();
    if (e1) throw e1;
    const { data: cc, error: e2 } = await db.from('foyer_comptes').insert({ foyer_id: f.id, user_id: me(), role: 'admin', email: state.user.email }).select().single();
    if (e2) throw e2;
    state.foyer = f;
    state.compte = cc;
    await this.migrate(f.id);
  },
  async migrate(fid) {
    const res = await Promise.all([T.recipes, T.plan, T.scans, T.links, T.checks, T.extras, T.members, T.journal]
      .map((t) => db.from(t).update({ foyer_id: fid }).eq('user_id', me()).is('foyer_id', null)));
    res.forEach((r, i) => { if (r.error) console.warn('migration', i, r.error); });
    const { data: s } = await db.from(T.settings).select('user_id').eq('foyer_id', fid).maybeSingle();
    if (!s) await db.from(T.settings).update({ foyer_id: fid }).eq('user_id', me()).is('foyer_id', null);
  },
  async loadComptes() {
    const { data, error } = await db.from('foyer_comptes').select('*').eq('foyer_id', foyer()).order('created_at');
    if (error) throw error;
    state.comptes = data;
    return data;
  },
  async invoke(name, body) {
    const { data, error } = await db.functions.invoke(name, { body });
    if (error) {
      let msg = 'Opération impossible';
      try { msg = (await error.context.json()).error || msg; } catch { /* réponse non JSON */ }
      throw new Error(msg);
    }
    return data;
  },
  isAdmin() { return state.compte?.role === 'admin'; },
};

// Écran « Mon foyer » : code d'invitation, comptes rattachés, « je suis… », rejoindre, mots de passe.
function openFoyerComptes() {
  const el = openSheet(`${sheetHead(state.foyer?.nom || 'Mon foyer')}<div data-body><div class="spinner"></div></div>`);
  const draw = async () => {
    try { await Foyer.loadComptes(); } catch (e) { fail(e); }
    const f = state.foyer;
    const admin = Foyer.isAdmin();
    const comptes = state.comptes.map((c) => {
      const m = memberById(c.member_id);
      const mine = c.user_id === me();
      return `<div class="nt-row"><span><b>${esc(c.email || 'compte')}</b>${mine ? ' <span class="badge-extra">moi</span>' : ''}<br><span class="muted small">${c.role === 'admin' ? 'Administrateur' : 'Membre'}${m ? ` · ${esc(m.nom)}` : ''}</span></span>
        ${!mine && admin ? `<button class="btn small" data-x="pw" data-email="${esc(c.email || '')}">Mot de passe</button>` : ''}</div>`;
    }).join('');
    $('[data-body]', el).innerHTML = `
      <div class="card" style="padding:14px;margin-bottom:12px">
        <div class="muted small">Code d'invitation du foyer</div>
        <div class="row"><b style="font-size:26px;letter-spacing:.12em;font-variant-numeric:tabular-nums" class="grow">${esc(f.code_invitation)}</b>
          <button class="btn small" data-x="share">${ICON.share} Partager</button></div>
        <p class="muted small" style="margin:6px 0 0">Un proche crée son compte, puis saisit ce code dans Paramètres › Mon foyer › Rejoindre : il verra et modifiera les mêmes recettes, planning et courses.</p>
      </div>
      ${admin ? `<form class="row" data-form="foyer-nom" style="margin-bottom:12px"><input class="input grow" name="nom" value="${esc(f.nom)}" maxlength="60" aria-label="Nom du foyer"><button class="btn">Renommer</button></form>` : ''}
      <label class="field" style="margin-bottom:12px"><span>Je suis…</span><select class="input" data-x="me">
        <option value="">— non précisé —</option>${state.members.map((m) => `<option value="${m.id}" ${state.compte?.member_id === m.id ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select>
        <span class="muted small" style="font-weight:400">Le suivi et le journal s'ouvrent sur ce membre.</span></label>
      <div class="ntable"><div class="nt-title">Comptes du foyer</div>${comptes}</div>
      <details class="ndetails"><summary>Rejoindre un autre foyer</summary>
        <p class="muted small">Vos données actuelles resteront dans votre foyer actuel. Saisissez le code reçu :</p>
        <form class="row" data-form="join"><input class="input grow" name="code" placeholder="Code à 8 caractères" maxlength="10" autocapitalize="characters" required><button class="btn primary">Rejoindre</button></form></details>`;
  };
  draw();
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    if (b.dataset.x === 'share') {
      const text = `Rejoins mon foyer sur ${APP_NAME} : crée un compte sur ${location.origin}${location.pathname} puis saisis le code ${state.foyer.code_invitation} dans Paramètres › Mon foyer.`;
      if (navigator.share) { try { await navigator.share({ text }); } catch { /* annulé */ } }
      else { try { await navigator.clipboard.writeText(text); toast('Invitation copiée'); } catch { toast(state.foyer.code_invitation); } }
    }
    if (b.dataset.x === 'pw') resetPasswordSheet(b.dataset.email);
  });
  el.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-x="me"]')) return;
    const member_id = e.target.value || null;
    try {
      await formeSetMe(member_id);
      toast('Enregistré');
      render();
    } catch (err) { fail(err); }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.dataset.form === 'foyer-nom') {
      try {
        const { error } = await db.from('foyers').update({ nom: f.nom.value.trim() || 'Mon foyer' }).eq('id', foyer());
        if (error) throw error;
        state.foyer.nom = f.nom.value.trim() || 'Mon foyer';
        $('h2', el).textContent = state.foyer.nom;
        toast('Foyer renommé');
      } catch (err) { fail(err); }
    }
    if (f.dataset.form === 'join') {
      if (!(await confirmSheet('Rejoindre ce foyer ? Vous quitterez votre foyer actuel ; ses données y restent.', 'Rejoindre', false))) return;
      try {
        const r = await Foyer.invoke('join-foyer', { code: f.code.value });
        toast(`Bienvenue dans « ${r.foyer.nom} »`);
        while (sheets.length) closeSheet();
        state.loaded = false;
        onSession({ user: state.user });
      } catch (err) { toast(err.message); }
    }
  });
}
function resetPasswordSheet(email) {
  const el = openSheet(`${sheetHead('Nouveau mot de passe')}
    <p class="muted small" style="margin-top:0">Définissez un nouveau mot de passe pour <b>${esc(email)}</b>. Communiquez-le lui ensuite.</p>
    <form class="stack" data-form="pw"><input class="input" name="password" type="text" minlength="6" maxlength="72" placeholder="Au moins 6 caractères" required autocomplete="off">
    <button class="btn primary block">Enregistrer</button></form>`);
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', e.target);
    btn.disabled = true;
    try { await Foyer.invoke('reset-password', { email, password: e.target.password.value }); closeSheet(); toast('Mot de passe modifié'); }
    catch (err) { btn.disabled = false; toast(err.message); }
  });
}

async function onSession(session) {
  const user = session?.user || null;
  if (user?.id === state.user?.id && state.loaded) return;
  state.user = user;
  state.loaded = false;
  Object.assign(state, { foyer: null, compte: null, comptes: [], recipes: [], links: {}, scans: [], plan: [], checks: {}, extras: [], members: [], journal: [], moving: null });
  if (!user) { Pet.stop(); state.forme = Forme.blank(); renderAuth(); return; }
  document.body.classList.remove('logged-out');
  $('#main').innerHTML = '<div class="spinner"></div>';
  try {
    await Foyer.ensure();
    store.set(`cache:user:${user.id}`, { foyer: state.foyer, compte: state.compte });
    await Promise.all([Data.loadAll(), CQ.load().catch((e) => console.warn('Ciqual', e))]);
    if (state.compte?.member_id && !memberById(state.suiviMember)) state.suiviMember = state.compte.member_id;
    await Data.loadWeek();
    state.offline = false;
    if (await Queue.flush().catch(() => 0)) await Data.loadWeek();
    Offline.saveAll();
    Offline.saveWeek();
    await Forme.load(true).catch((e) => console.warn('forme', e));
    await Modules.charger(true, { horsLigne: false });
    state.loaded = true;
    const qs = new URLSearchParams(location.search);
    const hash = location.hash.replace('#', '');
    // Lien direct vers un écran (#planning, #agenda…) ou un onglet (#cuisine).
    if (hash && (Modules.get(hash) || ONGLETS.some((o) => o.id === hash))) { state.tab = Nav.resoudre(hash); history.replaceState(null, '', location.pathname); }
    const urlAction = qs.get('action');
    if (urlAction) history.replaceState(null, '', location.pathname);
    render();
    runUrlAction(urlAction);
    evaluateYesterday().catch((e) => console.warn('bilan', e)).finally(() => Rewards.daily().catch(() => {}));
    Pet.start();
  } catch (err) {
    // Hors ligne : on repart du dernier chargement connu.
    const cu = store.get(`cache:user:${user.id}`, null);
    if (cu && isNetworkError(err)) {
      Object.assign(state, cu);
      if (Offline.restoreAll()) {
        Offline.restoreWeek();
        CQ.load().catch(() => {});
        Forme.load(true).catch(() => {});
        Modules.charger(false, { horsLigne: true }).catch(() => {});
        state.offline = true;
        state.loaded = true;
        render();
        return;
      }
    }
    $('#main').innerHTML = `<div class="empty"><p>Impossible de charger vos données.</p><button class="btn primary" onclick="location.reload()">Réessayer</button></div>`;
    console.error(err);
  }
}

