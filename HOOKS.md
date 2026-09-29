# Git hooks

## Table des matières

- [Commits](#commits)
  - [Choix des technologies](#choix-des-technologies)
    - [Husky](#husky)
    - [Script Node](#script-node)
  - [Fonctionnement du script](#fonctionnement-du-script)
  - [Tests manuels à effectuer](#tests-manuels-à-effectuer)
    - [Vérifier que les hooks sont bien installés](#vérifier-que-les-hooks-sont-bien-installés)
    - [Commit invalide en terminal → doit être rejeté avec un message clair](#commit-invalide-en-terminal--doit-être-rejeté-avec-un-message-clair)
    - [Vérifier qu'un `git commit --no-verify` contourne le hook](#vérifier-quun-git-commit---no-verify-contourne-le-hook)
- [Branches](#branches)
  - [Fonctionnement du script](#fonctionnement-du-script-1)
  - [Tests manuels à effectuer](#tests-manuels-à-effectuer-1)

## Commits

Ce projet bloque tout commit dont le message ne respecte pas la convention
[Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:`, `perf:`, `ci:`).

### Choix des technologies

#### Husky

La vérification est faite par un hook git natif (`commit-msg`), installé par **Husky**, qui appelle un script Node ([scripts/verify-commit-msg.cjs](scripts/verify-commit-msg.cjs)). Le hook s'applique depuis n'importe quel terminal/interface utilisant git.

Nous avons choisi de ne pas passer directement via le `.git/hooks` car ce dernier n'est pas versionné. Par conséquent, chaque personne qui va cloner le projet devra recréer à la main le fichier. C'est pour cette raison que nouos passons par Husky qui change l'emplacement où git va chercher les hooks.

Le script `"prepare": "husky"` dans [package.json](package.json) configure `core.hooksPath` vers `.husky/_` à chaque `npm install`

#### Script Node

La première version de ce hook utilisait commitlint, mais ses messages sortent avec des codes couleur ANSI (`[90m`, `[31m`...) que l'interface de VsCode n'interprète pas. Le résultat en sortie après un commit bloqué était donc illisible. Le script `verify-commit-msg.cjs` lui, n'affiche que du texte brut, avec un seul message ciblé par situation.

### Fonctionnement du script

Les messages d'erreur sont personnalisés en français, un par situation :

| Situation | Message |
|---|---|
| Message vide | `le message est vide.` |
| Pas de type (`corrige le bug`) | `aucun type reconnu au debut du message. Types valides : ...` |
| Type invalide (`feature: ...`) | `le type "feature" n'existe pas. Types valides : ...` |
| Scope en majuscule (`feat(Auth): ...`) | `le scope "(Auth)" doit etre en minuscules.` |
| Description vide (`feat:`) | `il manque une description apres "feat:".` |
| Point final (`fix: corrige le bug.`) | `la description ne doit pas se terminer par un point.` |
| Majuscule en début de description (`fix: Corrige...`) | `la description doit commencer par une minuscule.` |
| Première ligne trop longue (>100 car.) | `la premiere ligne fait X caracteres (max 100)...` |

Chaque erreur affiche aussi le message reçu et un exemple valide, par exemple :
```
Commit refuse : le message ne respecte pas le format Conventional Commits.
Message recu  : "test"
Probleme      : aucun type reconnu au debut du message. Types valides : feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
Exemple valide: "fix: corrige le crash au demarrage"
```

Pour changer un message ou ajouter une règle, il faut éditer directement [scripts/verify-commit-msg.cjs](scripts/verify-commit-msg.cjs). Chaque cas est représenté par un `if` qui appelle `fail(problème, exemple)`.

### Tests manuels à effectuer

#### Vérifier que les hooks sont bien installés
```bash
npm install
git config core.hooksPath
# doit afficher : .husky/_
```

#### Commit invalide en terminal → doit être rejeté avec un message clair
Tester chaque situation ci-dessous et vérifier que le message affiché correspond bien au tableau plus haut :
```bash
git commit --allow-empty -m "corrige le bug de connexion"     # pas de type
git commit --allow-empty -m "feature: ajoute un truc"         # type invalide
git commit --allow-empty -m "feat(Auth): ajoute le login"     # scope en majuscule
git commit --allow-empty -m "feat:"                           # description vide
git commit --allow-empty -m "fix: corrige le bug."            # point final
git commit --allow-empty -m "fix: Corrige le bug"             # majuscule en début de description
```

Tester également depuis une interface comme celle de VsCode

#### Vérifier qu'un `git commit --no-verify` contourne le hook
```bash
git commit --allow-empty -m "mauvais message" --no-verify
```

## Branches

Ce projet bloque également le push d'une branche dont le nom ne respecte pas le format `<type>/<description-courte>` (types autorisés : `feature`, `fix`, `hotfix`, `refactor`, `docs`, `test`, `chore`, `ci`).

La vérification est faite par un hook `pre-push`, installé par Husky, qui appelle [scripts/verify-branch-name.cjs](scripts/verify-branch-name.cjs).

Contrairement au message de commit, le nom d'une branche ne peut pas être bloqué à sa création : git n'a pas de hook qui s'exécute avant qu'une branche soit créée. `post-checkout` existe mais s'exécute après coup et ne peut qu'avertir, pas empêcher. Le seul moment où on peut réellement bloquer, c'est avant qu'elle parte vers le remote : c'est le rôle du hook `pre-push`.

Les branches `main`, `master` et `develop` sont exclues de la vérification (elles ne suivent pas le format `<type>/<description>`) : un push vers l'une de ces branches passe toujours, quel que soit son nom, car le script les reconnaît via une liste `PROTECTED_BRANCHES` codée en dur dans [scripts/verify-branch-name.cjs](scripts/verify-branch-name.cjs) et saute la vérification pour elles.

Ce hook ne fait que vérifier un *nom* de branche : il ne bloque pas, et n'a pas vocation à bloquer, le fait de pousser directement sur `main`/`develop` sans passer par une pull request. Si on veut interdire le push direct sur ces branches, ça se règle côté serveur (ex. règle de branche protégée sur GitHub), pas via un hook `pre-push` local qui peut être contourné avec `--no-verify` ou simplement en modifiant le script.

### Fonctionnement du script

Git fournit au hook `pre-push`, via son entrée standard (stdin), la liste des références en train d'être poussées, une par ligne, au format :

```
<ref locale> <sha locale> <ref distante> <sha distante>
```

Le script lit cette entrée, extrait le nom de chaque branche locale, et vérifie son format avec une expression régulière. Si une branche renommée/supprimée est détectée (sha locale à zéro), elle est ignorée.

Exemple de message affiché en cas de rejet :
```
Push refuse : le nom de la branche ne respecte pas la convention du projet.
Branche       : "nimportequoi"
Probleme      : le nom ne suit pas le format "<type>/<description-courte>". Types autorises : feature, fix, hotfix, refactor, docs, test, chore, ci.
Exemple valide: "feature/authentification-utilisateur"
```

### Tests manuels à effectuer

Comme `pre-push` ne se déclenche qu'au moment d'un push vers un remote, il faut un remote pour tester (un dépôt "bare" local suffit) :

```bash
# Créer un faux remote local
git init --bare /tmp/fake-remote.git
git remote add origin /tmp/fake-remote.git

# Branche invalide → doit être rejetée
git checkout -b nimportequoi
git push origin nimportequoi

# Type invalide (feat au lieu de feature) → doit être rejetée
git checkout main
git checkout -b feat/test-branch
git push origin feat/test-branch

# Branche valide → doit être acceptée
git checkout main
git checkout -b feature/test-branche-valide
git push origin feature/test-branche-valide

# Nettoyage
git checkout main
git branch -D nimportequoi feat/test-branch feature/test-branche-valide
git remote remove origin
rm -rf /tmp/fake-remote.git
```