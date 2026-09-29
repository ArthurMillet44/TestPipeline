# Pipelines CI

## Table des matières

- [Pull requests](#pull-requests)
  - [Fonctionnement](#fonctionnement)
  - [Rendre la vérification obligatoire](#rendre-la-vérification-obligatoire)
  - [Tests manuels à effectuer](#tests-manuels-à-effectuer)
- [Changelog et tag de version](#changelog-et-tag-de-version)
  - [Fonctionnement](#fonctionnement-1)
  - [Calcul de la version](#calcul-de-la-version)
  - [Répartition par section](#répartition-par-section)
  - [Cas particuliers gérés](#cas-particuliers-gérés)
  - [Tests manuels à effectuer](#tests-manuels-à-effectuer-1)

## Pull requests

Le titre d'une pull request suit la même convention que les commits (`<type>(<scope optionnel>): <description>`, voir [HOOKS.md](HOOKS.md)). Contrairement aux commits et aux branches, cette vérification **ne peut pas passer par un hook git** : une pull request est un objet GitHub (ou GitLab/Azure DevOps...), pas un objet git local, donc aucun hook côté client n'a accès à cette information.

La vérification est faite via une **CI GitHub Actions** ([.github/workflows/pr-title.yml](.github/workflows/pr-title.yml)), déclenchée à l'ouverture, la modification ou la mise à jour d'une pull request. Elle appelle [scripts/verify-pr-title.cjs](scripts/verify-pr-title.cjs), qui réutilise la même logique de validation que le hook de commit, factorisée dans [scripts/lib/validate-header.cjs](scripts/lib/validate-header.cjs) pour ne pas dupliquer les règles entre les deux scripts.

### Fonctionnement

Le workflow lit `github.event.pull_request.title` et le transmet au script via la variable d'environnement `PR_TITLE`. Le script applique les mêmes règles que pour un message de commit et échoue si le titre n'est pas conforme, ce qui fait échouer le job.

### Rendre la vérification obligatoire

Un job GitHub Actions qui échoue n'empêche pas par défaut de merger la pull request. Pour bloquer réellement le merge :

1. Repo GitHub → **Settings** → **Branches** → **Branch protection rules** → règle sur la branche cible (ex. `main`).
2. Cocher **Require status checks to pass before merging**.
3. Sélectionner le check `verify-pr-title` (visible dans la liste après au moins une exécution du workflow).

Tant que cette règle n'est pas configurée, l'échec du check reste visible dans l'onglet **Checks** de la PR mais n'empêche pas le merge.

### Tests manuels à effectuer

1. Ouvrir une pull request avec un titre non conforme (ex. `ajoute un truc`) → le check doit échouer, avec le message d'erreur visible dans les logs du job.
2. Modifier le titre pour qu'il soit conforme (ex. `feat(auth): ajoute le rafraichissement du token`) → le check doit repasser au vert (le workflow se redéclenche sur `edited`, sans nouveau commit nécessaire).
3. Si la règle de branche protégée est configurée, vérifier que le bouton de merge reste désactivé tant que le check n'est pas au vert.

## Changelog et tag de version

Quand une pull request `develop → main` est ouverte, deux workflows travaillent ensemble pour tenir `CHANGELOG.md` à jour et créer automatiquement le tag de version :

- [.github/workflows/changelog-preview.yml](.github/workflows/changelog-preview.yml) : se déclenche à l'ouverture ou la mise à jour de la PR. Calcule la prochaine version et écrit la section de changelog correspondante, puis pousse un commit directement sur `develop` (donc visible dans le diff de la PR avant le merge).
- [.github/workflows/release-tag.yml](.github/workflows/release-tag.yml) : se déclenche quand cette PR est **mergée**. Relit la version déjà écrite en tête de `CHANGELOG.md` (elle vient d'arriver sur `main` via le merge) et crée le tag git correspondant.

Cette séparation en deux temps est volontaire : le tag ne doit exister que pour du code réellement livré sur `main`, pas pour un brouillon encore en cours de revue. Créer un tag est un `git push` sur une ref `refs/tags/...`, pas sur la branche `main` elle-même : ce n'est donc pas bloqué par une règle "Require a pull request before merging" sur `main` (voir plus haut), contrairement à un commit qui modifierait directement `main`.

### Fonctionnement

Toute la logique de calcul (version, sections) est factorisée dans [scripts/lib/changelog.cjs](scripts/lib/changelog.cjs), sans aucun appel git/GitHub, pour rester testable isolément. L'orchestration se fait dans deux scripts :

- [scripts/generate-changelog.cjs](scripts/generate-changelog.cjs) : appelé par `changelog-preview.yml`. Trouve le dernier tag réel (`git tag`), liste les PR mergées dans `develop` depuis la date de ce tag (via `gh pr list --state merged --base develop`, sans filtre de date si aucun tag n'existe), les regroupe par type, calcule la prochaine version et écrit le résultat en tête de `CHANGELOG.md`.
- [scripts/extract-latest-version.cjs](scripts/extract-latest-version.cjs) : appelé par `release-tag.yml`. Relit simplement la version en tête de `CHANGELOG.md`.

### Calcul de la version

Le chiffre **MAJOR** (premier chiffre) n'est jamais modifié automatiquement : c'est une décision manuelle, réservée à une vraie mise en production. Les deux autres chiffres suivent la règle donnée au départ :

- Au moins une PR `feat` dans le lot → le chiffre **MINOR** (au milieu) monte d'un cran, **PATCH** repart à 0.
- Sinon (uniquement des `fix`, `docs`, `test`, etc.) → seul le chiffre **PATCH** (dernier) monte d'un cran.

Si aucun tag n'existe encore, la version de référence est `0.0.0`, donc le tout premier tag généré sera `0.1.0` (s'il y a un `feat` dans le lot) ou `0.0.1` (sinon).

### Répartition par section

Chaque type de commit/PR a sa propre section dans le changelog :

| Type | Section |
|---|---|
| `feat` | `### Added` |
| `fix` | `### Fixed` |
| `refactor` | `### Changed` |
| `perf` | `### Performance` |
| `docs` | `### Documentation` |
| `style` | `### Style` |
| `test` | `### Tests` |
| `build` | `### Build` |
| `ci` | `### CI` |
| `chore` | `### Chore` |
| `revert` | `### Reverted` |

Une PR dont le titre ne respecte pas le format `<type>(<scope>): <description>` est ignorée (elle ne devrait normalement pas exister, le titre étant déjà validé par la CI [Pull requests](#pull-requests) ci-dessus, mais le script s'en protège par défaut).

### Cas particuliers gérés

- **PR relancée plusieurs fois avant merge** (`synchronize`) : le script détecte que la dernière entrée de `CHANGELOG.md` ne correspond à aucun tag réel (c'est un brouillon d'une exécution précédente du même job) et la remplace, au lieu d'empiler des entrées en double.
- **Idempotence** : si rien n'a changé depuis la dernière exécution, le fichier généré est strictement identique à l'existant, donc aucun commit n'est poussé. C'est important pour éviter une boucle infinie : pousser un commit sur `develop` redéclenche l'événement `synchronize` de la PR, qui relance le workflow.
- **Comparaison de dates entre fuseaux horaires** : `git log --format=%aI` renvoie une date avec l'offset local (ex. `+02:00`) alors que l'API GitHub renvoie de l'UTC (`Z`). Une comparaison de chaînes de caractères entre les deux est incorrecte (testé et corrigé pendant le développement) ; le script convertit les deux en objets `Date` avant de comparer.

### Tests manuels à effectuer

Test réalisé en conditions réelles sur le dépôt GitHub (nécessite `gh` authentifié) :

```bash
# Préparation : une branche develop à jour avec main
git checkout -b develop main
git push origin develop

# Simuler une PR feat mergée dans develop
git checkout -b feature/exemple develop
# ... modifications ...
git commit -m "feat: exemple de fonctionnalite"
git push origin feature/exemple
gh pr create --base develop --head feature/exemple --title "feat: exemple de fonctionnalite" --body "test"
gh pr merge --merge --delete-branch

# Lancer le générateur localement (ou ouvrir une vraie PR develop -> main pour tester le workflow)
node scripts/generate-changelog.cjs
cat CHANGELOG.md   # doit afficher # [0.1.0 - <date>] avec la section ### Added
```

Puis :
1. Relancer `node scripts/generate-changelog.cjs` sans nouvelle PR mergée → doit afficher "Changelog deja a jour, rien a faire." sans modifier le fichier.
2. Committer `CHANGELOG.md` sur `develop`, merger dans `main`, puis lancer `node scripts/extract-latest-version.cjs` sur `main` → doit afficher la version attendue (`0.1.0`).
3. Créer le tag (`git tag -a v0.1.0 -m "Release v0.1.0"` puis `git push origin v0.1.0`) et vérifier qu'il apparaît bien sur GitHub.
4. Merger une nouvelle PR (ex. `fix: ...`) dans `develop` après ce tag, relancer le générateur → doit produire une nouvelle entrée `0.1.1` au-dessus de l'ancienne, sans toucher à l'entrée `0.1.0` déjà taguée.
