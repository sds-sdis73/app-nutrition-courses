
// Tous les modules sont enregistrés : barre d'onglets.
Nav.construire();
document.title = APP_NAME;
// Différé : on ne rappelle pas Supabase depuis l'intérieur du callback d'authentification.
db.auth.onAuthStateChange((_event, session) => { setTimeout(() => onSession(session), 0); });
