(function (root) {
  'use strict';
  const KEY = 'kempo-live-mock';
  function create(bracket, config = root.KEMPO_CONFIG || {}) {
    // 11/24: 公開版で apiUrl 未設定のとき、勝手にテストモードにしない（閲覧者の端末だけの偽結果が出るため）。
    const mock = new URLSearchParams(root.location.search).get('mock') === '1';
    const ready = mock || !!config.apiUrl;
    function readMock() {
      const saved = root.localStorage.getItem(KEY);
      return saved ? JSON.parse(saved) : root.KempoLogic.emptyState();
    }
    async function request(options) {
      if (!config.apiUrl) throw new Error('not_configured');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(config.apiUrl, { ...options, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('network_error');
        const state = await response.json();
        if (!state.ok) throw new Error(state.error || 'server_error');
        if (!Number.isInteger(state.rev) || !state.results || !state.current) throw new Error('invalid_response');
        return state;
      } finally { clearTimeout(timeout); }
    }
    async function load() { return mock ? readMock() : request({ method: 'GET' }); }
    async function post(action) {
      if (!mock) return request({ method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(action) });
      if (action.action === 'check') return readMock();
      const write = () => {
        const next = root.KempoLogic.applyAction(bracket, readMock(), action);
        if (!next.ok) throw new Error(next.error);
        root.localStorage.setItem(KEY, JSON.stringify(next));
        return next;
      };
      // 同一ブラウザの複数タブも書き込みを直列化。
      return root.navigator?.locks ? root.navigator.locks.request(KEY, write) : write();
    }
    return { mock, ready, load, post };
  }
  root.KempoAPI = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
