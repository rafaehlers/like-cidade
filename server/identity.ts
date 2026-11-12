import type { Request } from 'express';
import { isUserId, type UserId } from '../src/domain.js';
import { RequestError } from './errors.js';

// Demo adapter only. WorkOS integration must replace this with a verified server session
// and resolve (provider='workos', subject=session.user.id) in user_identities.
// Keep application IDs stable; never bind identities by nickname or email.
export function resolveDemoActor(_request: Request, data: Record<string, unknown>): UserId {
  if (!isUserId(data.userId)) throw new RequestError(400, 'Selecione um perfil válido da demonstração.');
  return data.userId;
}
