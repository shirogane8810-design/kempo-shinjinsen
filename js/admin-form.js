/* 入力と勝者の判定。DOM に依存せず、得点は常に bracket の slot 順で保持する。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.KempoAdminForm = factory(root.KempoLogic);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Logic) {
  'use strict';
  function createDraft(bracket, state, id) {
    const result = state.results[id];
    return { scores: result ? result.score.split('-').map(Number) : [0, 0],
      tieWinner: result?.winner ?? null, note: result?.note ?? '代表戦',
      teams: Logic.create(bracket, state).teams(id), baseRev: state.rev };
  }
  function changeScore(draft, slot, delta) {
    const scores = draft.scores.slice();
    scores[slot] = Math.max(0, Math.min(5, scores[slot] + delta));
    if (scores[slot] === draft.scores[slot]) return draft;
    return { ...draft, scores, tieWinner: null,
      note: scores[0] === scores[1] ? draft.note || '代表戦' : draft.note === '代表戦' ? '' : draft.note };
  }
  function evaluate(bracket, state, id, draft) {
    const match = bracket.matches.find(m => m.id === id), view = Logic.create(bracket, state);
    const valid = draft.scores.length === 2 && draft.scores.every(n => Number.isInteger(n) && n >= 0 && n <= 5);
    const tied = valid && draft.scores[0] === draft.scores[1];
    const winner = !valid ? null : tied ? ([0, 1].includes(draft.tieWinner) ? draft.tieWinner : null) : draft.scores[0] > draft.scores[1] ? 0 : 1;
    const teams = view.teams(id), previous = state.results[id];
    let reason = '';
    if (!match || teams.some(n => n == null)) reason = '対戦する両チームが確定していません。';
    else if (teams.some((n, i) => n !== draft.teams[i])) reason = '対戦チームが変わりました。閉じて試合を開き直してください。';
    else if (!valid) reason = '勝者数は0〜5で入力してください。';
    else if (winner === null) reason = '同点です。代表戦・判定で勝ったチームを選んでください';
    else if (previous && previous.winner !== winner && match.next && state.results[match.next.id])
      reason = `先に ${match.next.id} を取り消してください`;
    return { winner, tied, canSubmit: !reason, reason };
  }
  return { createDraft, changeScore, evaluate };
});
