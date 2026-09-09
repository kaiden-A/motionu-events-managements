export interface CategoryMeta {
  icon: string
  chipClass: string
  solidVar: string
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  Wellness: { icon: 'spa', chipClass: 'cat-wellness', solidVar: 'var(--cat-well)' },
  Dance: { icon: 'music', chipClass: 'cat-dance', solidVar: 'var(--cat-dance)' },
  Fitness: { icon: 'dumbbell', chipClass: 'cat-fitness', solidVar: 'var(--cat-fit)' },
  'Martial Arts': { icon: 'hand-fist', chipClass: 'cat-martial', solidVar: 'var(--cat-martial)' },
}

export const GENERAL_META: CategoryMeta = {
  icon: 'calendar-days',
  chipClass: 'cat-dance',
  solidVar: 'var(--primary)',
}

export function categoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? GENERAL_META
}
