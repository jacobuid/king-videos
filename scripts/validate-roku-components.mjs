import {readFileSync,readdirSync} from 'node:fs'
import {dirname,join} from 'node:path'

// BrightScript compiles findNode calls even when their target is absent. Verify
// local component wiring before packaging so startup cannot dereference invalid.
export function validateRokuComponents(root){
  const folder=join(root,'components')
  for(const file of readdirSync(folder).filter(name=>name.endsWith('.xml'))){
    const xml=readFileSync(join(folder,file),'utf8')
    const ids=new Set([...xml.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]))
    for(const script of xml.matchAll(/<script\b[^>]*\buri="([^"]+\.brs)"/g)){
      const source=readFileSync(join(dirname(join(folder,file)),script[1]),'utf8')
      for(const reference of source.matchAll(/m\.top\.findNode\("([^"]+)"\)/gi)){
        if(!ids.has(reference[1]))throw Error(`${file}: script ${script[1]} references missing node "${reference[1]}"`)
      }
    }
  }
}
