// Connecteurs marketing : Mailchimp, Meta (Facebook / Instagram / Lead Ads), LinkedIn, TikTok, Canva.
import { createHash } from 'node:crypto'
import { AuthError, call } from '../http.js'
import { clip, defined, splitName } from './util.js'
import type { ActionCtx, Connector } from './types.js'

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const now = () => new Date().toISOString()

// ======================= Mailchimp =======================
const mcBase = async (ctx: { secret(): Promise<{ extra?: Record<string, unknown> }> }) => String((await ctx.secret()).extra?.apiEndpoint ?? '') + '/3.0'
export const mailchimp: Connector = {
  key: 'mailchimp',
  oauth: { authorizeUrl: 'https://login.mailchimp.com/oauth2/authorize', tokenUrl: 'https://login.mailchimp.com/oauth2/token', scopes: () => [], clientId: () => process.env.MAILCHIMP_CLIENT_ID, clientSecret: () => process.env.MAILCHIMP_CLIENT_SECRET },
  async afterAuth(s) {
    const m = await call<{ dc: string; api_endpoint: string; accountname: string; login?: { login_email?: string } }>('https://login.mailchimp.com/oauth2/metadata', { provider: 'mailchimp', headers: { authorization: `OAuth ${s.accessToken}` } })
    return { account: m.login?.login_email || m.accountname, label: `Mailchimp — ${m.accountname}`, secret: { ...s, extra: { ...s.extra, dc: m.dc, apiEndpoint: m.api_endpoint } } }
  },
  async sync(ctx) {
    const base = await mcBase(ctx)
    const g = async <T>(p: string) => call<T>(base + p, { provider: 'mailchimp', deadline: ctx.deadline, headers: bearer(await ctx.token()) })
    const lists = await g<{ lists: { id: string; name: string; stats: { member_count: number; unsubscribe_count: number; open_rate: number; click_rate: number } }[] }>('/lists?count=50&fields=lists.id,lists.name,lists.stats')
    for (const l of lists.lists) {
      ctx.emit({ kind: 'metric', x: `aud:${l.id}`, data: { label: `Abonnés Mailchimp — ${l.name}`, value: l.stats.member_count, unit: 'abonnés', at: now(), ownerId: ctx.conn.ownerId } })
      if (!ctx.services.has('audience')) continue
      const since = ctx.cursor(`members.${l.id}`)
      let offset = Number(ctx.cursor(`members.${l.id}.offset`) ?? 0)
      const started = now()
      for (;;) {
        if (ctx.timeLeft() < 3500) return { more: true }
        const r = await g<{ members: { id: string; email_address: string; status: string; merge_fields?: Record<string, string> }[]; total_items: number }>(`/lists/${l.id}/members?count=500&offset=${offset}&fields=members.id,members.email_address,members.status,members.merge_fields,total_items${since ? `&since_last_changed=${encodeURIComponent(since)}` : ''}`)
        for (const m of r.members) {
          if (m.status === 'archived' || m.status === 'cleaned') continue
          ctx.emit({ kind: 'contact', x: `${l.id}:${m.id}`, data: defined({ email: m.email_address.toLowerCase(), firstName: m.merge_fields?.FNAME, lastName: m.merge_fields?.LNAME, phone: m.merge_fields?.PHONE, source: 'Mailchimp' }) })
        }
        offset += r.members.length
        ctx.setCursor(`members.${l.id}.offset`, String(offset))
        if (!r.members.length || offset >= r.total_items) break
      }
      ctx.setCursor(`members.${l.id}.offset`, undefined)
      ctx.setCursor(`members.${l.id}`, started)
    }
    if (ctx.services.has('campaigns')) {
      const since = ctx.cursor('campaigns') ?? new Date(Date.now() - 180 * 86400000).toISOString()
      const c = await g<{ campaigns: { id: string; send_time: string; archive_url: string; settings: { subject_line: string; title: string } }[] }>(`/campaigns?status=sent&count=50&since_send_time=${encodeURIComponent(since)}&sort_field=send_time&sort_dir=DESC`)
      for (const x of c.campaigns) {
        if (ctx.timeLeft() < 2500) return { more: true }
        const rep = await g<{ emails_sent: number; opens: { open_rate: number; unique_opens: number }; clicks: { click_rate: number; unique_clicks: number }; unsubscribed: number }>(`/reports/${x.id}`)
        ctx.emit({ kind: 'campaign', x: `camp:${x.id}`, url: x.archive_url, data: { kind: 'infolettre', title: x.settings.subject_line || x.settings.title, date: x.send_time?.slice(0, 10), url: x.archive_url, ownerId: ctx.conn.ownerId,
          metrics: { envois: rep.emails_sent, ouvertures: rep.opens.unique_opens, tauxOuverture: Math.round(rep.opens.open_rate * 1000) / 10, clics: rep.clicks.unique_clicks, tauxClics: Math.round(rep.clicks.click_rate * 1000) / 10, desabonnements: rep.unsubscribed } } })
      }
      // les rapports d'une campagne évoluent pendant ~30 jours : on relit cette période à chaque synchronisation
      ctx.setCursor('campaigns', new Date(Date.now() - 30 * 86400000).toISOString())
    }
    return {}
  },
  async registerHooks(ctx, publicUrl) {
    const base = await mcBase(ctx)
    const token = await ctx.token()
    const lists = await call<{ lists: { id: string }[] }>(`${base}/lists?count=20&fields=lists.id`, { provider: 'mailchimp', headers: bearer(token) })
    const out = []
    for (const l of lists.lists) {
      const url = `${publicUrl}/api/connect/webhook/mailchimp/${ctx.agencyId}/${ctx.conn.id}`
      const r = await call<{ id: string }>(`${base}/lists/${l.id}/webhooks`, { provider: 'mailchimp', method: 'POST', headers: bearer(token), json: { url, events: { subscribe: true, unsubscribe: true, profile: true, upemail: true }, sources: { user: true, admin: true, api: false } } })
      out.push({ id: `${l.id}:${r.id}`, kind: 'audience', expiresAt: '' })
    }
    return out
  },
  actions: {
    addMember: {
      async preview(a) { return `Ajouter ${a.params.email} à l’audience Mailchimp « ${a.params.listName ?? a.params.listId} ». Mailchimp enverra un courriel de confirmation d’abonnement (double consentement).` },
      async run(a) {
        const email = String(a.params.email ?? '').toLowerCase()
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !a.params.listId) throw new Error('Courriel et audience requis.')
        const h = createHash('md5').update(email).digest('hex')
        const r = await call<{ id: string; status: string }>(`${await mcBase(a)}/lists/${a.params.listId}/members/${h}`, { provider: 'mailchimp', method: 'PUT', headers: bearer(await a.token()), json: { email_address: email, status_if_new: 'pending', merge_fields: defined({ FNAME: a.params.firstName as string, LNAME: a.params.lastName as string }) } })
        return { summary: `Contact ${email} : statut Mailchimp « ${r.status} »`, externalId: r.id }
      },
    },
    sendCampaign: {
      async preview(a) { return `Envoyer MAINTENANT la campagne Mailchimp ${a.params.campaignId} à toute son audience. Action irréversible.` },
      async run(a) {
        await call(`${await mcBase(a)}/campaigns/${a.params.campaignId}/actions/send`, { provider: 'mailchimp', method: 'POST', headers: bearer(await a.token()) })
        return { summary: `Campagne ${a.params.campaignId} envoyée.` }
      },
    },
  },
}

// ======================= Meta =======================
const V = () => process.env.META_GRAPH_VERSION || 'v23.0'
const FB = () => `https://graph.facebook.com/${V()}`
const META_SCOPES: Record<string, string[]> = { pages: ['pages_show_list', 'pages_read_engagement'], instagram: ['instagram_basic', 'instagram_manage_insights'], leads: ['leads_retrieval', 'pages_manage_metadata', 'pages_show_list', 'pages_read_engagement'], publish: ['pages_manage_posts'] }
interface MetaPage { id: string; name: string; token: string; ig?: { id: string; username: string } }
export const meta: Connector = {
  key: 'meta',
  oauth: { authorizeUrl: `https://www.facebook.com/${V()}/dialog/oauth`, tokenUrl: `${FB()}/oauth/access_token`, scopes: s => [...new Set(s.flatMap(x => META_SCOPES[x] ?? []))], scopeSep: ',', clientId: () => process.env.META_APP_ID, clientSecret: () => process.env.META_APP_SECRET },
  async afterAuth(s) {
    // jeton longue durée, puis jetons de Page (sans expiration tant que l'accès n'est pas retiré)
    const ll = await call<{ access_token: string; expires_in?: number }>(`${FB()}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, fb_exchange_token: s.accessToken! })}`, { provider: 'meta' })
    const acc = await call<{ data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username: string } }[] }>(`${FB()}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=50`, { provider: 'meta', headers: bearer(ll.access_token) })
    const pages: MetaPage[] = acc.data.map(p => ({ id: p.id, name: p.name, token: p.access_token, ig: p.instagram_business_account }))
    return { account: pages.map(p => p.name).join(', ') || 'Aucune Page', label: `Meta — ${pages.map(p => p.name).join(', ')}`, secret: { accessToken: ll.access_token, expiresAt: ll.expires_in ? Date.now() + ll.expires_in * 1000 : undefined, extra: { pages } } }
  },
  async sync(ctx) {
    const pages = ((await ctx.secret()).extra?.pages as MetaPage[] | undefined) ?? []
    if (!pages.length) throw new AuthError('Aucune Page Facebook accessible : reconnectez le compte en choisissant vos Pages.')
    const g = <T>(p: string, token: string) => call<T>(`${FB()}${p}`, { provider: 'meta', deadline: ctx.deadline, headers: bearer(token) })
    for (const p of pages) {
      if (ctx.timeLeft() < 3000) return { more: true }
      if (ctx.services.has('pages')) {
        const info = await g<{ followers_count?: number; fan_count?: number; link?: string }>(`/${p.id}?fields=followers_count,fan_count,link`, p.token)
        if (info.followers_count !== undefined) ctx.emit({ kind: 'metric', x: `fb:${p.id}:followers`, url: info.link, data: { label: `Abonnés Facebook — ${p.name}`, value: info.followers_count, unit: 'abonnés', at: now(), ownerId: ctx.conn.ownerId } })
        const posts = await g<{ data: { id: string; message?: string; created_time: string; permalink_url?: string }[] }>(`/${p.id}/posts?fields=id,message,created_time,permalink_url&limit=25`, p.token)
        for (const x of posts.data) ctx.emit({ kind: 'campaign', x: `fbpost:${x.id}`, url: x.permalink_url, data: { kind: 'publication', title: clip(x.message || 'Publication Facebook', 140), date: x.created_time.slice(0, 10), url: x.permalink_url ?? '', metrics: {}, ownerId: ctx.conn.ownerId } })
      }
      if (ctx.services.has('instagram') && p.ig) {
        const ig = await g<{ followers_count?: number; media_count?: number }>(`/${p.ig.id}?fields=followers_count,media_count`, p.token)
        if (ig.followers_count !== undefined) ctx.emit({ kind: 'metric', x: `ig:${p.ig.id}:followers`, url: `https://www.instagram.com/${p.ig.username}`, data: { label: `Abonnés Instagram — @${p.ig.username}`, value: ig.followers_count, unit: 'abonnés', at: now(), ownerId: ctx.conn.ownerId } })
        const media = await g<{ data: { id: string; caption?: string; timestamp: string; permalink: string; like_count?: number; comments_count?: number; media_type: string }[] }>(`/${p.ig.id}/media?fields=id,caption,timestamp,permalink,like_count,comments_count,media_type&limit=25`, p.token)
        for (const m of media.data) ctx.emit({ kind: 'campaign', x: `ig:${m.id}`, url: m.permalink, data: { kind: m.media_type === 'VIDEO' ? 'video' : 'publication', title: clip(m.caption || 'Publication Instagram', 140), date: m.timestamp.slice(0, 10), url: m.permalink, metrics: defined({ jaime: m.like_count, commentaires: m.comments_count }) as Record<string, number>, ownerId: ctx.conn.ownerId } })
      }
      if (ctx.services.has('leads')) {
        const since = Number(ctx.cursor(`leads.${p.id}`) ?? Math.floor((Date.now() - 30 * 86400000) / 1000))
        const started = Math.floor(Date.now() / 1000)
        const forms = await g<{ data: { id: string; name: string }[] }>(`/${p.id}/leadgen_forms?fields=id,name&limit=50`, p.token)
        for (const f of forms.data) {
          if (ctx.timeLeft() < 2500) return { more: true }
          const filter = encodeURIComponent(JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]))
          const leads = await g<{ data: { id: string; created_time: string; field_data: { name: string; values: string[] }[] }[] }>(`/${f.id}/leads?fields=id,created_time,field_data&limit=100&filtering=${filter}`, p.token)
          for (const l of leads.data) {
            const v = Object.fromEntries(l.field_data.map(d => [d.name, d.values?.[0] ?? '']))
            const name = v.full_name ? splitName(v.full_name) : { firstName: v.first_name, lastName: v.last_name }
            const email = (v.email ?? '').toLowerCase()
            ctx.emit({ kind: 'contact', x: `lead:${l.id}`, lead: true, data: defined({ ...name, email, phone: v.phone_number, city: v.city, source: 'Facebook Lead Ads', notes: `Formulaire « ${f.name} » — ${l.created_time.slice(0, 10)}` }) })
            ctx.emit({ kind: 'activity', x: `leadact:${l.id}`, match: { contactEmail: email, contactPhone: v.phone_number }, data: { kind: 'note', date: l.created_time.slice(0, 10), summary: `Demande reçue par le formulaire Facebook « ${f.name} »`, memberId: ctx.conn.ownerId } })
          }
        }
        ctx.setCursor(`leads.${p.id}`, String(started - 300))
      }
    }
    return {}
  },
  async registerHooks(ctx) {
    if (!ctx.services.has('leads')) return []
    const pages = ((await ctx.secret()).extra?.pages as MetaPage[] | undefined) ?? []
    for (const p of pages) await call(`${FB()}/${p.id}/subscribed_apps?subscribed_fields=leadgen`, { provider: 'meta', method: 'POST', headers: bearer(p.token) })
    return pages.map(p => ({ id: p.id, kind: 'leadgen', expiresAt: '' }))
  },
  actions: {
    publishPage: {
      async preview(a) { return `Publier publiquement sur la Page Facebook ${a.params.pageName ?? a.params.pageId} :\n\n« ${a.params.message} »${a.params.link ? `\nLien : ${a.params.link}` : ''}` },
      async run(a) {
        const pages = ((await a.secret()).extra?.pages as MetaPage[] | undefined) ?? []
        const p = pages.find(x => x.id === a.params.pageId) ?? pages[0]
        if (!p || !a.params.message) throw new Error('Page et message requis.')
        const r = await call<{ id: string }>(`${FB()}/${p.id}/feed`, { provider: 'meta', method: 'POST', headers: bearer(p.token), json: defined({ message: String(a.params.message), link: a.params.link as string | undefined }) })
        return { summary: `Publié sur ${p.name}.`, externalId: r.id }
      },
    },
  },
}

// ======================= LinkedIn =======================
export const linkedin: Connector = {
  key: 'linkedin',
  oauth: { authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization', tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken', scopes: () => ['openid', 'profile', 'w_member_social'], clientId: () => process.env.LINKEDIN_CLIENT_ID, clientSecret: () => process.env.LINKEDIN_CLIENT_SECRET },
  async afterAuth(s) {
    const me = await call<{ sub: string; name?: string }>('https://api.linkedin.com/v2/userinfo', { provider: 'linkedin', headers: bearer(s.accessToken!) })
    return { account: me.name ?? me.sub, label: `LinkedIn — ${me.name ?? ''}`.trim(), secret: { ...s, extra: { ...s.extra, sub: me.sub } } }
  },
  async sync(ctx) {
    // aucune statistique en libre-service : on vérifie que l'accès est toujours valide et on prévient avant l'échéance
    await call('https://api.linkedin.com/v2/userinfo', { provider: 'linkedin', deadline: ctx.deadline, headers: bearer(await ctx.token()) })
    const exp = (await ctx.secret()).expiresAt
    const counts: Record<string, number> = exp ? { joursAvantReconnexion: Math.max(0, Math.floor((exp - Date.now()) / 86400000)) } : {}
    return { counts }
  },
  actions: {
    publish: {
      async preview(a) { return `Publier publiquement sur votre profil LinkedIn :\n\n« ${a.params.text} »` },
      async run(a) {
        const sub = (await a.secret()).extra?.sub
        if (!a.params.text) throw new Error('Texte requis.')
        await call('https://api.linkedin.com/rest/posts', { provider: 'linkedin', method: 'POST', headers: { ...bearer(await a.token()), 'LinkedIn-Version': process.env.LINKEDIN_VERSION || '202506', 'X-Restli-Protocol-Version': '2.0.0' },
          json: { author: `urn:li:person:${sub}`, commentary: String(a.params.text), visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false } })
        return { summary: 'Publication LinkedIn envoyée.' }
      },
    },
  },
}

// ======================= TikTok =======================
export const tiktok: Connector = {
  key: 'tiktok',
  oauth: { authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/', scopes: () => ['user.info.basic', 'user.info.stats', 'video.list'], scopeSep: ',', clientIdParam: 'client_key', clientId: () => process.env.TIKTOK_CLIENT_KEY, clientSecret: () => process.env.TIKTOK_CLIENT_SECRET },
  async afterAuth(s) {
    const r = await call<{ data: { user: { display_name: string } } }>('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { provider: 'tiktok', headers: bearer(s.accessToken!) })
    return { account: r.data.user.display_name, label: `TikTok — ${r.data.user.display_name}` }
  },
  async sync(ctx) {
    const t = await ctx.token()
    const u = await call<{ data: { user: { open_id: string; display_name: string; follower_count?: number; likes_count?: number; video_count?: number } } }>('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,likes_count,video_count', { provider: 'tiktok', deadline: ctx.deadline, headers: bearer(t) })
    const user = u.data.user
    if (user.follower_count !== undefined) ctx.emit({ kind: 'metric', x: `${user.open_id}:followers`, data: { label: `Abonnés TikTok — ${user.display_name}`, value: user.follower_count, unit: 'abonnés', at: now(), ownerId: ctx.conn.ownerId } })
    const v = await call<{ data: { videos: { id: string; title?: string; create_time: number; share_url: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[] } }>('https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,share_url,view_count,like_count,comment_count,share_count', { provider: 'tiktok', method: 'POST', deadline: ctx.deadline, headers: bearer(t), json: { max_count: 20 } })
    for (const x of v.data.videos ?? []) ctx.emit({ kind: 'campaign', x: `v:${x.id}`, url: x.share_url, data: { kind: 'video', title: clip(x.title || 'Vidéo TikTok', 140), date: new Date(x.create_time * 1000).toISOString().slice(0, 10), url: x.share_url, metrics: defined({ vues: x.view_count, jaime: x.like_count, commentaires: x.comment_count, partages: x.share_count }) as Record<string, number>, ownerId: ctx.conn.ownerId } })
    return {}
  },
}

// ======================= Canva =======================
export const canva: Connector = {
  key: 'canva',
  oauth: { authorizeUrl: 'https://www.canva.com/api/oauth/authorize', tokenUrl: 'https://api.canva.com/rest/v1/oauth/token', scopes: () => ['design:meta:read', 'profile:read'], pkce: true, tokenAuth: 'basic', clientId: () => process.env.CANVA_CLIENT_ID, clientSecret: () => process.env.CANVA_CLIENT_SECRET },
  async afterAuth(s) {
    const r = await call<{ profile?: { display_name?: string } }>('https://api.canva.com/rest/v1/users/me/profile', { provider: 'canva', headers: bearer(s.accessToken!) }).catch(() => ({ profile: { display_name: '' } }))
    return { account: r.profile?.display_name || 'Canva', label: `Canva — ${r.profile?.display_name ?? ''}`.trim() }
  },
  async sync(ctx) {
    let cont = ctx.cursor('cont')
    let pages = 0
    do {
      const r = await call<{ items: { id: string; title?: string; updated_at: number; urls?: { edit_url?: string; view_url?: string } }[]; continuation?: string }>(`https://api.canva.com/rest/v1/designs?ownership=owned&sort_by=modified_descending${cont ? `&continuation=${encodeURIComponent(cont)}` : ''}`, { provider: 'canva', deadline: ctx.deadline, headers: bearer(await ctx.token()) })
      for (const d of r.items) ctx.emit({ kind: 'campaign', x: `d:${d.id}`, url: d.urls?.edit_url, data: { kind: 'design', title: clip(d.title || 'Design Canva', 140), date: new Date(d.updated_at * 1000).toISOString().slice(0, 10), url: d.urls?.view_url || d.urls?.edit_url || '', metrics: {}, ownerId: ctx.conn.ownerId } })
      cont = r.continuation
      pages++
    } while (cont && pages < 3 && ctx.timeLeft() > 3000)
    ctx.setCursor('cont', undefined) // on relit les designs récents à chaque fois (tri par modification)
    return {}
  },
}

export type { ActionCtx }
