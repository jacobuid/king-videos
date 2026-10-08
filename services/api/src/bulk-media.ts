type BulkSettings={rating?:string|null;minAge?:number;genres?:string[];blocked?:boolean}
export function bulkMediaUpdates(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Choose bulk settings.')
  const settings=value as Record<string,unknown>
  if(Object.keys(settings).some(key=>!['rating','minAge','genres','blocked'].includes(key)))throw new Error('Bulk editing supports only rating, available age, genres and blocked status.')
  if(!Object.keys(settings).length)throw new Error('Choose at least one setting to change.')
  const clean:BulkSettings={},assignments:string[]=[],params:(string|number|null)[]=[]
  if('rating'in settings){if(settings.rating!==null&&(typeof settings.rating!=='string'||settings.rating.trim().length>20))throw new Error('Choose a valid rating.');clean.rating=typeof settings.rating==='string'?settings.rating.trim()||null:null;assignments.push('rating=?');params.push(clean.rating)}
  if('genres'in settings){if(!Array.isArray(settings.genres)||settings.genres.length>20||settings.genres.some(g=>typeof g!=='string'||!g.trim()||g.trim().length>40))throw new Error('Choose valid genres.');clean.genres=[...new Set(settings.genres.map(g=>(g as string).trim()))];assignments.push('genres=?');params.push(JSON.stringify(clean.genres))}
  if('blocked'in settings){if(typeof settings.blocked!=='boolean')throw new Error('Choose a valid blocked status.');clean.blocked=settings.blocked;assignments.push('blocked=?');params.push(clean.blocked?1:0)}
  if('minAge'in settings){if(typeof settings.minAge!=='number'||!Number.isInteger(settings.minAge)||settings.minAge<0||settings.minAge>21)throw new Error('Available age must be a whole number from 0 to 21.');clean.minAge=settings.minAge}
  if('minAge'in settings||'rating'in settings){const rating='rating'in settings?'?':'rating',age='minAge'in settings?'?':'min_age';assignments.push(`min_age=CASE WHEN category='movie' AND UPPER(COALESCE(${rating},''))='PG-13' THEN 16 WHEN category='movie' AND UPPER(COALESCE(${rating},''))='R' THEN 21 ELSE ${age} END`);if('rating'in settings)params.push(clean.rating??null,clean.rating??null);if('minAge'in settings)params.push(clean.minAge!)}
  return {assignments,params,settings:clean}
}
