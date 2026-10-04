import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

// Publish a verified snapshot, without touching the video upload workers.
// First prepare/review manifests; --publish uploads their thumbnails and adds D1 rows.
const publish = process.argv.includes('--publish')
const preparedOnly = process.argv.includes('--prepared')
const root = 'media-imports/unique-movies'
const json = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
const queue = await json('logs/unique-movies-upload-queue.json')
const encoding = await json('logs/unique-movies-queue.json')
const audit = await json('logs/unique-movies-thumbnail-audit.json')
const synopses = await json(join(root, 'synopses.json'))
const basic = Buffer.from(`${process.env.B2_BOOTSTRAP_KEY_ID}:${process.env.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${new URL(url).hostname}`)
  const result = await response.json()
  if (result.success === false) throw new Error(JSON.stringify(result.errors))
  return result
}
const auth = await request('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', { headers: { Authorization: `Basic ${basic}` } })
const b2 = (operation, body) => request(`${auth.apiInfo.storageApi.apiUrl}/b2api/v4/${operation}`, { method: 'POST', headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const bucketName = process.env.B2_BUCKET || 'king-videos'
const bucket = (await b2('b2_list_buckets', { accountId: auth.accountId, bucketName })).buckets.find(b => b.bucketName === bucketName)
if (!bucket) throw new Error('Bucket not found')
const files = new Map()
let startFileName
do {
  const page = await b2('b2_list_file_names', { bucketId: bucket.bucketId, maxFileCount: 10000, ...(startFileName ? { startFileName } : {}) })
  for (const file of page.files) files.set(file.fileName, file)
  startFileName = page.nextFileName
} while (startFileName)

const overrides = {
  'Charlie Brown - Christmastime Again': "It's Christmastime Again, Charlie Brown",
  'Charlie Brown - Its Magic': "It's Magic, Charlie Brown",
  'Charlie Brown - Its the Great Pumpkin': "It's the Great Pumpkin, Charlie Brown",
  'Charlie Brown - Great Pumpkin': "It's the Great Pumpkin, Charlie Brown",
  'Charlie Brown - Thanksgiving': 'A Charlie Brown Thanksgiving',
  'Charlie Brown - Christmas': 'A Charlie Brown Christmas',
  'Charlie Brown - Bon Voyage': 'Bon Voyage, Charlie Brown (and Don’t Come Back!!)',
  'Winnie the Pooh - Most Grand Adventure': "Pooh's Grand Adventure: The Search for Christopher Robin",
  'Lion King 1-1.5 Hakuna Matata': 'The Lion King 1½',
  'Lion King 2': "The Lion King II: Simba's Pride",
  '101 Dalmatians 2 - Patchs London Adventure': "101 Dalmatians II: Patch's London Adventure",
  'Atlantis 2 - Milos Return': "Atlantis: Milo's Return",
  'Little Mermaid 2 - Return to the Sea': 'The Little Mermaid II: Return to the Sea',
  'Little Mermaid - Ariels Beginning': "The Little Mermaid: Ariel's Beginning",
  'Winnie The Pooh\'s Most Grand Adventure': "Pooh's Grand Adventure: The Search for Christopher Robin",
  'The Lion King 1-1.5 - Hakuna Matata': 'The Lion King 1½',
  'The Lion King 2 (1998)': "The Lion King II: Simba's Pride",
  '101 Dalmatians 2 - Patch\'s London Adventure': "101 Dalmatians II: Patch's London Adventure",
  'Atlantis 2 Milo\'s Return': "Atlantis: Milo's Return",
  'The Little Mermaid 2-Return to the Sea': 'The Little Mermaid II: Return to the Sea',
  'Duck Tales - The Movie': 'DuckTales the Movie: Treasure of the Lost Lamp',
  'Buzz Lightyear Of Star Command, The Adventure Begins': 'Buzz Lightyear of Star Command: The Adventure Begins',
  'Lilo and Stitch 2 - Stitch has a Glitch': 'Lilo & Stitch 2: Stitch Has a Glitch',
  'Lady And The Tramp II - Scamp\'s Adventure': "Lady and the Tramp II: Scamp's Adventure",
  'Lady And The Tramp (1955)': 'Lady and the Tramp',
  'Home On The Range': 'Home on the Range',
  '101 Dalmatians': 'One Hundred and One Dalmatians',
  'Charlie Brown - Bon Voyage': 'Bon Voyage, Charlie Brown (and Don\'t Come Back!!)',
}
const articleOverrides = {
  'Frosty the Snowman': 'Frosty the Snowman (TV special)',
  'Rudolph the Red-Nosed Reindeer': 'Rudolph the Red-Nosed Reindeer (TV special)',
  'The Reluctant Dragon': 'The Reluctant Dragon (1941 film)',
  'Cinderella': 'Cinderella (1950 film)',
  'Sleeping Beauty': 'Sleeping Beauty (1959 film)',
  'Alice in Wonderland': 'Alice in Wonderland (1951 film)',
  'The Jungle Book': 'The Jungle Book (1967 film)',
  'The Sword in the Stone': 'The Sword in the Stone (1963 film)',
  'Peter Pan': 'Peter Pan (1953 film)',
  'Dinosaur': 'Dinosaur (2000 film)',
  'Chicken Little': 'Chicken Little (2005 film)',
  'The Little Mermaid': 'The Little Mermaid (1989 film)',
  'Robin Hood': 'Robin Hood (1973 film)',
  'Pocahontas': 'Pocahontas (1995 film)',
  'Winnie the Pooh': 'Winnie the Pooh (2011 film)',
  'Aladdin': 'Aladdin (1992 Disney film)',
  'Pinocchio': 'Pinocchio (1940 film)',
}
const episodes = [
  ['mayflower', 'The Mayflower Voyagers', '1988-10-21', 'The Peanuts gang joins the Pilgrims on their voyage to America and learns about the first Thanksgiving.'],
  ['birth', 'The Birth of the Constitution', '1988-10-28', 'The Peanuts gang visits Philadelphia as the Founding Fathers debate the United States Constitution.'],
  ['wright', 'The Wright Brothers at Kitty Hawk', '1988-11-04', 'The gang watches the Wright brothers prepare their historic first powered flight at Kitty Hawk.'],
  ['nasa', 'The NASA Space Station', '1988-11-11', 'Linus dreams that the Peanuts gang travels into space aboard a NASA space station.'],
  ['building', 'The Building of the Transcontinental Railroad', '1989-02-10', 'Charlie Brown recounts how the Union Pacific and Central Pacific railroads connected the country.'],
  ['inventors', 'The Great Inventors', '1989-03-10', 'The gang explores inventions associated with Alexander Graham Bell, Thomas Edison, and the pioneers of the automobile.'],
  ['smithsonian', 'The Smithsonian and the Presidency', '1989-04-19', 'A visit to the Smithsonian introduces the gang to Abraham Lincoln, Theodore Roosevelt, and Franklin D. Roosevelt.'],
  ['music', 'The Music and Heroes of America', '1989-05-23', 'Schroeder and Lucy present American musicians and historical heroes in a school pageant.'],
]
async function wikipedia(title, year) {
  const cache = `logs/wiki-${createHash('sha1').update(title + year).digest('hex')}.json`
  try { return await json(cache) } catch {}
  const candidates = [...new Set([articleOverrides[title] || title, ...(year ? [`${title} (${year} film)`, `${title} (${year} Disney film)`] : []), `${title} (film)`, `${title} (TV special)`])]
  for (const candidate of candidates) {
    try {
      await new Promise(done => setTimeout(done, 1500))
      let result
      try { result = await request(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate.replaceAll(' ', '_'))}`, { headers: { 'User-Agent': 'KingflixMetadata/1.0' } }) }
      catch (error) {
        if (!error.message.startsWith('HTTP 429')) throw error
        const response = await fetch(`https://en.wikipedia.org/wiki/${encodeURIComponent(candidate.replaceAll(' ', '_'))}`, { signal: AbortSignal.timeout(60000) })
        if (!response.ok) throw new Error(`HTTP ${response.status}: en.wikipedia.org`)
        const html = await response.text()
        const plain = value => value.replace(/<[^>]*>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&nbsp;', ' ').replace(/\[\d+\]/g, '').trim()
        const extract = [...html.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map(m => plain(m[1])).find(p => /film|special|television|animated/i.test(p) && (!year || p.includes(String(year))))
        const pageTitle = plain(html.match(/<span class="mw-page-title-main">([\s\S]*?)<\/span>/)?.[1] || candidate)
        result = { type: /may refer to|can refer to/.test(extract || '') ? 'disambiguation' : 'standard', title: pageTitle, extract: extract || '', content_urls: { desktop: { page: response.url } } }
      }
      if (result.type !== 'standard' || !/film|special|television|animated/i.test(result.extract || '')) continue
      if (year && !result.extract.includes(String(year))) continue
      await writeFile(cache, JSON.stringify(result, null, 2))
      return result
    } catch (error) { if (!error.message.startsWith('HTTP 404')) console.warn(`Wikipedia: ${candidate}: ${error.message}`) }
  }
  throw new Error(`No verified Wikipedia article: ${title} (${year || 'unknown year'})`)
}
const manifests = [], held = []
const uploaded = queue.tasks.filter(task => files.has(task.key))
for (const task of uploaded) {
  try {
    let path = task.path
    if (basename(path) === 'Origins.mp4') path = join(dirname(path), 'pokemin Origins.mp4')
    if ((await stat(path)).size !== Number(files.get(task.key).contentLength)) throw new Error('Remote video size differs')
    const mapping = audit.mappings.find(m => m.video === basename(path))
    if (!mapping?.thumbnail) throw new Error('Missing thumbnail')
    if (preparedOnly) {
      const id = task.key.startsWith('movies/this-is-america-charlie-brown/')
        ? `this-is-america-charlie-brown-s01e${String(episodes.findIndex(e => task.key.toLowerCase().includes(e[0])) + 1).padStart(2, '0')}`
        : task.key.split('/')[1]
      const manifest = await json(join(root, id, 'media.json'))
      if (manifest.videoKey !== task.key) throw new Error('Prepared manifest does not match video')
      manifest.description = synopses[id] || manifest.description
      await stat(join(root, id, manifest.thumbnail))
      await writeFile(join(root, id, 'media.json'), JSON.stringify(manifest, null, 2) + '\n')
      manifests.push(manifest)
      continue
    }
    const source = encoding.tasks.find(t => t.destination === task.path || t.title === task.title)
    const year = Number((`${source?.File || ''} ${task.title}`).match(/(?:19|20)\d{2}/)?.[0]) || null
    const isEpisode = task.key.startsWith('movies/this-is-america-charlie-brown/')
    let title = overrides[task.title] || task.title.replace(/^\d{1,2}\s*-\s*/, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\(\d{4}\)\s*$/, '').replace(/\s+-\s+/g, ': ')
    let id = task.key.split('/')[1], episode, wiki
    const featurette = task.title === 'Peanuts - We Need a Blockbuster, Charlie Brown'
    if (featurette) {
      title = 'We Need a Blockbuster, Charlie Brown'
      wiki = { extract: 'A documentary featurette explores the creation of It’s the Great Pumpkin, Charlie Brown through interviews with members of its production team.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Peanuts_filmography' } } }
    } else if (isEpisode) {
      const index = episodes.findIndex(e => task.key.toLowerCase().includes(e[0]))
      if (index < 0) throw new Error('Unknown episode')
      episode = episodes[index]
      id += `-s01e${String(index + 1).padStart(2, '0')}`
      title = episode[1]
      wiki = { title: 'This Is America, Charlie Brown', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/This_Is_America,_Charlie_Brown' } } }
    } else {
      wiki = await wikipedia(title, year)
      title = wiki.title.replace(/ \([^)]*(?:film|special)[^)]*\)$/, '')
    }
    const folder = join(root, id)
    await mkdir(folder, { recursive: true })
    await sharp(join(dirname(path), mapping.thumbnail)).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 85 }).toFile(join(folder, 'thumbnail.webp'))
    const manifest = {
      id, title, description: synopses[id] || (episode ? episode[3] : wiki.extract.split('\n')[0]),
      category: isEpisode ? 'tv' : 'movie', year: featurette ? 2008 : episode ? Number(episode[2].slice(0, 4)) : year || Number(wiki.extract.match(/(?:19|20)\d{2}/)?.[0]) || null,
      date: featurette ? '2008-09-02' : episode ? episode[2] : null,
      genres: featurette ? ['Documentary'] : ['Animation', ...['Adventure', 'Comedy', 'Fantasy', 'Romance', 'Family', 'Action'].filter(genre => new RegExp(`\\b${genre}\\b`, 'i').test(wiki.extract || ''))], duration: Math.round(Number(source?.Seconds)) || null,
      video: basename(path), videoKey: task.key, thumbnail: 'thumbnail.webp',
      thumbnailKey: isEpisode ? 'movies/this-is-america-charlie-brown/thumbnail.webp' : `${dirname(task.key).replaceAll('\\', '/')}/thumbnail.webp`,
      metadataSource: wiki.content_urls.desktop.page, sourceFolder: dirname(path),
      ...(episode ? { seriesId: 'this-is-america-charlie-brown', seriesTitle: 'This Is America, Charlie Brown', seasonNumber: 1, episodeNumber: episodes.indexOf(episode) + 1 } : {}),
    }
    await writeFile(join(folder, 'media.json'), JSON.stringify(manifest, null, 2) + '\n')
    manifests.push(manifest)
    console.log(`Prepared ${title}`)
  } catch (error) { held.push({ title: task.title, reason: error.message }); console.warn(`Held: ${task.title}: ${error.message}`) }
}
const report = { checkedAt: new Date().toISOString(), queued: queue.tasks.length, uploaded: uploaded.length, prepared: manifests.length, held, published: 0 }
await writeFile('logs/unique-movies-publication.json', JSON.stringify(report, null, 2))
if (publish) {
  const cfHeaders = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }
  const cf = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`
  const database = (await request(cf, { headers: cfHeaders })).result.find(db => db.name === (process.env.D1_DATABASE || 'king-videos-prod'))
  if (!database) throw new Error('D1 database not found')
  const query = (sql, params = []) => request(`${cf}/${database.uuid}/query`, { method: 'POST', headers: cfHeaders, body: JSON.stringify({ sql, params }) })
  const existing = (await query('SELECT id,video_key FROM media')).result.flatMap(r => r.results)
  const byKey = new Map(existing.map(row => [row.video_key, row.id]))
  const uploadedThumbnails = new Set()
  for (const manifest of manifests) {
    if (!uploadedThumbnails.has(manifest.thumbnailKey)) {
      const bytes = await readFile(join(root, manifest.id, manifest.thumbnail))
      const hash = createHash('sha1').update(bytes).digest('hex')
      if (files.get(manifest.thumbnailKey)?.contentSha1 !== hash) {
        const upload = await b2('b2_get_upload_url', { bucketId: bucket.bucketId })
        const result = await request(upload.uploadUrl, { method: 'POST', headers: { Authorization: upload.authorizationToken, 'X-Bz-File-Name': encodeURIComponent(manifest.thumbnailKey), 'X-Bz-Content-Sha1': hash, 'Content-Type': 'image/webp', 'Content-Length': String(bytes.length) }, body: bytes })
        if (result.contentSha1 !== hash || result.contentLength !== bytes.length) throw new Error(`Thumbnail verification failed: ${manifest.title}`)
      }
      uploadedThumbnails.add(manifest.thumbnailKey)
    }
    const id = byKey.get(manifest.videoKey) || manifest.id
    const params = [id, manifest.title, manifest.description, manifest.category, manifest.videoKey, manifest.thumbnailKey, manifest.date, manifest.year, JSON.stringify(manifest.genres), manifest.duration, manifest.seriesId || null, manifest.seriesTitle || null, manifest.seasonNumber || null, manifest.episodeNumber || null]
    await query('INSERT INTO media(id,title,description,category,video_key,thumbnail_key,release_date,year,genres,duration_seconds,series_id,series_title,season_number,episode_number) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,thumbnail_key=excluded.thumbnail_key,release_date=excluded.release_date,year=excluded.year,genres=excluded.genres,duration_seconds=excluded.duration_seconds,series_id=excluded.series_id,series_title=excluded.series_title,season_number=excluded.season_number,episode_number=excluded.episode_number', params)
    report.published++
    await writeFile('logs/unique-movies-publication.json', JSON.stringify(report, null, 2))
    console.log(`Published ${manifest.title}`)
  }
  const verified = (await query('SELECT id,video_key,thumbnail_key FROM media')).result.flatMap(r => r.results)
  report.verified = manifests.filter(m => verified.some(row => row.video_key === m.videoKey && row.thumbnail_key === m.thumbnailKey)).length
  if (report.verified !== manifests.length) throw new Error('Catalog verification failed')
  await writeFile('logs/unique-movies-publication.json', JSON.stringify(report, null, 2))
}
console.log(JSON.stringify(report, null, 2))
