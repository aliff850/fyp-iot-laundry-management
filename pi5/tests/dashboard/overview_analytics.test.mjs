import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../../dashboard/index.html', import.meta.url), 'utf8');
const jsSource = readFileSync(new URL('../../dashboard/static/dashboard.js', import.meta.url), 'utf8');

function createOverviewTestEnv(fetchImpl) {
  const storeData = { localStorage: {}, sessionStorage: {} };
  const makeStorage = kind => ({
    getItem(k) { return Object.hasOwn(storeData[kind], k) ? storeData[kind][k] : null; },
    setItem(k, v) { storeData[kind][k] = String(v); },
  });

  const ids = new Map();
  const makeEl = (tag = 'div', id = '') => {
    const classes = new Set();
    const el = {
      tagName: tag.toUpperCase(),
      id,
      type: '',
      disabled: false,
      colSpan: 1,
      children: [],
      attributes: {},
      dataset: {},
      style: {},
      listeners: {},
      classList: {
        add(...names) { names.forEach(n => classes.add(n)); el._className = [...classes].join(' '); },
        remove(...names) { names.forEach(n => classes.delete(n)); el._className = [...classes].join(' '); },
        toggle(n, force) {
          const present = force !== undefined ? Boolean(force) : !classes.has(n);
          if (present) classes.add(n); else classes.delete(n);
          el._className = [...classes].join(' ');
          return present;
        },
        contains(n) { return classes.has(n); },
      },
      _className: '',
      set className(val) {
        this._className = String(val || '');
        classes.clear();
        for (const tok of this._className.split(/\s+/).filter(Boolean)) classes.add(tok);
      },
      get className() { return this._className; },
      _text: '',
      set textContent(v) { this._text = String(v ?? ''); this.children = []; },
      get textContent() { return this._text + this.children.map(c => c.textContent).join(''); },
      setAttribute(k, v) {
        this.attributes[k] = String(v);
        if (k === 'class') this.className = v;
        if (k === 'id') this.id = String(v);
      },
      getAttribute(k) { return this.attributes[k] ?? null; },
      append(...nodes) {
        for (const n of nodes) {
          const node = typeof n === 'string' ? { textContent: n, children: [] } : n;
          this.children.push(node);
          node.parentNode = this;
        }
      },
      replaceChildren(...nodes) {
        this._text = '';
        this.children = [];
        this.append(...nodes);
      },
      remove() {
        if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this);
      },
      get firstElementChild() { return this.children[0] || null; },
      contains(target) {
        if (this === target) return true;
        return this.children.some(c => typeof c.contains === 'function' && c.contains(target));
      },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      dispatchEvent(evt) { (this.listeners[typeKey(evt)] || []).forEach(fn => fn(evt)); },
      focus() {},
      showModal() { this.open = true; },
      close() { this.open = false; },
    };
    return el;
  };
  const typeKey = evt => evt.type;

  const ensureId = (id, tag = 'div', initialClass = '') => {
    if (!ids.has(id)) {
      const el = makeEl(tag, id);
      if (initialClass) el.className = initialClass;
      ids.set(id, el);
    }
    return ids.get(id);
  };

  for (const id of [
    'overviewContent', 'gatewayGate', 'checkedAt', 'checkedAtDot', 'gatewayState', 'branchState', 'branchIdentity',
    'pageNotice', 'refreshButton', 'menuToggle', 'sideNav', 'pauseButton',
    'machineCount', 'safetyCount', 'deviceFreshness', 'pendingCount', 'syncedCount', 'quarantinedCount',
    'discoveriesSection', 'discoveriesList', 'historyContent', 'historyCount', 'historyNotice', 'historyRows',
    'historyPeriod', 'historyPageLabel', 'historyPrevPage', 'historyNextPage',
    'overviewAnalyticsSection', 'analyticsTotalCycles', 'analyticsTotalMinutes', 'analyticsTotalRevenue',
    'analyticsAvgGas', 'overviewMachineChartLabel', 'overviewMachineChartWrap', 'overviewMachineChart',
    'overviewMachineTableBody', 'overviewRevenueChartHeading', 'overviewRevenueWindow', 'overviewRevenueChartWrap', 'overviewRevenueChart',
    'overviewGasMode', 'overviewGasChartWrap', 'overviewGasChart',
    'overviewLpgTankSection', 'overviewLpgTankHeading', 'overviewLpgTankStatus',
    'overviewLpgTankChartWrap', 'overviewLpgTankChart', 'overviewLpgTankDetails',
    'overviewComplaintsMode', 'overviewComplaintsStatus', 'overviewComplaintsChartWrap',
    'overviewComplaintsChart', 'toastRegion', 'notificationsWrap', 'notificationsButton',
    'notificationsBadge', 'notificationsDropdown', 'notificationsDropdownList',
    'notificationsMarkRead', 'displayAllNotificationsBtn',
  ]) {
    ensureId(id);
  }
  for (const hiddenId of [
    'analyticsNotice', 'overviewMachineEmpty', 'overviewRevenueEmpty', 'overviewGasEmpty', 'overviewLpgTankEmpty',
    'pageNotice', 'discoveriesSection', 'historyNotice', 'notificationsBadge', 'notificationsDropdown',
  ]) {
    ensureId(hiddenId, 'div', 'hidden');
  }

  const periodButtons = ['day', 'week', 'month'].map(period => {
    const btn = makeEl('button');
    btn.dataset.analyticsPeriod = period;
    btn.setAttribute('aria-pressed', String(period === 'day'));
    return btn;
  });

  const metricButtons = ['cycles', 'running', 'revenue'].map(metric => {
    const btn = makeEl('button');
    btn.dataset.machineMetric = metric;
    btn.setAttribute('aria-pressed', String(metric === 'cycles'));
    return btn;
  });

  const historyCategoryButtons = ['lpg', 'machine'].map(category => {
    const btn = makeEl('button');
    btn.dataset.historyCategory = category;
    btn.setAttribute('aria-pressed', String(category === 'lpg'));
    return btn;
  });

  const historyFilterButtons = ['all', 'pending', 'quarantined'].map(filter => {
    const btn = makeEl('button');
    btn.dataset.historyFilter = filter;
    btn.setAttribute('aria-pressed', String(filter === 'all'));
    return btn;
  });

  ensureId('historyPeriod', 'select').value = 'all';

  const body = makeEl('body');
  body.dataset = { page: 'overview', staffCsrf: 'csrf-1' };

  const chartInstances = [];
  const createdCharts = [];
  class FakeChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.destroyed = false;
      chartInstances.push(this);
      createdCharts.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  }

  const doc = {
    body,
    documentElement: makeEl('html'),
    hidden: false,
    getElementById: id => ids.get(id) || null,
    querySelectorAll: selector => {
      if (selector === '[data-analytics-period]') return periodButtons;
      if (selector === '[data-machine-metric]') return metricButtons;
      if (selector === '[data-history-category]') return historyCategoryButtons;
      if (selector === '[data-history-filter]') return historyFilterButtons;
      return [];
    },
    createElement: tag => makeEl(tag),
    createElementNS: (_ns, tag) => makeEl(tag),
    addEventListener() {},
  };

  const context = {
    window: {
      Chart: FakeChart,
      document: doc,
      matchMedia: () => ({ matches: false }),
      location: { pathname: '/', search: '', assign() {} },
    },
    location: { pathname: '/', search: '', assign() {} },
    Chart: FakeChart,
    document: doc,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    localStorage: makeStorage('localStorage'),
    sessionStorage: makeStorage('sessionStorage'),
    fetch: fetchImpl,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    AudioContext: undefined,
    webkitAudioContext: undefined,
    HTMLElement: Object,
    AbortSignal: globalThis.AbortSignal,
    AbortController: globalThis.AbortController,
    URL,
    URLSearchParams,
  };
  context.window.window = context.window;
  context.globalThis = context;
  vm.runInNewContext(jsSource, context);

  return {
    ids,
    periodButtons,
    metricButtons,
    historyCategoryButtons,
    historyFilterButtons,
    createdCharts,
    chartInstances,
    context,
  };
}

test('Overview HTML removes Safety freshness card and meets mobile/DESIGN full-width stack structure', () => {
  assert.doesNotMatch(html, /Safety freshness/);
  assert.doesNotMatch(html, /safetySummary/);
  assert.doesNotMatch(html, /lg:grid-cols-2/);
  assert.match(html, /id="overviewAnalyticsSection"/);
  assert.match(html, /data-machine-metric="cycles"/);
  assert.match(html, /data-machine-metric="running"/);
  assert.match(html, /data-machine-metric="revenue"/);
  assert.match(html, /id="overviewMachineChart"/);
  assert.match(html, /id="overviewRevenueChart"/);
  assert.match(html, /id="overviewGasChart"/);
  assert.match(html, /id="overviewComplaintsChart"/);
  assert.match(html, /overflow-x-auto rounded-md border border-rule/);
  assert.match(html, /Customer complaint intake is not implemented yet\./);
  assert.doesNotMatch(html, /·/);
});

test('Overview analytics renders stacked program cycles, toggleable machine bar charts, multi-node gas mode, and period switching', async () => {
  const analyticsCalls = [];
  const samplePayload = period => ({
    period,
    granularity: period === 'day' ? 'hour' : 'day',
    timezone: 'Asia/Kuala_Lumpur',
    summary: {
      completed_cycles: period === 'week' ? 14 : 3,
      running_minutes: period === 'week' ? 420.5 : 95.0,
      estimated_revenue_myr: period === 'week' ? '92.00' : '19.50',
      avg_gas_ppm: period === 'week' ? 18.4 : 15.2,
      gas_node_count: period === 'week' ? 2 : 1,
      gas_aggregation_mode: period === 'week' ? 'multi_node_average' : 'single_node',
    },
    programs: [
      { program_id: 'quick', label: 'Quick' },
      { program_id: 'p_delicate01', label: 'Delicate' },
    ],
    machines: [
      {
        source_id: 'washer-01',
        label: 'Washer 1',
        device_type: 'washer',
        completed_cycles: 2,
        running_minutes: 60.0,
        estimated_revenue_myr: '13.00',
        cycles_by_program: { quick: 1, p_delicate01: 1 },
      },
      {
        source_id: 'dryer-01',
        label: 'Dryer 1',
        device_type: 'dryer',
        completed_cycles: 1,
        running_minutes: 35.0,
        estimated_revenue_myr: '6.50',
        cycles_by_program: { quick: 1 },
      },
    ],
    revenue_series: [
      { bucket: '2026-11-15T09:00', label: '09:00', period_revenue_myr: '13.00', cumulative_revenue_myr: '13.00' },
      { bucket: '2026-11-15T10:00', label: '10:00', period_revenue_myr: '6.50', cumulative_revenue_myr: '19.50' },
    ],
    gas_series: {
      aggregation_mode: period === 'week' ? 'multi_node_average' : 'single_node',
      node_count: period === 'week' ? 2 : 1,
      nodes: [{ source_id: 'lpg-node-01', label: 'Main LPG Sensor', calibrated: true, period_avg_ppm: 15.2, sample_count: 10 }],
      series: [
        { bucket: '2026-11-15T09:00', label: '09:00', avg_ppm: null, contributing_nodes: 0 },
        { bucket: '2026-11-15T10:00', label: '10:00', avg_ppm: 15.2, contributing_nodes: 1 },
      ],
    },
    complaints: { implemented: false, source: 'deferred_customer_app', total: null, series: [] },
  });

  const env = createOverviewTestEnv(async url => {
    if (url.startsWith('/api/dashboard/overview/analytics')) {
      const parsed = new URL(url, 'http://localhost');
      const period = parsed.searchParams.get('period') || 'day';
      analyticsCalls.push(period);
      return { ok: true, status: 200, json: async () => samplePayload(period) };
    }
    if (url === '/api/dashboard/notifications') {
      return { ok: true, status: 200, json: async () => ({ devices: [], events: [] }) };
    }
    if (url.startsWith('/api/dashboard/history')) {
      return { ok: true, status: 200, json: async () => ({ records: [] }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        gateway: { status: 'active', branch_id: 'b-1', branch_name: 'Main Branch' },
        checked_at: '2026-11-15T10:00:00Z',
        device_counts: { machines: 2, safety_nodes: 1 },
        freshness_counts: { fresh: 3, stale: 0, offline: 0 },
        unknown_devices: 0,
        sync: { pending: 0, synced: 10, quarantined: 0 },
        discoveries: [],
      }),
    };
  });

  // Allow initial async refresh microtasks to settle
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.deepEqual(analyticsCalls, ['day']);
  assert.equal(env.ids.get('analyticsTotalCycles').textContent, '3');
  assert.equal(env.ids.get('analyticsTotalRevenue').textContent, 'RM 19.50');
  assert.equal(env.ids.get('overviewGasMode').textContent, 'Main LPG Sensor');
  assert.equal(env.ids.get('overviewMachineTableBody').children.length, 2);
  assert.equal(env.createdCharts.length, 4);

  const machineChart = env.createdCharts.find(c => c.canvas.id === 'overviewMachineChart');
  assert.equal(machineChart.config.type, 'bar');
  assert.equal(machineChart.config.options.scales.x.stacked, true);
  assert.equal(machineChart.config.options.scales.y.stacked, true);
  assert.deepEqual([...machineChart.config.data.labels], ['Washer 1', 'Dryer 1']);
  assert.deepEqual([...machineChart.config.data.datasets.map(d => d.label)], ['Quick', 'Delicate']);
  assert.deepEqual([...machineChart.config.data.datasets[0].data], [1, 1]);
  assert.deepEqual([...machineChart.config.data.datasets[1].data], [1, 0]);

  // Toggle machine metric to Running minutes and Estimated revenue without re-fetching
  env.metricButtons[1].dispatchEvent({ type: 'click' });
  assert.equal(env.metricButtons[0].getAttribute('aria-pressed'), 'false');
  assert.equal(env.metricButtons[1].getAttribute('aria-pressed'), 'true');
  assert.equal(machineChart.destroyed, true);
  const runningChart = env.createdCharts.at(-1);
  assert.equal(runningChart.canvas.id, 'overviewMachineChart');
  assert.equal(runningChart.config.options.scales.y.stacked, false);
  assert.equal(runningChart.config.options.scales.y.title.text, 'Minutes');
  assert.deepEqual([...runningChart.config.data.datasets[0].data], [60, 35]);

  env.metricButtons[2].dispatchEvent({ type: 'click' });
  assert.equal(env.metricButtons[2].getAttribute('aria-pressed'), 'true');
  const revChart = env.createdCharts.at(-1);
  assert.equal(revChart.config.options.scales.y.title.text, 'RM');
  assert.deepEqual([...revChart.config.data.datasets[0].data], [13, 6.5]);
  assert.deepEqual(analyticsCalls, ['day']);

  const dayRevenueTrendChart = env.createdCharts.find(c => c.canvas.id === 'overviewRevenueChart');
  assert.equal(env.ids.get('overviewRevenueChartHeading').textContent, 'Hourly estimated revenue');
  assert.equal(dayRevenueTrendChart.config.data.datasets[0].label, 'Hourly revenue (RM)');
  assert.deepEqual([...dayRevenueTrendChart.config.data.datasets[0].data], [13, 6.5]);

  const gasChart = env.createdCharts.find(c => c.canvas.id === 'overviewGasChart');
  assert.equal(gasChart.config.type, 'line');
  assert.equal(gasChart.config.data.datasets[0].spanGaps, false);
  assert.deepEqual([...gasChart.config.data.datasets[0].data], [null, 15.2]);

  const complaintsChart = env.createdCharts.find(c => c.canvas.id === 'overviewComplaintsChart');
  assert.equal(complaintsChart.config.type, 'bar');
  assert.deepEqual([...complaintsChart.config.data.datasets[0].data], [null, null]);

  // Switch period to 7 days ('week') and verify prior charts destroyed + daily revenue + multi-node label shown
  env.periodButtons[1].dispatchEvent({ type: 'click' });
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.deepEqual(analyticsCalls, ['day', 'week']);
  assert.equal(env.periodButtons[0].getAttribute('aria-pressed'), 'false');
  assert.equal(env.periodButtons[1].getAttribute('aria-pressed'), 'true');
  assert.equal(env.ids.get('analyticsTotalCycles').textContent, '14');
  assert.equal(env.ids.get('overviewGasMode').textContent, '2 nodes averaged');
  assert.equal(env.ids.get('overviewRevenueChartHeading').textContent, 'Daily estimated revenue');
  const weekRevenueTrendChart = env.createdCharts.filter(c => c.canvas.id === 'overviewRevenueChart').at(-1);
  assert.equal(weekRevenueTrendChart.config.data.datasets[0].label, 'Daily revenue (RM)');
  assert.deepEqual([...weekRevenueTrendChart.config.data.datasets[0].data], [13, 6.5]);
  assert.ok(env.createdCharts.slice(0, 6).every(c => c.destroyed === true));
  assert.equal(env.createdCharts.length, 10);
});

test('Overview analytics fetch error shows notice and preserves existing KPIs without zeroing', async () => {
  let failAnalytics = false;
  const env = createOverviewTestEnv(async url => {
    if (url.startsWith('/api/dashboard/overview/analytics')) {
      if (failAnalytics) return { ok: false, status: 503, json: async () => ({ error: 'db down' }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          period: 'day',
          granularity: 'hour',
          summary: { completed_cycles: 5, running_minutes: 120.0, estimated_revenue_myr: '35.00', avg_gas_ppm: 14.0, gas_node_count: 1, gas_aggregation_mode: 'single_node' },
          machines: [],
          revenue_series: [{ bucket: '2026-11-15T10:00', label: '10:00', period_revenue_myr: '35.00', cumulative_revenue_myr: '35.00' }],
          gas_series: { aggregation_mode: 'single_node', node_count: 1, nodes: [], series: [] },
          complaints: { implemented: false, source: 'deferred_customer_app', total: null, series: [] },
        }),
      };
    }
    if (url === '/api/dashboard/notifications') return { ok: true, status: 200, json: async () => ({ devices: [], events: [] }) };
    if (url.startsWith('/api/dashboard/history')) return { ok: true, status: 200, json: async () => ({ records: [] }) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        gateway: { status: 'active', branch_id: 'b-1' },
        checked_at: '2026-11-15T10:00:00Z',
        device_counts: { machines: 1, safety_nodes: 1 },
        freshness_counts: { fresh: 2, stale: 0, offline: 0 },
        unknown_devices: 0,
        sync: { pending: 0, synced: 2, quarantined: 0 },
        discoveries: [],
      }),
    };
  });

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(env.ids.get('analyticsTotalCycles').textContent, '5');
  assert.equal(env.ids.get('analyticsNotice').classList.contains('hidden'), true);

  failAnalytics = true;
  env.periodButtons[2].dispatchEvent({ type: 'click' });
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(env.ids.get('analyticsNotice').classList.contains('hidden'), false);
  assert.match(env.ids.get('analyticsNotice').textContent, /could not be refreshed/i);
  assert.equal(env.ids.get('analyticsTotalCycles').textContent, '5');
});

test('Recent local records HTML includes category switch, All time default select, and accessible pagination', () => {
  assert.match(html, /data-history-category="lpg"/);
  assert.match(html, /data-history-category="machine"/);
  assert.match(html, /id="historyPeriod"/);
  assert.match(html, /<option value="all" selected>All time<\/option>/);
  assert.match(html, /id="historyPrevPage"/);
  assert.match(html, /id="historyNextPage"/);
  assert.match(html, /id="historyPageLabel"/);
});

test('Recent local records switches LPG\/Machine categories with independent pagination, time range, and delivery state', async () => {
  const historyRequests = [];
  const env = createOverviewTestEnv(async url => {
    if (url.startsWith('/api/dashboard/history')) {
      const parsed = new URL(url, 'http://localhost');
      const category = parsed.searchParams.get('category') || 'lpg';
      const period = parsed.searchParams.get('period') || 'all';
      const delivery = parsed.searchParams.get('delivery') || 'all';
      const page = Number(parsed.searchParams.get('page') || '1');
      historyRequests.push({ category, period, delivery, page });
      if (category === 'lpg') {
        const total = delivery === 'pending' ? 12 : 25;
        const total_pages = Math.ceil(total / 10);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            category,
            period,
            delivery,
            page,
            page_size: 10,
            total,
            total_pages,
            records: Array.from({ length: page === total_pages ? total - (total_pages - 1) * 10 : 10 }, (_, idx) => ({
              source_id: `lpg-node-01`,
              sample_at: `2026-11-15T10:0${idx % 10}:00Z`,
              sync_state: delivery === 'pending' ? 'pending' : 'synced',
              quarantine_reason: null,
            })),
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          category,
          period,
          delivery,
          page,
          page_size: 10,
          total: period === 'today' ? 4 : 18,
          total_pages: period === 'today' ? 1 : 2,
          records: [
            {
              source_id: 'washer-sim-01',
              sample_at: '2026-11-15T11:00:00Z',
              sync_state: 'synced',
              quarantine_reason: null,
            },
          ],
        }),
      };
    }
    if (url.startsWith('/api/dashboard/overview/analytics')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          period: 'day',
          granularity: 'hour',
          summary: { completed_cycles: 0, running_minutes: 0, estimated_revenue_myr: '0.00', avg_gas_ppm: null, gas_node_count: 0, gas_aggregation_mode: 'uncalibrated' },
          machines: [],
          revenue_series: [],
          gas_series: { aggregation_mode: 'uncalibrated', node_count: 0, nodes: [], series: [] },
          complaints: { implemented: false, source: 'deferred_customer_app', total: null, series: [] },
        }),
      };
    }
    if (url === '/api/dashboard/notifications') return { ok: true, status: 200, json: async () => ({ devices: [], events: [] }) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        gateway: { status: 'active', branch_id: 'b-1' },
        checked_at: '2026-11-15T10:00:00Z',
        device_counts: { machines: 1, safety_nodes: 1 },
        freshness_counts: { fresh: 2, stale: 0, offline: 0 },
        unknown_devices: 0,
        sync: { pending: 0, synced: 2, quarantined: 0 },
        discoveries: [],
      }),
    };
  });

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(historyRequests[0], { category: 'lpg', period: 'all', delivery: 'all', page: 1 });
  assert.equal(env.ids.get('historyPageLabel').textContent, 'Page 1 of 3');
  assert.equal(env.ids.get('historyCount').textContent, 'Showing 1–10 of 25 LPG records');
  assert.equal(env.ids.get('historyPrevPage').disabled, true);
  assert.equal(env.ids.get('historyNextPage').disabled, false);

  // Move LPG to page 2 and pending delivery
  env.historyFilterButtons[1].dispatchEvent({ type: 'click' }); // pending -> resets page to 1
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(historyRequests.at(-1), { category: 'lpg', period: 'all', delivery: 'pending', page: 1 });
  env.ids.get('historyNextPage').dispatchEvent({ type: 'click' }); // page 2
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(historyRequests.at(-1), { category: 'lpg', period: 'all', delivery: 'pending', page: 2 });
  assert.equal(env.ids.get('historyPageLabel').textContent, 'Page 2 of 2');
  assert.equal(env.ids.get('historyNextPage').disabled, true);

  // Switch to Machines -> defaults to page=1, period=all, delivery=all
  env.historyCategoryButtons[1].dispatchEvent({ type: 'click' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(historyRequests.at(-1), { category: 'machine', period: 'all', delivery: 'all', page: 1 });
  assert.equal(env.ids.get('historyPeriod').value, 'all');
  assert.equal(env.ids.get('historyPageLabel').textContent, 'Page 1 of 2');

  // Change Machines period to today
  env.ids.get('historyPeriod').value = 'today';
  env.ids.get('historyPeriod').dispatchEvent({ type: 'change', target: env.ids.get('historyPeriod') });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(historyRequests.at(-1), { category: 'machine', period: 'today', delivery: 'all', page: 1 });
  assert.equal(env.ids.get('historyPageLabel').textContent, 'Page 1 of 1');

  // Switch back to LPG -> restores LPG's own page=2, period=all, delivery=pending
  env.historyCategoryButtons[0].dispatchEvent({ type: 'click' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(historyRequests.at(-1), { category: 'lpg', period: 'all', delivery: 'pending', page: 2 });
  assert.equal(env.ids.get('historyPeriod').value, 'all');
  assert.equal(env.ids.get('historyPageLabel').textContent, 'Page 2 of 2');
});

test('overview renders real-time LPG gas tank level bar chart with honest offline and maintenance states', async () => {
  assert.ok(html.includes('id="overviewLpgTankSection"'));
  assert.ok(html.includes('id="overviewLpgTankChart"'));

  const env = createOverviewTestEnv(async url => {
    if (url.startsWith('/api/dashboard/history')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ category: 'lpg', period: 'all', delivery: 'all', page: 1, page_size: 10, total: 0, total_pages: 1, records: [] }),
      };
    }
    if (url.startsWith('/api/dashboard/overview/analytics')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          period: 'day',
          granularity: 'hour',
          summary: { completed_cycles: 0, running_minutes: 0, estimated_revenue_myr: '0.00', avg_gas_ppm: null, gas_node_count: 0, gas_aggregation_mode: 'uncalibrated' },
          machines: [],
          revenue_series: [],
          gas_series: { aggregation_mode: 'uncalibrated', node_count: 0, nodes: [], series: [] },
          complaints: { implemented: false, source: 'deferred_customer_app', total: null, series: [] },
        }),
      };
    }
    if (url === '/api/dashboard/notifications') return { ok: true, status: 200, json: async () => ({ devices: [], events: [] }) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        gateway: { status: 'active', branch_id: 'b-1' },
        checked_at: '2026-11-16T00:00:00Z',
        device_counts: { machines: 0, safety_nodes: 3 },
        freshness_counts: { fresh: 2, stale: 0, offline: 1 },
        unknown_devices: 0,
        sync: { pending: 0, synced: 2, quarantined: 0 },
        safety_nodes: [
          {
            source_id: 'esp32-lpg-01',
            label: 'Tank A',
            status: 'active',
            maintenance_mode: false,
            weight_evaluation_paused: false,
            observation: {
              freshness: 'fresh',
              quality: { weight_valid: true },
              values: { lpg_percent: 68.5, lpg_weight_kg: 9.59 },
            },
          },
          {
            source_id: 'esp32-lpg-02',
            label: 'Tank B (Swapping)',
            status: 'maintenance',
            maintenance_mode: true,
            weight_evaluation_paused: true,
            observation: {
              freshness: 'fresh',
              quality: { weight_valid: true },
              values: { lpg_percent: 0.0, lpg_weight_kg: 0.0 },
            },
          },
          {
            source_id: 'esp32-lpg-03',
            label: 'Tank C (Offline)',
            status: 'active',
            maintenance_mode: false,
            weight_evaluation_paused: false,
            observation: {
              freshness: 'offline',
              quality: { weight_valid: true },
              values: { lpg_percent: 42.0, lpg_weight_kg: 5.88 },
            },
          },
        ],
        discoveries: [],
      }),
    };
  });

  await new Promise(resolve => setTimeout(resolve, 25));

  const tankChart = env.createdCharts.find(c => c.canvas?.id === 'overviewLpgTankChart');
  assert.ok(tankChart, 'Expected overviewLpgTankChart Chart.js instance to be mounted');
  assert.equal(tankChart.config.type, 'bar');
  assert.deepEqual(tankChart.config.data.labels, ['Tank A', 'Tank B (Swapping)', 'Tank C (Offline)']);
  assert.deepEqual(tankChart.config.data.datasets[0].data, [68.5, null, null]);
  assert.equal(env.ids.get('overviewLpgTankStatus').textContent, '1 of 3 live');
  const detailText = env.ids.get('overviewLpgTankDetails').textContent;
  assert.ok(detailText.includes('68.5% (9.59 kg)'));
  assert.ok(detailText.includes('Maintenance'));
  assert.ok(detailText.includes('Offline'));
});
