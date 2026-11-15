// Module « Sécurité » : emplacement réservé, à construire (voir LISEZMOI.md).
Modules.register({
  id: 'securite',
  onglet: 'plus',
  segment: 'Sécurité',
  ordre: 50,
  libelle: 'Sécurité',
  icone: I('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  description: 'Bientôt ici',
  rendu: () => Modules.bientot('Sécurité', 'Face ID à l\'ouverture de l\'appli, avec un code en secours.'),
});
