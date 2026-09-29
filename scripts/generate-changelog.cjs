#!/usr/bin/env node
// Genere/actualise, sur la branche develop, la section de changelog "a
// venir" pour la PR develop -> main en cours, a partir des PR mergees dans
// develop depuis le dernier tag reel (ou toutes si aucun tag n'existe).
//
// Prerequis : git avec l'historique et les tags recuperes (fetch-depth: 0),
// et la CLI gh authentifiee (GH_TOKEN).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHeader, validateHeader } = require('./lib/validate-header.cjs');
const {
  computeNextVersion,
  sectionForType,
  buildChangelogEntry,
  extractLatestVersion,
} = require('./lib/changelog.cjs');

const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');
const BASE_BRANCH = 'develop';

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
}

function getRealTags() {
  let raw;

  try {
    raw = sh('git', ['tag', '-l', 'v*']);
  } catch {
    return [];
  }

  return raw ? raw.split('\n').filter(Boolean) : [];
}

function tagVersion(tag) {
  return tag.replace(/^v/, '');
}

function tagDate(tag) {
  return sh('git', ['log', '-1', '--format=%aI', tag]);
}

// Le tag le plus recent, base sur la date du commit tague (pas l'ordre
// alphabetique des noms de tags).
function getLastTag(tags) {
  if (tags.length === 0) {
    return null;
  }

  const withDates = tags.map((tag) => ({ tag, date: tagDate(tag) }));
  withDates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return withDates[withDates.length - 1];
}

function listMergedPullRequests(sinceIso) {
  const raw = sh('gh', [
    'pr', 'list',
    '--state', 'merged',
    '--base', BASE_BRANCH,
    '--limit', '200',
    '--json', 'number,title,mergedAt',
  ]);

  const prs = JSON.parse(raw);
  const sinceTime = sinceIso ? new Date(sinceIso).getTime() : null;

  return prs.filter((pr) => sinceTime === null || new Date(pr.mergedAt).getTime() > sinceTime);
}

function groupPullRequestsBySection(prs) {
  const bySection = {};
  const ignored = [];
  const types = [];

  for (const pr of prs) {
    const parsed = parseHeader(pr.title);
    const section = parsed ? sectionForType(parsed.type) : null;

    if (!parsed || !validateHeader(pr.title).valid || !section) {
      ignored.push(pr);
      continue;
    }

    types.push(parsed.type);
    bySection[section] = bySection[section] || [];
    bySection[section].push(`${pr.title} (#${pr.number})`);
  }

  return { bySection, ignored, types };
}

function main() {
  const tags = getRealTags();
  const last = getLastTag(tags);
  const baselineVersion = last ? tagVersion(last.tag) : '0.0.0';
  const sinceIso = last ? last.date : null;

  const prs = listMergedPullRequests(sinceIso);

  if (prs.length === 0) {
    console.log('Aucune PR mergee dans develop depuis le dernier tag, rien a previsualiser.');
    return;
  }

  const { bySection, ignored, types } = groupPullRequestsBySection(prs);

  if (ignored.length > 0) {
    console.log(`PR ignorees (titre non conforme) : ${ignored.map((pr) => `#${pr.number}`).join(', ')}`);
  }

  if (types.length === 0) {
    console.log('Aucune PR au titre conforme a lister, rien a previsualiser.');
    return;
  }

  const nextVersion = computeNextVersion(baselineVersion, types);
  const date = new Date().toISOString().slice(0, 10);
  const newEntry = buildChangelogEntry(nextVersion, date, bySection);

  const existing = fs.existsSync(CHANGELOG_PATH) ? fs.readFileSync(CHANGELOG_PATH, 'utf8') : '';
  const realVersions = new Set(tags.map(tagVersion));
  const existingLatest = extractLatestVersion(existing);

  // Si la derniere entree du fichier n'est pas encore taguee, c'est un
  // brouillon issu d'une execution precedente de ce meme job (la PR a ete
  // mise a jour) : on le remplace plutot que de l'empiler.
  let rest = existing;
  if (existingLatest && !realVersions.has(existingLatest)) {
    const secondEntryIndex = existing.indexOf('\n# [', 1);
    rest = secondEntryIndex === -1 ? '' : existing.slice(secondEntryIndex + 1);
  }

  const newContent = `${newEntry}\n${rest}`.trimEnd() + '\n';

  if (newContent === existing) {
    console.log('Changelog deja a jour, rien a faire.');
    return;
  }

  fs.writeFileSync(CHANGELOG_PATH, newContent);
  console.log(`CHANGELOG.md mis a jour avec la version ${nextVersion}.`);
}

main();
