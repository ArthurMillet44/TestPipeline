#!/usr/bin/env node
// Lit CHANGELOG.md et affiche la version en tete (la plus recente).
// Utilise par la CI apres le merge de la PR develop -> main pour savoir
// quel tag creer sur le commit de merge.

const fs = require('fs');
const path = require('path');
const { extractLatestVersion } = require('./lib/changelog.cjs');

const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');

const content = fs.existsSync(CHANGELOG_PATH) ? fs.readFileSync(CHANGELOG_PATH, 'utf8') : '';
const version = extractLatestVersion(content);

if (!version) {
  console.error('Aucune version trouvee en tete de CHANGELOG.md.');
  process.exit(1);
}

console.log(version);
