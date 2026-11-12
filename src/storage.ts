import type { IssueSnapshot, NewIssue, Status, UserId } from './domain';

async function request<T = IssueSnapshot>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, cache: 'no-store', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  } catch { throw new Error('Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.'); }
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new Error(value.error ?? 'Não foi possível concluir a ação. Tente novamente.');
  }
  return response.json();
}
export const loadIssues = (signal?: AbortSignal) => request('/issues', { signal });
export const createSharedIssue = (value: NewIssue, userId: UserId) => request<IssueSnapshot & { createdId: string }>('/issues', { method: 'POST', body: JSON.stringify({ ...value, userId }) });
export const setIssueSupport = (id: string, userId: UserId, supported: boolean) => request(`/issues/${encodeURIComponent(id)}/support`, { method: 'PUT', body: JSON.stringify({ userId, supported }) });
export const addIssueComment = (id: string, userId: UserId, text: string) => request(`/issues/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify({ userId, text }) });
export const setIssueStatus = (id: string, userId: UserId, status: Status) => request(`/issues/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ userId, status }) });
export const removeSharedIssue = (id: string, userId: UserId) => request(`/issues/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ userId }) });

export async function preparePhoto(file: File, maxDimension = 1400): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Escolha uma foto JPG, PNG, WebP ou AVIF.');
  if (file.size > 15 * 1024 * 1024) throw new Error('A foto deve ter até 15 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Não foi possível abrir essa foto.');
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar essa foto.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Não foi possível abrir essa foto.');
  } finally { URL.revokeObjectURL(url); }
}

export const loadProfile = (id: UserId, signal?: AbortSignal) => request<import('./profiles').ProfileDetails>(`/profiles/${encodeURIComponent(id)}`, { signal });
export const saveProfile = (id: UserId, value: import('./profiles').ProfileUpdate) => request(`/profiles/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...value, userId: id }) });
export const prepareAvatar = (file: File) => preparePhoto(file, 320);

export const loadRanking = (params: {period:import('./ranking').RankingPeriod;city:import('./profiles').PilotCity|'all';theme:import('./ranking').RankingTheme;userId:UserId},signal?:AbortSignal)=>request<import('./ranking').RankingSnapshot>(`/ranking?${new URLSearchParams(params)}`,{signal});
