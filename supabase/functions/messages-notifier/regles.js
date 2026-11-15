// Règle d'envoi des notifications de messages et de photos (fonctions pures, vérifiées par
// tests/unit/messages-photos.test.js). Mêmes réglages que send-reminders : la ligne notif_prefs de la personne,
// puis ses anciens réglages d'appareil (push_abonnements.prefs), puis les valeurs par défaut — heures de silence
// de 22 h à 7 h comprises, même pour un compte qui n'a jamais ouvert Plus › Notifications.
import { enSilence, prefsEffectives, veut } from '../send-reminders/regles.js';

// Type de la fonction → interrupteur de l'écran Plus › Notifications.
export const CLE_NOTIF = { message: 'messages', photo: 'photo' };

// Ancien format d'appareil : prefs.silence = { debut: "22:00", fin: "07:00" } ou prefs.silence_debut / silence_fin.
function ancienSilence(prefs, heure) {
  const debut = String(prefs?.silence?.debut ?? prefs?.silence_debut ?? '');
  const fin = String(prefs?.silence?.fin ?? prefs?.silence_fin ?? '');
  if (!/^\d{2}:\d{2}$/.test(debut) || !/^\d{2}:\d{2}$/.test(fin) || debut === fin) return false;
  return debut < fin ? heure >= debut && heure < fin : heure >= debut || heure < fin;
}

// Faut-il ne PAS prévenir cet appareil ? np : ligne notif_prefs du compte (ou undefined) ; ancien : push_abonnements.prefs ;
// type : « message » ou « photo » ; heure : « HH:MM », heure de Paris.
export function couper(np, ancien, type, heure) {
  const cle = CLE_NOTIF[type] ?? type;
  const a = ancien || {};
  const p = prefsEffectives(np || null, a);
  // Interrupteur : la ligne notif_prefs d'abord, puis l'ancien réglage de l'appareil (« messages » ou « message »).
  const choix = typeof np?.types?.[cle] === 'boolean' ? np.types[cle] : [a[cle], a[type]].find((v) => typeof v === 'boolean');
  if (choix === false || !veut(p, cle)) return true;
  if (enSilence(p, Number(String(heure).slice(0, 2)))) return true;
  return !np && ancienSilence(a, heure); // l'ancienne plage d'un appareil, tant que la personne n'a rien réglé
}
