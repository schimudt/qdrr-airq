import { BANDS, MINUTE, parseReading, previousHour, hourlyEstimate } from './quality.js';
import { FEEDS, latest, history, hourRecords } from './api.js';
import { Poller } from './polling.js';
import { renderChart } from './charts.js';

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const time = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const clock = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

for (const band of BANDS) {
  const item = document.createElement('li');
  item.style.setProperty('--band', band.color);
  item.append(document.createTextNode(band.thai));
  for (const text of [band.english, `${band.range} µg/m³`]) {
    const line = document.createElement('span');
    line.textContent = text;
    item.append(line);
  }
  $('legend').append(item);
}

function errorText(error, retained = false) {
  const reason = error.status === 429 ? 'Adafruit IO จำกัดคำขอชั่วคราว' : 'ดึงข้อมูลไม่สำเร็จ';
  return `${reason}${retained ? ' · ยังแสดงข้อมูลที่ดึงได้ก่อนหน้า' : ''} · จะลองใหม่อัตโนมัติ`;
}

const poller = new Poller();
for (const [key, feed] of Object.entries(FEEDS)) {
  let reading = null;
  let chartLoaded = false;
  let chartRecords = null;
  let chartTime = 0;
  let chartWidth = 0;
  const chartContainer = $(`${key}-chart`);
  const resizeObserver = new ResizeObserver(() => {
    if (chartRecords && chartContainer.clientWidth !== chartWidth) {
      chartWidth = chartContainer.clientWidth;
      renderChart(chartContainer, chartRecords, { pm: key === 'pm', now: chartTime });
    }
  });
  resizeObserver.observe(chartContainer);
  poller.add(async () => {
    const records = await latest(feed);
    const point = parseReading(records[0], { pm: key === 'pm' });
    if (!point || point.time > Date.now() + MINUTE) throw new Error('No valid latest reading');
    reading = point;
    $(`${key}-value`).textContent = number.format(point.value);
    $(`${key}-time`).textContent = `บันทึก ${time.format(point.time)} น.`;
    $(`${key}-status`).textContent = '';
  }, MINUTE, error => {
    $(`${key}-status`).textContent = errorText(error, !!reading);
    if (!reading) $(`${key}-time`).textContent = 'ยังไม่มีค่าล่าสุดที่ใช้ได้';
  });

  poller.add(async () => {
    const records = await history(feed);
    chartRecords = records;
    chartTime = Date.now();
    chartWidth = chartContainer.clientWidth;
    renderChart(chartContainer, records, { pm: key === 'pm', now: chartTime });
    chartLoaded = true;
    $(`${key}-chart-status`).textContent = '';
  }, 5 * MINUTE, error => {
    $(`${key}-chart-status`).textContent = errorText(error, chartLoaded);
    if (!chartLoaded) {
      const message = document.createElement('p');
      message.textContent = 'ยังไม่มีข้อมูลกราฟที่ใช้ได้';
      $(`${key}-chart`).replaceChildren(message);
    }
  });
}

let lastAssessment = null;
let assessedAt = 0;
poller.add(async () => {
  const window = previousHour();
  if (lastAssessment?.end === window.end && Date.now() - assessedAt < 5 * MINUTE) return;
  const records = await hourRecords(FEEDS.pm, window);
  const result = hourlyEstimate(records, window);
  lastAssessment = result;
  assessedAt = Date.now();
  $('assessment-period').textContent = `${time.format(result.start).replace(/:\d{2}$/, '')}–${clock.format(result.end)} น. · เวลาไทย · ข้อมูลครอบคลุม ${Math.round(result.coverage * 100)}%`;
  $('assessment-status').textContent = '';
  $('report').style.setProperty('--quality-color', result.band?.color ?? '#8b939d');
  if (result.band) {
    $('category').textContent = `${result.band.thai} (${result.band.english})`;
    // Extra precision avoids displaying a boundary value beside the next category.
    const formatted = new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(result.value);
    $('assessment-value').textContent = `PM2.5 เฉลี่ยรายชั่วโมงโดยประมาณ ${formatted} µg/m³`;
  } else {
    $('category').textContent = 'ข้อมูลไม่เพียงพอสำหรับจัดระดับรายชั่วโมง';
    $('assessment-value').textContent = 'ต้องมีข้อมูลครอบคลุมอย่างน้อย 75% ของชั่วโมง';
  }
}, MINUTE, error => {
  $('assessment-status').textContent = errorText(error, !!lastAssessment);
  if (!lastAssessment) {
    $('category').textContent = 'ยังประเมินรายชั่วโมงไม่ได้';
    $('assessment-value').textContent = '';
  }
});

// Old assessments remain timestamped but are not presented as the current hour's result.
function markOlderAssessment() {
  if (lastAssessment && lastAssessment.end !== previousHour().end) {
    $('assessment-status').textContent = 'ผลประเมินของชั่วโมงก่อนหน้า · กำลังรอข้อมูลสำหรับชั่วโมงล่าสุด';
  }
}

function tick() {
  markOlderAssessment();
  void poller.tick();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
tick();
setInterval(tick, 1000);
