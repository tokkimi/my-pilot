import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { matrixMarkdown } from '../scripts/matrix'

// La matrice documentée doit rester identique au catalogue réellement utilisé par l'application.
describe('documentation', () => {
  it('docs/MATRICE.md est à jour', () => {
    const md = `# Matrice des intégrations ImmoPilot\n\n${matrixMarkdown()}`
    if (process.env.UPDATE_DOCS) writeFileSync('docs/MATRICE.md', md)
    expect(readFileSync('docs/MATRICE.md', 'utf8')).toBe(md)
  })
})
