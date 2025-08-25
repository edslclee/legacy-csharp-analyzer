import mermaid from 'mermaid'
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })

export async function renderMermaid(el: HTMLElement, code: string) {
  const id = 'erd-' + Math.random().toString(36).slice(2)
  const { svg } = await mermaid.render(id, code)
  el.innerHTML = svg
}

// apps/web/src/lib/mermaid.ts
export function getSvgPngDataUrl(svgContainer: HTMLElement): Promise<string | null> {
  const svg = svgContainer.querySelector('svg')
  if (!svg) return Promise.resolve(null)

  const xml = new XMLSerializer().serializeToString(svg)
  const svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = svg64
  })
}

export function exportSvgToPng(svgContainer: HTMLElement, filename = 'erd.png') {
  const svg = svgContainer.querySelector('svg')
  if (!svg) return

  const xml = new XMLSerializer().serializeToString(svg)
  const svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: filename })
      a.click()
      URL.revokeObjectURL(url)
    })
  }
  img.src = svg64
}