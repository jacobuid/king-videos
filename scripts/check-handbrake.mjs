import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const statusFile = new URL('../.handbrake-current.json', import.meta.url)
const currentJob = existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, 'utf8').replace(/^\uFEFF/, '')) : null
const sourceFolder = process.argv[2] ?? currentJob?.inputFolder
const outputFolder = process.argv[3] ?? currentJob?.outputFolder
if (!sourceFolder || !outputFolder) {
  console.error('No current HandBrake job was found. Start compression or pass source and output folders after --.')
  process.exit(1)
}
const videoExtensions = new Set(['.mp4', '.m4v', '.mkv', '.avi'])

function fail(message) {
  console.error(`\nHandBrake status check failed: ${message}`)
  process.exit(1)
}

function videosIn(folder, includePartial = false) {
  if (!existsSync(folder)) fail(`Folder not found: ${folder}`)
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(folder, entry.name))
    .filter((file) => videoExtensions.has(extname(file).toLowerCase()))
    .filter((file) => includePartial || !basename(file).endsWith('.partial.mp4'))
    .filter((file) => !/\(1\)|\(AUSLAN\)/i.test(basename(file)))
    .sort((a, b) => a.localeCompare(b))
}

function baseName(file) {
  return basename(file, extname(file))
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** power).toFixed(power >= 3 ? 2 : 1)} ${units[power]}`
}

function findHandBrake() {
  if (process.env.HANDBRAKE_PATH && existsSync(process.env.HANDBRAKE_PATH)) return process.env.HANDBRAKE_PATH

  const where = spawnSync('where.exe', ['HandBrakeCLI.exe'], { encoding: 'utf8', windowsHide: true })
  const pathResult = where.stdout?.split(/\r?\n/).find(Boolean)?.trim()
  if (pathResult && existsSync(pathResult)) return pathResult

  const command = [
    '$candidate = Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\\Microsoft\\WinGet\\Packages"',
    '-Recurse -Filter HandBrakeCLI.exe -File -ErrorAction SilentlyContinue |',
    'Select-Object -First 1 -ExpandProperty FullName;',
    'if ($candidate) { $candidate }',
  ].join(' ')
  const found = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
  }).stdout?.trim()
  return found && existsSync(found) ? found : null
}

function handBrakeIsRunning() {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', "if (Get-Process -Name HandBrakeCLI -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }"],
    { encoding: 'utf8', windowsHide: true },
  )
  return result.stdout.trim() === 'yes'
}

const sourceFiles = videosIn(sourceFolder)
const outputFiles = videosIn(outputFolder)
const outputNames = new Set(outputFiles.map(baseName))
const completedFiles = outputFiles.filter((file) => statSync(file).size > 0)
const remainingFiles = sourceFiles.filter((file) => !outputNames.has(baseName(file)))
const partialFiles = readdirSync(outputFolder).filter((name) => name.endsWith('.partial.mp4'))
const handBrake = findHandBrake()

if (!handBrake) fail('HandBrakeCLI.exe was not found. Set HANDBRAKE_PATH to its full path.')

let invalidFiles = 0
for (const file of completedFiles) {
  const scan = spawnSync(handBrake, ['-i', file, '--scan'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
  })
  if (scan.status !== 0) invalidFiles++
}

const sourceBytes = sourceFiles.reduce((total, file) => total + statSync(file).size, 0)
const completedBytes = completedFiles.reduce((total, file) => total + statSync(file).size, 0)
const completedSizes = completedFiles.map((file) => statSync(file).size)
const matchingSourceBytes = sourceFiles
  .filter((file) => outputNames.has(baseName(file)))
  .reduce((total, file) => total + statSync(file).size, 0)
const ratio = matchingSourceBytes > 0 ? completedBytes / matchingSourceBytes : 0
const estimatedBytes = ratio > 0 ? sourceBytes * ratio : completedBytes

console.log('\nHandBrake compression status\n')
console.log(`- **Source:** ${sourceFolder}`)
console.log(`- **Output:** ${outputFolder}`)
console.log(`- **Currently running:** ${handBrakeIsRunning() ? 'Yes' : 'No'}`)
console.log(`- **${completedFiles.length} completed files**`)
console.log(`- **${remainingFiles.length} remaining files**`)
console.log(`- **${invalidFiles} invalid files**`)
console.log(`- **${partialFiles.length} partial files**`)
if (completedSizes.length > 0) {
  console.log(`- File sizes range from **${formatBytes(Math.min(...completedSizes))} to ${formatBytes(Math.max(...completedSizes))}**`)
}
console.log(`- Total compressed size: **${formatBytes(completedBytes)}**`)
console.log(`- Before compressed size: **${formatBytes(sourceBytes)}**`)
console.log(`- Estimated final compressed size: **${formatBytes(estimatedBytes)}**`)

if (remainingFiles.length > 0) {
  console.log('\nRemaining:')
  for (const file of remainingFiles) console.log(`- ${basename(file)}`)
}

if (invalidFiles > 0) process.exitCode = 2
