import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Modal({ title, children, onClose, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">✕</button>
      </div>
      {children}
    </dialog>
  );
}

export function prettyDate(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', options) : '';
}

export function duration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const remainder = minutes % 60;
  return `${Math.floor(minutes / 60)}h${remainder ? ` ${remainder}m` : ''}`;
}

export function downloadText(filename: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
