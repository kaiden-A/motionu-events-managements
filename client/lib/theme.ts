export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'mu-theme'

export function systemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function currentTheme(): ThemeMode {
  const root = document.documentElement.getAttribute('data-theme')
  if (root === 'dark' || root === 'light') return root
  return systemTheme()
}

export function applyTheme(mode: ThemeMode): ThemeMode {
  document.documentElement.setAttribute('data-theme', mode)
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* ignore */
  }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0B1220' : '#F4F6FB')
  return mode
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = currentTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
