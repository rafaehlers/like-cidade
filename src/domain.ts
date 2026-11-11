export type Role = 'resident' | 'agency' | 'admin';
export type UserId = keyof typeof PEOPLE;
export type Status = 'Registrada' | 'Em análise' | 'Em andamento' | 'Resolvida';
export type Category = 'Calçada' | 'Iluminação' | 'Lixo' | 'Buraco' | 'Água e esgoto' | 'Espaço público';
export type Position = { lat: number; lng: number };
export type NewIssue = Position & { title: string; category: Category; description: string; address: string; photo?: string };
export type IssueSnapshot = { issues: Issue[]; revision: number };
export type Comment = { id: string; author: string; authorId?: UserId; text: string; createdAt: string };
export type Event = { label: string; author: string; authorId?: UserId; createdAt: string };
export type Issue = Position & {
  id: string; title: string; category: Category; description: string; address: string;
  status: Status; author: string; authorId: UserId; createdAt: string;
  photo?: string; likes: UserId[]; comments: Comment[]; history: Event[]; sample?: boolean;
};
export const CENTER: Position = { lat: -26.9078, lng: -48.6635 };
export const CATEGORIES: Category[] = ['Calçada', 'Iluminação', 'Lixo', 'Buraco', 'Água e esgoto', 'Espaço público'];
export const STATUSES: Status[] = ['Registrada', 'Em análise', 'Em andamento', 'Resolvida'];
export const PEOPLE = {
  resident: { name: 'Rafael', fullName: 'Rafael · Morador', role: 'Morador', type: 'resident', initials: 'RA' },
  'resident-felipe': { name: 'Felipe', fullName: 'Felipe · Morador', role: 'Morador', type: 'resident', initials: 'FE' },
  'resident-gabriel': { name: 'Gabriel', fullName: 'Gabriel · Morador', role: 'Morador', type: 'resident', initials: 'GA' },
  'resident-sergio': { name: 'Sérgio', fullName: 'Sérgio · Morador', role: 'Morador', type: 'resident', initials: 'SE' },
  agency: { name: 'Marcos', fullName: 'Marcos · Representante do órgão', role: 'Representante do órgão', type: 'agency', initials: 'MA' },
  admin: { name: 'Rafael', fullName: 'Rafael · Administrador', role: 'Administrador', type: 'admin', initials: 'RA' },
} as const;
export function isUserId(value: unknown): value is UserId { return typeof value === 'string' && Object.hasOwn(PEOPLE, value); }
export function toggleSupport(likes: UserId[], userId: UserId): UserId[] {
  return likes.includes(userId) ? likes.filter(id => id !== userId) : [...likes, userId];
}
export function authorName(id: UserId | undefined, fallback: string) { return id && isUserId(id) ? PEOPLE[id].name : fallback; }
export function isRole(value: unknown): value is Role { return value === 'resident' || value === 'agency' || value === 'admin'; }
export function canManage(role: Role) { return role === 'agency' || role === 'admin'; }
export function validPosition(position: Position) {
  return Number.isFinite(position.lat) && Number.isFinite(position.lng) && Math.abs(position.lat) <= 90 && Math.abs(position.lng) <= 180;
}
export function inBounds(position: Position, bounds: { north: number; south: number; east: number; west: number }) {
  const longitudeInside = bounds.west <= bounds.east
    ? position.lng >= bounds.west && position.lng <= bounds.east
    : position.lng >= bounds.west || position.lng <= bounds.east;
  return position.lat >= bounds.south && position.lat <= bounds.north && longitudeInside;
}
export function seedIssues(): Issue[] {
  const now = Date.now();
  return [
    { title: 'Calçada precisa de um cuidado', category: 'Calçada', description: 'Trecho de calçada com desnível, dificultando a passagem. Este é um relato fictício para explorar a demonstração.', address: 'Centro, Itajaí · localização ilustrativa', lat: -26.9082, lng: -48.6618, status: 'Registrada', likes: ['agency', 'admin'] },
    { title: 'Iluminação na praça', category: 'Iluminação', description: 'Uma luminária da praça está apagada. Exemplo fictício de acompanhamento de uma ocorrência.', address: 'Praça no Centro, Itajaí · exemplo', lat: -26.9057, lng: -48.6648, status: 'Em andamento', likes: ['resident'] },
    { title: 'Descarte de lixo na rua', category: 'Lixo', description: 'Materiais deixados junto à calçada. Exemplo fictício, sem correspondência com um problema real neste endereço.', address: 'Centro, Itajaí · localização ilustrativa', lat: -26.9101, lng: -48.6664, status: 'Resolvida', likes: ['agency'] },
  ].map((i, index) => ({ ...i, id: `example-${index}`, category: i.category as Category, status: i.status as Status,
    likes: i.likes as UserId[], author: 'Morador de exemplo', authorId: 'resident', sample: true,
    createdAt: new Date(now - (index + 1) * 3600000).toISOString(), comments: [],
    history: [{ label: 'Ocorrência de exemplo criada', author: 'Demonstração', createdAt: new Date(now - (index + 1) * 3600000).toISOString() }],
  }));
}
