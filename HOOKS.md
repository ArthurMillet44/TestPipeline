# Git hook — Conventional Commits

Ce projet bloque tout commit dont le message ne respecte pas la convention
[Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:`, `perf:`, `build:`, `ci:`, `revert:`...).

La vérification est faite par un hook git natif (`commit-msg`), installé par **Husky** et exécuté par **commitlint**. Elle s'applique quel que soit le point d'entrée : terminal, VSCode (panneau Source Control), GitKraken, etc., puisque tous passent par le même moteur git.

## Tests manuels à effectuer

### 1. Vérifier que les hooks sont bien installés
```bash
npm install
git config core.hooksPath
# doit afficher : .husky/_
```

### 2. Commit invalide en terminal → doit être rejeté
```bash
git commit --allow-empty -m "mauvais message"
```
Résultat attendu : commit refusé, commitlint affiche les erreurs (`subject may not be empty`, `type may not be empty`, etc.), code de sortie ≠ 0.

Autres messages invalides à tester :
```bash
git commit --allow-empty -m "Fix bug"          # type manquant/mauvais casse
git commit --allow-empty -m "feat sans deux points"
git commit --allow-empty -m "FEAT: majuscule"  # selon config, peut être rejeté
```

### 3. Commit valide en terminal → doit être accepté
```bash
git commit --allow-empty -m "feat: ajoute la validation des commits"
git commit --allow-empty -m "fix(auth): corrige le token expiré"
git commit --allow-empty -m "chore: met a jour les dependances"
```
Résultat attendu : commit créé sans erreur.

### 4. Test depuis VSCode
1. Modifier un fichier, le stager depuis l'onglet **Source Control**.
2. Taper un message non conventionnel dans le champ de message et cliquer sur **Commit**.
3. Vérifier que VSCode affiche une erreur (visible dans la notification ou l'onglet **Output → Git**) et qu'aucun commit n'est créé.
4. Recommencer avec un message conventionnel (`feat: ...`) → le commit doit passer.

### 5. Test avec un commit vide via une extension tierce (optionnel)
Si l'équipe utilise GitLens ou une autre extension pour commit, refaire le test 4 avec cet outil pour confirmer que le hook s'applique aussi (c'est le cas par construction, car ces outils utilisent le même binaire `git`).

### 6. Vérifier qu'un `git commit --no-verify` contourne volontairement le hook
```bash
git commit --allow-empty -m "mauvais message" --no-verify
```
Résultat attendu : commit accepté malgré le message invalide (comportement normal de git, `--no-verify` est une échappatoire volontaire qu'on ne peut pas empêcher côté client — la vraie garde-fou reste la vérification côté CI/serveur si besoin).

## Importer ce hook dans un autre projet

### Fichiers à copier
```
.husky/commit-msg        → le hook git (appelle commitlint)
commitlint.config.js     → la config des règles conventional commits
```

### Modifications à reporter dans le `package.json` cible
Ajouter dans `devDependencies` :
```json
{
  "devDependencies": {
    "husky": "^9.1.7",
    "@commitlint/cli": "^21.2.3",
    "@commitlint/config-conventional": "^21.2.3"
  }
}
```

Ajouter le script `prepare` (indispensable : c'est lui qui réinstalle les hooks pour chaque personne qui clone/`npm install` le projet) :
```json
{
  "scripts": {
    "prepare": "husky"
  }
}
```

### Commandes à exécuter dans le projet cible
```bash
# 1. Installer les dépendances (déclenche aussi "prepare" automatiquement)
npm install

# 2. Vérifier que le hook est bien actif
git config core.hooksPath
# doit afficher : .husky/_

# 3. Tester
git commit --allow-empty -m "message invalide"      # doit échouer
git commit --allow-empty -m "feat: message valide"  # doit réussir
```

> Si le projet cible n'a pas encore de `.git`, faire `git init` avant `npm install` : Husky a besoin d'un dépôt git pour configurer `core.hooksPath`.

### Cas particulier : monorepo / hooks à la racine uniquement
Le hook doit être installé à la racine du dépôt git (là où se trouve `.git/`), pas dans un sous-dossier `packages/xxx`. Si `package.json` (et donc `npm install`) vit dans un sous-dossier, adapter le script `prepare` avec le chemin relatif vers la racine, par exemple :
```json
{
  "scripts": {
    "prepare": "cd .. && husky packages/mon-app/.husky"
  }
}
```
