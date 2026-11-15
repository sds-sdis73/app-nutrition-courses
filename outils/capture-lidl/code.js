const champ = document.getElementById("adresse");
champ.value = decodeURIComponent(location.hash.slice(1));
document.getElementById("copier").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(champ.value); }
  catch { champ.select(); document.execCommand("copy"); }
  document.getElementById("etat").textContent = "Copiée. Collez-la maintenant dans Miam & moi.";
  document.getElementById("etat").className = "ok";
});
