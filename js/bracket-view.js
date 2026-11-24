/* Shared pamphlet SVG renderer for viewer and admin. */
(function (root) {
  'use strict';
  function render(container, bracket, state, block, { onTeam, onMatch } = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const svgEl = (tag, attrs, text) => {
      const node = document.createElementNS(ns, tag);
      Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
      if (text != null) node.textContent = text;
      return node;
    };
    const matches = new Map(bracket.matches.map(m => [m.id, m])), view = KempoLogic.create(bracket, state);
    const tree = bracket.trees[block];
    const leavesOf = node => node.team != null ? [node] : node.children.flatMap(leavesOf);
    const halves = tree.children.map(leavesOf);
    // make_tournament.py の build_page と同じ用紙座標。見出しとルール部分は除く。
    const marginLeft = 26.2, marginRight = 575.2, top = 97.5, boxHeight = 140;
    const bottom = block === '男子' ? 841.89 - 20 - 8 : 586 - 44.2 - 8;
    const pitch = Math.min(40.02, (marginRight - marginLeft) / (Math.max(...halves.map(h => h.length)) - 1 + 0.713));
    const boxWidth = pitch * 0.713;
    const levels = Math.max(...tree.children.map(n => matches.get(n.match).level));
    const step = Math.min(50, (bottom - top - 2 * boxHeight) / (2 * levels + 1.6));
    const svg = svgEl('svg', { viewBox: `12 ${top - 12} 577.4 ${bottom - top + 24}`,
      role: 'group', 'aria-label': block + 'トーナメント表' });
    svg.style.setProperty('--tree-color', block === '女子' ? '#D6587A' : '#306BB4');
    const lines = svgEl('g'), labels = svgEl('g'), teams = svgEl('g');
    svg.append(lines, labels, teams);

    function branch(child, x, y, match, slot) {
      const won = state.results[match.id]?.winner === slot;
      // 合流する横線も中点で分け、勝った側の経路だけを色付けする。
      lines.append(svgEl('path', { d: `M ${child.x} ${child.y} V ${y} H ${x}`,
        class: 'tree-line' + (won ? ' won' : ''), 'data-match': match.id, 'data-slot': slot }));
    }
    function matchLabel(match, x, y, down, final = false) {
      const result = state.results[match.id];
      const label = svgEl('text', { x, y, 'text-anchor': final ? 'start' : 'middle',
        class: 'tree-title' + (final ? ' tree-final' : ''), 'data-match': match.id },
      final ? `決勝　${match.court}コート` : match.id);
      if (result?.score) label.append(svgEl('tspan', { dx: 5, class: 'tree-score' }, result.score));
      if (onMatch) {
        const status = result ? 'done' : view.teams(match.id).every(n => n != null) ? 'ready' : 'waiting';
        const target = svgEl('g', { class: 'match-target ' + status, 'data-match': match.id,
          role: 'button', tabindex: 0, 'aria-label': `${match.id} ${match.round} ${status === 'waiting' ? '相手待ち' : result ? '結果を直す' : '結果を入力'}` });
        // 11/24 Claude: 札は文字の幅ぴったりの小さな角丸にする（大きな四角がチーム枠や隣の札に重なっていたため）。閲覧用には追加しない。
        const fs = final ? 10 : 9;
        const textW = s => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2000 ? fs : fs * 0.56), 0);
        const w = textW(final ? `決勝　${match.court}コート` : match.id) + (result?.score ? 5 + textW(result.score) : 0) + 8;
        const h = fs + 4;
        target.append(svgEl('rect', { x: final ? x - 4 : x - w / 2, y: y - fs - 0.5,
          width: w, height: h, rx: h / 2, class: 'match-hit' }), label);
        target.addEventListener('click', () => onMatch(match.id));
        target.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMatch(match.id); }
        });
        labels.append(target);
      } else labels.append(label);
      if (result?.note) labels.append(svgEl('text', { x, y: y + (final ? 11 : down ? -9.5 : 8),
        'text-anchor': final ? 'start' : 'middle', class: 'tree-note' }, result.note));
    }
    function teamBox(leaf, x, y) {
      const team = bracket.teams[leaf.team], status = view.teamNext(leaf.team)?.status;
      const g = svgEl('g', { class: 'tree-click' + (status === 'eliminated' ? ' lost' : status === 'champion' ? ' champion' : ''),
        'data-team': leaf.team, ...(onTeam ? { tabindex: 0, role: 'button', 'aria-label': team.name + 'の次の試合' } : {}) });
      g.append(svgEl('title', {}, team.name));
      g.append(svgEl('rect', { x: x - boxWidth / 2, y, width: boxWidth, height: boxHeight, class: 'tree-box' }));
      g.append(svgEl('text', { x, y: y + 15, 'text-anchor': 'middle', class: 'tree-number' }, team.no));
      // 原稿と同じ収まり計算。長い大学名と合同の所属名も枠内に全文を置く。
      const need = Array.from(team.short).length * 9 * 1.02 + (team.suffix ? 9 * 1.1 : 0) + Array.from(team.sub).length * 6.5 * 1.02;
      const size = 9 * Math.min(1, (boxHeight - 22 - 6) / need);
      let cursor = y + 22;
      function vertical(text, fontSize, cls) {
        if (!text) return;
        g.append(svgEl('text', { x, y: cursor, class: cls, 'font-size': fontSize,
          'writing-mode': 'vertical-rl', 'text-orientation': 'mixed', 'letter-spacing': fontSize * 0.02 }, text));
        cursor += Array.from(text).length * fontSize * 1.02;
      }
      vertical(team.short, size, 'tree-team');
      if (team.suffix) {
        g.append(svgEl('text', { x, y: cursor + size * 0.9, 'text-anchor': 'middle',
          'font-size': size * 0.9, class: 'tree-suffix' }, team.suffix));
        cursor += size * 1.1;
      }
      vertical(team.sub, 6.5 * size / 9, 'tree-sub');
      if (onTeam) {
        g.addEventListener('click', () => onTeam(leaf.team));
        g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTeam(leaf.team); } });
      }
      teams.append(g);
    }
    function drawHalf(root, leaves, down) {
      const edge = down ? top + boxHeight : bottom - boxHeight;
      const width = pitch * (leaves.length - 1) + boxWidth;
      const x0 = (marginLeft + marginRight - width) / 2 + boxWidth / 2;
      const xs = new Map(leaves.map((leaf, i) => [leaf.team, x0 + pitch * i]));
      leaves.forEach(leaf => teamBox(leaf, xs.get(leaf.team), down ? top : bottom - boxHeight));
      // draw_half と同じく、子の中点と回戦 level で座標を決める（シードも保持）。
      function walk(node) {
        if (node.team != null) return { x: xs.get(node.team), y: edge };
        const children = node.children.map(walk), match = matches.get(node.match);
        const x = (children[0].x + children[1].x) / 2;
        const y = edge + (down ? 1 : -1) * step * match.level;
        children.forEach((child, slot) => branch(child, x, y, match, slot));
        matchLabel(match, x, y + (down ? -3 : 10), down);
        return { x, y };
      }
      return walk(root);
    }
    const upper = drawHalf(tree.children[0], halves[0], true);
    const lower = drawHalf(tree.children[1], halves[1], false);
    const final = matches.get(tree.match), mid = (upper.y + lower.y) / 2;
    const center = (upper.x + lower.x) / 2;
    branch(upper, center, mid, final, 0);
    branch(lower, center, mid, final, 1);
    matchLabel(final, Math.max(upper.x, lower.x) + 5, mid + 3.5, true, true);
    const left = container.scrollLeft;
    container.replaceChildren(svg); container.scrollLeft = left;
  }

  root.KempoBracketView = { render };
})(globalThis);
