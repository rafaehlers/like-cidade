import { useState } from 'react';
import type { PublicProfile } from '../profiles';

export default function Avatar({ profile, size = 'normal' }: { profile: Pick<PublicProfile,'nickname'|'role'|'avatarUrl'>; size?: 'normal'|'large' }) {
  const [failedUrl,setFailedUrl]=useState<string>();
  const initials=profile.nickname.trim().split(/\s+/).map(word=>Array.from(word)[0]).slice(0,2).join('').toLocaleUpperCase('pt-BR');
  return <span className={`avatar avatar-${profile.role} ${size==='large' ? 'avatar-large' : ''}`} aria-hidden="true">
    {profile.avatarUrl && profile.avatarUrl!==failedUrl ? <img src={profile.avatarUrl} alt="" onError={()=>setFailedUrl(profile.avatarUrl)} /> : initials}
  </span>;
}
