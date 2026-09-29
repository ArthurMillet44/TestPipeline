// Logique pure de generation du changelog : calcul de version et
// construction du contenu markdown. Ne fait aucun appel git/GitHub, pour
// rester testable independamment (voir generate-changelog.cjs pour
// l'orchestration).

// Une section de changelog par type de commit/PR.
const TYPE_SECTIONS = {
  feat: 'Added',
  fix: 'Fixed',
  docs: 'Documentation',
  style: 'Style',
  refactor: 'Changed',
  perf: 'Performance',
  test: 'Tests',
  build: 'Build',
  ci: 'CI',
  chore: 'Chore',
  revert: 'Reverted',
};

// Ordre d'affichage des sections dans une entree de changelog.
const SECTION_ORDER = [
  'Added', 'Fixed', 'Changed', 'Performance',
  'Documentation', 'Style', 'Tests', 'Build', 'CI', 'Chore', 'Reverted',
];

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || '');

  if (!match) {
    return null;
  }

  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

// Le chiffre MAJOR n'est jamais modifie automatiquement : c'est une decision
// manuelle reservee a une vraie mise en production. Un "feat" fait monter
// MINOR (et remet PATCH a 0) ; tout le reste (fix, docs, tests, etc.) fait
// monter PATCH.
function computeNextVersion(baselineVersion, types) {
  const base = parseVersion(baselineVersion) || { major: 0, minor: 0, patch: 0 };
  const hasFeat = types.includes('feat');

  if (hasFeat) {
    return formatVersion({ major: base.major, minor: base.minor + 1, patch: 0 });
  }

  return formatVersion({ major: base.major, minor: base.minor, patch: base.patch + 1 });
}

function sectionForType(type) {
  return TYPE_SECTIONS[type] || null;
}

function buildChangelogEntry(version, date, entriesBySection) {
  const lines = [`# [${version} - ${date}]`, ''];

  for (const section of SECTION_ORDER) {
    const entries = entriesBySection[section];

    if (!entries || entries.length === 0) {
      continue;
    }

    lines.push(`### ${section}`);
    for (const entry of entries) {
      lines.push(`- ${entry}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

// Lit la version en tete d'un changelog existant (l'entree la plus recente).
function extractLatestVersion(changelogContent) {
  const match = /^# \[(\d+\.\d+\.\d+) - .+\]/m.exec(changelogContent || '');
  return match ? match[1] : null;
}

module.exports = {
  TYPE_SECTIONS,
  SECTION_ORDER,
  parseVersion,
  formatVersion,
  computeNextVersion,
  sectionForType,
  buildChangelogEntry,
  extractLatestVersion,
};
