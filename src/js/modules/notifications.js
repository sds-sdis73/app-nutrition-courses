// Module « Notifications » : emplacement réservé, à construire (voir LISEZMOI.md).
Modules.register({
  id: 'notifications',
  onglet: 'plus',
  segment: 'Notifications',
  ordre: 30,
  libelle: 'Notifications',
  icone: I('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  description: 'Bientôt ici',
  rendu: () => Modules.bientot('Notifications', 'Chacun choisit, une par une, les notifications qu\'il reçoit, et ses heures de silence.', `<button class="btn" data-act="rappels">${ICON.clock} Rappels actuels</button>`),
});
