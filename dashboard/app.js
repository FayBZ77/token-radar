// Token Radar's dashboard. It renders window.RADAR — the board main.ts wrote beside this page as
// data.js — as a ranked, filterable board with a detail drawer per protocol. No network, no
// fetch: every byte on screen was computed by the model from the sealed snapshot, and the
// drawer's arithmetic recomputes each row's implied value from the factors it prints.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var state = {
    tab: 'pre',
    q: '',
    category: 'all',
    chain: 'all',
    band: 'all',
    watchOnly: false,
    sort: 'rank',
    dir: 1,
    selected: null,
  };

  // ---------- formatting ----------

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtFull(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    if (days >= 30) return Math.round(days / 30.4) + ' mo';
    return days + ' d';
  }
  function fmtMult(n) {
    return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0') + 'x';
  }
  function fmtFactor(n) {
    return 'x' + n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }

  // ---------- tiny DOM helper ----------

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---------- data access ----------

  function tabRows() {
    return state.tab === 'pre' ? DATA.rows : DATA.live;
  }
  function rankOf(row) {
    return state.tab === 'pre' ? row.rank : row.live_rank;
  }

  var BANDS = [
    { id: 'all', label: 'Any implied value', test: function () { return true; } },
    { id: 'huge', label: 'Implied $250M and up', test: function (v) { return v >= 250e6; } },
    { id: 'big', label: 'Implied $50M to $250M', test: function (v) { return v >= 50e6 && v < 250e6; } },
    { id: 'mid', label: 'Implied $10M to $50M', test: function (v) { return v >= 10e6 && v < 50e6; } },
    { id: 'small', label: 'Implied under $10M', test: function (v) { return v < 10e6; } },
  ];

  function visibleRows() {
    var band = BANDS.filter(function (b) { return b.id === state.band; })[0] || BANDS[0];
    var q = state.q.trim().toLowerCase();
    var rows = tabRows().filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (!band.test(r.implied_value_usd)) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'rank') { va = rankOf(a); vb = rankOf(b); }
      else if (key === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'change') { va = a.change_7d === null ? -Infinity : a.change_7d; vb = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else { va = a.implied_value_usd; vb = b.implied_value_usd; }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return rankOf(a) - rankOf(b);
    });
    return rows;
  }

  // The page's own copy of the model's last step: the factors the board prints multiply to the
  // board's number. Shown in the drawer so a reader can check the arithmetic, not just trust it.
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * row.model.peer_multiple * row.model.momentum_multiplier * row.model.record_multiplier * row.model.breadth_multiplier));
  }

  // ---------- masthead ----------

  function renderMasthead() {
    var c = DATA.counts;
    var stats = [
      { v: String(c.protocols), k: 'protocols in the snapshot' },
      { v: String(c.pre_token_rows), k: 'pre-token protocols ranked', em: true },
      { v: c.watchlist + ' / ' + c.watchlist, k: 'house watchlist covered' },
      { v: fmtUsd(c.total_implied_usd), k: 'implied pre-token value' },
      { v: String(DATA.peer_count), k: 'tokenized peers priced' },
    ];
    var head = el('div', null,
      el('div', { class: 'brand' },
        el('div', { class: 'mark', 'aria-hidden': 'true' }),
        el('div', null,
          el('h1', null, 'TOKEN ', el('span', { class: 'thin' }, 'RADAR')),
          el('p', { class: 'tagline' },
            'Every protocol that ', el('strong', null, 'records no token yet'), ', ranked by what its token would be worth ',
            'if its record held — and the steps to farm each one before it launches. Snapshot of ', DATA.as_of, '.'))),
      el('div', { class: 'stats' }, stats.map(function (s) {
        return el('div', { class: 'stat' },
          el('div', { class: 'v' }, s.em ? el('em', null, s.v) : s.v),
          el('div', { class: 'k', text: s.k }));
      })));
    document.getElementById('masthead').appendChild(head);
  }

  // ---------- controls ----------

  var els = {};

  function optionsFor(values, allLabel) {
    var out = [el('option', { value: 'all', text: allLabel })];
    values.forEach(function (v) { out.push(el('option', { value: v, text: v })); });
    return out;
  }

  function refreshSelects() {
    var rows = tabRows();
    var cats = {};
    var chains = {};
    rows.forEach(function (r) {
      cats[r.category || 'Uncategorized'] = (cats[r.category || 'Uncategorized'] || 0) + 1;
      r.chains.forEach(function (ch) { chains[ch] = (chains[ch] || 0) + 1; });
    });
    var byCount = function (m) {
      return Object.keys(m).sort(function (a, b) { return m[b] - m[a] || (a < b ? -1 : 1); });
    };
    var keepCat = state.category, keepChain = state.chain;
    els.category.replaceChildren.apply(els.category, optionsFor(byCount(cats), 'All categories'));
    els.chain.replaceChildren.apply(els.chain, optionsFor(byCount(chains).slice(0, 40), 'All chains'));
    els.category.value = cats[keepCat] ? keepCat : 'all';
    els.chain.value = chains[keepChain] ? keepChain : 'all';
    state.category = els.category.value;
    state.chain = els.chain.value;
    els.watchField.style.display = state.tab === 'pre' ? '' : 'none';
  }

  function renderControls() {
    var preTab = el('button', {
      class: 'tab', role: 'tab', id: 'tab-pre', 'aria-selected': 'true',
      onclick: function () { switchTab('pre'); },
    }, 'Pre-token radar ', el('span', { class: 'n', text: String(DATA.counts.pre_token_rows) }));
    var liveTab = el('button', {
      class: 'tab live', role: 'tab', id: 'tab-live', 'aria-selected': 'false',
      onclick: function () { switchTab('live'); },
    }, 'Already trading ', el('span', { class: 'n', text: String(DATA.counts.live_rows) }));
    els.preTab = preTab; els.liveTab = liveTab;

    els.q = el('input', {
      type: 'search', placeholder: 'Name, slug or category', 'aria-label': 'Search protocols',
      oninput: function () { state.q = els.q.value; renderTable(); },
    });
    els.category = el('select', { 'aria-label': 'Category', onchange: function () { state.category = els.category.value; renderTable(); } });
    els.chain = el('select', { 'aria-label': 'Chain', onchange: function () { state.chain = els.chain.value; renderTable(); } });
    els.band = el('select', { 'aria-label': 'Implied value band', onchange: function () { state.band = els.band.value; renderTable(); } },
      BANDS.map(function (b) { return el('option', { value: b.id, text: b.label }); }));
    els.watch = el('input', {
      type: 'checkbox',
      onchange: function () { state.watchOnly = els.watch.checked; renderTable(); },
    });
    els.watchField = el('label', { class: 'check' }, els.watch, ' House watchlist only');

    var wrap = el('div', { class: 'controls' },
      el('div', { class: 'tabs', role: 'tablist' }, preTab, liveTab),
      el('div', { class: 'filters' },
        el('div', { class: 'field' }, el('label', { text: 'Search' }), els.q),
        el('div', { class: 'field' }, el('label', { text: 'Category' }), els.category),
        el('div', { class: 'field' }, el('label', { text: 'Chain' }), els.chain),
        el('div', { class: 'field' }, el('label', { text: 'Value band' }), els.band),
        els.watchField),
      el('p', { class: 'formula' },
        'Implied value = TVL x the category\u2019s peer multiple (what tokenized protocols of its kind trade at, per dollar of TVL) ',
        'x a momentum factor from its 7-day TVL change x a track-record factor from how long it has run tokenless x a breadth factor for its chains. ',
        'It prices the record as it stands; it does not predict a launch.'));
    document.querySelector('main').appendChild(wrap);
  }

  function switchTab(tab) {
    state.tab = tab;
    state.sort = 'rank'; state.dir = 1;
    els.preTab.setAttribute('aria-selected', tab === 'pre' ? 'true' : 'false');
    els.liveTab.setAttribute('aria-selected', tab === 'live' ? 'true' : 'false');
    refreshSelects();
    renderTable();
  }

  // ---------- the board ----------

  var boardRoot = null;

  function sortHeader(label, key, numeric) {
    var sorted = state.sort === key;
    return el('th', {
      class: (numeric ? 'num ' : '') + (sorted ? 'sorted' : ''),
      onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
        renderTable();
      },
    }, label + (sorted ? (state.dir === 1 ? ' \u25b2' : ' \u25bc') : ''));
  }

  function statusChip(row) {
    if (row.token_status === 'live') return el('span', { class: 'chip live', text: 'Trading' + (row.symbol ? ' \u00b7 ' + row.symbol : '') });
    return el('span', { class: 'chip pre', text: 'Pre-token' });
  }

  function rowEl(row) {
    var rank = rankOf(row);
    var cells = [
      el('td', { class: 'rank', text: String(rank) }),
      el('td', { class: 'proto' },
        el('span', { class: 'name', text: row.name }),
        el('span', { class: 'cat', text: row.category || 'Uncategorized' })),
      el('td', null,
        statusChip(row), ' ',
        row.watchlist ? el('span', { class: 'chip wl', text: 'Watchlist' }) : null),
      el('td', { class: 'hideable' },
        el('span', { class: 'chip', text: row.chains.slice(0, 2).join(' \u00b7 ') + (row.chains.length > 2 ? ' +' + (row.chains.length - 2) : '') })),
      el('td', { class: 'num', text: fmtUsd(row.tvl_usd) }),
      el('td', { class: 'num ' + (row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(row.change_7d) }),
      el('td', { class: 'num hideable', text: fmtAge(row.age_days) }),
      el('td', { class: 'num hideable', text: fmtMult(row.model.peer_multiple) }),
      el('td', { class: 'num implied' },
        fmtUsd(row.implied_value_usd),
        row.token_status === 'live' && row.mcap_usd !== null
          ? el('span', { class: 'sub', text: 'actual ' + fmtUsd(row.mcap_usd) })
          : null),
    ];
    if (state.tab === 'live') {
      var gap = row.gap_pct;
      cells.push(el('td', { class: 'num' },
        gap === null ? 'n/a' : el('span', {
          class: 'chip ' + (gap >= 0 ? 'gap-up' : 'gap-down'),
          text: (gap >= 0 ? '+' : '') + Math.round(gap * 100) + '% vs market',
        })));
    }
    return el('tr', {
      class: rank <= 3 && state.sort === 'rank' ? 'top' + rank : '',
      'data-slug': row.slug,
      onclick: function () { openDrawer(row); },
    }, cells);
  }

  function renderTable() {
    var rows = visibleRows();
    var head = [
      sortHeader('#', 'rank', true),
      sortHeader('Protocol', 'name', false),
      el('th', { text: 'Status' }),
      el('th', { class: 'hideable', text: 'Chains' }),
      sortHeader('TVL', 'tvl', true),
      sortHeader('7d', 'change', true),
      sortHeader('Tokenless for', 'age', true),
      el('th', { class: 'num hideable', text: 'Peer x' }),
      sortHeader('Implied value', 'implied', true),
    ];
    if (state.tab === 'live') head.push(el('th', { class: 'num', text: 'Model vs market' }));
    var body = rows.length === 0
      ? el('div', { class: 'empty', text: 'No protocol matches these filters. Loosen one and the radar sweeps again.' })
      : el('table', { class: 'board' },
          el('thead', null, el('tr', null, head)),
          el('tbody', null, rows.map(rowEl)));
    var wrap = el('div', { class: 'boardwrap' }, body,
      el('p', {
        class: 'count-line',
        text: rows.length + ' of ' + tabRows().length + (state.tab === 'pre' ? ' pre-token protocols' : ' trading protocols') + ' \u00b7 click a row for its numbers and farm plan',
      }));
    if (boardRoot) boardRoot.replaceWith(wrap);
    else document.querySelector('main').appendChild(wrap);
    boardRoot = wrap;
  }

  // ---------- detail drawer ----------

  var drawerRoot = null;

  function fig(value, label) {
    return el('div', { class: 'fig' }, el('div', { class: 'v', text: value }), el('div', { class: 'k', text: label }));
  }

  function openDrawer(row) {
    state.selected = row.slug;
    var m = row.model;
    var check = impliedOf(row);
    var figs = [
      fig(fmtFull(row.tvl_usd), 'TVL in the snapshot'),
      fig(fmtFull(row.implied_value_usd), 'Implied value'),
      fig(fmtPct(row.change_7d), 'TVL change, 7 days'),
      fig(fmtAge(row.age_days), row.token_status === 'live' ? 'tracked for' : 'running with no token'),
    ];
    if (row.token_status === 'live' && row.mcap_usd !== null) {
      figs.push(fig(fmtFull(row.mcap_usd), 'Actual market cap'));
      figs.push(fig((row.gap_pct >= 0 ? '+' : '') + Math.round(row.gap_pct * 100) + '%', 'Model vs market'));
    }
    var why = el('div', { class: 'why' },
      el('div', { class: 'line' }, el('span', null, 'TVL'), el('span', null, fmtFull(row.tvl_usd))),
      el('div', { class: 'line' },
        el('span', null, 'Peer multiple \u00b7 ' + (row.category || 'Uncategorized') + ' (' + m.peer_count + (m.peer_count === 1 ? ' tokenized peer)' : ' tokenized peers)')),
        el('span', null, fmtFactor(m.peer_multiple))),
      el('div', { class: 'line' }, el('span', null, 'Momentum \u00b7 7d change ' + fmtPct(row.change_7d)), el('span', null, fmtFactor(m.momentum_multiplier))),
      el('div', { class: 'line' }, el('span', null, 'Track record \u00b7 ' + fmtAge(row.age_days) + ' tokenless'), el('span', null, fmtFactor(m.record_multiplier))),
      el('div', { class: 'line' }, el('span', null, 'Breadth \u00b7 ' + row.chains.length + (row.chains.length === 1 ? ' chain' : ' chains')), el('span', null, fmtFactor(m.breadth_multiplier))),
      el('div', { class: 'line total' }, el('span', null, 'Implied value'), el('span', null, fmtFull(row.implied_value_usd))),
      el('p', null,
        'The four factors multiply to ' + fmtFull(check) + ' \u2014 the board\u2019s number, recomputed here from the printed factors. ',
        row.token_status === 'live'
          ? 'Its token already trades, so the market\u2019s own cap stands beside the model\u2019s: the gap is the signal, in either direction.'
          : 'It records no token in the snapshot. This is what a token would be worth if the record held \u2014 not a promise that one launches.'));
    var drawer = el('div', null,
      el('div', { class: 'backdrop', onclick: closeDrawer }),
      el('aside', { class: 'drawer' + (row.token_status === 'live' ? ' live' : ''), 'aria-label': row.name + ' detail' },
        el('button', { class: 'close', 'aria-label': 'Close detail', onclick: closeDrawer }, '\u00d7'),
        el('h2', { text: row.name }),
        el('div', { class: 'meta' },
          statusChip(row), ' ',
          row.watchlist ? el('span', { class: 'chip wl', text: 'House watchlist' }) : null, ' ',
          el('span', { class: 'chip', text: row.category || 'Uncategorized' }),
          row.listed_at ? el('span', { text: ' \u00b7 tracked since ' + row.listed_at }) : null),
        el('div', { class: 'figures' }, figs),
        el('h3', null, 'Why this value'),
        why,
        el('h3', null, row.token_status === 'live' ? 'How to farm it now' : 'How to farm it'),
        el('ol', { class: 'plan' }, row.farm_steps.map(function (s) { return el('li', { text: s }); })),
        el('h3', null, 'Chains'),
        el('div', { class: 'meta' }, row.chains.map(function (ch) { return el('span', { class: 'chip', text: ch }); })),
        el('p', { class: 'note', text: 'Figures are the snapshot\u2019s, frozen at ' + DATA.as_of + '. A plan is a starting point, not advice: check the protocol\u2019s own app for its current terms before moving money.' })));
    drawerRoot.replaceChildren(drawer);
  }

  function closeDrawer() {
    state.selected = null;
    drawerRoot.replaceChildren();
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  // ---------- method and colophon ----------

  function renderMethod() {
    var cats = DATA.categories.slice(0, 14);
    var method = el('div', { class: 'method' },
      el('section', null,
        el('h2', null, 'How the radar prices a token that does not exist'),
        el('p', null,
          'Start from the protocols whose token already trades: ', el('strong', null, String(DATA.peer_count) + ' of them'),
          ' carry a market cap in the snapshot. For each category, take the median of their market cap per dollar of TVL. ',
          'A category with few peers borrows the market\u2019s judgement \u2014 its median is shrunk toward the all-market median of ',
          el('strong', null, fmtMult(DATA.global_multiple)), ' by peer count \u2014 and every multiple is held inside 0.02x to 2.00x, ',
          'so one wild peer cannot price a whole category.'),
        el('p', null,
          'A pre-token protocol is then priced as its TVL times its category\u2019s multiple, adjusted by three factors from its own record: ',
          el('strong', null, 'momentum'), ' (a strong 7-day TVL change lifts the price a little, a falling one trims it), ',
          el('strong', null, 'track record'), ' (four years running with no token counts for more than four weeks), and ',
          el('strong', null, 'breadth'), ' (a protocol live on six chains would distribute wider than one on a single chain). ',
          'No name is special-cased anywhere: one function scores every row, and the drawer on each row shows its four factors.'),
        el('p', null,
          'The board holds every protocol on the house watchlist and every other pre-token protocol in its own right \u2014 ',
          String(DATA.counts.pre_token_rows), ' in all. Set aside, and named here so the sweep is honest: ',
          String(DATA.counts.set_aside), ' records that are an exchange, a versioned pool, or a wrapped, staked or bridged product of an asset that already trades, and ',
          String(DATA.counts.unpriced_token), ' whose token is recorded with no market cap to price against.')),
      el('section', null,
        el('h2', null, 'Peer multiples by category'),
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Peers' }),
            el('th', { class: 'num', text: 'Median' }), el('th', { class: 'num', text: 'Used' }))),
          el('tbody', null, cats.map(function (c) {
            return el('tr', null,
              el('td', { text: c.category }),
              el('td', { class: 'num', text: String(c.peers) }),
              el('td', { class: 'num', text: fmtMult(c.raw_median) }),
              el('td', { class: 'num', text: fmtMult(c.multiple) }));
          }))),
        el('p', { class: 'note', text: 'Median is the category\u2019s raw median mcap / TVL; Used is after shrinkage toward the all-market median and the 0.02x\u20132.00x clamp. The full table is in the page\u2019s data.' })));
    document.querySelector('main').appendChild(method);
  }

  function renderColophon() {
    var foot = document.getElementById('colophon');
    foot.appendChild(el('p', null,
      'Data: ' + DATA.source + '. The snapshot is frozen: figures are as of ' + DATA.as_of + ' and do not move. ',
      'Implied value is this radar\u2019s own model (' + DATA.model_version + '), computed from the snapshot alone; it is not a prediction that any protocol issues a token, ',
      'and a protocol is said to record no token, never to have none \u2014 a record can lag the market.'));
    foot.appendChild(el('p', null,
      'Farm plans are generated from each protocol\u2019s category, chains, TVL and age. They describe ordinary use of the protocol; ',
      'whether any of it is ever rewarded is the protocol\u2019s decision, and none of this is financial advice.'));
  }

  // ---------- go ----------

  drawerRoot = document.getElementById('drawer-root');
  renderMasthead();
  renderControls();
  refreshSelects();
  renderTable();
  renderMethod();
  renderColophon();
  window.__radarReady = true;
})();
