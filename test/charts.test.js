import test from 'node:test';
import assert from 'node:assert/strict';
import { renderChart } from '../src/charts.js';
import { HOUR } from '../src/quality.js';

class Element {
  constructor(tag) { this.tag = tag; this.attributes = {}; this.children = []; this.clientWidth = 350; this.id = 'test-chart'; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
}

test('charts connect sparse valid measurements across gaps without adding points or data tables', () => {
  const original = globalThis.document;
  globalThis.document = { createElementNS: (_, tag) => new Element(tag), createElement: tag => new Element(tag) };
  try {
    const now = Date.parse('2026-11-15T10:00:00Z');
    const container = new Element('div');
    renderChart(container, [
      { created_at: new Date(now - 20 * HOUR).toISOString(), value: '29' },
      { created_at: new Date(now - 10 * HOUR).toISOString(), value: '26' },
      { created_at: new Date(now - 5 * HOUR).toISOString(), value: 'invalid' },
      { created_at: new Date(now).toISOString(), value: '32' },
    ], { now });
    const svg = container.children.find(child => child.tag === 'svg');
    const path = svg.children.find(child => child.tag === 'path').attributes.d;
    assert.equal((path.match(/M/g) ?? []).length, 1);
    assert.equal((path.match(/L/g) ?? []).length, 2);
    assert.equal(svg.children.filter(child => child.tag === 'circle').length, 3);
    assert.equal(container.children.some(child => child.tag === 'details'), false);
    assert.ok(!svg.children.find(child => child.tag === 'title').textContent.includes('ตาราง'));
  } finally {
    globalThis.document = original;
  }
});
