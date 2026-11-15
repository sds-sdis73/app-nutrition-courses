// Module « Univers graphique » : emplacement réservé, à construire (voir LISEZMOI.md).
Modules.register({
  id: 'univers',
  onglet: 'plus',
  segment: 'Univers',
  ordre: 20,
  libelle: 'Univers graphique',
  icone: I('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.8-9-7.8z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15.5" cy="7.5" r="1"/>'),
  description: 'Bientôt ici',
  rendu: () => Modules.bientot('Univers graphique', 'Chacun choisit son univers : carnet, washi, herbier, cocon ou kermesse.'),
});
