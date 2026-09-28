import { readFile, readdir, rename } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

const manifestPath = resolve(process.argv[2] || 'media-imports/my-little-pony-friendship-is-magic/media.json')
const folder = resolve(process.argv[3] || dirname(manifestPath))
const apply = process.argv.includes('--apply')
const seasonIndex = process.argv.indexOf('--season')
const onlySeason = seasonIndex >= 0 ? Number(process.argv[seasonIndex + 1]) : null
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const selectedEpisodes = (manifest.episodes || []).filter(item => !onlySeason || item.season === onlySeason)
const metadata = new Map(selectedEpisodes.map(item => [`${item.season}-${item.episode}`, item]))
const files = (await readdir(folder)).filter(name => name.toLowerCase().endsWith('.mp4')).sort()

function episodeSlot(name) {
  const match = name.match(/S(\d+)\s*E(\d+)/i)
    || name.match(/Season\s*(\d+)\s*Episode\s*(\d+)/i)
    || name.match(/^(\d+)x(\d+)/i)
    || name.match(/-\s*(\d+)\.(\d+)\s*-/i)
  return match ? `${Number(match[1])}-${Number(match[2])}` : null
}

function normalizedTitle(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function sourceTitle(name) {
  const match = name.match(/S\d+\s*E\d+\s*-\s*(.+)\.mp4$/i)
    || name.match(/^\d+x\d+\s+(.+?)(?:\s*\(\d+p\))?\.mp4$/i)
    || name.match(/-\s*\d+\.\d+\s*-\s*(.+)\.mp4$/i)
  return (match?.[1] || '')
    .replace(/\s+\(\d+p(?:\s+WebRip)?\)$/i, '')
    .replace(/\s+\(TV\)$/i, '')
    .trim()
}

const correctedSeasonThreeSlots = new Map([
  ['applefamilyreunion', '3-8'],
  ['toomanypinkie', '3-3'],
  ['magicduel', '3-5'],
  ['sleeplessinponyville', '3-6'],
  ['wonderboltacademy', '3-7'],
])

function safeTitle(title) {
  return title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
}

if (files.length !== metadata.size) {
  throw new Error(`Expected ${metadata.size} MP4 files from the manifest, found ${files.length}`)
}

const mappings = files.map(source => {
  const parsedSlot = episodeSlot(source)
  const titleKey = normalizedTitle(sourceTitle(source))
  const slot = parsedSlot?.startsWith('3-')
    ? correctedSeasonThreeSlots.get(titleKey) || parsedSlot
    : parsedSlot
  const episode = metadata.get(slot)
  if (!episode) throw new Error(`No manifest episode matches ${source}`)
  const target = `My Little Pony FiM S${episode.season} E${episode.episode} - ${safeTitle(episode.title)}.mp4`
  return { source, target, slot }
})

const duplicateSlots = mappings.filter((item, index) => mappings.findIndex(other => other.slot === item.slot) !== index)
const duplicateTargets = mappings.filter((item, index) => mappings.findIndex(other => other.target.toLowerCase() === item.target.toLowerCase()) !== index)
if (duplicateSlots.length) throw new Error(`Duplicate episode slots: ${duplicateSlots.map(item => item.slot).join(', ')}`)
if (duplicateTargets.length) throw new Error(`Duplicate target filenames: ${duplicateTargets.map(item => item.target).join(', ')}`)

for (const { source, target } of mappings) {
  console.log(`${source} -> ${target}`)
  if (apply && source !== target) await rename(resolve(folder, source), resolve(folder, target))
}

console.log(`${apply ? 'Renamed' : 'Validated'} ${mappings.length} files in ${folder}`)
