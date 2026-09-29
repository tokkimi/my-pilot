// Génère le tableau Markdown de la matrice des intégrations à partir du catalogue (source unique).
import { CONNECTORS, IMPL_LABEL, INTEGRATIONS, METHOD_LABEL } from '../src/lib/integrations/catalog'

const cell = (v: string[] | string) => (Array.isArray(v) ? v.join(' · ') : v).replace(/\|/g, '\\|').replace(/\n/g, ' ') || '—'

export function matrixMarkdown() {
  const head = '| Application | Connexion | Accès nécessaires | Données lues | Modifiables / actions | Statistiques | Affichage dans ImmoPilot | Automatisation | État | Blocages externes |\n|---|---|---|---|---|---|---|---|---|---|'
  const cats = [...new Set(INTEGRATIONS.map(i => i.category))]
  const parts = cats.map(cat => `### ${cat}\n\n${head}\n${INTEGRATIONS.filter(i => i.category === cat).map(i => `| **${i.name}** | ${cell(i.method.map(m => METHOD_LABEL[m]))} | ${cell(i.access)} | ${cell(i.read)} | ${cell([...i.write, ...i.actions.map(a => `${a.label} (${a.risk})`)])} | ${cell(i.stats)} | ${cell(i.embed.note)} | ${cell(i.automation.note)} | ${IMPL_LABEL[i.impl]} | ${cell(i.blockers)} |`).join('\n')}`)
  const conn = `| Connecteur | Authentification | Comptes | Fréquence par défaut | Webhooks | Services | Maintien de la connexion |\n|---|---|---|---|---|---|---|\n${Object.values(CONNECTORS).map(c => `| **${c.name}** | ${c.auth} | ${c.modes.map(m => (m === 'user' ? 'individuel' : 'partagé')).join(', ')} | ${c.defaultEveryMin ? `${c.defaultEveryMin} min` : 'manuel / événement'} | ${c.webhooks ? 'oui' : 'non'} | ${cell(c.services.map(s => `${s.label}${s.scope ? ` (\`${s.scope}\`)` : ''}${s.approval ? ` — ${s.approval}` : ''}`))} | ${cell(c.refresh)} |`).join('\n')}`
  return `<!-- Généré depuis src/lib/integrations/catalog.ts — ne pas modifier à la main : UPDATE_DOCS=1 npm test -->\n\n## Connecteurs\n\n${conn}\n\n## Matrice application par application\n\n${parts.join('\n\n')}\n`
}
