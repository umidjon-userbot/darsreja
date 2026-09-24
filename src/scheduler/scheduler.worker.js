// Generator alohida oqimda (Web Worker) — katta jadvalda UI qotmaydi
import { generateSchedule } from './scheduler.js';

self.onmessage = (e) => {
  const { data, options } = e.data;
  try {
    let last = 0;
    const result = generateSchedule(data, options, (stage, pct, text) => {
      const now = Date.now();
      if (now - last > 80 || stage === 'done') {
        last = now;
        self.postMessage({ type: 'progress', stage, pct, text });
      }
    });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
