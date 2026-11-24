(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const button = (text, fn, cls) => { const b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; };
  let bracket, api, state = KempoLogic.emptyState(), token = '', block = '男子';
  let busy = false, loading = false, pending = null, timer, selected = null, draft = null;
  const logic = () => KempoLogic.create(bracket, state);
  const shortName = no => { const t = bracket.teams[no]; return t ? t.short + t.suffix : ''; };
  function message(text, error = false) {
    for (const id of ['message', 'editor-message']) {
      $(id).textContent = text; $(id).className = 'message' + (error ? ' error' : '');
    }
  }
  function retryVisible(show) { $('retry').hidden = $('editor-retry').hidden = !show; }
  function errorText(error) {
    return ({ unauthorized: '合言葉が違います。「合言葉を変える」から入力し直してください。',
      next_has_result: `先に ${selected?.next?.id || '次の試合'} を取り消してください`,
      not_ready: '対戦する両チームが確定していません。', no_result: 'この試合の結果はすでに取り消されています。',
      invalid_current: '試合中を選び直してください。', invalid_result: '勝者と勝者数を確認してください。',
      confirmation_required: '確認文字 RESET を入力してください。' })[error.message] || '保存できませんでした。入力内容を残しています。';
  }
  function renderTree() {
    KempoBracketView.render($('bracket'), bracket, state, block, { onMatch: openMatch });
  }
  function render() {
    if (!bracket) return;
    const phase = logic().phaseNow();
    $('updated').textContent = '最終保存 ' + (state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString('ja-JP') : '—');
    $('phase-label').textContent = phase.label;
    $('phases').replaceChildren(...bracket.phases.flatMap(p => {
      const done = phase.done || p.no < phase.no;
      const chip = el('li', (done ? '✓ ' : '') + '①②③④⑤⑥⑦'[p.no - 1] + ' ' + p.label,
        done ? 'done' : p.no === phase.no && !phase.rest ? 'now' : '');
      if (p.no !== bracket.rest_after_phase) return [chip];
      const restDone = phase.done || phase.no > p.no + 1;
      return [chip, el('li', restDone ? '✓ 休憩' : '休憩', restDone ? 'done' : phase.rest ? 'now' : '')];
    }));
    const current = $('phases').querySelector('.now');
    if (current) {
      current.setAttribute('aria-current', 'step');
      $('phases').scrollLeft = current.offsetLeft - $('phases').offsetLeft - ($('phases').clientWidth - current.clientWidth) / 2;
    }
    renderTree(); updateEditor();
    $('reset-form').querySelector('button').disabled = busy || !!pending;
    $('change-token').disabled = busy;
  }
  function openMatch(id) {
    if (busy || pending) return;
    selected = bracket.matches.find(m => m.id === id);
    draft = KempoAdminForm.createDraft(bracket, state, id);
    const red = logic().redSide(id), order = red === 1 ? [1, 0] : [0, 1];
    $('match-title').textContent = `${id} · ${selected.block}${selected.round}`;
    $('opponents').replaceChildren(...order.map((slot, position) => {
      const no = draft.teams[slot], team = bracket.teams[no], card = el('div', null, 'opponent');
      card.dataset.slot = slot;
      const choose = button('', () => {
        if (!busy && !pending && KempoAdminForm.evaluate(bracket, state, id, draft).tied) {
          draft = { ...draft, tieWinner: slot, note: draft.note || '代表戦' }; updateEditor();
        }
      }, 'team-choice');
      choose.append(el('span', red === null ? '—' : position === 0 ? '赤' : '白', 'sash' + (red !== null && position === 0 ? ' red' : '')),
        el('strong', team ? `${team.no} ${shortName(no)}` : `相手待ち（${selected.slots[slot].from}の勝者）`));
      if (team?.sub) choose.append(el('small', team.sub));
      card.append(choose, el('p', '勝者数', 'score-label'));
      const counter = el('div', null, 'counter'), value = el('output', draft.scores[slot]);
      value.setAttribute('aria-label', `${position === 0 ? '赤' : '白'}の勝者数`);
      value.setAttribute('aria-live', 'polite');
      for (const delta of [-1, 1]) {
        const b = button(delta < 0 ? '−' : '＋', () => {
          draft = KempoAdminForm.changeScore(draft, slot, delta); updateEditor();
        });
        b.dataset.delta = delta;
        b.setAttribute('aria-label', `${position === 0 ? '赤' : '白'}の勝者数を${delta < 0 ? '減らす' : '増やす'}`);
        if (delta === 1) counter.append(value); counter.append(b);
      }
      card.append(counter); return card;
    }));
    $('editor-message').textContent = '';
    $('match-editor').hidden = false; $('admin-layout').classList.add('editing');
    updateEditor(); $('match-title').focus({ preventScroll: true });
  }
  function closeEditor(restoreFocus = true) {
    const id = selected?.id;
    selected = null; draft = null;
    $('match-editor').hidden = true; $('admin-layout').classList.remove('editing');
    if (restoreFocus && id) Array.from(document.querySelectorAll('.match-target')).find(n => n.dataset.match === id)?.focus({ preventScroll: true });
  }
  function updateEditor() {
    if (!selected || !draft) return;
    const status = KempoAdminForm.evaluate(bracket, state, selected.id, draft), view = logic();
    const teams = view.teams(selected.id), ready = teams.every(n => n != null) && teams.every((n, i) => n === draft.teams[i]);
    const disabled = busy || !!pending || !ready, result = state.results[selected.id];
    $('editor-notice').textContent = result ? '確定済みの結果です。点数・メモを直して確定できます。' : '左右のチームの真下で勝者数を入力してください。';
    for (const card of $('opponents').children) {
      const slot = Number(card.dataset.slot), win = ready && status.winner === slot;
      card.classList.toggle('selected-winner', win);
      card.classList.toggle('loser', ready && status.winner !== null && !win);
      const choose = card.querySelector('.team-choice');
      choose.setAttribute('aria-pressed', String(win)); choose.disabled = disabled || !status.tied;
      card.querySelector('output').textContent = draft.scores[slot];
      card.querySelectorAll('[data-delta]').forEach(b => {
        b.disabled = disabled || (Number(b.dataset.delta) < 0 ? draft.scores[slot] === 0 : draft.scores[slot] === 5);
      });
    }
    const winner = ready && status.winner !== null ? shortName(draft.teams[status.winner]) : null;
    $('winner-banner').textContent = winner ? `勝者：${winner}` : ready ? '勝者を選んでください' : '相手待ち';
    $('winner-banner').className = 'winner-banner' + (winner ? selected.block === '女子' ? ' women' : ' men' : ' undecided');
    $('tie-hint').hidden = !ready || !status.tied;
    $('result-note').value = draft.note; $('result-note').disabled = disabled;
    $('save-result').disabled = busy || !!pending || !status.canSubmit;
    $('result-reason').textContent = status.reason;
    $('undo-result').hidden = !result;
    $('undo-result').disabled = busy || !!pending || !view.canUndo(selected.id);
    $('undo-reason').textContent = result && !view.canUndo(selected.id) ? `先に ${selected.next.id} を取り消してください` : '';
    $('set-current').disabled = disabled || !!result;
    $('close-editor').disabled = busy || !!pending;
  }
  function showEditor() { $('login').hidden = !!token; $('editor').hidden = !token; $('change-token').hidden = !token; }
  async function refresh() {
    if (!api || busy || loading || pending || !token) return;
    loading = true; $('refresh').disabled = true;
    try {
      const fresh = await api.load();
      if (busy || pending || fresh.rev < state.rev) return;
      const changed = fresh.rev !== state.rev;
      state = fresh;
      // 編集窓の DOM と draft を保持。チーム変更時は誤保存を止める。
      if (changed || !$('bracket').children.length) render();
    } catch (_) { message('更新できませんでした。もう一度押してください', true); }
    finally { loading = false; $('refresh').disabled = false; }
  }
  async function send(action, retry = false) {
    if (busy || !token || (!retry && pending)) return;
    const request = retry ? pending : { ...action, baseRev: action.action === 'result' ? draft.baseRev : state.rev };
    if (!request) return;
    pending = request; busy = true; retryVisible(false); render();
    try {
      // 応答だけが失われた場合、同じ結果を二重送信しない。
      if (retry) {
        const fresh = await api.load(), r = fresh.results[request.id];
        if ((request.action === 'result' && r && r.winner === request.winner && r.score === request.score && r.note === request.note) ||
            (request.action === 'undo' && !r)) {
          state = fresh; pending = null; closeEditor(false); message('保存済みの結果を読み込みました。'); return;
        }
        if (request.action === 'reset' && fresh.rev !== request.baseRev) {
          state = fresh; pending = null; message('ほかの端末で更新されました。全結果を消す場合は、もう一度 RESET を入力してください。'); $('reset-confirm').value = ''; return;
        }
      }
      state = await api.post({ ...request, token });
      pending = null;
      if (request.action === 'reset') $('reset-confirm').value = '';
      closeEditor(false);
      message(state.conflict ? 'ほかの端末で更新されました' : '保存しました。');
    } catch (error) { message(errorText(error), true); retryVisible(true); }
    finally { busy = false; render(); }
  }
  $('save-result').onclick = () => {
    if (!draft) return;
    const status = KempoAdminForm.evaluate(bracket, state, selected.id, draft);
    if (status.canSubmit) send({ action: 'result', id: selected.id, winner: status.winner, score: draft.scores.join('-'), note: draft.note });
  };
  $('undo-result').onclick = () => { if (selected && logic().canUndo(selected.id)) send({ action: 'undo', id: selected.id }); };
  $('set-current').onclick = () => { if (selected) send({ action: 'setCurrent', court: selected.court, id: selected.id }); };
  $('result-note').onchange = () => { draft = { ...draft, note: $('result-note').value }; };
  $('close-editor').onclick = () => { if (!busy && !pending) closeEditor(); };
  $('match-editor').onkeydown = e => { if (e.key === 'Escape' && !busy && !pending) { e.preventDefault(); closeEditor(); } };
  $('retry').onclick = $('editor-retry').onclick = () => send(null, true);
  $('refresh').onclick = async () => {
    if (!api) return init();
    if (busy) return;
    pending = null; retryVisible(false); message(''); await refresh(); render();
  };
  $('login').onsubmit = async e => {
    e.preventDefault(); const typed = $('token').value.trim(); if (!typed) return;
    // 11/24: 当日に「保存できない」と気づくのを防ぐため、入る前に合言葉をサーバーで確かめる。
    try { state = await api.post({ action: 'check', token: typed }); }
    catch (error) {
      $('login-hint').textContent = error.message === 'unauthorized' ? '合言葉が違います。'
        : error.message === 'not_configured' ? 'まだ結果の保存先（Google）が設定されていません。' : '確認できませんでした。電波を確かめてもう一度押してください。';
      return;
    }
    token = typed; $('login-hint').textContent = '';
    localStorage.setItem('kempo-admin-token', token); $('token').value = ''; showEditor(); await refresh(); render();
  };
  $('change-token').onclick = () => {
    if (busy) return;
    localStorage.removeItem('kempo-admin-token'); token = ''; showEditor(); $('token').focus();
  };
  $('reset-form').onsubmit = e => { e.preventDefault(); if ($('reset-confirm').value === 'RESET' && !pending) send({ action: 'reset', confirm: 'RESET' }); };
  document.querySelectorAll('[data-block]').forEach(tab => {
    tab.onclick = () => {
      block = tab.dataset.block;
      document.querySelectorAll('[data-block]').forEach(b => { b.setAttribute('aria-selected', String(b === tab)); b.tabIndex = b === tab ? 0 : -1; });
      $('bracket').setAttribute('aria-labelledby', tab.id);
      if (bracket) renderTree();
    };
    tab.onkeydown = e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const other = $(block === '男子' ? 'tab-women' : 'tab-men'); other.click(); other.focus(); } };
  });
  async function init() {
    try {
      const response = await fetch('bracket.json', { cache: 'no-cache' }); if (!response.ok) throw new Error('bracket');
      bracket = await response.json(); api = KempoAPI.create(bracket);
      $('mock').hidden = !api.mock;
      $('login-hint').textContent = api.mock ? 'テストモードでは任意の合言葉で入力できます。結果はこのブラウザだけに保存されます。'
        : !api.ready ? 'まだ結果の保存先（Google）が設定されていません。設定が済むまで入力できません。' : '';
      token = localStorage.getItem('kempo-admin-token') || ''; showEditor(); render(); await refresh();
      clearInterval(timer); timer = setInterval(refresh, 15000);
    } catch (_) { message('更新できませんでした。もう一度押してください', true); }
  }
  await init();
})();
