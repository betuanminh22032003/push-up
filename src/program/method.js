/**
 * The rules the training schedule follows, each with the study behind it, for
 * the "Why the schedule looks like this" card. The text of each rule is
 * `program.method.<id>` (src/i18n/featureStrings.js); the full write-up with
 * every source is research/chuyen-mon-lich-tap.md.
 *
 * Only peer-reviewed papers, guidelines and position stands are cited here,
 * by first author and year.
 */
export const METHOD_RULES = [
  {
    id: 'twice',
    sources: [
      { label: 'WHO 2020', url: 'https://bjsm.bmj.com/content/54/24/1451' },
      { label: 'Schoenfeld 2016', url: 'https://pubmed.ncbi.nlm.nih.gov/27102172/' },
    ],
  },
  {
    id: 'order',
    sources: [{ label: 'Simão 2012', url: 'https://pubmed.ncbi.nlm.nih.gov/22292516/' }],
  },
  {
    id: 'warmup',
    sources: [
      { label: 'Fradkin 2010', url: 'https://pubmed.ncbi.nlm.nih.gov/19996770/' },
      { label: 'Van Hooren 2018', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5999142/' },
    ],
  },
  {
    id: 'rest',
    sources: [
      { label: 'Grgic 2018', url: 'https://vuir.vu.edu.au/38537/' },
      { label: 'Singer 2024', url: 'https://pubmed.ncbi.nlm.nih.gov/39205815/' },
    ],
  },
  {
    id: 'effort',
    sources: [
      { label: 'Lasevicius 2022', url: 'https://pubmed.ncbi.nlm.nih.gov/31895290/' },
      { label: 'Kikuchi 2017', url: 'https://pubmed.ncbi.nlm.nih.gov/29541130/' },
    ],
  },
  {
    id: 'progress',
    sources: [
      { label: 'ACSM 2009', url: 'https://journals.lww.com/acsm-msse/Fulltext/2009/03000/Progression_Models_in_Resistance_Training_for.26.aspx' },
      { label: 'Plotkin 2022', url: 'https://peerj.com/articles/14142' },
    ],
  },
  {
    id: 'cycle',
    sources: [{ label: 'Bell 2023', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/' }],
  },
];

/** The pre-exercise health check's questions, in order (`health.q.<id>`). */
export const HEALTH_QUESTIONS = ['heart', 'chest', 'dizzy', 'chronic', 'meds', 'joint', 'supervised', 'pregnant'];

/**
 * What a set of answers means for training. Any yes: see a doctor first, and
 * no maximal hold in the test. A joint problem or a pregnancy: jump-free cardio.
 * @param {Record<string, boolean>} answers
 */
export function healthOutcome(answers = {}) {
  const anyYes = HEALTH_QUESTIONS.some((id) => answers[id] === true);
  const lowImpact = answers.joint === true || answers.pregnant === true;
  return { anyYes, lowImpact };
}
