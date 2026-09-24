// Generatorni Web Worker'da ishga tushirish (bo‘lmasa — asosiy oqimda zaxira rejim)
import SchedWorker from '../scheduler/scheduler.worker.js?worker&inline';
import { generateSchedule } from '../scheduler/scheduler.js';

export function runGenerator(data, options, onProgress) {
  let worker = null;
  let cancelled = false;
  let rejectFn;
  const payload = JSON.parse(JSON.stringify(data));
  const promise = new Promise((resolve, reject) => {
    rejectFn = reject;
    const fallback = () => {
      if (cancelled) return;
      onProgress?.('validate', 2, 'Asosiy oqimda ishlamoqda…');
      setTimeout(() => {
        if (cancelled) return;
        try {
          resolve(generateSchedule(payload, options, (s, p, t) => onProgress?.(s, p, t)));
        } catch (e) { reject(e); }
      }, 30);
    };
    try {
      worker = new SchedWorker();
    } catch {
      worker = null;
      fallback();
      return;
    }
    let started = false;
    worker.onmessage = (e) => {
      started = true;
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.stage, m.pct, m.text);
      if (m.type === 'done') { worker.terminate(); resolve(m.result); }
      if (m.type === 'error') { worker.terminate(); reject(new Error(m.message)); }
    };
    worker.onerror = (e) => {
      worker.terminate();
      if (!started) fallback();
      else reject(new Error(e.message || 'Worker xatosi'));
    };
    worker.postMessage({ data: payload, options });
  });
  return {
    promise,
    cancel() {
      cancelled = true;
      worker?.terminate();
      rejectFn?.(Object.assign(new Error('Bekor qilindi'), { cancelled: true }));
    },
  };
}
