import type { ConnectorKey } from '../../src/lib/integrations/catalog.js'
import type { Connector } from './types.js'
import { google } from './google.js'
import { microsoft } from './microsoft.js'
import { canva, linkedin, mailchimp, meta, tiktok } from './marketing.js'
import { calendly, crea, csv, ics, webhook } from './other.js'

export const CONNECTOR_IMPL: Record<ConnectorKey, Connector> = { google, microsoft, mailchimp, meta, linkedin, tiktok, canva, calendly, crea, ics, webhook, csv }

/** Le connecteur OAuth est-il configuré par la plateforme (identifiants d'application présents) ? */
export function platformReady(key: ConnectorKey): { ok: boolean; missing: string[] } {
  const need: Record<ConnectorKey, string[]> = {
    google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], microsoft: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'], mailchimp: ['MAILCHIMP_CLIENT_ID', 'MAILCHIMP_CLIENT_SECRET'],
    calendly: ['CALENDLY_CLIENT_ID', 'CALENDLY_CLIENT_SECRET'], meta: ['META_APP_ID', 'META_APP_SECRET'], linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'], canva: ['CANVA_CLIENT_ID', 'CANVA_CLIENT_SECRET'], crea: [], ics: [], webhook: [], csv: [],
  }
  const missing = need[key].filter(k => !process.env[k])
  return { ok: !missing.length, missing }
}
