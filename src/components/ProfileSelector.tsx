import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { PEOPLE, type UserId } from '../domain';

type Props = { value: UserId; disabled: boolean; onChange: (value: UserId) => void };
const accounts = Object.entries(PEOPLE) as [UserId, (typeof PEOPLE)[UserId]][];

export default function ProfileSelector({ value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const person = PEOPLE[value];

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function choose(id: UserId) {
    setOpen(false);
    trigger.current?.focus();
    if (id !== value) onChange(id);
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    if (next !== undefined) { event.preventDefault(); buttons[next]?.focus(); }
  }

  return <div className="profile-selector" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button type="button" ref={trigger} className="profile-trigger" disabled={disabled}
      aria-label={`Perfil da demonstração: ${person.fullName}`} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      onClick={() => setOpen(current => !current)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      }}>
      <span className={`avatar avatar-${person.type}`}>{person.initials}</span>
      <span className="profile-text"><small>{person.role}</small><strong>{person.name}</strong></span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div className="profile-menu" id={menuId} role="menu" aria-label="Perfis da demonstração" ref={menu} onKeyDown={navigate}>
      {accounts.map(([id, account]) => <button type="button" key={id} role="menuitemradio" aria-checked={id === value}
        aria-label={account.fullName} className="profile-menu-item" tabIndex={-1} onClick={() => choose(id)}>
        <span className={`avatar avatar-${account.type}`} aria-hidden="true">{account.initials}</span>
        <span className="profile-menu-text"><strong>{account.name}</strong><small>{account.role}</small></span>
        {id === value && <Check size={17} className="profile-menu-check" aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
