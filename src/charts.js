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

export function nearestPoint(points, time) {
  if (!points.length) return -1;
  let low = 0, high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].time < time) low = middle + 1;
    else high = middle;
  }
  return low > 0 && time - points[low - 1].time <= points[low].time - time ? low - 1 : low;
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
  const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-labelledby': id });
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
    svg.append(dot);
  }
  container.append(svg);

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.id = `${container.id}-tooltip`;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  const tooltipValue = document.createElement('strong');
  const tooltipTime = document.createElement('span');
  tooltip.append(tooltipValue, tooltipTime);
  container.append(tooltip);
  const crosshair = svgElement('line', { y1: box.top, y2: box.bottom, class: 'chart-crosshair', visibility: 'hidden', 'aria-hidden': 'true' });
  const selection = svgElement('circle', { r: 5, class: 'chart-selection', visibility: 'hidden', 'aria-hidden': 'true' });
  const hitArea = svgElement('rect', {
    x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top,
    class: 'chart-hit-area', tabindex: 0, role: 'slider',
    'aria-label': `${pm ? 'PM2.5' : 'อุณหภูมิ'} ย้อนหลัง ใช้ปุ่มลูกศรเพื่อเลือกเวลา`,
    'aria-valuemin': 1, 'aria-valuemax': points.length, 'aria-describedby': tooltip.id,
  });
  svg.append(crosshair, selection, hitArea);
  let selected = points.length - 1;
  function show(index) {
    selected = Math.max(0, Math.min(points.length - 1, index));
    const point = points[selected];
    const value = `${number.format(point.value)} ${unit}`;
    const timestamp = `${date.format(point.time)} น.`;
    tooltipValue.textContent = value;
    tooltipTime.textContent = timestamp;
    tooltip.hidden = false;
    hitArea.setAttribute('aria-valuenow', selected + 1);
    hitArea.setAttribute('aria-valuetext', `${timestamp} · ${value}`);
    crosshair.setAttribute('x1', x(point.time));
    crosshair.setAttribute('x2', x(point.time));
    crosshair.setAttribute('visibility', 'visible');
    selection.setAttribute('cx', x(point.time));
    selection.setAttribute('cy', y(point.value));
    selection.setAttribute('visibility', 'visible');
    tooltip.style.left = `${Math.max(0, Math.min(width - tooltip.offsetWidth, x(point.time) - tooltip.offsetWidth / 2))}px`;
    tooltip.style.top = `${Math.max(0, y(point.value) - tooltip.offsetHeight - 14)}px`;
  }
  function hide() {
    tooltip.hidden = true;
    crosshair.setAttribute('visibility', 'hidden');
    selection.setAttribute('visibility', 'hidden');
  }
  hitArea.setAttribute('aria-valuenow', selected + 1);
  hitArea.setAttribute('aria-valuetext', `${date.format(points[selected].time)} น. · ${number.format(points[selected].value)} ${unit}`);
  hitArea.onpointermove = hitArea.onpointerdown = event => {
    const bounds = svg.getBoundingClientRect();
    const plotX = (event.clientX - bounds.left) * width / bounds.width;
    const time = start + (plotX - box.left) / (box.right - box.left) * 24 * HOUR;
    show(nearestPoint(points, time));
  };
  hitArea.onpointerleave = event => { if (event.pointerType !== 'touch' && document.activeElement !== hitArea) hide(); };
  hitArea.onfocus = () => show(selected);
  hitArea.onblur = hide;
  hitArea.onkeydown = event => {
    const moves = { ArrowLeft: selected - 1, ArrowDown: selected - 1, ArrowRight: selected + 1, ArrowUp: selected + 1, Home: 0, End: points.length - 1 };
    if (event.key === 'Escape') hide();
    else if (Object.hasOwn(moves, event.key)) {
      event.preventDefault();
      show(moves[event.key]);
    }
  };
  const caption = document.createElement('p');
  caption.className = 'chart-caption';
  caption.textContent = `${date.format(start)} – ${date.format(now)} · เวลาไทย`;
  container.append(caption);
}
