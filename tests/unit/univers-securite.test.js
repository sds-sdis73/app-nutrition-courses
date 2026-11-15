// Module univers-securite : contrastes des univers (lus dans le CSS), code de secours, verrouillage, WebAuthn,
// partage du sport (agenda) et sauvegarde. Se lance aussi seul : node --test tests/unit/univers-securite.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('./_app');

const U = app.modules.univers;
const S = app.modules.securite;
const P = app.modules['univers-securite'];
const B = app.modules.sauvegarde;
const plain = (o) => JSON.parse(JSON.stringify(o));

// --- Contraste WCAG ---
const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'css', 'modules', 'univers-securite.css'), 'utf8');
function jetons(id) {
  const m = CSS.match(new RegExp(`\\[data-uapercu="${id}"\\]\\s*\\{([^}]*)\\}`));
  assert.ok(m, `jetons de l'univers ${id} introuvables dans le CSS`);
  return Object.fromEntries([...m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
}
const lum = (hex) => {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Paires texte / fond réellement utilisées par les écrans (texte courant, secondaire, boutons, liens, onglets, pastilles).
const PAIRES = [['ink', 'bg'], ['ink', 'surface'], ['ink', 'surface-2'], ['muted', 'surface'], ['muted', 'bg'], ['muted', 'surface-2'],
  ['on-primary', 'primary'], ['primary-strong', 'surface'], ['primary-strong', 'bg'], ['primary-strong', 'primary-soft'], ['ink', 'primary-soft'],
  ['ink', 'mango-soft'], ['ink', 'mint-soft'], ['ink', 'mango'], ['bg', 'ink'], ['danger', 'surface'],
  ['u-tab-ink', 'u-tab-bg'], ['u-tab-actif', 'u-tab-bg'], ['u-tab-on', 'u-tab-on-bg']];

describe('univers graphiques', () => {
  test('6 choix : Classique et les 5 univers retenus', () => {
    assert.deepEqual(plain(U.UNIVERS.map((u) => u.id)), ['classique', 'carnet', 'washi', 'herbier', 'cocon', 'kermesse']);
    assert.equal(U.universDe('inconnu').id, 'classique');
    assert.ok(U.universValide('herbier') && !U.universValide('pixel'));
    assert.match(U.policesUrl(U.universDe('washi')), /^https:\/\/fonts\.googleapis\.com\/css2\?family=Shippori\+Mincho.*&display=swap$/);
  });
  for (const id of ['carnet', 'washi', 'herbier', 'cocon', 'kermesse']) {
    test(`${id} : contraste ≥ 4,5:1 pour chaque paire texte/fond`, () => {
      const t = jetons(id);
      const echecs = [];
      for (const [f, b] of PAIRES) {
        const fg = t[f];
        const bg = t[b] === 'transparent' ? t['u-tab-bg'] : t[b];
        assert.ok(fg && bg, `${id} : jeton --${f} ou --${b} manquant`);
        assert.match(fg, /^#[0-9a-f]{6}$/i, `${id} --${f}`);
        assert.match(bg, /^#[0-9a-f]{6}$/i, `${id} --${b}`);
        const r = ratio(fg, bg);
        if (r < 4.5) echecs.push(`--${f} sur --${b} : ${r.toFixed(2)}`);
      }
      assert.deepEqual(echecs, []);
    });
  }
  test('chaque univers définit tous les jetons du thème Classique', () => {
    const base = Object.keys(jetons('classique'));
    for (const id of ['carnet', 'washi', 'herbier', 'cocon', 'kermesse']) {
      const t = jetons(id);
      assert.deepEqual(base.filter((k) => !(k in t)), [], id);
    }
  });
});

describe('sécurité : code de secours et verrouillage', () => {
  test('code de secours : 4 à 6 chiffres, ni répété ni en suite', () => {
    for (const ok of ['4826', '93017', '250419']) assert.equal(S.codeRefuse(ok), null, ok);
    assert.match(S.codeRefuse('123'), /4 à 6 chiffres/);
    assert.match(S.codeRefuse('1234567'), /4 à 6 chiffres/);
    assert.match(S.codeRefuse('12a4'), /4 à 6 chiffres/);
    assert.match(S.codeRefuse('0000'), /répété/);
    assert.match(S.codeRefuse('1234'), /suite/);
    assert.match(S.codeRefuse('9876'), /suite/);
    assert.match(S.codeRefuse('7890'), /suite/);
  });
  test('empreinte PBKDF2 : stable, dépend du sel, jamais le code en clair', async () => {
    const sel = '00112233445566778899aabbccddeeff';
    const a = await S.hacherCode('4826', sel, 1000);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(await S.hacherCode('4826', sel, 1000), a);
    assert.notEqual(await S.hacherCode('4827', sel, 1000), a);
    assert.notEqual(await S.hacherCode('4826', 'ffeeddccbbaa99887766554433221100', 1000), a);
    assert.ok(!a.includes('4826'));
  });
  test('attente après échecs : rien avant 5, puis 30 s doublées, 15 min au plus', () => {
    assert.equal(S.attenteApresEchecs(4), 0);
    assert.equal(S.attenteApresEchecs(5), 30000);
    assert.equal(S.attenteApresEchecs(6), 60000);
    assert.equal(S.attenteApresEchecs(30), 15 * 60000);
  });
  test('retour dans l\'appli : verrouillé après le délai seulement', () => {
    const t = 1_800_000_000_000;
    assert.equal(S.doitVerrouiller({ actif: true, cacheLe: t, maintenant: t + 4 * 60000, delaiMin: 5 }), false);
    assert.equal(S.doitVerrouiller({ actif: true, cacheLe: t, maintenant: t + 5 * 60000, delaiMin: 5 }), true);
    assert.equal(S.doitVerrouiller({ actif: false, cacheLe: t, maintenant: t + 60 * 60000 }), false);
    assert.equal(S.doitVerrouiller({ actif: true, cacheLe: null, maintenant: t }), false);
    assert.equal(S.doitVerrouiller({ actif: true, cacheLe: t, maintenant: t + 1, delaiMin: 0 }), true);
    assert.equal(S.delaiTexte(5), 'après 5 minutes hors de l\'appli');
    assert.equal(S.delaiTexte(0), 'dès que tu quittes l\'appli');
  });
  test('WebAuthn : identité vérifiée (UV) exigée, base64 URL aller-retour', () => {
    const auth = (flags) => { const o = new Uint8Array(37); o[32] = flags; return o.buffer; };
    assert.equal(S.uvVerifie(auth(0x05)), true);
    assert.equal(S.uvVerifie(auth(0x45)), true);
    assert.equal(S.uvVerifie(auth(0x01)), false, 'présence sans Face ID');
    assert.equal(S.uvVerifie(new Uint8Array(10)), false);
    for (const n of [0, 1, 2, 3, 16, 31, 32]) {
      const o = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
      const s = S.b64url(o);
      assert.match(s, /^[A-Za-z0-9_-]*$/);
      assert.deepEqual([...S.deB64url(s)], [...o]);
    }
    assert.equal(S.b64url(new TextEncoder().encode('Tribu')), 'VHJpYnU');
    assert.equal(S.nomBio('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'Face ID');
  });
});

describe('partage du sport', () => {
  const seances = [
    { id: 's1', user_id: 'moi', member_id: 'mA', date: '2026-11-18', heure: '18:30', type: 'course', statut: 'prevu', duree_min: 45, distance_m: 8200, sous: 'ef' },
    { id: 's2', user_id: 'manon', member_id: 'mM', date: '2026-11-19', heure: '07:00', type: 'renfo', statut: 'fait', duree_min: 30, titre: 'Renfo coureur' },
    { id: 's3', user_id: 'manon', member_id: 'mM', date: '2026-11-20', heure: null, type: 'course', statut: 'rate' },
  ];
  test('tout ou rien : les miennes seulement si je partage ; jamais les séances manquées', () => {
    assert.deepEqual(plain(P.seancesVisibles(seances, { moi: 'moi', partageMoi: false }).map((s) => s.id)), ['s2']);
    assert.deepEqual(plain(P.seancesVisibles(seances, { moi: 'moi', partageMoi: true }).map((s) => s.id)), ['s1', 's2']);
  });
  test('élément d\'agenda : titre, horaires, membre, détail', () => {
    const e = P.elementAgenda(seances[0], (id) => ({ mA: 'Antoine' }[id]));
    assert.deepEqual(plain(e), { id: 'seance:s1', date: '2026-11-18', heure: '18:30', heureFin: '19:15', titre: 'Footing en endurance', detail: 'Antoine · 45 min · 8,2 km',
      membres: ['mA'], couleur: null, act: 'partage-sport-voir', data: { id: 's1' } });
    assert.equal(P.elementAgenda(seances[1]).titre, 'Renfo coureur');
    assert.match(P.elementAgenda(seances[1]).detail, /faite/);
    assert.equal(P.heureFin('23:40', 60), '23:59');
    assert.equal(P.heureFin(null, 30), null);
  });
  test('l\'agenda de la famille passe par Agenda.sources', () => {
    assert.ok(app.Agenda.sources.some((s) => s.module === 'univers-securite'));
  });
  test('Forme › Réglages reçoit la carte de partage', () => {
    assert.equal(app.Forme.reglagesExtra.length >= 1, true);
  });
});

describe('sauvegarde', () => {
  test('tables : toutes celles du foyer, sans les secrets ni les tables techniques', () => {
    const t = B.tablesASauvegarder(['recettes', 'agenda_evenements', 'mc_secrets', 'push_abonnements']);
    for (const x of ['recettes', 'journal', 'forme_seances', 'mc_planning', 'agenda_evenements', 'compte_preferences']) assert.ok(t.includes(x), x);
    for (const x of ['mc_secrets', 'push_abonnements', 'config_app', 'rappels_envoyes']) assert.ok(!t.includes(x), x);
    assert.equal(new Set(t).size, t.length, 'sans doublon');
  });
  test('rappel mensuel : jamais sauvegardé ou 30 jours et plus', () => {
    const now = new Date('2026-11-16T10:00:00');
    assert.deepEqual(plain(B.rappelSauvegarde(null, now)), { du: true, jours: null });
    assert.deepEqual(plain(B.rappelSauvegarde('2026-11-01T10:00:00', now)), { du: false, jours: 15 });
    assert.deepEqual(plain(B.rappelSauvegarde('2026-10-17T09:00:00', now)), { du: true, jours: 30 });
  });
  test('fichier : nom daté, résumé, et clés de l\'ancien format pour l\'import', () => {
    const now = new Date('2026-11-16T10:00:00');
    assert.equal(B.nomFichierSauvegarde(now), 'tribu-et-toutous-sauvegarde-2026-11-16.json');
    const d = B.construireSauvegarde({ tables: { recettes: [{ id: 'r1' }, { id: 'r2' }], reglages: [{ store_name: 'U' }], planning_repas: [{ id: 'p1' }] }, foyer: { id: 'f', nom: 'Maison' }, compte: 'a@b.c', maintenant: now });
    assert.equal(d.format, 'tribu-et-toutous/sauvegarde');
    assert.deepEqual(plain(d.resume), { tables: 3, lignes: 4 });
    assert.equal(d.recipes.length, 2);
    assert.equal(d.settings.store_name, 'U');
    assert.equal(d.meal_plan.length, 1);
    assert.deepEqual(plain(d.product_links), []);
  });
});

describe('univers : couleurs des membres, scan, Forme', () => {
  const hexa = /^#[0-9a-f]{6}$/i;
  for (const id of ['carnet', 'washi', 'herbier', 'cocon', 'kermesse']) {
    test(`${id} : six couleurs de membres définies et toutes différentes`, () => {
      const t = jetons(id);
      const c = [1, 2, 3, 4, 5, 6].map((i) => t[`m${i}`]);
      c.forEach((x, i) => assert.match(x || '', hexa, `${id} --m${i + 1}`));
      assert.equal(new Set(c.map((x) => x.toLowerCase())).size, 6, `${id} : ${c.join(' ')}`);
      // Assez éloignées deux à deux pour se distinguer d'un coup d'œil (écart RVB).
      const rvb = (h) => [1, 3, 5].map((k) => parseInt(h.substr(k, 2), 16));
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
        const [a, b] = [rvb(c[i]), rvb(c[j])];
        assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 60, `${id} : --m${i + 1} et --m${j + 1} trop proches`);
      }
    });
  }
  test('Forme : les choix cochés sont sur un fond clair (encre ≥ 4,5:1), plus sur --sky', () => {
    const pont = CSS.slice(CSS.indexOf(':root[data-univers] .forme[data-amb]'), CSS.indexOf('@media (prefers-reduced-motion'));
    assert.match(pont, /--f-accent-2: var\(--primary-soft\)/);
  });
  test('Scan : le champ du code-barres a un texte foncé dans les univers (fond clair)', () => {
    assert.match(CSS, /:root\[data-univers\] \.manual \.input \{ color: var\(--ink\); \}/);
    assert.match(CSS, /:root\[data-univers\] \.manual \.input::placeholder \{ color: var\(--muted\);/);
  });
});
