import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { children: ReactNode; variant?: 'primary' | 'success' | 'danger' | 'secondary'; }
const variants = { primary: 'bg-amber-500 hover:bg-amber-600 text-slate-950', success: 'bg-emerald-600 hover:bg-emerald-700 text-white', danger: 'bg-red-600 hover:bg-red-700 text-white', secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700' };
export function Button({ children, variant = 'primary', className = '', ...props }: ButtonProps) { return <button className={`font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors disabled:opacity-50 ${variants[variant]} ${className}`} {...props}>{children}</button>; }