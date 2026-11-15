#!/usr/bin/env node
/* ============================================================================
   ASSEMBLEUR : reconstruit index.html à partir de src/ (sans dépendance).

   Ordre d'assemblage :
     - styles  : src/css/*.css (ordre alphabétique, d'où les préfixes numériques),
                 puis src/css/modules/*.css ;
     - script  : src/js/00-*.js … 89-*.js (le cœur), puis src/js/modules/*.js
                 (un fichier par module, ordre alphabétique, chacun enveloppé dans
                 sa propre fonction pour que ses noms restent privés), puis
                 src/js/90-*.js … 99-*.js (le démarrage, une fois tous les modules
                 enregistrés).
   Le tout est inséré dans src/gabarit.html à la place de __STYLE__ et __SCRIPT__.
   forme-data.js, plats.json et aliments.json restent des fichiers séparés.

   Usage :  node tools/assemble.js              → écrit index.html
            node tools/assemble.js --verifier   → échoue si index.html n'est pas à jour
   Depuis un autre script : require('./tools/assemble.js').assembler() → texte HTML.
   ============================================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const SRC = path.join(RACINE, 'src');
const SORTIE = path.join(RACINE, 'index.html');
const lire = (p) => fs.readFileSync(p, 'utf8');
const avecFin = (t) => (t.endsWith('\n') ? t : `${t}\n`);
const fichiers = (dossier, ext) => (fs.existsSync(dossier) ? fs.readdirSync(dossier).filter((f) => f.endsWith(ext)).sort() : []);

// Un module : son code est enveloppé (portée privée) et repéré par un commentaire.
function envelopper(nom, code) {
  return `// ==== module ${nom} ====\n(function () {\n${avecFin(code)}})();\n`;
}

function styles() {
  const coeur = fichiers(path.join(SRC, 'css'), '.css').map((f) => avecFin(lire(path.join(SRC, 'css', f))));
  const mods = fichiers(path.join(SRC, 'css', 'modules'), '.css').map((f) => `/* ==== module ${f.replace(/\.css$/, '')} ==== */\n${avecFin(lire(path.join(SRC, 'css', 'modules', f)))}`);
  return [...coeur, ...mods].join('');
}

function script() {
  const js = fichiers(path.join(SRC, 'js'), '.js');
  const avant = js.filter((f) => !/^9\d-/.test(f));
  const apres = js.filter((f) => /^9\d-/.test(f));
  const mods = fichiers(path.join(SRC, 'js', 'modules'), '.js');
  return [
    ...avant.map((f) => avecFin(lire(path.join(SRC, 'js', f)))),
    ...mods.map((f) => envelopper(f.replace(/\.js$/, ''), lire(path.join(SRC, 'js', 'modules', f)))),
    ...apres.map((f) => avecFin(lire(path.join(SRC, 'js', f)))),
  ].join('');
}

function remplacer(texte, marque, valeur) {
  const i = texte.indexOf(marque);
  if (i < 0) throw new Error(`marque absente du gabarit : ${marque}`);
  if (texte.indexOf(marque, i + 1) >= 0) throw new Error(`marque en double : ${marque}`);
  return texte.slice(0, i) + valeur + texte.slice(i + marque.length);
}

function assembler() {
  let html = lire(path.join(SRC, 'gabarit.html'));
  const js = script();
  if (/<\/script/i.test(js)) throw new Error('« </script » interdit dans le code (écrire <\\/script>)');
  html = remplacer(html, '__STYLE__', styles());
  html = remplacer(html, '__SCRIPT__', js);
  return html;
}

// Liste des modules présents (pour les tests et la documentation).
const modules = () => fichiers(path.join(SRC, 'js', 'modules'), '.js').map((f) => f.replace(/\.js$/, ''));

if (require.main === module) {
  const html = assembler();
  if (process.argv.includes('--verifier')) {
    const actuel = fs.existsSync(SORTIE) ? lire(SORTIE) : '';
    if (actuel !== html) { console.error('index.html n\'est pas à jour : lancer « npm run build ».'); process.exit(1); }
    console.log('index.html est à jour.');
  } else {
    fs.writeFileSync(SORTIE, html);
    console.log(`index.html assemblé (${(html.length / 1024).toFixed(0)} Ko, ${modules().length} modules).`);
  }
}

module.exports = { assembler, modules, RACINE, SRC };
