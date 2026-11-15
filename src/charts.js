import { BANDS, normaliseRecords, HOUR } from './quality.js';

const NS = 'http://www.w3.org/2000/svg';
const clock = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const date = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

function svgElement(tag, attrs = {}, text) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

export function renderChart(container, records, { pm = false, now = Date.now() } = {}) {
  const start = now - 24 * HOUR;
  const points = normaliseRecords(records, { pm }).filter(point => point.time >= start && point.time <= now);
  container.replaceChildren();
  if (!points.length) {
    const message = document.createElement('p');
    message.textContent = 'ไม่มีข้อมูลในช่วง 24 ชั่วโมงนี้';
    container.append(message);
    return;
  }
  const unit = pm ? 'µg/m³' : '°C';
  const values = points.map(point => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const min = pm ? 0 : Math.floor(low - 2);
  const max = pm ? Math.max(20, Math.ceil(high * 1.15 / 5) * 5) : Math.ceil(high + 2);
  // Size the viewBox to the actual panel so Thai labels stay readable on phones.
  const width = Math.max(240, container.clientWidth), height = 290;
  const box = { left: 48, right: width - 16, top: 28, bottom: 246 };
  const x = time => box.left + (time - start) / (24 * HOUR) * (box.right - box.left);
  const y = value => box.bottom - (value - min) / (max - min) * (box.bottom - box.top);
  const id = `${container.id}-description`;
  const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': id });
  svg.append(svgElement('title', { id }, `${pm ? 'PM2.5' : 'อุณหภูมิ'} ย้อนหลัง 24 ชั่วโมง ต่ำสุด ${number.format(low)} สูงสุด ${number.format(high)} ${unit}`));
  svg.append(svgElement('rect', { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, fill: '#fff' }));
  if (pm) {
    let previous = 0;
    for (const band of BANDS) {
      if (previous >= max) break;
      const upper = Math.min(band.max, max);
      svg.append(svgElement('rect', { x: box.left, y: y(upper), width: box.right - box.left, height: y(previous) - y(upper), fill: band.color, 'fill-opacity': '.18' }));
      if (Number.isFinite(band.max) && band.max < max) {
        svg.append(svgElement('line', { x1: box.left, x2: box.right, y1: y(band.max), y2: y(band.max), stroke: band.color, 'stroke-width': 1 }));
      }
      previous = upper;
    }
  }
  for (let tick = 0; tick <= 4; tick++) {
    const value = min + (max - min) * tick / 4;
    svg.append(svgElement('line', { x1: box.left, x2: box.right, y1: y(value), y2: y(value), class: 'chart-grid' }));
    svg.append(svgElement('text', { x: box.left - 9, y: y(value) + 4, 'text-anchor': 'end', class: 'chart-axis' }, number.format(value)));
    const time = start + 24 * HOUR * tick / 4;
    svg.append(svgElement('text', { x: x(time), y: box.bottom + 23, 'text-anchor': tick === 0 ? 'start' : tick === 4 ? 'end' : 'middle', class: 'chart-axis' }, clock.format(time)));
  }
  svg.append(svgElement('text', { x: box.left, y: 15, class: 'chart-axis' }, unit));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
  svg.append(svgElement('path', { d: path, class: 'chart-line' }));
  for (const point of points) {
    const dot = svgElement('circle', { cx: x(point.time), cy: y(point.value), r: 2.3, class: 'chart-point' });
    dot.append(svgElement('title', {}, `${date.format(point.time)} · ${number.format(point.value)} ${unit}`));
    svg.append(dot);
  }
  container.append(svg);
  const caption = document.createElement('p');
  caption.className = 'chart-caption';
  caption.textContent = `${date.format(start)} – ${date.format(now)} · เวลาไทย`;
  container.append(caption);
}
