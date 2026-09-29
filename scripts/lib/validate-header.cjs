// Regles de validation partagees entre le message de commit et le titre de
// pull request, les deux suivant le meme format Conventional Commits :
// <type>(<scope optionnel>)!: <description>

const TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor',
  'perf', 'test', 'build', 'ci', 'chore', 'revert',
];

const MAX_HEADER_LENGTH = 100;

// Extrait { type, scope, breaking, subject } d'un header, ou null s'il ne
// correspond pas du tout au format <type>(<scope>)!: <description>.
// Ne valide pas les regles (type autorise, casse, etc.), juste la forme.
function parseHeader(header) {
  const match = header.match(/^([a-zA-Z-]+)(\(([^)]+)\))?(!)?:\s?(.*)$/);

  if (!match) {
    return null;
  }

  const [, type, , scope, breaking, subject] = match;

  return {
    type,
    scope: scope || null,
    breaking: Boolean(breaking),
    subject,
  };
}

function validateHeader(header) {
  if (!header || !header.trim()) {
    return {
      valid: false,
      problem: 'le message est vide.',
      example: 'feat: ajoute la connexion utilisateur',
    };
  }

  const parsed = parseHeader(header);

  if (!parsed) {
    return {
      valid: false,
      problem: `aucun type reconnu au debut du message. Types valides : ${TYPES.join(', ')}.`,
      example: 'fix: corrige le crash au demarrage',
    };
  }

  const { type, scope, subject } = parsed;

  if (!TYPES.includes(type)) {
    return {
      valid: false,
      problem: `le type "${type}" n'existe pas. Types valides : ${TYPES.join(', ')}.`,
      example: 'feat(auth): ajoute le rafraichissement du token',
    };
  }

  if (scope && /[A-Z]/.test(scope)) {
    return {
      valid: false,
      problem: `le scope "(${scope})" doit etre en minuscules.`,
      example: 'feat(auth): ...',
    };
  }

  if (!subject || !subject.trim()) {
    const prefix = `${type}${scope ? `(${scope})` : ''}`;
    return {
      valid: false,
      problem: `il manque une description apres "${prefix}:".`,
      example: `${prefix}: corrige l'affichage du header`,
    };
  }

  if (subject.trim().endsWith('.')) {
    return {
      valid: false,
      problem: 'la description ne doit pas se terminer par un point.',
      example: 'fix: corrige le bug',
    };
  }

  if (/^[A-Z]/.test(subject.trim())) {
    return {
      valid: false,
      problem: 'la description doit commencer par une minuscule.',
      example: 'fix: corrige le bug',
    };
  }

  if (header.length > MAX_HEADER_LENGTH) {
    return {
      valid: false,
      problem: `la premiere ligne fait ${header.length} caracteres (max ${MAX_HEADER_LENGTH}). Mets les details dans le corps du commit.`,
    };
  }

  return { valid: true, type, scope, subject };
}

module.exports = { validateHeader, parseHeader, TYPES, MAX_HEADER_LENGTH };
