/**
 * Discourse Analysis Constants
 */

const ESV_API = 'https://api.esv.org/v3/passage/text/';
const SBLGNT_BASE = 'https://raw.githubusercontent.com/Faithlife/SBLGNT/master/data/sblgnt/text/';

const SBLGNT_BOOKS = {
  matt: 'Matt.txt', matthew: 'Matt.txt', mt: 'Matt.txt',
  mark: 'Mark.txt', mk: 'Mark.txt', mr: 'Mark.txt',
  luke: 'Luke.txt', lk: 'Luke.txt',
  john: 'John.txt', jn: 'John.txt', jhn: 'John.txt', joh: 'John.txt',
  acts: 'Acts.txt', ac: 'Acts.txt',
  rom: 'Rom.txt', romans: 'Rom.txt', ro: 'Rom.txt',
  '1cor': '1Cor.txt', '1corinthians': '1Cor.txt',
  '2cor': '2Cor.txt', '2corinthians': '2Cor.txt',
  gal: 'Gal.txt', galatians: 'Gal.txt', ga: 'Gal.txt',
  eph: 'Eph.txt', ephesians: 'Eph.txt',
  phil: 'Phil.txt', philippians: 'Phil.txt', php: 'Phil.txt',
  col: 'Col.txt', colossians: 'Col.txt',
  '1thess': '1Thess.txt', '1thessalonians': '1Thess.txt',
  '2thess': '2Thess.txt', '2thessalonians': '2Thess.txt',
  '1tim': '1Tim.txt', '1timothy': '1Tim.txt',
  '2tim': '2Tim.txt', '2timothy': '2Tim.txt',
  titus: 'Titus.txt', tit: 'Titus.txt',
  phlm: 'Phlm.txt', philemon: 'Phlm.txt',
  heb: 'Heb.txt', hebrews: 'Heb.txt',
  jas: 'Jas.txt', james: 'Jas.txt',
  '1pet': '1Pet.txt', '1peter': '1Pet.txt',
  '2pet': '2Pet.txt', '2peter': '2Pet.txt',
  '1jn': '1John.txt', '1john': '1John.txt',
  '2jn': '2John.txt', '2john': '2John.txt',
  '3jn': '3John.txt', '3john': '3John.txt',
  jude: 'Jude.txt', jud: 'Jude.txt',
  rev: 'Rev.txt', revelation: 'Rev.txt', re: 'Rev.txt',
};

const FULL_BOOK_NAMES = {
  matt: 'Matthew', matthew: 'Matthew', mt: 'Matthew',
  mark: 'Mark', mk: 'Mark', mr: 'Mark',
  luke: 'Luke', lk: 'Luke',
  john: 'John', jn: 'John', jhn: 'John', joh: 'John',
  acts: 'Acts', ac: 'Acts',
  rom: 'Romans', romans: 'Romans', ro: 'Romans',
  '1cor': '1 Corinthians', '1corinthians': '1 Corinthians',
  '2cor': '2 Corinthians', '2corinthians': '2 Corinthians',
  gal: 'Galatians', ga: 'Galatians',
  eph: 'Ephesians', ephesians: 'Ephesians',
  phil: 'Philippians', php: 'Philippians',
  col: 'Colossians',
  '1thess': '1 Thessalonians', '1thessalonians': '1 Thessalonians',
  '2thess': '2 Thessalonians', '2thessalonians': '2 Thessalonians',
  '1tim': '1 Timothy', '1timothy': '1 Timothy',
  '2tim': '2 Timothy', '2timothy': '2 Timothy',
  titus: 'Titus', tit: 'Titus',
  phlm: 'Philemon', philemon: 'Philemon',
  heb: 'Hebrews',
  jas: 'James', james: 'James',
  '1pet': '1 Peter', '1peter': '1 Peter',
  '2pet': '2 Peter', '2peter': '2 Peter',
  '1jn': '1 John', '1john': '1 John',
  '2jn': '2 John', '2john': '2 John',
  '3jn': '3 John', '3john': '3 John',
  jude: 'Jude', jud: 'Jude',
  rev: 'Revelation', revelation: 'Revelation', re: 'Revelation',
};

const BOLLS_BOOKS = {
  gen: 1, genesis: 1, exod: 2, exodus: 2, lev: 3, leviticus: 3, num: 4, numbers: 4, deut: 5, deuteronomy: 5,
  josh: 6, joshua: 6, judg: 7, judges: 7, ruth: 8, '1sam': 9, '1samuel': 9, '2sam': 10, '2samuel': 10,
  '1kings': 11, '2kings': 12, '1chron': 13, '1chronicles': 13, '2chron': 14, '2chronicles': 14,
  ezra: 15, neh: 16, nehemiah: 16, est: 17, esther: 17, job: 18, ps: 19, psalms: 19, prov: 20, proverbs: 20,
  eccl: 21, ecclesiastes: 21, song: 22, isa: 23, isaiah: 23, jer: 24, jeremiah: 24, lam: 25, lamentations: 25,
  ezek: 26, ezekiel: 26, dan: 27, daniel: 27, hos: 28, hosea: 28, joel: 29, amos: 30, obad: 31, obadiah: 31,
  jonah: 32, mic: 33, micah: 33, nah: 34, nahum: 34, hab: 35, habakkuk: 35, zeph: 36, zephaniah: 36, hag: 37, haggai: 37,
  zech: 38, zechariah: 38, mal: 39, malachi: 39,
  matt: 40, matthew: 40, mark: 41, luke: 42, john: 43, acts: 44, rom: 45, romans: 45,
  '1cor': 46, '2cor': 47, gal: 48, galatians: 48, eph: 49, ephesians: 49,
  phil: 50, philippians: 50, col: 51, colossians: 51, '1thess': 52, '2thess': 53,
  '1tim': 54, '2tim': 55, titus: 56, phlm: 57, philemon: 57, heb: 58, hebrews: 58,
  jas: 59, james: 59, '1pet': 60, '1peter': 60, '2pet': 61, '2peter': 61, '1jn': 62, '1john': 62,
  '2jn': 63, '2john': 63, '3jn': 64, '3john': 64, jude: 65, rev: 66, revelation: 66,
  tobit: 67, judith: 68, wisdom: 69, sirach: 70, baruch: 71, '1macc': 72, '1maccabees': 72, '2macc': 73, '2maccabees': 73, '3macc': 74, '3maccabees': 74, '4macc': 75, '4maccabees': 75
};

const BRACKET_LABELS = {
  series: 'S',
  progression: 'P/*',
  alternative: 'A',
  'both-and': 'B-A',
  ground: '*/G',
  inference: 'I',
  bilateral: 'Bl',
  'cause-effect': 'C/E*',
  'action-result': 'Ac/Res*',
  'action-purpose': 'Ac/Pur*',
  conditional: 'If/Th*',
  temporal: 'T/*',
  locative: 'L/*',
  'action-manner': 'Ac/Mn*',
  comparison: 'Cf/*',
  'negative-positive': '-/+',
  'idea-explanation': 'Id/Exp*',
  'question-answer': 'Q/A*',
  'general-specific': 'Gen/Sp*',
  'fact-interpretation': 'Ft/In*',
  'anticipation-fulfillment': 'An/Fl*',
  concessive: 'Csv/*',
  'situation-response': 'Sit/R*',
  'unspecified': '?'
};

const GURTNER_LABELS = {
  series: 'S',
  progression: 'P/*',
  alternative: 'A',
  'both-and': 'B-A',
  ground: '*/G',
  inference: 'I',
  bilateral: 'Bl',
  'cause-effect': 'C/E/*',
  'action-result': 'C/E/*',
  'action-purpose': 'M/Ed/*',
  conditional: 'C?/E/*',
  temporal: 'T/*',
  locative: 'L/*',
  'action-manner': 'W/Ed/*',
  comparison: 'Cf/*',
  'negative-positive': '-/+',
  'idea-explanation': 'Id/Exp*',
  'question-answer': 'Q/A*',
  'general-specific': 'Gen/Sp*',
  'fact-interpretation': 'Ft/In*',
  'anticipation-fulfillment': 'An/Fl*',
  concessive: 'Csv/*',
  'situation-response': 'Sit/R*',
  'unspecified': '?'
};

const RELATIONSHIP_LABELS = {
  series: 'Series (S)',
  progression: 'Progression (P)',
  alternative: 'Alternative (A)',
  'both-and': 'Both-And (B-A)',
  ground: 'Ground (G)',
  inference: 'Inference (I)',
  bilateral: 'Bilateral (Bl)',
  'cause-effect': 'Cause-Effect (C/E)',
  'action-result': 'Action-Result (Ac/Res)',
  'action-purpose': 'Action-Purpose (Ac/Pur)',
  conditional: 'Conditional (If/Th)',
  temporal: 'Temporal (T)',
  locative: 'Locative (L)',
  'action-manner': 'Action-Manner (Ac/Mn)',
  comparison: 'Comparison (Cf)',
  'negative-positive': 'Negative-Positive (-/+)',
  'idea-explanation': 'Idea-Explanation (Id/Exp)',
  'question-answer': 'Question-Answer (Q/A)',
  'general-specific': 'General-Specific (Gen/Sp)',
  'fact-interpretation': 'Fact-Interpretation (Ft/In)',
  'anticipation-fulfillment': 'Anticipation-Fulfillment (An/Fl)',
  concessive: 'Concessive (Csv)',
  'situation-response': 'Situation-Response (Sit/R)',
  'unspecified': '?'
};

const RELATIONSHIP_GROUPS_HIERARCHY = [
  {
    name: 'COORDINATE RELATIONSHIPS',
    types: ['series', 'progression', 'alternative', 'both-and', 'anticipation-fulfillment']
  },
  {
    name: 'SUBORDINATE RELATIONSHIPS',
    subgroups: [
      {
        name: 'Support by Restatement',
        types: ['action-manner', 'comparison', 'negative-positive', 'question-answer', 'idea-explanation', 'general-specific', 'fact-interpretation']
      },
      {
        name: 'Support by Distinct Statement',
        types: ['ground', 'inference', 'bilateral', 'action-result', 'action-purpose', 'conditional', 'temporal', 'locative']
      },
      {
        name: 'Support by Contrary Statement',
        types: ['concessive', 'situation-response']
      }
    ]
  }
];

const SINGLE_LABEL_TYPES = new Set(['series', 'alternative', 'bilateral', 'both-and', 'unspecified']);

const GURTNER_RELATIONSHIP_NAMES = {
  series: 'Series (S)',
  progression: 'Progression (P)',
  alternative: 'Alternative (A)',
  ground: 'Ground (G)',
  inference: 'Inference (I)',
  bilateral: 'Bilateral (Bl)',
  'cause-effect': 'Cause-Effect (C/E)',
  'action-result': 'Cause-Effect (C/E)',
  'action-purpose': 'Means-End (M/Ed)',
  conditional: 'Conditional (C?/E)',
  temporal: 'Temporal (T)',
  locative: 'Locative (L)',
  'action-manner': 'Way-End (W/Ed)',
  comparison: 'Comparison (Cf)',
  'negative-positive': 'Negative-Positive (-/+)',
  'idea-explanation': 'Idea-Explanation (Id/Exp)',
  'question-answer': 'Question-Answer (Q/A)',
  concessive: 'Concessive (Csv)',
  'situation-response': 'Situation-Response (Sit/R)',
  'unspecified': '?'
};

const BRACKET_GEO = {
  GAP: 15,
  BRACKET_WIDTH: 20,
  SLOT_WIDTH: 30,
  MIN_TEXT_WIDTH: 300,
  BASE_PADDING: 100
};

const THEME_KEY = 'biblebracket_theme';
const COMMENT_AUTHOR_KEY = 'biblebracket_comment_author';
const REVIEWER_NAME_KEY = 'biblebracket_reviewer_name';
const PAGE_AUTHOR_KEY = 'biblebracket_page_author';

const RELATIONSHIP_COLORS = {
  series: '#ef4444',             // Red
  progression: '#f97316',        // Orange
  alternative: '#f59e0b',        // Amber
  'both-and': '#84cc16',         // Lime
  ground: '#10b981',             // Emerald
  inference: '#06b6d4',          // Cyan
  bilateral: '#3b82f6',          // Blue
  'cause-effect': '#6366f1',     // Indigo
  'action-result': '#8b5cf6',    // Violet
  'action-purpose': '#a855f7',   // Purple
  conditional: '#d946ef',        // Fuchsia
  temporal: '#ec4899',           // Pink
  locative: '#f43f5e',           // Rose
  'action-manner': '#0ea5e9',    // Sky Blue
  comparison: '#14b8a6',         // Teal
  'negative-positive': '#4ade80', // Light Green
  'idea-explanation': '#fbbf24', // Gold
  'question-answer': '#2dd4bf',  // Aquamarine
  'general-specific': '#60a5fa', // Light Blue
  'fact-interpretation': '#fb7185', // Coral
  'anticipation-fulfillment': '#c084fc', // Light Purple
  concessive: '#94a3b8',         // Slate
  'situation-response': '#475569', // Dark Slate
  unspecified: '#94a3b8'         // Gray
};

const RELATIONSHIP_DEFINITIONS = {
  series: { definition: "Each proposition makes an independent contribution to the whole", keywords: "and, moreover, furthermore, likewise" },
  progression: { definition: "Each proposition is a further step to the climax", keywords: "then, and, moreover" },
  alternative: { definition: "Each proposition expresses an opposite possibility arising from a situation", keywords: "but, on the other hand, while, or" },
  'question-answer': { definition: "Statement of question and answer to that question", keywords: "?" },
  'situation-response': { definition: "Statement of response to a stated situation or action", keywords: "and" },
  'action-manner': { definition: "Statement of an action and one which tells more explicitly what is involved in carrying out this action", keywords: "in that, by" },
  comparison: { definition: "Statement expressing an action, thing, etc. followed by a statement making that action, thing, etc. clearer by showing what it is like", keywords: "even as, as... so" },
  'negative-positive': { definition: "Two alternatives, one of which is denied so that the other is enforced", keywords: "not... but, though, although, but" },
  'general-specific': { definition: "Propositions stating a whole and one or more which set for the part of the whole", keywords: "that is, for" },
  'fact-interpretation': { definition: "Proposition and one clarifying or explaining its meaning", keywords: "that is, for" },
  ground: { definition: "Statement and the argument or basis on which it stands; supporting follows the supported", keywords: "for, because, since" },
  inference: { definition: "As above, but now the supporting precedes the supported", keywords: "therefore, wherefore, thus, consequently" },
  'action-result': { definition: "An action and one automatically consequent upon that action", keywords: "that, so that, with the result that" },
  'cause-effect': { definition: "An action and one automatically consequent upon that action", keywords: "that, so that, with the result that" },
  conditional: { definition: "Like above, except the existence of the cause is only potential", keywords: "if... then, if, except" },
  'action-purpose': { definition: "An action and the one that is intended to come as a result or goal", keywords: "in order that, that, lest, to the end that" },
  temporal: { definition: "Proposition and the occasion when it can occur", keywords: "when, whenever" },
  locative: { definition: "Proposition and the place where it can be true", keywords: "where, wherever" },
  concessive: { definition: "Main clause that stands despite a contrary statement", keywords: "nevertheless, although though, yet, however" },
  'anticipation-fulfillment': { definition: "A main clause that fulfills the anticipation or promise of a prior clause (subset of progression)", keywords: "" },
  'both-and': { definition: "Each proposition makes an independent contribution to the whole, but the contributions are inseparable (subset of series)", keywords: "" },
  bilateral: { definition: "A bilateral relationship supporting the preceding proposition and supported by the following proposition.", keywords: "for... therefore" },
  'idea-explanation': { definition: "A relationship where the second proposition explains the idea of the first.", keywords: "that is" }
};

window.DA_CONSTANTS = {
    ESV_API, SBLGNT_BASE, SBLGNT_BOOKS, FULL_BOOK_NAMES, BOLLS_BOOKS,
    BRACKET_LABELS, GURTNER_LABELS, RELATIONSHIP_LABELS, RELATIONSHIP_GROUPS_HIERARCHY,
    SINGLE_LABEL_TYPES, GURTNER_RELATIONSHIP_NAMES, BRACKET_GEO,
    RELATIONSHIP_COLORS, RELATIONSHIP_DEFINITIONS,
    THEME_KEY, COMMENT_AUTHOR_KEY, REVIEWER_NAME_KEY, PAGE_AUTHOR_KEY
};
