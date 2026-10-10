import { mkdirSync, writeFileSync } from 'node:fs';

const headers = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' };
const base = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`;
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`D1 request failed: ${response.status}`);
  return data;
}
const database = (await request(base)).result.find(db => db.name === (process.env.D1_DATABASE || 'king-videos-prod'));
if (!database) throw new Error('Database not found');
async function query(sql) {
  return (await request(`${base}/${database.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql, params: [] }) })).result[0].results;
}
const predicate = "UPPER(TRIM(rating)) IN ('PG','PG-13','R','NC-17','TV-Y7','TV-Y7-FV','TV-PG','TV-14','TV-MA') AND COALESCE(min_age,0)<6";
const items = await query(`SELECT id,title,category,rating,min_age FROM media WHERE ${predicate} ORDER BY rating,title`);
console.log(JSON.stringify({ needingUpdate: items.length, ratings: await query('SELECT rating,COUNT(*) AS count FROM media GROUP BY rating ORDER BY rating') }));
if (process.argv.includes('--apply')) {
  mkdirSync('logs', { recursive: true });
  const report = { createdAt: new Date().toISOString(), items };
  writeFileSync('logs/preschool-rating-floor.json', JSON.stringify(report, null, 2));
  await query(`UPDATE media SET min_age=6 WHERE ${predicate}`);
  const remaining = (await query(`SELECT COUNT(*) AS count FROM media WHERE ${predicate}`))[0].count;
  if (remaining) throw new Error(`Verification failed: ${remaining} remaining`);
  writeFileSync('logs/preschool-rating-floor.json', JSON.stringify({ ...report, updated: items.length, remaining }, null, 2));
  console.log(JSON.stringify({ updated: items.length, remaining }));
}
