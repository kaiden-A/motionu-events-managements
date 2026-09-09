export interface CategoryMeta {
  icon: string
  chipClass: string
  solidVar: string
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  Workshop: { icon: 'wrench', chipClass: 'cat-workshop', solidVar: 'var(--cat-workshop)' },
  Hackathon: { icon: 'rocket', chipClass: 'cat-hackathon', solidVar: 'var(--cat-hackathon)' },
  'Tech Talk': { icon: 'microphone', chipClass: 'cat-talk', solidVar: 'var(--cat-talk)' },
  Seminar: { icon: 'graduation-cap', chipClass: 'cat-seminar', solidVar: 'var(--cat-seminar)' },
  General: { icon: 'calendar-days', chipClass: 'cat-general', solidVar: 'var(--cat-general)' },
}

export const GENERAL_META: CategoryMeta = {
  icon: 'calendar-days',
  chipClass: 'cat-general',
  solidVar: 'var(--cat-general)',
}

export function categoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? GENERAL_META
}
