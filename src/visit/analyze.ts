// Analyse déterministe d'une dictée de visite : dimensions par pièce, points à surveiller, points forts.
// Fonctionne hors ligne, sans service externe.

export interface ParsedRoom { name: string; length: number; width: number; height: number; unit: 'pi' | 'm'; source: string }
export interface Analysis { rooms: ParsedRoom[]; watch: string[]; highlights: string[] }

const NUM_WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
  quinze: 15, seize: 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19, vingt: 20, 'vingt-deux': 22, 'vingt-quatre': 24, 'vingt-cinq': 25, trente: 30, quarante: 40,
}
export const ROOM_WORDS: [RegExp, string][] = [
  [/chambre (?:principale|des ma[iî]tres)|\bccp\b/, 'Chambre principale'],
  [/chambre (?:num[ée]ro )?(\d)/, 'Chambre $1'], [/\bcac ?(\d)/, 'Chambre $1'], [/chambre/, 'Chambre'],
  [/salle [àa] manger/, 'Salle à manger'], [/salle familiale/, 'Salle familiale'], [/salle de jeux/, 'Salle de jeux'],
  [/salle de bains?/, 'Salle de bain'], [/salle d.eau/, 'Salle d’eau'], [/salle de lavage|buanderie/, 'Salle de lavage'],
  [/cuisine/, 'Cuisine'], [/salon/, 'Salon'], [/bureau/, 'Bureau'], [/sous-sol/, 'Sous-sol'], [/garage/, 'Garage'],
  [/walk-?in|garde-robe/, 'Walk-in'], [/hall|entr[ée]e/, 'Hall d’entrée'], [/rangement/, 'Rangement'], [/atelier/, 'Atelier'],
  [/v[ée]randa|solarium/, 'Véranda'], [/terrasse/, 'Terrasse'], [/balcon/, 'Balcon'], [/mezzanine/, 'Mezzanine'],
]
const WATCH: [RegExp, string][] = [
  [/fissur/, 'Fissure(s) mentionnée(s)'], [/humidit/, 'Humidité'], [/moisissur|champignon/, 'Moisissure'], [/infiltration|d[ée]g[aâ]ts? d.eau/, 'Infiltration / dégât d’eau'],
  [/efflorescence/, 'Efflorescence'], [/pyrite/, 'Pyrite'], [/ocre ferreuse/, 'Ocre ferreuse'], [/amiante/, 'Amiante'], [/vermiculite/, 'Vermiculite'],
  [/toiture|bardeaux/, 'Toiture à vérifier'], [/fen[eê]tres? [àa] changer|thermos/, 'Fenêtres / thermos'], [/drain fran[cç]ais/, 'Drain français'],
  [/fondation/, 'Fondation à vérifier'], [/odeur/, 'Odeur'], [/fusibles|panneau (?:de )?60/, 'Électricité (panneau / fusibles)'], [/plomb\b|tuyaux? en plomb/, 'Plomberie en plomb'],
  [/chauffe-eau|r[ée]servoir [àa] eau chaude/, 'Chauffe-eau (âge à vérifier)'], [/fourmis|termites|rongeurs|souris/, 'Parasites'], [/[àa] r[ée]nover|[àa] refaire|us[ée]e?s?/, 'Travaux à prévoir'],
]
const HIGHLIGHTS: [RegExp, string][] = [
  [/r[ée]nov[ée]|refait|neuf|neuve/, 'Rénovations récentes'], [/quartz|granit/, 'Comptoirs quartz / granit'], [/bois franc|plancher de bois/, 'Planchers de bois'],
  [/foyer/, 'Foyer'], [/piscine/, 'Piscine'], [/garage/, 'Garage'], [/lumineu|fenestration/, 'Luminosité'], [/vue /, 'Vue'], [/thermopompe|climatis/, 'Climatisation / thermopompe'],
  [/terrain|cour arri[eè]re|intimit/, 'Terrain / cour'], [/stationnement/, 'Stationnement'], [/[ée]coles?|parc|m[ée]tro|commerces/, 'Proximité des services'],
]

export function normalize(t: string) {
  let s = ' ' + t.toLowerCase().replace(/’/g, "'") + ' '
  s = s.replace(/(\d)\s*virgule\s*(\d)/g, '$1,$2')
  for (const [w, n] of Object.entries(NUM_WORDS).sort((a, b) => b[0].length - a[0].length)) s = s.replace(new RegExp(`(?<=[\\s(])${w}(?=[\\s,.)])`, 'g'), String(n))
  s = s.replace(/(\d+)\s+et demi/g, (_, n) => `${n},5`)
  s = s.replace(/(\d+)\s*(?:pieds?|pi|')\s*(\d{1,2})(?!\d)\s*(?:pouces?|po|")?/g, (_, f, i) => `${String(Math.round((+f + +i / 12) * 100) / 100).replace('.', ',')} pi `)
  return s
}
const num = (x: string) => +x.replace(',', '.')

export function analyzeDictation(text: string): Analysis {
  const s = normalize(text)
  const rooms: ParsedRoom[] = []
  const sentences = s.split(/[.;!?\n](?!\d)|(?:\s(?:ensuite|puis|après ça|et la|et le)\s)/)
  let lastRoom = ''
  for (const sentence of sentences) {
    const roomMatch = ROOM_WORDS.map(([re, label]) => { const m = sentence.match(re); return m ? { at: m.index ?? 0, label: label.replace('$1', m[1] ?? '') } : null }).filter(Boolean) as { at: number; label: string }[]
    const dim = /(\d+(?:[.,]\d+)?)\s*(pieds?|pi|mètres?|metres?|m)?\s*(?:par|x|sur|fois)\s*(\d+(?:[.,]\d+)?)\s*(pieds?|pi|mètres?|metres?|m\b)?/g
    let m: RegExpExecArray | null
    while ((m = dim.exec(sentence))) {
      const before = roomMatch.filter(r => r.at <= (m!.index ?? 0)).sort((a, b) => b.at - a.at)[0] ?? roomMatch[0]
      const name = before?.label || lastRoom
      if (!name) continue
      lastRoom = name
      const unit: 'pi' | 'm' = /m[eè]t|^m$/.test(m[2] || m[4] || '') ? 'm' : 'pi'
      const h = sentence.match(/(?:hauteur|plafonds?)\s*(?:de|à|a)?\s*(\d+(?:[.,]\d+)?)/)
      rooms.push({ name, length: num(m[1]), width: num(m[3]), height: h ? num(h[1]) : 0, unit, source: sentence.trim() })
    }
    if (roomMatch.length) lastRoom = roomMatch.sort((a, b) => b.at - a.at)[0].label
  }
  const found = (list: [RegExp, string][]) => [...new Set(list.filter(([re]) => re.test(s)).map(([, l]) => l))]
  return { rooms, watch: found(WATCH), highlights: found(HIGHLIGHTS) }
}
