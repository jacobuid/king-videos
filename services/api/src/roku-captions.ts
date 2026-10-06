// Roku's MP4 sidecar captions use SRT. Browser playback continues to use VTT.
export function vttToSrt(value:string){
  if(!value.replace(/^\uFEFF/,'').startsWith('WEBVTT'))return value
  let index=0
  const cues=[]
  for(const block of value.replace(/^\uFEFF/,'').replaceAll('\r','').split(/\n\s*\n/)){
    const lines=block.split('\n'),timeIndex=lines.findIndex(line=>line.includes(' --> '))
    if(timeIndex<0||/^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0]))continue
    const match=lines[timeIndex].match(/^((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/)
    if(!match)continue
    const stamp=(time:string)=>(time.split(':').length===2?'00:':'')+time.replace('.',',')
    const text=lines.slice(timeIndex+1).join('\n').replace(/<\/?(?:c|v|lang)(?:[.\s][^>]*)?>/g,'').replace(/<\d{2}:\d{2}(?::\d{2})?\.\d{3}>/g,'').trimEnd()
    cues.push(`${++index}\n${stamp(match[1])} --> ${stamp(match[2])}\n${text}`)
  }
  return cues.join('\n\n')+'\n'
}
