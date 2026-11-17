import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const jsSource = readFileSync(new URL('./static/dashboard.js', import.meta.url), 'utf8');

function createDomEnvironment(fetchImpl) {
  const storeData = { localStorage: {}, sessionStorage: {} };
  const makeStorage = kind => ({
    getItem(k) { return Object.hasOwn(storeData[kind], k) ? storeData[kind][k] : null; },
    setItem(k, v) { storeData[kind][k] = String(v); },
  });

  const allNodes = [];
  const makeEl = (tag = 'div') => {
    const classes = new Set();
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      type: '',
      disabled: false,
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
        if (this.parentNode) {
          this.parentNode.children = this.parentNode.children.filter(c => c !== this);
        }
      },
      get firstElementChild() { return this.children[0] || null; },
      contains(target) {
        if (this === target) return true;
        return this.children.some(c => typeof c.contains === 'function' && c.contains(target));
      },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      dispatchEvent(evt) { (this.listeners[evt.type] || []).forEach(fn => fn(evt)); },
      focus() {},
      showModal() { this.open = true; },
      close() { this.open = false; this.dispatchEvent({ type: 'close' }); },
    };
    allNodes.push(el);
    return el;
  };

  const ids = new Map();
  const ensureId = (id, tag = 'div', initialClass = '') => {
    if (!ids.has(id)) {
      const el = makeEl(tag);
      el.id = id;
      if (initialClass) el.className = initialClass;
      ids.set(id, el);
    }
    return ids.get(id);
  };

  ensureId('toastRegion');
  ensureId('notificationsWrap');
  ensureId('notificationsButton', 'button');
  ensureId('notificationsBadge', 'span', 'hidden');
  ensureId('notificationsDropdown', 'div', 'hidden');
  ensureId('notificationsDropdownList', 'ul');
  ensureId('notificationsMarkRead', 'button');
  ensureId('displayAllNotificationsBtn', 'button');
  ensureId('refreshButton', 'button');
  ensureId('menuToggle', 'button');
  ensureId('sideNav', 'nav', 'hidden');
  ensureId('pageNotice', 'div', 'hidden');
  ensureId('checkedAt', 'span');
  ensureId('gatewayState', 'span');
  ensureId('branchState', 'span');
  ensureId('overviewContent');
  ensureId('pauseButton', 'button');
  ensureId('historyContent');

  const body = makeEl('body');
  body.dataset = { page: 'overview', staffCsrf: 'csrf-1' };
  const docListeners = {};

  const windowObj = {
    location: { pathname: '/', search: '', assign() {} },
    localStorage: makeStorage('localStorage'),
    sessionStorage: makeStorage('sessionStorage'),
  };

  const context = vm.createContext({
    window: windowObj,
    document: {
      hidden: false,
      body,
      getElementById: id => ids.get(id) || null,
      createElement: tag => makeEl(tag),
      createElementNS: (_ns, tag) => makeEl(tag),
      createDocumentFragment: () => makeEl('fragment'),
      querySelectorAll: () => [],
      addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    },
    fetch: fetchImpl,
    Intl,
    Date,
    Number,
    String,
    Math,
    JSON,
    Map,
    Set,
    Array,
    Object,
    Promise,
    Error,
    URLSearchParams,
    AbortSignal: { timeout: () => ({}) },
    Chart: undefined,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
  });

  vm.runInContext(jsSource, context);
  return { context, ids, body, storeData };
}

test('Pi dashboard HTML places bell button left of local log-out SVG button and avoids external CDNs', () => {
  const bellIdx = html.indexOf('id="notificationsButton"');
  const signoutIdx = html.indexOf('action="/logout"');
  assert.ok(bellIdx !== -1 && signoutIdx !== -1 && bellIdx < signoutIdx);
  assert.match(html, /Display all notifications/);
  assert.match(html, /<span class="sr-only">Sign out<\/span>/);
  assert.doesNotMatch(html, /unpkg|jsdelivr|cdnjs|lucide\.dev/i);
  assert.doesNotMatch(jsSource, /unpkg|jsdelivr|cdnjs|lucide\.dev/i);
});

test('Pi notifications detect RUNNING, ERROR, LPG low, and LPG maintenance transitions into toasts, dropdown (max 5), and history modal', async () => {
  let pollStep = 0;
  const pollPayloads = [
    {
      gateway: { status: 'active', branch_id: 'branch-1' },
      checked_at: '2026-11-15T06:00:00Z',
      devices: [
        { source_id: 'w-1', label: 'Washer 01', type: 'washer', state: 'IDLE', maintenance_mode: false, lpg_percent: null, sample_at: '2026-11-15T06:00:00Z' },
        { source_id: 'lpg-1', label: 'Main Tank', type: 'lpg_edge_node', state: 'UNKNOWN', maintenance_mode: false, lpg_percent: 42.0, sample_at: '2026-11-15T06:00:00Z' },
        { source_id: 'lpg-2', label: 'Backup Tank', type: 'lpg_edge_node', state: 'UNKNOWN', maintenance_mode: false, lpg_percent: 42.0, sample_at: '2026-11-15T06:00:00Z' },
      ],
      events: [
        { id: 'cycle:c1:completed', category: 'machine', kind: 'machine_completed', severity: 'positive', title: 'Cycle completed', detail: 'Washer 01 finished Quick (60 s)', source_id: 'w-1', device_label: 'Washer 01', occurred_at: '2026-11-15T05:50:00Z', active: false },
      ],
    },
    {
      gateway: { status: 'active', branch_id: 'branch-1' },
      checked_at: '2026-11-15T06:00:04Z',
      devices: [
        { source_id: 'w-1', label: 'Washer 01', type: 'washer', state: 'RUNNING', program_id: 'quick', maintenance_mode: false, lpg_percent: null, sample_at: '2026-11-15T06:00:04Z' },
        { source_id: 'lpg-1', label: 'Main Tank', type: 'lpg_edge_node', state: 'UNKNOWN', maintenance_mode: true, lpg_percent: 12.0, sample_at: '2026-11-15T06:00:04Z' },
        { source_id: 'lpg-2', label: 'Backup Tank', type: 'lpg_edge_node', state: 'UNKNOWN', maintenance_mode: false, lpg_percent: 12.0, sample_at: '2026-11-15T06:00:04Z' },
      ],
      events: [],
    },
    {
      gateway: { status: 'active', branch_id: 'branch-1' },
      checked_at: '2026-11-15T06:00:08Z',
      devices: [
        { source_id: 'w-1', label: 'Washer 01', type: 'washer', state: 'ERROR', fault_code: 'E04', maintenance_mode: false, lpg_percent: null, sample_at: '2026-11-15T06:00:08Z' },
        { source_id: 'lpg-1', label: 'Main Tank', type: 'lpg_edge_node', state: 'UNKNOWN', maintenance_mode: true, lpg_percent: 12.0, sample_at: '2026-11-15T06:00:08Z' },
        { source_id: 'lpg-2', label: 'Backup Tank', type: 'lpg_edge_node', state: 'UNKNOWN', maintenance_mode: false, lpg_percent: 12.0, sample_at: '2026-11-15T06:00:08Z' },
      ],
      events: [
        { id: 'cycle:c2:stopped', category: 'machine', kind: 'machine_stopped', severity: 'neutral', title: 'Cycle stopped', detail: 'Dryer 01 stopped', source_id: 'd-1', device_label: 'Dryer 01', occurred_at: '2026-11-15T05:55:00Z', active: false },
        { id: 'cycle:c3:completed', category: 'machine', kind: 'machine_completed', severity: 'positive', title: 'Cycle completed', detail: 'Washer 02 finished', source_id: 'w-2', device_label: 'Washer 02', occurred_at: '2026-11-15T05:54:00Z', active: false },
        { id: 'cycle:c4:completed', category: 'machine', kind: 'machine_completed', severity: 'positive', title: 'Cycle completed', detail: 'Washer 03 finished', source_id: 'w-3', device_label: 'Washer 03', occurred_at: '2026-11-15T05:53:00Z', active: false },
      ],
    },
  ];

  const env = createDomEnvironment(async url => {
    if (url === '/api/dashboard/notifications') {
      const idx = Math.min(pollStep, pollPayloads.length - 1);
      return { ok: true, status: 200, json: async () => pollPayloads[idx] };
    }
    if (url.startsWith('/api/dashboard/history')) {
      return { ok: true, status: 200, json: async () => ({ records: [] }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        gateway: { status: 'active', branch_id: 'branch-1' },
        checked_at: '2026-11-15T06:00:00Z',
        device_counts: { machines: 1, safety_nodes: 1 },
        freshness_counts: { fresh: 2, stale: 0, offline: 0 },
        unknown_devices: 0,
        sync: { synced: 1, pending: 0, quarantined: 0 },
        safety_nodes: [],
        discoveries: [],
      }),
    };
  });

  // Initial refresh seeds baselines silently -> 0 toasts
  await env.context.refreshNotifications();
  assert.equal(env.ids.get('toastRegion').children.length, 0);

  // Step 1: Washer -> RUNNING + LPG -> Low + Maintenance (3 transition toasts)
  pollStep = 1;
  await env.context.refreshNotifications();
  assert.equal(env.ids.get('toastRegion').children.length, 3);
  assert.match(env.ids.get('toastRegion').textContent, /Machine running/);
  assert.match(env.ids.get('toastRegion').textContent, /LPG undergoing maintenance/);
  assert.match(env.ids.get('toastRegion').textContent, /LPG gas level low/);

  // Step 2: Washer -> ERROR fault E04 (capped at 3 visible toasts, replaces non-sticky)
  pollStep = 2;
  await env.context.refreshNotifications();
  assert.equal(env.ids.get('toastRegion').children.length, 3);
  assert.match(env.ids.get('toastRegion').textContent, /fault E04/);

  // Header dropdown caps preview to 5 recent items, while modal shows all merged events + filters
  const dropdownList = env.ids.get('notificationsDropdownList');
  assert.equal(dropdownList.children.length, 5);
  assert.equal(env.ids.get('notificationsBadge').textContent, '7');

  env.ids.get('displayAllNotificationsBtn').dispatchEvent({ type: 'click' });
  const dialog = env.body.children.find(el => el.tagName === 'DIALOG');
  assert.ok(dialog && dialog.open === true);
  assert.match(dialog.className, /\bh-11\/12\b/);
  assert.match(dialog.className, /\bw-11\/12\b/);
  assert.match(dialog.textContent, /All \(7\)/);
  assert.match(dialog.textContent, /Machines \(5\)/);
  assert.match(dialog.textContent, /LPG & Safety \(2\)/);
});

test('Pi notifications modal paginates at 10 items per page and resets to page 1 when switching filters', async () => {
  const manyEvents = Array.from({ length: 14 }, (_, idx) => ({
    id: `cycle:bulk-${idx}:completed`,
    category: idx < 11 ? 'machine' : 'lpg',
    kind: idx < 11 ? 'machine_completed' : 'lpg_low',
    severity: idx < 11 ? 'positive' : 'warning',
    title: idx < 11 ? `Cycle #${idx + 1}` : `LPG #${idx + 1}`,
    detail: `Event ${idx + 1}`,
    source_id: `dev-${idx + 1}`,
    device_label: `Device ${idx + 1}`,
    occurred_at: `2026-11-15T06:${String(59 - idx).padStart(2, '0')}:00Z`,
    active: false,
  }));

  const env = createDomEnvironment(async url => {
    if (url === '/api/dashboard/notifications') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          gateway: { status: 'active', branch_id: 'branch-1' },
          checked_at: '2026-11-15T07:00:00Z',
          devices: [],
          events: manyEvents,
        }),
      };
    }
    if (url.startsWith('/api/dashboard/history')) {
      return { ok: true, status: 200, json: async () => ({ records: [] }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        gateway: { status: 'active', branch_id: 'branch-1' },
        checked_at: '2026-11-15T07:00:00Z',
        device_counts: { machines: 0, safety_nodes: 0 },
        freshness_counts: { fresh: 0, stale: 0, offline: 0 },
        unknown_devices: 0,
        sync: { synced: 0, pending: 0, quarantined: 0 },
        safety_nodes: [],
        discoveries: [],
      }),
    };
  });

  await env.context.refreshNotifications();
  env.ids.get('displayAllNotificationsBtn').dispatchEvent({ type: 'click' });
  const dialog = env.body.children.find(el => el.tagName === 'DIALOG');
  const findByText = (node, pattern) => {
    if (node.textContent && pattern.test(node.textContent) && (!node.children || node.children.length === 0)) return node;
    for (const child of node.children || []) {
      const hit = findByText(child, pattern);
      if (hit) return hit;
    }
    return null;
  };

  assert.match(dialog.textContent, /Page 1 of 2 \(14 notifications\)/);
  assert.match(dialog.textContent, /Cycle #1/);
  assert.doesNotMatch(dialog.textContent, /LPG #12/);

  const nextBtn = findByText(dialog, /^Next$/);
  const prevBtn = findByText(dialog, /^Previous$/);
  assert.equal(prevBtn.disabled, true);
  assert.equal(nextBtn.disabled, false);

  nextBtn.dispatchEvent({ type: 'click' });
  assert.match(dialog.textContent, /Page 2 of 2 \(14 notifications\)/);
  assert.match(dialog.textContent, /LPG #12/);
  assert.doesNotMatch(dialog.textContent, /Cycle #1\b/);
  assert.equal(prevBtn.disabled, false);
  assert.equal(nextBtn.disabled, true);

  // Switching to LPG filter (3 items) resets page and hides pager cleanly
  const lpgTab = findByText(dialog, /^LPG & Safety \(3\)$/);
  lpgTab.dispatchEvent({ type: 'click' });
  assert.match(dialog.textContent, /LPG #12/);
  const findById = (node, id) => {
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const hit = findById(child, id);
      if (hit) return hit;
    }
    return null;
  };
  const pager = findById(dialog, 'notificationsModalPager');
  assert.equal(pager.classList.contains('hidden'), true);
});

test('maintenance mode suppresses lpg_low and lpg_critical transition toasts while keeping lpg_maintenance', () => {
  const env = createDomEnvironment(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const { detectNotificationTransitions } = env.context;

  // Initial seed: normal 40% tank, not in maintenance
  const seed = detectNotificationTransitions(null, [
    { source_id: 'lpg-01', label: 'Tank A', type: 'lpg_edge_node', lpg_percent: 40, maintenance_mode: false },
  ], '2026-11-15T09:00:00Z');
  assert.equal(seed.triggeredEvents.length, 0);

  // Worker starts maintenance and removes empty cylinder (lpg_percent drops to 0)
  const stepMaint = detectNotificationTransitions(seed.nextMap, [
    { source_id: 'lpg-01', label: 'Tank A', type: 'lpg_edge_node', lpg_percent: 0, maintenance_mode: true },
  ], '2026-11-15T09:01:00Z');
  assert.equal(stepMaint.triggeredEvents.length, 1);
  assert.equal(stepMaint.triggeredEvents[0].kind, 'lpg_maintenance');

  // Worker completes swap cleanly onto a full cylinder (lpg_percent 95%, maintenance_mode false)
  const stepDone = detectNotificationTransitions(stepMaint.nextMap, [
    { source_id: 'lpg-01', label: 'Tank A', type: 'lpg_edge_node', lpg_percent: 95, maintenance_mode: false },
  ], '2026-11-15T09:03:00Z');
  assert.equal(stepDone.triggeredEvents.length, 0);
});

test('calibrated MQ-6 gas thresholds trigger warning and sticky critical transition events even during maintenance', () => {
  const env = createDomEnvironment(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const { detectNotificationTransitions } = env.context;

  // Initial seed: calibrated fresh normal tank + uncalibrated tank + offline tank
  const seed = detectNotificationTransitions(null, [
    {
      source_id: 'lpg-01', label: 'Main Scale', type: 'lpg_edge_node',
      freshness: 'fresh', lpg_percent: 65, maintenance_mode: false,
      ppm_calibrated: true, gas_condition: 'normal', estimated_ppm: 85,
    },
    {
      source_id: 'lpg-uncal', label: 'Uncalibrated', type: 'lpg_edge_node',
      freshness: 'fresh', lpg_percent: 65, maintenance_mode: false,
      ppm_calibrated: false, gas_condition: 'critical', estimated_ppm: 1500,
    },
    {
      source_id: 'lpg-off', label: 'Offline Scale', type: 'lpg_edge_node',
      freshness: 'offline', lpg_percent: 65, maintenance_mode: false,
      ppm_calibrated: true, gas_condition: 'critical', estimated_ppm: 1500,
    },
  ], '2026-11-15T10:00:00Z');
  assert.equal(seed.triggeredEvents.length, 0);

  // Step 1: normal -> warning on lpg-01; uncalibrated/offline remain suppressed
  const stepWarn = detectNotificationTransitions(seed.nextMap, [
    {
      source_id: 'lpg-01', label: 'Main Scale', type: 'lpg_edge_node',
      freshness: 'fresh', lpg_percent: 64, maintenance_mode: false,
      ppm_calibrated: true, gas_condition: 'warning', estimated_ppm: 540.4,
    },
    {
      source_id: 'lpg-uncal', label: 'Uncalibrated', type: 'lpg_edge_node',
      freshness: 'fresh', lpg_percent: 65, maintenance_mode: false,
      ppm_calibrated: false, gas_condition: 'critical', estimated_ppm: 1500,
    },
    {
      source_id: 'lpg-off', label: 'Offline Scale', type: 'lpg_edge_node',
      freshness: 'offline', lpg_percent: 65, maintenance_mode: false,
      ppm_calibrated: true, gas_condition: 'critical', estimated_ppm: 1500,
    },
  ], '2026-11-15T10:00:10Z');
  assert.equal(stepWarn.triggeredEvents.length, 1);
  assert.equal(stepWarn.triggeredEvents[0].kind, 'lpg_gas_warning');
  assert.equal(stepWarn.triggeredEvents[0].severity, 'warning');
  assert.match(stepWarn.triggeredEvents[0].detail, /540 ppm/);

  // Step 2: warning -> critical during active maintenance_mode still fires lpg_gas_critical alongside lpg_maintenance, without lpg_critical
  const stepCrit = detectNotificationTransitions(stepWarn.nextMap, [
    {
      source_id: 'lpg-01', label: 'Main Scale', type: 'lpg_edge_node',
      freshness: 'fresh', lpg_percent: 0, maintenance_mode: true,
      ppm_calibrated: true, gas_condition: 'critical', estimated_ppm: 1280,
    },
  ], '2026-11-15T10:00:20Z');
  assert.deepEqual(Array.from(stepCrit.triggeredEvents, e => e.kind), ['lpg_maintenance', 'lpg_gas_critical']);
  assert.equal(stepCrit.triggeredEvents[1].severity, 'negative');
  assert.match(stepCrit.triggeredEvents[1].detail, /1280 ppm/);

  // Step 3: easing from critical -> warning does not re-fire lpg_gas_warning
  const stepEase = detectNotificationTransitions(stepCrit.nextMap, [
    {
      source_id: 'lpg-01', label: 'Main Scale', type: 'lpg_edge_node',
      freshness: 'fresh', lpg_percent: 80, maintenance_mode: false,
      ppm_calibrated: true, gas_condition: 'warning', estimated_ppm: 450,
    },
  ], '2026-11-15T10:00:30Z');
  assert.equal(stepEase.triggeredEvents.length, 0);
});

test('refreshNotifications renders warning and sticky role=alert critical gas leak toasts', async () => {
  let step = 0;
  const payloads = [
    {
      gateway: { status: 'active', branch_id: 'branch-1' },
      checked_at: '2026-11-15T11:00:00Z',
      devices: [
        {
          source_id: 'lpg-1', label: 'Main Tank', type: 'lpg_edge_node',
          freshness: 'fresh', state: 'UNKNOWN', maintenance_mode: false, lpg_percent: 70,
          ppm_calibrated: true, gas_condition: 'normal', estimated_ppm: 60,
          sample_at: '2026-11-15T11:00:00Z',
        },
      ],
      events: [],
    },
    {
      gateway: { status: 'active', branch_id: 'branch-1' },
      checked_at: '2026-11-15T11:00:05Z',
      devices: [
        {
          source_id: 'lpg-1', label: 'Main Tank', type: 'lpg_edge_node',
          freshness: 'fresh', state: 'UNKNOWN', maintenance_mode: false, lpg_percent: 70,
          ppm_calibrated: true, gas_condition: 'warning', estimated_ppm: 540,
          sample_at: '2026-11-15T11:00:05Z',
        },
      ],
      events: [],
    },
    {
      gateway: { status: 'active', branch_id: 'branch-1' },
      checked_at: '2026-11-15T11:00:10Z',
      devices: [
        {
          source_id: 'lpg-1', label: 'Main Tank', type: 'lpg_edge_node',
          freshness: 'fresh', state: 'UNKNOWN', maintenance_mode: false, lpg_percent: 70,
          ppm_calibrated: true, gas_condition: 'critical', estimated_ppm: 1320,
          sample_at: '2026-11-15T11:00:10Z',
        },
      ],
      events: [],
    },
  ];

  const env = createDomEnvironment(async url => {
    if (url === '/api/dashboard/notifications') {
      const idx = Math.min(step, payloads.length - 1);
      return { ok: true, status: 200, json: async () => payloads[idx] };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        gateway: { status: 'active', branch_id: 'branch-1' },
        checked_at: '2026-11-15T11:00:00Z',
        device_counts: { machines: 0, safety_nodes: 1 },
        freshness_counts: { fresh: 1, stale: 0, offline: 0 },
        unknown_devices: 0,
        sync: { synced: 1, pending: 0, quarantined: 0 },
        safety_nodes: [],
        discoveries: [],
      }),
    };
  });

  await env.context.refreshNotifications();
  assert.equal(env.ids.get('toastRegion').children.length, 0);

  step = 1;
  await env.context.refreshNotifications();
  assert.equal(env.ids.get('toastRegion').children.length, 1);
  assert.match(env.ids.get('toastRegion').children[0].textContent, /LPG gas elevated/);
  assert.match(env.ids.get('toastRegion').children[0].textContent, /540 ppm/);

  step = 2;
  await env.context.refreshNotifications();
  assert.equal(env.ids.get('toastRegion').children.length, 2);
  const criticalToast = env.ids.get('toastRegion').children.find(el => /LPG gas leak critical/.test(el.textContent));
  assert.ok(criticalToast, 'expected critical gas leak toast');
  assert.equal(criticalToast.getAttribute('role'), 'alert');
  assert.match(criticalToast.textContent, /1320 ppm/);
});
