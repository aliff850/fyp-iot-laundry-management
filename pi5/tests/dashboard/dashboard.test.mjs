import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

// No browser or third-party packages are needed for transport/state regression checks.
class Element {
    constructor() { this.children = []; this.attributes = {}; this.dataset = {}; this.style = { setProperty() {} }; this.classList = { toggle() {}, add() {}, remove() {} }; this._text = ''; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set innerHTML(value) { this._html = value; this.children = []; }
    get innerHTML() { return this._html || ''; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this._text = ''; this._html = ''; this.children = children; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener() {}
}

const observation = (overrides = {}) => ({
    id: 27, device_id: 'test-scale', recorded_at: new Date().toISOString(), is_synced: 0,
    data: { lpg_percent: 42.5, lpg_weight_kg: 6.38, voltage: 0.28, temperature: 25.4, humidity: 62.3 },
    ...overrides,
});

async function screen(latest, history = [], latestStatus = 200, historyStatus = 200) {
    const elements = new Map();
    const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
    const context = vm.createContext({
        document: { getElementById: get, querySelectorAll: () => [], createElement: () => new Element(), createDocumentFragment: () => new Element() },
        window: { location: { protocol: 'http:' } }, location: { protocol: 'http:' },
        fetch: async url => ({ ok: (url.includes('latest') ? latestStatus : historyStatus) === 200,
            status: url.includes('latest') ? latestStatus : historyStatus,
            json: async () => url.includes('latest') ? latest : history }),
        Date, Number, String, Intl, Math, JSON, Promise, AbortSignal, console: { error() {}, warn() {}, log() {} },
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    });
    vm.runInContext(source, context);
    await new Promise(resolve => setImmediate(resolve));
    return { get, context };
}

test('TI-05 / S-15: HTTP failures never become a healthy connection', async () => {
    const { get } = await screen({}, [], 503, 503);
    assert.match(get('statusBadge').textContent, /unavailable/i);
    assert.match(get('latestNotice').textContent, /could not|couldn't/i);
});

test('TI-05: an empty database is distinct from a transport failure', async () => {
    const { get } = await screen({ error: 'No records found' }, [], 404);
    assert.match(get('statusBadge').textContent, /no readings/i);
    assert.match(get('historyTable').textContent, /no telemetry/i);
});

test('FE-08 / S-15: real zero values remain visible and missing fields stay unknown', async () => {
    const { get } = await screen(observation({ data: { temperature: 0, humidity: 0, voltage: 0 } }));
    assert.match(get('ambientTemp').textContent, /0\.0/);
    assert.match(get('ambientHumidity').textContent, /0\.0/);
    assert.equal(get('lpgPercent').textContent, '—');
});

test('TI-05: an old record does not prove a live sensor', async () => {
    const { get } = await screen(observation({ recorded_at: '2020-01-01 00:00:00' }));
    assert.match(get('readingFreshness').textContent, /old|freshness unknown/i);
    assert.doesNotMatch(get('statusBadge').textContent, /gateway online/i);
});

test('TI-03: sync counts describe only the returned history window', async () => {
    const { get } = await screen(observation(), [observation({ is_synced: 1 }), observation(), observation({ is_synced: -1 }), observation({ is_synced: 8 })]);
    assert.equal(get('syncedCount').textContent, '1');
    assert.equal(get('pendingCount').textContent, '1');
    assert.equal(get('quarantinedCount').textContent, '1');
    assert.equal(get('unknownCount').textContent, '1');
});

test('TI-05: a failed refresh retains the last reading with a visible failure', async () => {
    const { get, context } = await screen(observation());
    context.fetch = async () => ({ ok: false, status: 500 });
    await vm.runInContext('updateDashboard()', context);
    assert.match(get('lpgPercent').textContent, /42\.5/);
    assert.match(get('latestNotice').textContent, /last|retained/i);
    assert.match(get('statusBadge').textContent, /unavailable/i);
});

test('TI-02: device payload text cannot inject markup into history', async () => {
    const injected = '<img src=x onerror=alert(1)>';
    const { get } = await screen(observation(), [observation({ device_id: injected })]);
    assert.equal(get('historyTable').innerHTML.includes(injected), false);
    assert.match(get('historyTable').textContent, /<img src=x/);
});

test('TI-05: malformed success responses are rejected', async () => {
    const { get } = await screen({ nonsense: true }, { not: 'rows' });
    assert.match(get('statusBadge').textContent, /unavailable/i);
    assert.match(get('historyNotice').textContent, /could not|couldn't/i);
});
