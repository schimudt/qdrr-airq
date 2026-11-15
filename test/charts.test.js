import test from 'node:test';
import assert from 'node:assert/strict';
import { renderChart, nearestPoint } from '../src/charts.js';
import { HOUR } from '../src/quality.js';

class Element {
  constructor(tag) { this.tag = tag; this.attributes = {}; this.children = []; this.clientWidth = 350; this.id = 'test-chart'; this.style = {}; this.offsetWidth = 130; this.offsetHeight = 65; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  getBoundingClientRect() { return { left: 0, width: 350 }; }
}

test('hover selection finds the closest recorded time, including sparse gaps and endpoints', () => {
  const points = [{time:10},{time:20},{time:100}];
  for (const [time, expected] of [[0,0],[10,0],[15,0],[19,1],[40,1],[90,2],[200,2]]) {
    assert.equal(nearestPoint(points,time),expected);
  }
  assert.equal(nearestPoint([], 0), -1);
});

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
    assert.equal(svg.children.filter(child => child.attributes.class === 'chart-point').length, 3);
    assert.equal(container.children.some(child => child.tag === 'details'), false);
    assert.ok(!svg.children.find(child => child.tag === 'title').textContent.includes('ตาราง'));
    const hitArea = svg.children.find(child => child.attributes.class === 'chart-hit-area');
    const tooltip = container.children.find(child => child.className === 'chart-tooltip');
    assert.equal(tooltip.hidden, true);
    hitArea.onfocus();
    assert.equal(tooltip.hidden, false);
    assert.equal(tooltip.children[0].textContent, '32 °C');
    hitArea.onkeydown({key:'ArrowLeft',preventDefault(){}});
    assert.equal(tooltip.children[0].textContent, '26 °C');
    hitArea.onkeydown({key:'Home',preventDefault(){}});
    assert.equal(tooltip.children[0].textContent, '29 °C');
    hitArea.onpointermove({clientX:334});
    assert.equal(tooltip.children[0].textContent, '32 °C');
    hitArea.onpointerleave({pointerType:'touch'});
    assert.equal(tooltip.hidden, false);
    hitArea.onpointerleave({pointerType:'mouse'});
    assert.equal(tooltip.hidden, true);
    hitArea.onpointerdown({clientX:48});
    assert.equal(tooltip.children[0].textContent, '29 °C');
    hitArea.onkeydown({key:'Escape'});
    assert.equal(tooltip.hidden, true);
  } finally {
    globalThis.document = original;
  }
});
