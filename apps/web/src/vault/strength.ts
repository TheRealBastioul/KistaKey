// zxcvbn-ts password scoring for the health report. Its dictionaries are
// large, so they load on first use in their own chunk (dynamic import), not
// with the app. Scoring runs on the main thread: it's fast per password and
// results are cached per item revision (health.ts).
export type PasswordScorer = (password: string, userInputs: string[]) => number;

let loading: Promise<PasswordScorer> | null = null;

export function loadPasswordScorer(): Promise<PasswordScorer> {
  loading ??= (async () => {
    const [{ zxcvbn, zxcvbnOptions }, common, en] = await Promise.all([
      import("@zxcvbn-ts/core"),
      import("@zxcvbn-ts/language-common"),
      import("@zxcvbn-ts/language-en"),
    ]);
    zxcvbnOptions.setOptions({
      translations: en.translations,
      graphs: common.adjacencyGraphs,
      dictionary: { ...common.dictionary, ...en.dictionary },
    });
    return (password, userInputs) => zxcvbn(password, userInputs).score;
  })();
  // A failed chunk load (offline) may be retried later.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
