#!/usr/bin/env node
// Verifie que le titre de la pull request respecte Conventional Commits.
// Destine a etre lance en CI (GitHub Actions) : le titre d'une PR n'est pas
// un objet git local, donc inaccessible depuis un hook git.

const { validateHeader } = require('./lib/validate-header.cjs');

const title = process.env.PR_TITLE;

if (typeof title !== 'string') {
  console.error('Variable d\'environnement PR_TITLE manquante.');
  process.exit(1);
}

function fail(problem, example) {
  console.error('');
  console.error('Pull request refusee : le titre ne respecte pas le format Conventional Commits.');
  console.error(`Titre recu    : "${title}"`);
  console.error(`Probleme      : ${problem}`);
  if (example) {
    console.error(`Exemple valide: "${example}"`);
  }
  console.error('');
  process.exit(1);
}

const result = validateHeader(title.trim());

if (!result.valid) {
  fail(result.problem, result.example);
}

process.exit(0);
