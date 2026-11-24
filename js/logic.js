(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KempoLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const resultOf = (results, id) => own(results, id) ? results[id] : null;
  function emptyState() {
    return { ok: true, rev: 0, updatedAt: '', results: {}, current: { A: null, B: null, C: null, D: null } };
  }
  function sideTeam(bracket, results, matchId, slot, visited = new Set()) {
    if (visited.has(matchId)) return null;
    const match = bracket.matches.find(m => m.id === matchId);
    const side = match && match.slots[slot];
    if (!side) return null;
    if (side.team != null) return side.team;
    const result = resultOf(results, side.from);
    if (!result || ![0, 1].includes(result.winner)) return null;
    visited.add(matchId);
    return sideTeam(bracket, results, side.from, result.winner, visited);
  }
  function create(bracket, state) {
    const results = state.results || {};
    const byId = new Map(bracket.matches.map(m => [m.id, m]));
    const teams = id => [0, 1].map(s => sideTeam(bracket, results, id, s));
    const done = id => !!resultOf(results, id);
    function courtView(court) {
      const matches = bracket.matches.filter(m => m.court === court).sort((a, b) => a.order - b.order);
      const explicit = byId.get((state.current || {})[court]);
      const playing = explicit && explicit.court === court && !done(explicit.id) ? explicit :
        matches.find(m => !done(m.id) && teams(m.id).every(n => n != null)) || null;
      const next = matches.find(m => !done(m.id) && (!playing || m.order > playing.order)) || null;
      return { playing, next, doneCount: matches.filter(m => done(m.id)).length, total: matches.length };
    }
    function matchStatus(id) {
      const m = byId.get(id);
      if (!m) return 'waiting';
      if (done(id)) return 'done';
      if (courtView(m.court).playing?.id === id) return 'playing';
      return teams(id).every(n => n != null) ? 'ready' : 'waiting';
    }
    function phaseNow() {
      const pending = bracket.matches.filter(m => !done(m.id));
      if (!pending.length) return { no: null, label: '全試合終了', rest: false, done: true };
      const no = Math.min(...pending.map(m => m.phase));
      const phase = bracket.phases.find(p => p.no === no);
      const rest = no === bracket.rest_after_phase + 1;
      return { ...phase, label: rest ? '休憩（コートの合体・移動）' : phase.label, rest, done: false };
    }
    function teamNext(no) {
      no = Number(no);
      let match = bracket.matches.find(m => m.slots.some(s => s.team === no));
      if (!match) return null;
      while (match) {
        const result = resultOf(results, match.id);
        if (!result) return { status: 'next', id: match.id, court: match.court };
        if (sideTeam(bracket, results, match.id, result.winner) !== no)
          return { status: 'eliminated', id: match.id, court: match.court };
        if (!match.next) return { status: 'champion', id: match.id, court: match.court };
        match = byId.get(match.next.id);
      }
      return null;
    }
    function canUndo(id) {
      const m = byId.get(id);
      return !!m && done(id) && (!m.next || !done(m.next.id));
    }
    function redSide(id) {
      const t = teams(id);
      return t.some(n => n == null) ? null : (t[0] < t[1] ? 0 : 1);
    }
    return { teams, courtView, matchStatus, phaseNow, teamNext, canUndo, redSide };
  }
  // モック用の純粋な更新関数。失敗時は入力 state を変更しない。
  function applyAction(bracket, state, action, at = new Date().toISOString()) {
    const next = JSON.parse(JSON.stringify(state));
    const logic = create(bracket, state);
    const match = bracket.matches.find(m => m.id === action.id);
    const fail = error => ({ ok: false, error });
    if (action.action === 'result') {
      if (!match || ![0, 1].includes(action.winner) || !/^[0-5]-[0-5]$/.test(action.score) ||
          !['', '代表戦', '判定', '不戦勝', '延長'].includes(action.note || '')) return fail('invalid_result');
      if (logic.teams(match.id).some(n => n == null)) return fail('not_ready');
      const previous = resultOf(state.results, match.id);
      if (previous && previous.winner !== action.winner && match.next && resultOf(state.results, match.next.id))
        return fail('next_has_result');
      next.results[match.id] = { winner: action.winner, score: action.score, note: action.note || '', at };
      if (next.current[match.court] === match.id) next.current[match.court] = null;
    } else if (action.action === 'undo') {
      if (!match || !resultOf(state.results, match.id)) return fail('no_result');
      if (!logic.canUndo(match.id)) return fail('next_has_result');
      delete next.results[match.id];
      // 取り消しで相手未定になった試合の明示指定を解除。
      const revised = create(bracket, next);
      for (const court of bracket.courts) {
        if (next.current[court] && revised.teams(next.current[court]).some(n => n == null)) next.current[court] = null;
      }
    } else if (action.action === 'setCurrent') {
      if (!bracket.courts.includes(action.court) || (action.id !== null &&
          (!match || match.court !== action.court || resultOf(state.results, match.id)))) return fail('invalid_current');
      next.current[action.court] = action.id;
    } else if (action.action === 'reset') {
      if (action.confirm !== 'RESET') return fail('confirmation_required');
      next.results = {};
      next.current = emptyState().current;
    } else return fail('invalid_action');
    return { ...next, ok: true, rev: state.rev + 1, updatedAt: at, conflict: action.baseRev !== state.rev };
  }
  return { emptyState, sideTeam, create, applyAction };
});
