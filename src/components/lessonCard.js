import { esc } from '../utils/dom.js';
import { PARITY_SHORT } from '../i18n/uz.js';

/**
 * vm: lessonVM natijasi + ixtiyoriy { conflict, subst:{name, orig}, status, cont }
 */
export function lessonCardHtml(vm, opts = {}) {
  const l = vm.lesson;
  const cls = ['lcard'];
  if (l.locked) cls.push('locked');
  if (opts.conflict) cls.push('conflict');
  if (opts.status === 'substituted' || opts.status === 'moved') cls.push('subst');
  if (opts.status === 'cancelled') cls.push('cancelled');
  if (opts.dim) cls.push('dim');
  if (opts.selected) cls.push('selected');
  const flags = [];
  if (opts.conflict) flags.push('<span title="Konflikt" aria-label="Konflikt">🔴</span>');
  if (l.locked) flags.push('<span title="Qulflangan" aria-label="Qulflangan">🔒</span>');
  if (opts.status === 'substituted' || opts.status === 'moved') flags.push('<span title="Almashtirilgan" aria-label="Almashtirilgan">🔁</span>');
  if (l.weekParity && l.weekParity !== 'all') flags.push(`<span class="par" title="${l.weekParity === 'odd' ? 'Toq hafta' : 'Juft hafta'}">${PARITY_SHORT[l.weekParity]}</span>`);
  const teacherLine = opts.subst
    ? `🔁 <b>${esc(opts.subst.name)}</b> <span class="muted">(asl: ${esc(opts.subst.orig)})</span>`
    : esc(vm.teacher?.name || '—');
  const label = `${vm.subject?.name || ''}, ${vm.target}, ${vm.teacher?.name || ''}, ${vm.room?.number || ''}-xona${opts.conflict ? ', konflikt bor' : ''}${l.locked ? ', qulflangan' : ''}`;
  if (opts.cont) {
    return `<div class="${cls.join(' ')}" style="--c:${esc(vm.color)};opacity:.6;cursor:default" data-cont="${l.id}" aria-hidden="true"><div class="m">↳ ${esc(vm.subject?.name || '')} (davomi)</div></div>`;
  }
  return `<div class="${cls.join(' ')}" style="--c:${esc(vm.color)}" data-lesson="${l.id}" ${opts.date ? `data-date="${opts.date}"` : ''} tabindex="0" role="button" aria-label="${esc(label)}">
    <div class="s"><span>${esc(vm.icon)} ${esc(vm.subject?.name || '?')}</span><span class="flags">${flags.join('')}</span></div>
    <div class="m">${esc(vm.target)}</div>
    <div class="m">${teacherLine}</div>
    <div class="m">${esc(vm.room?.number || '—')}${vm.room ? '-xona' : ''}${vm.dur > 1 ? ` · ${vm.dur} slot` : ''}${opts.status === 'moved' ? ' · ko‘chirilgan' : ''}${opts.status === 'cancelled' ? ' · bekor' : ''}</div>
    ${opts.event ? `<div class="m">🎪 ${esc(opts.event.title)}${opts.status === 'cancelled' ? '' : ' — to‘qnashuv'}</div>` : ''}
  </div>`;
}
