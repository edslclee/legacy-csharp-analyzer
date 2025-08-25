import React from 'react'

// 반드시 export!
export type TabKey = 'ERD' | 'TABLES' | 'CRUD' | 'PROCESS' | 'DOCS'

// 반드시 export!
export function Tabs({
  active,
  onChange,
}: { active: TabKey; onChange: (k: TabKey) => void }) {
  const items: TabKey[] = ['ERD','TABLES','CRUD','PROCESS','DOCS']
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(k => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`px-3 py-1 rounded border ${active===k ? 'bg-gray-900 text-white' : 'bg-white'}`}
          aria-pressed={active===k}
        >
          {k}
        </button>
      ))}
    </div>
  )
}