// Module « Agenda familial » : emplacement réservé, à construire (voir LISEZMOI.md).
Modules.register({
  id: 'agenda',
  onglet: 'famille',
  segment: 'Agenda',
  ordre: 10,
  libelle: 'Agenda familial',
  rendu: () => Modules.bientot('Agenda familial', 'Une couleur par membre, les vues jour, semaine et mois, les vacances scolaires et les liens avec vos autres agendas.'),
});
