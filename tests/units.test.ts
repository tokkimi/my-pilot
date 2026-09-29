import { describe, expect, it, vi } from 'vitest'
import { redact, seal, unseal } from '../server/vault'
import { buildContext } from '../server/ai'
import { access, defaultPolicy, normalizePolicy } from '../server/policy'
import { parseIcs, toWall } from '../server/connectors/util'
import { csvRecords, webhookRecords } from '../server/connectors/other'
import { authorizeUrl, readState, signState } from '../server/connectors/oauth'
import { microsoft } from '../server/connectors/microsoft'
import { INTEGRATIONS, CONNECTORS } from '../src/lib/integrations/catalog'
import { PLATFORM_CATALOG } from '../src/lib/platforms'

describe('coffre et masquage des secrets', () => {
  it('chiffre et déchiffre; refuse un contenu altéré', () => {
    const s = seal({ refreshToken: 'abc' })
    expect(s).not.toContain('abc')
    expect(unseal<{ refreshToken: string }>(s).refreshToken).toBe('abc')
    const bad = s.slice(0, -3) + (s.endsWith('A') ? 'BBB' : 'AAA')
    expect(() => unseal(bad)).toThrow()
  })
  it('retire les secrets des objets et des textes', () => {
    const r = redact({ note: 'clé sk-abcdefghijklmnopqrstuv et Bearer abcdefghijklmnopqrstuvwxyz', refresh_token: 'x', password: 'y', nested: [{ accessToken: 'z' }] })
    expect(JSON.stringify(r)).not.toMatch(/sk-abc|Bearer abc|"x"|"y"|"z"/)
  })
})

describe('contexte de l’IA', () => {
  const doc = {
    agency: { name: 'Agence' },
    members: [{ id: 'u1', name: 'A', role: 'courtier' }],
    contacts: [{ id: 'c1', firstName: 'Julie', email: 'j@x.com', budget: 500000, password: 'jamais', _src: [{ p: 'google', c: 'cx', x: '1', at: '2026-09-28T10:00:00Z' }], _prov: { email: { p: 'google', at: '2026-09-28T10:00:00Z' } } }],
    activities: [{ id: 'a1', contactId: 'c1', kind: 'courriel', date: '2026-09-28', summary: 'privé de u2', memberId: 'u2', private: true }, { id: 'a2', contactId: 'c1', kind: 'appel', date: '2026-09-27', summary: 'appel', memberId: 'u2' }],
    listings: [{ id: 'l1', address: '1 rue', price: 400000 }],
    ledger: [{ id: 'x', amount: 999 }],
  }
  it('respecte les réglages, masque les montants et les communications privées d’autrui, garde la provenance', () => {
    const p = defaultPolicy()
    const ctx = JSON.stringify(buildContext(doc, { id: 'u1', role: 'courtier' }, p))
    expect(ctx).toContain('google@2026-09-28')
    expect(ctx).not.toContain('jamais')
    expect(ctx).not.toContain('privé de u2')
    expect(ctx).toContain('appel')
    expect(ctx).not.toContain('500000')
    expect(ctx).not.toContain('999')
    p.ai.collections.finance = true
    p.ai.collections.listings = false
    const ctx2 = JSON.stringify(buildContext(doc, { id: 'u1', role: 'courtier' }, p))
    expect(ctx2).toContain('500000')
    expect(ctx2).not.toContain('1 rue')
  })
  it('se limite au dossier demandé', () => {
    const ctx = buildContext({ ...doc, contacts: [...doc.contacts, { id: 'c2', firstName: 'Autre' }] }, { id: 'u1', role: 'admin' }, defaultPolicy(), { coll: 'contacts', id: 'c1' })
    expect(JSON.stringify(ctx)).not.toContain('Autre')
  })
})

describe('permissions', () => {
  it('offre plateforme, activation, rôles', () => {
    const p = normalizePolicy({ providers: { mailchimp: { ...defaultPolicy().providers.mailchimp!, useRoles: ['admin'], visibleRoles: ['admin', 'courtier'] } } })
    const all = new Set(Object.keys(CONNECTORS) as never[])
    expect(access({ role: 'courtier' }, 'mailchimp', p, all)).toMatchObject({ see: true, use: false })
    expect(access({ role: 'admin' }, 'mailchimp', p, all).use).toBe(true)
    expect(access({ role: 'marketing' }, 'mailchimp', p, all).see).toBe(false)
    expect(access({ role: 'admin' }, 'mailchimp', p, new Set()).see).toBe(false)
    p.providers.mailchimp!.enabled = false
    expect(access({ role: 'admin' }, 'mailchimp', p, all)).toMatchObject({ see: true, use: false })
  })
})

describe('OAuth', () => {
  it('état signé et PKCE; aucun vérificateur dans l’URL', () => {
    process.env.MICROSOFT_CLIENT_ID = 'id'
    const st = signState({ u: 'u1', a: 'ag', p: 'microsoft', m: 'user', n: 'nonce', s: ['calendar'] })
    expect(readState(st)?.u).toBe('u1')
    expect(readState(st.replace(/.$/, c => (c === 'a' ? 'b' : 'a')))).toBeNull()
    const url = new URL(authorizeUrl(microsoft.oauth!, 'microsoft', 'https://app.test', st, ['calendar'], 'verificateur-secret'))
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.toString()).not.toContain('verificateur-secret')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/api/connect/callback/microsoft')
    expect(url.searchParams.get('scope')).toContain('Calendars.ReadWrite')
    expect(url.searchParams.get('scope')).not.toContain('Mail.ReadBasic')
  })
})

describe('formats', () => {
  it('lit un agenda .ics (lignes pliées, UTC, date seule, annulation)', () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1@x\r\nSUMMARY:Visite\\, 12 rue\r\nDTSTART:20261001T140000Z\r\nDTEND:20261001T150000Z\r\nLOCATION:La\r\n val\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:2@x\r\nSUMMARY:Congé\r\nDTSTART;VALUE=DATE:20261002\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR'
    const e = parseIcs(ics, 'America/Toronto')
    expect(e[0]).toMatchObject({ uid: '1@x', summary: 'Visite, 12 rue', start: '2026-10-01T10:00', location: 'Laval' })
    expect(e[1]).toMatchObject({ allDay: true, start: '2026-10-02T00:00', status: 'CANCELLED' })
    expect(toWall('2026-01-15T15:30:00Z', 'America/Toronto')).toBe('2026-01-15T10:30')
  })
  it('webhook entrant : n’invente aucun champ', () => {
    const r = webhookRecords({ type: 'lead', data: { name: 'Jean Tremblay', email: 'JEAN@x.com' } }, '2026-09-29')
    expect(r[0]).toMatchObject({ kind: 'contact', lead: true, data: { firstName: 'Jean', lastName: 'Tremblay', email: 'jean@x.com' } })
    expect(r[0].data).not.toHaveProperty('phone')
    const ez = webhookRecords({ EventName: 'DocumentCompleted', id: 'f1' }, '2026-09-29')
    expect(ez[0].kind).toBe('metric')
  })
  it('import CSV : colonnes françaises et anglaises', () => {
    const r = csvRecords([{ 'Prénom': 'Ana', 'NOM': 'Roy', 'E-mail': 'a@x.com' }, { foo: '' }], 'contacts', 'Prospects')
    expect(r).toHaveLength(1)
    expect(r[0].data).toMatchObject({ firstName: 'Ana', lastName: 'Roy', email: 'a@x.com', source: 'Prospects' })
  })
})

describe('matrice des intégrations', () => {
  it('couvre toutes les plateformes existantes du catalogue', () => {
    const keys = new Set(INTEGRATIONS.map(i => i.key))
    for (const p of PLATFORM_CATALOG) expect(keys, p.key).toContain(p.key)
  })
  it('aucune fiche « lien » n’annonce de lecture ou d’action automatique', () => {
    for (const i of INTEGRATIONS.filter(x => x.impl === 'lien')) { expect(i.connector, i.key).toBeUndefined(); expect(i.actions, i.key).toHaveLength(0) }
    for (const i of INTEGRATIONS.filter(x => x.connector)) expect(CONNECTORS[i.connector!], i.key).toBeDefined()
  })
})
vi.restoreAllMocks()
