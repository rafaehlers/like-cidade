import { Accessibility, BadgeAlert as BadgeExclamationPoint, Droplets, Lightbulb, Trash2, Trees } from 'lucide-react';
import type { Category } from '../domain';

const CATEGORY_ICONS = { Calçada: Accessibility, Iluminação: Lightbulb, Lixo: Trash2, Buraco: BadgeExclamationPoint, 'Água e esgoto': Droplets, 'Espaço público': Trees };

export default function CategoryIcon({ category, size = 22 }: { category: Category; size?: number }) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />;
}
