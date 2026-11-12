import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, UserRound, Trophy } from 'lucide-react';
import { PEOPLE, type UserId } from '../domain';
import type { PublicProfile } from '../profiles';
import Avatar from './Avatar';

type Props = { value: UserId; disabled: boolean; onChange: (value: UserId) => void; profiles: PublicProfile[]; onOpenProfile: () => void; onOpenRanking: () => void };
const accounts = Object.entries(PEOPLE) as [UserId, (typeof PEOPLE)[UserId]][];

export default function ProfileSelector({ value, disabled, onChange, profiles, onOpenProfile, onOpenRanking }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const person = PEOPLE[value];
  const publicPerson = profiles.find(profile=>profile.id===value);
  const nickname = publicPerson?.nickname ?? person.name;

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
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
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]') ?? []);
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
      aria-label={`Perfil atual: ${nickname} · ${person.role}`} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      onClick={() => setOpen(current => !current)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      }}>
      <Avatar profile={publicPerson ?? {nickname,role:person.type}} />
      <span className="profile-text"><small>{person.role}</small><strong>{nickname}</strong></span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div className="profile-menu" id={menuId} role="menu" aria-label="Perfis de usuários" ref={menu} onKeyDown={navigate}>
      <button type="button" role="menuitem" className="profile-menu-item my-profile-item" onClick={()=>{setOpen(false);onOpenProfile();}}><UserRound size={20} /><span className="profile-menu-text"><strong>Meu perfil</strong><small>Pontos, conquistas e informações</small></span></button>
      <button type="button" role="menuitem" className="profile-menu-item" onClick={()=>{setOpen(false);onOpenRanking();}}><Trophy size={20}/><span className="profile-menu-text"><strong>Ranking</strong><small>Moradores e cidades em ação</small></span></button>
      <p className="profile-menu-label">Trocar usuário</p>
      <div className="profile-menu-accounts" role="group" aria-label="Trocar usuário">
      {accounts.map(([id, account]) => { const profile=profiles.find(item=>item.id===id); return <button type="button" key={id} role="menuitemradio" aria-checked={id === value}
        aria-label={`${profile?.nickname ?? account.name} · ${account.role}`} className="profile-menu-item" tabIndex={-1} onClick={() => choose(id)}>
        <Avatar profile={profile ?? {nickname:account.name,role:account.type}} />
        <span className="profile-menu-text"><strong>{profile?.nickname ?? account.name}</strong><small>{account.role}</small></span>
        {id === value && <Check size={17} className="profile-menu-check" aria-hidden="true" />}
      </button>; })}
      </div>
    </div>}
  </div>;
}
