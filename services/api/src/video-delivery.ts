// Roku progressive playback may keep a single open-ended HTTP range open.
// Preserve its range rather than ending the response after the browser chunk limit.
export function videoOriginRange(range:string|null,roku:boolean){
  if(roku||!range)return range
  const match=range.match(/^bytes=(\d+)-(\d*)$/)
  if(!match)return range
  const start=Number(match[1]),end=match[2]?Number(match[2]):Infinity
  return `bytes=${start}-${Math.min(end,start+16777215)}`
}
