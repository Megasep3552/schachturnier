import type { ReactNode } from 'react';

export function ModalDialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} aria-label="Dialog schließen" className="text-xl text-slate-500 hover:text-slate-900">×</button></div>{children}</div></div>;
}