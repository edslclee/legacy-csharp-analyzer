import JSZip from 'jszip'
import type { Ingested, IngestedType } from '../types'

const inferType = (name: string): IngestedType => {
  const n = name.toLowerCase()
  if (n.endsWith('.cs')) return 'cs'
  if (n.endsWith('.sql')) return 'sql'
  return 'doc'
}

export async function readFiles(files: File[], allowZipTypes: IngestedType[] = ['cs','sql']): Promise<Ingested[]> {
  const out: Ingested[] = []
  for (const f of files) {
    if (f.name.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(await f.arrayBuffer())
      for (const key of Object.keys(zip.files)) {
        const entry = zip.files[key]
        if (!entry.dir) {
          const type = inferType(entry.name)
          if (!allowZipTypes.includes(type)) continue
          const txt = await entry.async('string')
          out.push({ name: entry.name, type, content: txt })
        }
      }
    } else {
      const txt = await f.text()
      const type = inferType(f.name)
      out.push({ name: f.name, type, content: txt })
    }
  }
  return out
}

export function estimateBytes(items: Ingested[]): number {
  return new TextEncoder().encode(items.map(i => i.content).join('\n')).length
}