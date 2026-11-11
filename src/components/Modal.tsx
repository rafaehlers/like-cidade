import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

let openModals = 0;
let originalOverflow = '';

export default function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    if (openModals === 0) originalOverflow = document.body.style.overflow;
    openModals += 1;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); openModals -= 1; if (openModals === 0) document.body.style.overflow = originalOverflow; };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === ref.current) { const rect = ref.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Fechar janela" onClick={onClose}><X size={21} /></button></div>
    {children}
  </dialog>;
}
