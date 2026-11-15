// ---------------------------------------------------------------------------
// Écrans du cœur rangés dans les 5 onglets, et premiers analyseurs du bouton « + ».
// Accueil : Ma journée, Famille (module accueil-famille), Suivi nutritionnel.
//   Le suivi nutritionnel va dans Accueil et non dans Cuisine : il porte sur la personne (journal
//   alimentaire, poids, budget calorique du jour, données « soi seul »), comme « Ma journée » qui y mène,
//   alors que Cuisine regroupe ce que le foyer partage (repas, courses, recettes).
// Cuisine : Repas, Courses, Recettes, Batch (masquable), Scan. Forme : le module Forme.
// Plus : réglages et outils (les écrans à venir sont des modules de src/js/modules/).
// ---------------------------------------------------------------------------
Modules.register({ id: 'aujourdhui', onglet: 'accueil', segment: 'Ma journée', ordre: 10, libelle: () => APP_NAME, rendu: () => renderToday() });
Modules.register({ id: 'suivi', onglet: 'accueil', segment: 'Suivi', ordre: 30, libelle: 'Suivi nutritionnel', rendu: () => renderSuivi() });

Modules.register({
  id: 'planning', onglet: 'cuisine', segment: 'Repas', ordre: 10, libelle: 'Ma semaine', rendu: () => renderPlanning(),
  // Repas de la semaine chargée, pour l'agenda familial.
  agenda: (debut, fin) => state.plan.filter((p) => p.recipe_id || p.reste_id).map((p) => {
    const date = isoDate(addDays(typeof p.week === 'string' ? isoToDate(p.week) : state.week, Number(p.day) || 0));
    const r = p.recipe_id ? recipeById(p.recipe_id) : null;
    return { id: `repas:${p.week}:${p.day}:${p.slot}`, date, heure: SLOT_TIME[p.slot] || null, titre: r?.title || 'Reste', detail: slotLabel(p.slot), act: 'tab', data: { tab: 'planning' } };
  }),
});
Modules.register({ id: 'courses', onglet: 'cuisine', segment: 'Courses', ordre: 20, libelle: 'Liste de courses', rendu: () => renderCourses() });
Modules.register({ id: 'recettes', onglet: 'cuisine', segment: 'Recettes', ordre: 30, libelle: 'Mes recettes', rendu: () => renderRecipes() });
Modules.register({ id: 'batch', onglet: 'cuisine', segment: 'Batch', ordre: 40, libelle: 'Batch cooking', masquable: true, rendu: () => renderBatchTab() });
Modules.register({ id: 'scan', onglet: 'cuisine', segment: 'Scan', ordre: 50, libelle: 'Scanner un produit', rendu: () => renderScan() });

Modules.register({ id: 'forme', onglet: 'forme', segment: 'Forme', ordre: 10, libelle: 'Forme', rendu: () => renderForme() });

Modules.register({ id: 'plus', onglet: 'plus', libelle: 'Plus', rendu: () => Nav.menuPlus() });
Modules.register({ id: 'reglages', onglet: 'plus', segment: 'Réglages', ordre: 10, icone: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'), description: 'Compte, foyer, magasin, rappels', ouvrir: () => openSettings() });
Modules.register({ id: 'monsieur-cuisine', onglet: 'plus', segment: 'Monsieur Cuisine', ordre: 40, icone: ICON.chef, description: 'Planning, courses et recettes du robot', ouvrir: () => mcSheet() });
// Sauvegarde (Plus › Sauvegarde) : module univers-securite (src/js/modules/univers-securite.js).
Modules.register({ id: 'widget', onglet: 'plus', segment: 'Widget', ordre: 70, icone: I('<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/>'), description: 'Le résumé du jour sur l\'écran d\'accueil', ouvrir: () => widgetSheet() });

// Analyseurs du cœur : article de courses, repas, séance. Les événements et les tâches viennent des modules agenda et taches.
const ARTICLE_VERBE = /^\s*(?:acheter|achète|achete|ajoute[rz]?|prendre|racheter|il (?:faut|manque)|plus de|courses?\s*:?)\s+/i;
const ARTICLE_DET = /^(?:du|de la|de l'|de l’|des|de|d'|d’|un|une|le|la|les|l'|l’)\s*/i;
function analyseArticles(texte) {
  const verbe = ARTICLE_VERBE.test(texte);
  const items = texte.replace(ARTICLE_VERBE, '').split(/\s*(?:,|;|\n|\bet\b|\+)\s*/i).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.match(/^(\d+(?:[.,]\d+)?\s*(?:kg|g|l|cl|ml|x)?)\s+(.*)$/i);
    const nom = (m ? m[2] : x).replace(ARTICLE_DET, '').trim();
    return { nom: nom.charAt(0).toUpperCase() + nom.slice(1), qte: m ? m[1].replace(/\s+/g, ' ') : '' };
  }).filter((a) => a.nom.length > 1);
  return { verbe, items };
}
AjoutRapide.ajouter({
  module: 'courses', type: 'article', libelle: 'Article',
  analyser(texte) {
    const { verbe, items } = analyseArticles(texte);
    if (!items.length) return null;
    return { score: verbe ? 0.8 : 0.25, resume: items.map((a) => (a.qte ? `${a.qte} ${a.nom}` : a.nom)).join(', '), donnees: items };
  },
  async enregistrer(items) {
    for (const a of items) await Data.addExtra(a.nom, a.qte, guessAisle(a.nom));
    return items.length > 1 ? `${items.length} articles ajoutés aux courses` : 'Ajouté aux courses';
  },
  ouvrir() { switchTab('courses'); setTimeout(() => $('[data-form="extra"] [name="xname"]')?.focus(), 100); },
});
AjoutRapide.ajouter({
  module: 'suivi', type: 'repas', libelle: 'Repas',
  analyser(texte) {
    const t = sansAccents(texte);
    const mot = /\b(mange|manger|repas|dejeuner|diner|petit[- ]dej|gouter|collation|bu|bois)\b/.test(t);
    return { score: mot ? 0.7 : 0.15, resume: 'au journal du jour', donnees: texte };
  },
  ouvrir(texte) {
    journalAdd(defaultSlot());
    const champ = $('.sheet-wrap.open [data-form="nlp"] [name="txt"]');
    if (champ && texte) champ.value = texte;
  },
});
AjoutRapide.ajouter({
  module: 'forme', type: 'seance', libelle: 'Séance',
  analyser(texte) {
    const t = sansAccents(texte);
    if (!/\b(course|courir|footing|jogging|trail|renfo|renforcement|seance|velo|natation|nage|yoga|muscu|marche|rando)\b/.test(t)) return null;
    return { score: 0.6, resume: 'ouvrir Forme', donnees: texte };
  },
  ouvrir() { switchTab('forme'); },
});
