// Module « Album de famille » : emplacement réservé, à construire (voir LISEZMOI.md).
Modules.register({
  id: 'photos',
  onglet: 'famille',
  segment: 'Photos',
  ordre: 40,
  libelle: 'Album de famille',
  rendu: () => Modules.bientot('Album de famille', 'L\'album privé du foyer, les liens vers vos albums partagés et la gazette des grands-parents.'),
});
