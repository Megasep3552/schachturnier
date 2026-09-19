'use client';

import type { LucideIcon } from 'lucide-react';
import type { TabId } from '@/types';

export interface TabItem { id: TabId; label: string; icon: LucideIcon; }
export function Tabs({ items, activeTab, onChange }: { items: TabItem[]; activeTab: TabId; onChange: (tab: TabId) => void }) {
  return <nav className="bg-slate-800/80 border-t border-slate-700"><div className="max-w-6xl mx-auto px-4 flex overflow-x-auto space-x-1 py-2">{items.map(({ id, icon: Icon, label }) => <button key={id} onClick={() => onChange(id)} className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ${activeTab === id ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:bg-slate-700'}`}><Icon className="w-4 h-4" /><span>{label}</span></button>)}</div></nav>;
}