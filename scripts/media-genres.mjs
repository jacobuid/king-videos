// Genre rules shared by metadata cleanup and new imports.
export function classicGenres(genres,year){
  const legacyClassic=genres.includes('Classic Television')
  const result=[...new Set(genres.map(genre=>genre==='Classic Television'?'Classic':genre))]
  const animated=result.some(genre=>genre==='Animation'||genre==='Cartoon')
  const knownYear=Number.isInteger(Number(year))&&Number(year)>0
  if(animated||(knownYear&&Number(year)>=1990))return result.filter(genre=>genre!=='Classic')
  if(knownYear&&Number(year)<1990&&!result.includes('Classic'))result.push('Classic')
  // Keep an explicitly classified older special when its exact year is unavailable.
  if(!knownYear&&!legacyClassic&&!genres.includes('Classic'))return result.filter(genre=>genre!=='Classic')
  return result
}
