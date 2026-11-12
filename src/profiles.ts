import type { Category, Role, Subcategory, UserId } from './domain.js';

export const PILOT_CITIES = ['Itajaí', 'Balneário Camboriú', 'Navegantes'] as const;
export type PilotCity = (typeof PILOT_CITIES)[number];
export type PublicProfile = { id: UserId; nickname: string; city: PilotCity; bio: string; role: Role; avatarUrl?: string; updatedAt: string };
export type ProfileUpdate = { nickname: string; city: PilotCity; bio: string; avatar?: string | null };
export type PointAction = 'report' | 'support' | 'solution' | 'conclusion';
export const POINT_RULES = [
  { action: 'report', label: 'Registrar uma ocorrência', points: 10, available: true },
  { action: 'support', label: 'Apoiar uma ocorrência de outra pessoa', points: 2, available: true },
  { action: 'solution', label: 'Confirmar, contestar ou informar uma solução', points: 5, available: false },
  { action: 'conclusion', label: 'Ter uma ocorrência sua concluída', points: 15, available: false },
] as const;
export const LEVELS = [
  { level: 1, title: 'Vizinho Novo', threshold: 0 },
  { level: 2, title: 'Vizinho Atento', threshold: 100 },
  { level: 3, title: 'Fiscal do Bairro', threshold: 300 },
  { level: 4, title: 'Guardião do Bairro', threshold: 700 },
  { level: 5, title: 'Guardião da Cidade', threshold: 1500 },
] as const;
export type PointEntry = { id: string; action: PointAction; amount: number; issueId: string; issueTitle: string; category: Category; subcategory?: Subcategory; createdAt: string; reason: string; reversesId?: string; balance: number; demo?: boolean; city?: PilotCity };
export type Achievement = { id: 'first-step' | 'sharp-eye' | 'accessibility'; title: string; description: string; target: number; progress: number; earnedAt?: string; available: boolean };
export type ProfileDetails = { profile: PublicProfile; total: number; level: (typeof LEVELS)[number]; nextLevel?: (typeof LEVELS)[number]; progress: number; achievements: Achievement[]; ledger: PointEntry[]; stats: { reports: number; supports: number; solutions: number; conclusions: number }; revision: number; demoPoints: number; actualPoints: number };
export const ACCESSIBILITY_SUBCATEGORIES: readonly string[] = ['Rampa de acesso ausente', 'Rampa de acesso danificada', 'Piso tátil ausente', 'Piso tátil danificado'];
export function profileProgress(profile: PublicProfile, ledger: PointEntry[], revision: number): ProfileDetails {
  const total = ledger.reduce((sum, entry) => sum + entry.amount, 0);
  const level = [...LEVELS].reverse().find(item => total >= item.threshold) ?? LEVELS[0];
  const nextLevel = LEVELS.find(item => item.level === level.level + 1);
  const reversed = new Set(ledger.flatMap(entry => entry.reversesId ? [entry.reversesId] : []));
  const active = ledger.filter(entry => entry.amount > 0 && !reversed.has(entry.id));
  const events = (action: PointAction) => active.filter(entry => entry.action === action);
  const reports = events('report');
  const accessible = reports.filter(entry => ACCESSIBILITY_SUBCATEGORIES.includes(entry.subcategory ?? ''));
  const solutions = events('solution');
  const earned = (entries: PointEntry[], target: number) => entries.length >= target ? [...entries].sort((a,b) => a.createdAt.localeCompare(b.createdAt))[target-1].createdAt : undefined;
  return { profile, total, level, nextLevel, revision, demoPoints: ledger.filter(entry=>entry.demo).reduce((sum,entry)=>sum+entry.amount,0), actualPoints: ledger.filter(entry=>!entry.demo).reduce((sum,entry)=>sum+entry.amount,0),
    progress: nextLevel ? Math.max(0, Math.min(100, (total-level.threshold)/(nextLevel.threshold-level.threshold)*100)) : 100,
    stats: { reports: reports.length, supports: events('support').length, solutions: solutions.length, conclusions: events('conclusion').length },
    achievements: [
      { id: 'first-step', title: 'Primeiro Passo', description: 'Registre sua primeira ocorrência.', target: 1, progress: reports.length, earnedAt: earned(reports,1), available: true },
      { id: 'accessibility', title: 'Guardião da Acessibilidade', description: 'Registre 10 ocorrências sobre rampas de acesso ou piso tátil.', target: 10, progress: accessible.length, earnedAt: earned(accessible,10), available: true },
      { id: 'sharp-eye', title: 'Olho Vivo', description: 'Confirme ou conteste 10 soluções.', target: 10, progress: solutions.length, earnedAt: earned(solutions,10), available: false },
    ], ledger,
  };
}
