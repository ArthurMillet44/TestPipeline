# Pipelines CI

## Table des matières

- [Pull requests](#pull-requests)
  - [Fonctionnement](#fonctionnement)
  - [Rendre la vérification obligatoire](#rendre-la-vérification-obligatoire)
  - [Tests manuels à effectuer](#tests-manuels-à-effectuer)

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
test pipeline pr
