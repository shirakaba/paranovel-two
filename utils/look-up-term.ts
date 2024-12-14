import { QuickSQLiteConnection } from 'react-native-quick-sqlite';

export async function lookUpTerm(term: string, db: QuickSQLiteConnection) {
  const limit = 3;
  /**
   * Given the form (orthography) of the word, finds all corresponding
   * headwords (i.e. senses).
   *
   * In future, we could do a fallback search using the MeCab-provided reading
   * as well, if we wanted. This would catch cases like ふり向く and お父様
   * (incorrect orthography, but recognisable by reading). But even Jisho and
   * 10ten let these through.
   *
   * @example
   * // SELECT * FROM word_forms WHERE form = 四 LIMIT 3
   * [
   *   {"common": 1, "form": "四", "headword": 1579470, "kana": 0, "tags": null},
   *   {"common": 0, "form": "四", "headword": 2747960, "kana": 0, "tags": null}
   * ]
   *
   * @example
   * // SELECT * FROM word_forms WHERE form = 何ヶ月 LIMIT 3
   * [{ form: '何ヶ月', kana: 0, tags: null, common: 0 }]
   */
  const wordFormsForForm = (
    ((
      await db.executeAsync(
        'SELECT * FROM word_forms WHERE form = ? LIMIT ?;',
        [term, limit],
      )
    ).rows?._array as Array<WordForm> | undefined) ?? new Array<WordForm>()
  ).sort((a, b) => b.common - a.common);

  console.log('wordFormsForForm', wordFormsForForm);
  if (!wordFormsForForm.length) {
    return [];
  }

  /**
   * All the headwords that our search term may possibly be referring to.
   *
   * @example
   * // form = "四"
   * [1579470, 2747960]
   */
  const headwords = [
    ...new Set(wordFormsForForm.map<number>(({ headword }) => headword)),
  ];

  /**
   * Look for any additional wordForms sharing the same headwords, to pick up
   * extra orthographies (and for each orthography, whether it's common, etc.).
   *
   * The form "四" has headwords 1579470 and 2747960. There are further forms
   * sharing each of those headwords.
   *
   * The form "何ヶ月" has headword 1188640, but it's just one of many forms with
   * that headword.
   *
   * @example
   * // SELECT * FROM word_forms WHERE headword = 1579470 OR headword = 2747960
   * [
   *   { form: '４', kana: 0, tags: null, common: 0, headword: 1579470 },
   *   { form: '肆', kana: 0, tags: null, common: 0, headword: 1579470 },
   *   { form: 'し', kana: 1, tags: null, common: 1, headword: 1579470 },
   *   { form: 'よん', kana: 1, tags: null, common: 1, headword: 1579470 },
   *   { form: 'よ', kana: 1, tags: null, common: 0, headword: 1579470 },
   *   { form: '四', kana: 0, tags: null, common: 1, headword: 1579470 },
   *   { form: '四', kana: 0, tags: null, common: 0, headword: 2747960 },
   *   { form: 'スー', kana: 1, tags: null, common: 0, headword: 2747960 },
   * ]
   *
   * @example
   * // SELECT * FROM word_forms WHERE headword = 1188640
   * [
   *   { form: '何ヶ月', kana: 0, tags: null, common: 0, headword: 1188640 },
   *   { form: '何ヵ月', kana: 0, tags: null, common: 0, headword: 1188640 },
   *   { form: '何か月', kana: 0, tags: null, common: 0, headword: 1188640 },
   *   { form: '何カ月', kana: 0, tags: ["sK"], common: 0, headword: 1188640 },
   *   { form: '何ケ月', kana: 0, tags: ["sK"], common: 0, headword: 1188640 },
   *   { form: '何箇月', kana: 0, tags: ["sK"], common: 0, headword: 1188640 },
   *   { form: 'なんかげつ', kana: 1, tags: null, common: 0, headword: 1188640 },
   * ]
   */
  const wordFormsForHeadwords =
    ((
      await db.executeAsync(
        `SELECT * FROM word_forms WHERE ${headwords
          .map(() => 'headword = ?')
          .join(' OR ')} LIMIT ?;`,
        [...headwords, 50],
      )
    ).rows?._array as Array<WordForm> | undefined) ?? new Array<WordForm>();
  console.log('wordFormsForHeadwords', wordFormsForHeadwords);

  const formPayloads: { [headword: number]: Array<WordFormPayload> } = {};
  for (const { headword, common, kana, form, tags } of wordFormsForHeadwords) {
    formPayloads[headword] ||= [];
    formPayloads[headword].push({ common: !!common, kana: !!kana, form, tags });
  }
  console.log('formPayloads', formPayloads);

  const senses: Array<{
    /** The headword referred to by word_forms */
    id: number;
    /** A JSON string to be parsed */
    sense: string;
  }> =
    (
      await db.executeAsync(
        `SELECT * FROM word_senses WHERE ${headwords
          .map(() => 'id = ?')
          .join(' OR ')} LIMIT ?;`,
        [...headwords, limit],
      )
    ).rows?._array ?? [];
  console.log('senses', senses);

  return senses
    .map<LookupResult>(({ id: headword, sense }) => {
      const forms = formPayloads[headword].sort(
        (a, b) => (b.common ? 1 : 0) - (a.common ? 1 : 0),
      );

      return {
        headword,
        forms,
        hasCommonForm: forms.some(form => form.common),
        senses: JSON.parse(sense) as Array<Sense>,
      };
    })
    .sort((a, b) => (b.hasCommonForm ? 1 : 0) - (a.hasCommonForm ? 1 : 0));
}

/**
 * Each LookupResult represents all the information associated with a given
 * headword.
 */
export interface LookupResult {
  headword: number;
  forms: Array<WordFormPayload>;
  /** Commonness is related to the orthography, not the sense. */
  hasCommonForm: boolean;
  senses: Array<Sense>;
}

export interface WordForm {
  common: 0 | 1;
  form: string;
  headword: number;
  kana: 0 | 1;
  tags: Array<string> | null;
}

export interface WordFormPayload {
  form: string;
  kana: boolean;
  tags: Array<string> | null;
  common: boolean;
}

export interface Sense {
  gloss: Array<string>;
  related?: Array<[string, number?]>;
  field?: Array<string>;
  misc?: Array<string>;
  info?: Array<string>;
  dialect?: Array<string>;
  antonym?: Array<[string, number]>;
  appliesToKanji?: Array<string>;
  languageSource?: Array<{
    lang: string;
    full: boolean;
    wasei: boolean;
    text: string;
  }>;
  pos: Array<string>;
}
