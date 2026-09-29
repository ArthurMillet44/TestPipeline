#!/usr/bin/env node
// Verifie que le nom de la branche respecte la convention du projet
// (<type>/<description-courte>) avant de la pousser vers le remote.
// Lit sur stdin les refs a pousser, au format fourni par git pour le hook pre-push :
// <local ref> SP <local sha1> SP <remote ref> SP <remote sha1> LF

const readline = require('readline');

const TYPES = ['feature', 'fix', 'hotfix', 'refactor', 'docs', 'test', 'chore', 'ci'];
const PROTECTED_BRANCHES = ['main', 'master', 'develop'];
const BRANCH_REGEX = new RegExp(`^(${TYPES.join('|')})/[a-z0-9]+(-[a-z0-9]+)*$`);
const ZERO_SHA = /^0+$/;

function fail(branch, problem, example) {
  console.error('');
  console.error('Push refuse : le nom de la branche ne respecte pas la convention du projet.');
  console.error(`Branche       : "${branch}"`);
  console.error(`Probleme      : ${problem}`);
  if (example) {
    console.error(`Exemple valide: "${example}"`);
  }
  console.error('');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
const lines = [];

rl.on('line', (line) => {
  if (line.trim()) lines.push(line);
});

rl.on('close', () => {
  for (const line of lines) {
    const [localRef, localSha] = line.split(' ');

    if (!localRef || !localRef.startsWith('refs/heads/')) {
      continue;
    }

    // Suppression d'une branche distante : le sha local est a zero, rien a verifier.
    if (ZERO_SHA.test(localSha)) {
      continue;
    }

    const branch = localRef.replace('refs/heads/', '');

    if (PROTECTED_BRANCHES.includes(branch)) {
      continue;
    }

    if (!BRANCH_REGEX.test(branch)) {
      fail(
        branch,
        `le nom ne suit pas le format "<type>/<description-courte>". Types autorises : ${TYPES.join(', ')}.`,
        'feature/authentification-utilisateur',
      );
    }
  }

  process.exit(0);
});
