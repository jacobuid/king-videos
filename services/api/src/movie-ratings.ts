export function movieRatingAge(category:string,rating:string|null|undefined,current=0){
  if(category.toLowerCase()!=='movie')return current
  const normalized=rating?.trim().toUpperCase()
  if(normalized==='PG-13')return 16
  if(normalized==='R')return 21
  return current
}
