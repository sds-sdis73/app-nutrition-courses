// Après la connexion Lidl, accounts.lidl.com redirige vers l'adresse de l'appli Monsieur Cuisine
// (lidl-com.monsieur-cuisine.Companion://login/prod?code=…), que le navigateur abandonne sans l'afficher.
// On lit cette adresse dans l'en-tête Location de la réponse et on l'affiche dans une page de l'extension.
// Inspiré du « Login-Helfer » de ha-monsieur-cuisine (MrVain74, licence MIT).
const PREFIXE = "lidl-com.monsieur-cuisine.Companion://login/prod";
let derniere = "";

function afficher(adresse, tabId) {
  if (!adresse.startsWith(PREFIXE) || !adresse.includes("code=") || adresse === derniere) return;
  derniere = adresse;
  const page = chrome.runtime.getURL(`code.html#${encodeURIComponent(adresse)}`);
  if (typeof tabId === "number" && tabId >= 0) chrome.tabs.update(tabId, { url: page });
  else chrome.tabs.create({ url: page });
}

chrome.webRequest.onHeadersReceived.addListener((d) => {
  const loc = (d.responseHeaders || []).find((h) => h.name.toLowerCase() === "location");
  if (loc?.value) afficher(loc.value, d.tabId);
}, { urls: ["https://accounts.lidl.com/*"] }, ["responseHeaders"]);

chrome.webRequest.onBeforeRedirect.addListener((d) => {
  if (d.redirectUrl) afficher(d.redirectUrl, d.tabId);
}, { urls: ["https://accounts.lidl.com/*"] });
