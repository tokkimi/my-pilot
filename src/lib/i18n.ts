import dictionary from './translations.json'
export const language: 'fr' | 'en' = typeof localStorage !== 'undefined' && localStorage.getItem('immopilot-language') === 'en' ? 'en' : 'fr'
export const locale = language === 'en' ? 'en-CA' : 'fr-CA'
export function tr(text: string): string { return language === 'en' ? (dictionary as Record<string,string>)[text] ?? text : text }
