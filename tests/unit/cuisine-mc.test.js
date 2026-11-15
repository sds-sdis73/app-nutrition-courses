// Module « Cuisine reliée à Monsieur Cuisine » : quantités, fusion des doublons, rayons, matériel, placard,
// surcharges, coches, recettes (ingrédients, nutrition) et planning.
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./_app');

const m = app.modules['cuisine-mc'];
const plain = (o) => JSON.parse(JSON.stringify(o));
const articles = (l) => [...l.rayons, ...l.finis].flatMap((r) => r.articles);
const article = (l, cle) => articles(l).find((a) => a.cle === cle);

describe('cuisine-mc : quantités et unités', () => {
  test('nombres écrits par Monsieur Cuisine', () => {
    assert.equal(m.lireNombre('15'), 15);
    assert.equal(m.lireNombre('½'), 0.5);
    assert.equal(m.lireNombre('1 ½'), 1.5);
    assert.equal(m.lireNombre('1/2'), 0.5);
    assert.equal(m.lireNombre('2 1/2'), 2.5);
    assert.equal(m.lireNombre('2,5'), 2.5);
    assert.equal(m.lireNombre('2-3'), 3);
    assert.equal(m.lireNombre(''), null);
    assert.equal(m.lireNombre(null), null);
    assert.equal(m.lireNombre('quelques'), null);
  });
  test('quantité saisie à la main : nombre et unité', () => {
    assert.deepEqual(plain(m.decouperQuantite('500 g')), { v: 500, unite: 'g' });
    assert.deepEqual(plain(m.decouperQuantite('1,5 kg')), { v: 1.5, unite: 'kg' });
    assert.deepEqual(plain(m.decouperQuantite('2')), { v: 2, unite: '' });
    assert.deepEqual(plain(m.decouperQuantite('')), { v: null, unite: '' });
  });
  test('unités de base compatibles (g/kg, ml/cl/l, cuillères, pièces)', () => {
    assert.deepEqual(plain(m.uniteBase('kg')), { base: 'g', mult: 1000 });
    assert.deepEqual(plain(m.uniteBase('cl')), { base: 'ml', mult: 10 });
    assert.deepEqual(plain(m.uniteBase('c.c.')), { base: 'cc', mult: 1 });
    assert.deepEqual(plain(m.uniteBase(' c.s.')), { base: 'cc', mult: 3 });
    assert.deepEqual(plain(m.uniteBase('cuillère à café')), { base: 'cc', mult: 1 });
    assert.deepEqual(plain(m.uniteBase('cuillères à soupe')), { base: 'cc', mult: 3 });
    assert.deepEqual(plain(m.uniteBase('pincer')), { base: 'pincée', mult: 1 });
    assert.deepEqual(plain(m.uniteBase('gousses')), { base: 'gousse', mult: 1 });
    assert.deepEqual(plain(m.uniteBase(null)), { base: 'pièce', mult: 1 });
    assert.deepEqual(plain(m.uniteBase('barquette')), { base: 'barquette', mult: 1 });
  });
  test('affichage des quantités', () => {
    assert.equal(m.formatQuantite('g', 750), '750 g');
    assert.equal(m.formatQuantite('g', 1250), '1,3 kg');
    assert.equal(m.formatQuantite('ml', 450), '450 ml');
    assert.equal(m.formatQuantite('ml', 1500), '1,5 l');
    assert.equal(m.formatQuantite('cc', 1), '1 c. à c.');
    assert.equal(m.formatQuantite('cc', 6), '2 c. à s.');
    assert.equal(m.formatQuantite('pièce', 1.4), '2');
    assert.equal(m.formatQuantite('gousse', 3), '3 gousses');
    assert.equal(m.formatQuantite('pincée', 1), '1 pincée');
    assert.equal(m.formatQuantites({ 'pièce': 2, g: 300 }), '300 g + 2');
    assert.equal(m.uniteLisible('c.s.'), 'c. à s.');
    assert.equal(m.uniteLisible(''), '');
  });
});

describe('cuisine-mc : noms, clés et matériel', () => {
  test('nom nettoyé : précisions entre parenthèses, après virgule, « à volonté »', () => {
    assert.equal(m.nettoyerNom('yaourt nature, grec (10 % M.G.)'), 'yaourt nature');
    assert.equal(m.nettoyerNom('Œuf (calibre M)'), 'Œuf');
    assert.equal(m.nettoyerNom('Sucre à volonté'), 'Sucre');
    assert.equal(m.nettoyerNom('Matière grasse pour le plat'), 'Matière grasse');
  });
  test('unité écrite dans le nom (« brins de persil », « Gousses d’ail »)', () => {
    assert.deepEqual(plain(m.analyserLigne({ nom: 'brins de persil', quantite: '15', unite: null })), { nom: 'Persil', cle: 'persil', base: 'brin', v: 15 });
    assert.deepEqual(plain(m.analyserLigne({ nom: 'Gousses d’ail', quantite: '2' })), { nom: 'Ail', cle: 'ail', base: 'gousse', v: 2 });
    assert.deepEqual(plain(m.analyserLigne({ nom: 'cumin, moulu', quantite: '½', unite: 'c.c.' })), { nom: 'Cumin', cle: 'cumin', base: 'cc', v: 0.5 });
  });
  test('même clé pour le singulier et le pluriel', () => {
    assert.equal(m.cleArticle('Huiles d\'olive'), m.cleArticle('huile d\'olive'));
    assert.equal(m.cleArticle('Oignons'), m.cleArticle('oignon'));
  });
  test('matériel reconnu, aliments gardés', () => {
    for (const x of ['plat à gratin  (20 x 35 cm)', 'Moule à manqué', 'Cercle à pâtisserie', 'Poche à douille', 'ramequins']) assert.ok(m.estMateriel(x), x);
    for (const x of ['crème fouettée', 'Moules de bouchot', 'Matière grasse pour le plat', 'Plat de côtes', 'Bolets', 'Papier cuisson']) assert.ok(!m.estMateriel(x), x);
  });
});

describe('cuisine-mc : rayons dans l\'ordre du supermarché', () => {
  test('ordre des rayons', () => {
    const R = plain(m.RAYONS);
    assert.equal(R[0], 'Fruits & légumes');
    for (const [a, b] of [['Fruits & légumes', 'Boulangerie'], ['Boulangerie', 'Boucherie'], ['Boucherie', 'Poissonnerie'], ['Poissonnerie', 'Crèmerie & œufs'], ['Crèmerie & œufs', 'Fromages'],
      ['Fromages', 'Épicerie salée'], ['Épicerie sucrée', 'Conserves'], ['Conserves', 'Surgelés'], ['Surgelés', 'Boissons'], ['Boissons', 'Hygiène & beauté'], ['Hygiène & beauté', 'Entretien & maison'], ['Entretien & maison', 'Bébé'], ['Bébé', 'Animaux']]) {
      assert.ok(R.indexOf(a) < R.indexOf(b), `${a} avant ${b}`);
    }
  });
  test('rayon du nom d\'abord, catégorie Monsieur Cuisine si le nom est inconnu', () => {
    assert.equal(m.rayonDe('brins de persil', 'Bœuf'), 'Herbes & épices');
    assert.equal(m.rayonDe('saumon', null), 'Poissonnerie');
    assert.equal(m.rayonDe('viande hachée de bœuf', 'Bœuf'), 'Boucherie');
    assert.equal(m.rayonDe('croquettes', null), 'Animaux');
    assert.equal(m.rayonDe('couches', null), 'Bébé');
    assert.equal(m.rayonDe('Truc mystère', 'Produits laitiers'), 'Crèmerie & œufs');
    assert.equal(m.rayonDe('Truc mystère', 'Légumes'), 'Fruits & légumes');
    assert.equal(m.rayonDe('Truc mystère', null), 'Autres');
    assert.equal(m.rayonMc('Volaille'), 'Boucherie');
    assert.equal(m.rayonMc('Riz & céréales'), 'Épicerie salée');
  });
});

describe('cuisine-mc : construction de la liste', () => {
  const lignes = [
    { nom: 'Gousses d\'ail', quantite: '2', source: 'mc', recette: 'Keftas' },
    { nom: 'ail', quantite: '1', unite: 'gousse', source: 'mc', recette: 'Soupe' },
    { nom: 'Lait', quantite: '20', unite: 'cl', source: 'mc' },
    { nom: 'lait', quantite: '250', unite: 'ml', source: 'miam', recette: 'Purée' },
    { nom: 'Carottes', quantite: '1', unite: 'kg', source: 'mc' },
    { nom: 'carotte', quantite: '300', unite: 'g', source: 'mc' },
    { nom: 'carotte', quantite: '2', source: 'mc' },
    { nom: 'plat à gratin  (20 x 35 cm)', source: 'mc' },
    { nom: 'Sel', quantite: '1', unite: 'c.c.', source: 'mc' },
    { nom: 'Lessive', quantite: '1', source: 'ajout', ajoutId: 'a1' },
    { nom: 'Yaourts', quantite: '', source: 'mc', categorie: 'Produits laitiers' },
  ];
  const placard = (cle) => (cle === 'sel' ? { type: 'basique' } : null);

  test('doublons fusionnés, quantités compatibles additionnées', () => {
    const l = m.construireListe(lignes, { placard });
    assert.equal(article(l, 'ail').quantite, '3 gousses');
    assert.deepEqual(plain(article(l, 'ail').recettes), ['Keftas', 'Soupe']);
    assert.equal(article(l, 'lait').quantite, '450 ml');
    assert.equal(article(l, 'carotte').quantite, '1,3 kg + 2');
    assert.equal(article(l, 'yaourt').quantite, '');
  });
  test('matériel retiré, placard mis de côté, ajouts gardés même au placard', () => {
    const l = m.construireListe(lignes, { placard: (cle) => (['sel', 'lessive'].includes(cle) ? { type: 'basique' } : null) });
    assert.deepEqual(plain(l.materiel), ['plat à gratin']);
    assert.deepEqual(plain(l.placard.map((a) => a.cle)), ['sel']);
    assert.ok(article(l, 'lessive'), 'un ajout à la main reste dans la liste');
    assert.deepEqual(plain(article(l, 'lessive').ajoutIds), ['a1']);
  });
  test('rayons triés, rayon courant en haut et rayons terminés à la fin', () => {
    const maintenant = new Date('2026-10-21T12:00:00');
    const l = m.construireListe(lignes, { placard, maintenant, modifs: { ail: { cle: 'ail', coche: true, coche_le: '2026-10-21T11:50:00' }, carotte: { cle: 'carotte', coche: true, coche_le: '2026-10-21T11:51:00' } } });
    assert.equal(l.courant, 'Crèmerie & œufs');
    assert.deepEqual(plain(l.finis.map((r) => r.nom)), ['Fruits & légumes']);
    assert.deepEqual(plain(l.rayons.map((r) => r.nom)), ['Crèmerie & œufs', 'Entretien & maison']);
    assert.equal(l.coches, 2);
    assert.equal(l.total, 5);
  });
  test('surcharges appliquées par-dessus la synchro : nom, quantité, précision, rayon, masqué, racheter', () => {
    const modifs = {
      lait: { cle: 'lait', nom: 'Lait demi-écrémé', quantite: '1', unite: 'l', precision: 'bio' },
      carotte: { cle: 'carotte', rayon: 'Surgelés' },
      yaourt: { cle: 'yaourt', masque: true },
      sel: { cle: 'sel', forcer: true },
    };
    const l = m.construireListe(lignes, { placard, modifs });
    const lait = article(l, 'lait');
    assert.equal(lait.nom, 'Lait demi-écrémé');
    assert.equal(lait.quantite, '1 l');
    assert.equal(lait.origine, '450 ml');
    assert.equal(lait.precision, 'bio');
    assert.ok(lait.modifie);
    assert.equal(article(l, 'carotte').rayon, 'Surgelés');
    assert.deepEqual(plain(l.masques.map((a) => a.cle)), ['yaourt']);
    assert.ok(article(l, 'sel'), 'racheter même si au placard');
    assert.equal(l.placard.length, 0);
  });
  test('une coche expire après 7 jours', () => {
    const maintenant = new Date('2026-10-21T12:00:00');
    assert.ok(m.cocheActive({ coche: true, coche_le: '2026-10-18T10:00:00' }, maintenant));
    assert.ok(!m.cocheActive({ coche: true, coche_le: '2026-10-10T10:00:00' }, maintenant));
    assert.ok(!m.cocheActive({ coche: false }, maintenant));
    assert.ok(!m.cocheActive(null, maintenant));
  });
  test('texte à partager : articles restants par rayon', () => {
    const l = m.construireListe(lignes, { placard, maintenant: new Date('2026-10-21T12:00:00'), modifs: { ail: { cle: 'ail', coche: true, coche_le: '2026-10-21T11:00:00' } } });
    const t = m.texteListe(l, 'Courses');
    assert.match(t, /^Courses\n\nFRUITS & LÉGUMES\n- Carottes : 1,3 kg \+ 2\n/);
    assert.doesNotMatch(t, /Ail/);
    assert.match(t, /- Lait : 450 ml/);
  });
});

describe('cuisine-mc : recettes et nutrition', () => {
  before(() => app.ready);
  const courses = [
    { nom: 'Poireaux', quantite: '500', unite: 'g', recette: 'Quiche aux poireaux' },
    { nom: 'Crème fraîche', quantite: '20', unite: 'cl', recette: 'Quiche aux poireaux' },
    { nom: 'Riz', quantite: '200', unite: 'g', recette: 'Autre recette' },
  ];
  test('ingrédients : ceux de la recette, sinon ceux de la liste de courses, sinon aucun', () => {
    const nommee = { titre: 'Gratin', ingredients: [{ nom: 'Chou-fleur', quantite: '800', unite: 'g', groupe: '' }] };
    assert.equal(m.ingredientsRecette(nommee, courses).source, 'recette');
    const sansNoms = { titre: 'Quiche aux poireaux', ingredients: [{ nom: '', quantite: '500', unite: 'g' }] };
    const r = m.ingredientsRecette(sansNoms, courses);
    assert.equal(r.source, 'courses');
    assert.deepEqual(plain(r.lignes.map((l) => l.nom)), ['Poireaux', 'Crème fraîche']);
    assert.equal(m.ingredientsRecette({ titre: 'Inconnue', ingredients: [] }, courses).source, null);
  });
  test('étapes : texte, sinon titre en phrase ; étapes « Mode » du robot et doublons retirés', () => {
    const e = m.etapesLisibles([{ titre: 'Hacher', texte: 'Hacher le persil 5 s.' }, { titre: 'Mode', texte: null }, { titre: 'Mettre le beurre dans le bol', texte: '' }, { titre: 'x', texte: 'Hacher le persil 5 s.' }]);
    assert.deepEqual(plain(e), ['Hacher le persil 5 s.', 'Mettre le beurre dans le bol']);
    assert.deepEqual(plain(m.etapesLisibles(null)), []);
  });
  test('ingrédient converti pour la table Ciqual', () => {
    assert.deepEqual(plain(m.versIngredientCoeur({ nom: 'Lait', quantite: '20', unite: 'cl' })), { name: 'Lait', qty: '200', unit: 'ml' });
    assert.deepEqual(plain(m.versIngredientCoeur({ nom: 'sel', quantite: '1 ½', unite: 'c.c.' })), { name: 'Sel', qty: '1.5', unit: 'c. à c.' });
    assert.deepEqual(plain(m.versIngredientCoeur({ nom: 'Œuf (calibre M)', quantite: '2' })), { name: 'Œuf', qty: '2', unit: 'pièce' });
    assert.deepEqual(plain(m.versIngredientCoeur({ nom: 'brins de persil', quantite: '10' })), { name: 'Persil', qty: '10', unit: 'g' });
  });
  test('valeurs de Monsieur Cuisine en secours', () => {
    const n = m.nutrimentsMc([{ name: 'Calories', unit: 'kcal', amount: 440 }, { name: 'Carbohydrate', amount: 15 }, { name: 'Fat', amount: 31 }, { name: 'Protein', amount: 25 }]);
    assert.equal(n.kcal, 440);
    assert.equal(n.gluc, 15);
    assert.equal(n.lip, 31);
    assert.equal(n.prot, 25);
    assert.equal(m.nutrimentsMc(null), null);
    assert.equal(m.nutrimentsMc([{ name: 'Protein', amount: 3 }]), null);
  });
  test('calcul Ciqual d\'une recette Monsieur Cuisine avec le cœur (recipeNutrition)', () => {
    const lignes = m.ingredientsRecette({ titre: 'Quiche aux poireaux' }, courses).lignes;
    const rn = app.recipeNutrition({ ingredients: lignes.map(m.versIngredientCoeur), servings: 4 });
    assert.equal(rn.missing, 0);
    assert.ok(rn.perPortion.kcal > 80 && rn.perPortion.kcal < 300, String(rn.perPortion.kcal));
  });
});

describe('cuisine-mc : planning et accueil', () => {
  const lundi = app.isoToDate('2026-10-19');
  const plan = [
    { mc_id: '3', date: '2026-10-21', titre: 'Soupe', data: { order: 1 } },
    { mc_id: '2', date: '2026-10-21', titre: 'Quiche', data: { order: 0 } },
    { mc_id: '1', date: '2026-10-19', titre: 'Gratin', data: {} },
    { mc_id: '9', date: '2026-10-27', titre: 'Semaine suivante', data: {} },
  ];
  test('repas rangés par jour de la semaine, dans l\'ordre Monsieur Cuisine', () => {
    const j = m.repasDeLaSemaine(plan, lundi);
    assert.equal(j.length, 7);
    assert.deepEqual(plain(j[0].map((p) => p.titre)), ['Gratin']);
    assert.deepEqual(plain(j[2].map((p) => p.titre)), ['Quiche', 'Soupe']);
    assert.equal(j.flat().length, 3);
  });
  test('prochain repas : le premier avant 14 h, le dernier ensuite, sinon le jour suivant', () => {
    assert.equal(m.prochainRepas(plan, new Date('2026-10-21T11:00:00')).repas.titre, 'Quiche');
    assert.equal(m.prochainRepas(plan, new Date('2026-10-21T15:00:00')).repas.titre, 'Soupe');
    const r = m.prochainRepas(plan, new Date('2026-10-22T09:00:00'));
    assert.equal(r.repas.titre, 'Semaine suivante');
    assert.equal(r.aujourdhui, false);
    assert.equal(m.prochainRepas([], new Date()), null);
  });
  test('date de la dernière synchronisation en clair', () => {
    const now = new Date('2026-10-21T12:05:00');
    assert.equal(m.ilYa(null, now), 'jamais');
    assert.equal(m.ilYa('2026-10-21T12:04:40', now), 'à l\'instant');
    assert.equal(m.ilYa('2026-10-21T11:50:00', now), 'il y a 15 min');
    assert.equal(m.ilYa('2026-10-21T09:00:00', now), 'il y a 3 h');
    assert.equal(m.ilYa('2026-10-20T18:17:00', now), 'hier');
    assert.match(m.ilYa('2026-10-03T18:17:00', now), /^le 3 oct/);
  });
  test('le module est enregistré dans Cuisine, sans segment, avec son analyseur « article »', () => {
    const def = app.Modules.get('cuisine-mc');
    assert.equal(def.onglet, 'cuisine');
    assert.equal(def.segment, undefined);
    assert.equal(app.T.courses_modifs, 'courses_modifs');
    const props = app.AjoutRapide.analyser('acheter du lait et 2 kg de pommes', { maintenant: new Date(), membres: [] });
    assert.equal(props[0].type, 'article');
    assert.equal(props[0].analyseur.module, 'cuisine-mc');
    assert.equal(props[0].resume, 'Lait, 2 kg Pommes');
  });
});

describe('carte de liaison', () => {
  const t = (s) => String(s).replace(/<[^>]+>/g, '');
  test('jamais relié : pas de « dernières données conservées », et un renvoi vers l\'aide', () => {
    const r = plain(m.etatLiaison(null, false));
    assert.equal(r.jamais, true);
    assert.equal(r.etat, 'attente');
    assert.match(r.texte, /^Pas encore relié/);
    assert.doesNotMatch(r.texte, /conservées/);
  });
  test('liaison coupée avec des données : elles sont dites conservées', () => {
    assert.match(t(m.etatLiaison(null, true).texte), /Liaison coupée · dernières données conservées/);
    assert.match(t(m.etatLiaison({ statut: 'deconnecte', derniere_synchro: '2026-10-20T10:00:00Z' }, true).texte), /Liaison à refaire · dernières données conservées/);
    assert.match(m.etatLiaison({ statut: 'ok', derniere_synchro: '2026-10-21T09:00:00Z' }, true, () => 'il y a 3 h').texte, /^Synchronisé il y a 3 h/);
    assert.match(m.etatLiaison({ statut: 'ok', derniere_synchro: null }, false).texte, /en attente de la première synchronisation/);
  });
});
