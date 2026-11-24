/* 閲覧画面。取得失敗時は直前の state と DOM を保持する。 */
(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  let bracket, api, state = KempoLogic.emptyState(), block = '男子', busy = false, timer;
  const logic = () => KempoLogic.create(bracket, state);
  const name = no => { const t = bracket.teams[no]; return t ? `${t.no} ${t.short}${t.suffix}` : ''; };
  const shortName = no => { const t = bracket.teams[no]; return t ? t.short + t.suffix : ''; };
  function teamInfo(no) {
    $('team-title').textContent = bracket.teams[no].name;
    const next = logic().teamNext(no);
    $('team-info').textContent = next.status === 'champion' ? '優勝' : next.status === 'eliminated' ? `${next.id}で敗退` : `次は ${next.id}（${next.court}コート）`;
    $('team-dialog').showModal();
  }
  function teamButton(match, slot) {
    const no = logic().teams(match.id)[slot];
    const button = el(no == null ? 'div' : 'button', null, 'team');
    const red = logic().redSide(match.id);
    button.append(el('span', red === null ? '—' : red === slot ? '赤' : '白', 'sash' + (red === slot ? ' red' : '')));
    const text = el('span', no == null ? `${match.slots[slot].from}の勝者` : name(no));
    if (no != null && bracket.teams[no].sub) text.append(el('small', bracket.teams[no].sub));
    button.append(text);
    if (no != null) button.onclick = () => teamInfo(no);
    return button;
  }
  function render() {
    const view = logic(), phase = view.phaseNow();
    $('updated').textContent = '最終更新 ' + (state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '—');
    $('phase-label').textContent = phase.label;
    $('phase-mini').textContent = phase.done ? '全試合終了' : 'いま：' + phase.label;
    $('phase-label').classList.toggle('all-done', phase.done);
    const chips = bracket.phases.flatMap(p => {
      const done = phase.done || p.no < phase.no;
      const chip = el('li', (done ? '✓ ' : '') + '①②③④⑤⑥⑦'[p.no - 1] + ' ' + p.label,
        done ? 'done' : p.no === phase.no && !phase.rest ? 'now' : '');
      if (p.no !== bracket.rest_after_phase) return [chip];
      const restDone = phase.done || phase.no > p.no + 1;
      return [chip, el('li', restDone ? '✓ 休憩' : '休憩', restDone ? 'done' : phase.rest ? 'now' : '')];
    });
    $('phases').replaceChildren(...chips);
    const current = $('phases').querySelector('.now');
    if (current) {
      current.setAttribute('aria-current', 'step');
      // container 非対応のブラウザでも、更新でページの読んでいる位置を変えない。
      const { scrollX, scrollY } = window;
      current.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant', container: 'nearest' });
      if (window.scrollX !== scrollX || window.scrollY !== scrollY)
        window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
    }
    $('champions').hidden = !phase.done;
    $('champions').replaceChildren(...(phase.done ? ['男子', '女子'].map(b => {
      const final = bracket.matches.find(m => m.block === b && !m.next);
      const winner = view.teams(final.id)[state.results[final.id].winner];
      const card = el('div', null, b === '女子' ? 'women' : 'men');
      card.append(el('p', b + ' 優勝'), el('strong', shortName(winner)));
      return card;
    }) : []));
    $('courts').replaceChildren(...bracket.courts.map(court => {
      const courtState = view.courtView(court), { doneCount, total } = courtState;
      const resting = court === 'A' && phase.rest;
      const playing = resting ? null : courtState.playing;
      const next = resting ? courtState.playing || courtState.next : courtState.next;
      const card = el('article', null, 'court ' + ((playing || next)?.block === '女子' ? 'women' : 'men'));
      card.append(el('h3', court + 'コート'));
      if (playing) {
        card.append(el('p', '試合中', 'label'), el('strong', playing.id, 'match-id'), teamButton(playing, 0), teamButton(playing, 1));
      } else if (doneCount !== total) {
        card.append(el('p', resting ? '休憩（コートの合体・移動）' : '待機中', 'court-status'));
      }
      const nextBox = el('div', null, 'next');
      if (doneCount === total) {
        nextBox.append(el('p', 'このコートの試合は終了', 'court-finished'));
        if (court !== 'A') nextBox.append(el('p', '（決勝はAコート）'));
      } else if (next) {
        const opponents = view.teams(next.id).map((no, i) => no != null ? shortName(no) : next.slots[i].from + 'の勝者');
        nextBox.append(el('strong', '次 ' + next.id), el('p', '（' + opponents.join(' ― ') + '）'));
      } else {
        nextBox.append(el('p', 'この試合がこのコートの最終試合'));
      }
      card.append(nextBox, el('p', `${doneCount}/${total}試合 済`, 'count'));
      return card;
    }));
    renderTree();
  }
  function renderTree() {
    KempoBracketView.render($('bracket'), bracket, state, block, { onTeam: teamInfo });
  }

  async function refresh() {
    if (!api || busy) return;
    busy = true; $('refresh').disabled = true;
    try { state = await api.load(); render(); $('message').textContent = ''; }
    catch (e) {
      $('message').className = 'message' + (e.message === 'not_configured' ? '' : ' error');
      $('message').textContent = e.message === 'not_configured' ? '速報は準備中です。大会当日（12月5日）に結果が表示されます。'
        : '更新できませんでした。電波の良い場所でもう一度押してください（表は前回の内容のままです）';
    }
    finally { busy = false; $('refresh').disabled = false; }
  }
  function setAuto() {
    clearInterval(timer);
    try { localStorage.setItem('kempo-auto-refresh', $('auto').checked ? '1' : '0'); } catch (_) {}
    // 閲覧者が一斉に読みに来ないよう少しずらし、画面を見ていない間は読みに行かない（サーバーの負荷対策）。
    if ($('auto').checked) timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000 + Math.floor(Math.random() * 5000));
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && $('auto').checked) refresh(); });
  // 表示タブ（トーナメント表／進行状況）。#progress で進行状況を直接開ける。
  function showView(view) {
    document.querySelectorAll('[data-view]').forEach(b => {
      const on = b.dataset.view === view;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      $('view-' + b.dataset.view).hidden = !on;
    });
    history.replaceState(null, '', location.pathname + location.search + (view === 'progress' ? '#progress' : ''));
    if (bracket) render();
  }
  document.querySelectorAll('[data-view]').forEach(button => {
    button.onclick = () => showView(button.dataset.view);
    button.onkeydown = e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const other = document.querySelector(`[data-view]:not([data-view="${button.dataset.view}"])`); other.click(); other.focus(); } };
  });
  if (location.hash === '#progress') showView('progress');
  $('close-dialog').onclick = () => $('team-dialog').close();
  $('team-dialog').onclick = e => { if (e.target === $('team-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientY < r.top) e.target.close(); } };
  $('refresh').onclick = () => api ? refresh() : init();
  $('auto').onchange = setAuto;
  document.querySelectorAll('[data-block]').forEach(button => {
    button.onclick = () => {
      block = button.dataset.block;
      document.querySelectorAll('[data-block]').forEach(b => { b.setAttribute('aria-selected', String(b === button)); b.tabIndex = b === button ? 0 : -1; });
      $('bracket').setAttribute('aria-labelledby', button.id);
      if (bracket) renderTree();
    };
    button.onkeydown = e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const other = $(block === '男子' ? 'tab-women' : 'tab-men'); other.click(); other.focus(); } };
  });
  async function init() {
    try {
      $('refresh').disabled = true;
      const response = await fetch('bracket.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('bracket');
      bracket = await response.json(); api = KempoAPI.create(bracket);
      $('mock').hidden = !api.mock;
      try { $('auto').checked = localStorage.getItem('kempo-auto-refresh') === '1'; } catch (_) {}
      setAuto();
      render(); await refresh();
    } catch (_) { $('message').className = 'message error'; $('message').textContent = '更新できませんでした。もう一度押してください'; }
    finally { $('refresh').disabled = false; }
  }
  await init();
})();
