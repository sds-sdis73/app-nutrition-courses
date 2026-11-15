// Module « Carnet de la famille » : emplacement réservé, à construire (voir LISEZMOI.md).
Modules.register({
  id: 'carnet',
  onglet: 'famille',
  segment: 'Carnet',
  ordre: 50,
  libelle: 'Carnet de la famille',
  rendu: () => Modules.bientot('Carnet de la famille', 'Santé et vaccins, maison et animaux, budget du mois et contacts utiles.'),
});
