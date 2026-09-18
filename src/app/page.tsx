'use client';

import { useMemo, useState, useEffect } from 'react';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard, PlayCircle, Trophy, Users, History,
  ClipboardList, Settings, AlertTriangle, Trash2, Pencil,
  ChevronRight, X, ArrowRight, CircleCheck,
} from 'lucide-react';

const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'] });

// ---------------------------------------------------------------------------
// Typen (unverändert gegenüber der bestehenden Datenstruktur)
// ---------------------------------------------------------------------------

type Gruppe = 'Leicht' | 'Mittel' | 'Schwer';

interface Spieler {
  id: number;
  name: string;
  punkte: number;
  buchholz: number;
  gruppe: Gruppe;
  anwesend: boolean;
}

interface Partie {
  id: number;
  runde: number;
  weiss_id: number;
  schwarz_id: number | null;
  ergebnis: string | null;
  status: string;
}

type Ansicht = 'start' | 'runde' | 'tabelle' | 'spieler' | 'spielhistorie' | 'verwaltung' | 'einstellungen';

interface SpielerStats {
  spiele: number;
  siege: number;
  remis: number;
  niederlagen: number;
  freirunden: number;
}

interface NoticeState {
  ton: 'info' | 'fehler' | 'erfolg';
  text: string;
}

interface ConfirmState {
  titel: string;
  nachricht: string;
  bestaetigenLabel: string;
  ton?: 'standard' | 'warnung' | 'gefahr';
  onBestaetigen: () => void;
}

// ---------------------------------------------------------------------------
// Design-Tokens
// ---------------------------------------------------------------------------

const FARBE_AKZENT = '#2F6153';
const FARBE_AKZENT_DUNKEL = '#264F44';

const GRUPPEN_FARBEN: Record<Gruppe, { bg: string; text: string; border: string; dot: string }> = {
  Leicht: { bg: '#EAF6EF', text: '#256C43', border: '#BFE3CE', dot: '#3F8361' },
  Mittel: { bg: '#FBF3E2', text: '#8A6116', border: '#EBD6A6', dot: '#C08A2E' },
  Schwer: { bg: '#FBEAEC', text: '#8E2733', border: '#F0C4CA', dot: '#B23A48' },
};

const btnPrimary = `inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed`;
const btnSecondary = `inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors disabled:opacity-40`;
const btnDanger = `inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#B3261E] text-white font-medium text-sm hover:bg-[#96201A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed`;
const btnGhostSmall = `inline-flex items-center gap-1 text-sm font-medium hover:underline`;

// ---------------------------------------------------------------------------
// Kleine, wiederverwendbare Bausteine
// ---------------------------------------------------------------------------

function GruppenBadge({ gruppe }: { gruppe: Gruppe }) {
  const f = GRUPPEN_FARBEN[gruppe];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0"
      style={{ background: f.bg, color: f.text, borderColor: f.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: f.dot }} />
      {gruppe}
    </span>
  );
}

function FarbSchachfeld({ farbe }: { farbe: 'Weiß' | 'Schwarz' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span
        className="w-2.5 h-2.5 rounded-sm border border-slate-400"
        style={{ background: farbe === 'Weiß' ? '#ffffff' : '#334155' }}
      />
      {farbe}
    </span>
  );
}

function Karte({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`bg-white border border-slate-200 rounded-xl p-5 ${className}`} style={style}>{children}</div>;
}

function Punktzahl({ value, groß = false }: { value: number; groß?: boolean }) {
  return (
    <span className={`${plexMono.className} font-semibold`} style={{ color: FARBE_AKZENT }}>
      <span className={groß ? 'text-2xl' : 'text-base'}>{value}</span>
    </span>
  );
}

function Hinweisbanner({ notice, onClose }: { notice: NoticeState; onClose: () => void }) {
  const stile = {
    info: 'bg-slate-100 border-slate-300 text-slate-700',
    erfolg: 'bg-[#EAF6EF] border-[#BFE3CE] text-[#256C43]',
    fehler: 'bg-[#FBEAEC] border-[#F0C4CA] text-[#8E2733]',
  }[notice.ton];
  return (
    <div className={`flex items-start justify-between gap-4 border rounded-lg px-4 py-3 text-sm ${stile}`}>
      <span>{notice.text}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 shrink-0"><X size={16} /></button>
    </div>
  );
}

function LeererZustand({ text }: { text: string }) {
  return <p className="text-sm text-slate-400 italic py-6 text-center">{text}</p>;
}

function Modal({ titel, onClose, children }: { titel: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-slate-900">{titel}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BestaetigungsDialog({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) {
  const klasse = state.ton === 'gefahr' ? btnDanger : btnPrimary;
  const style = state.ton === 'warnung' ? { background: '#C08A2E' } : state.ton === 'gefahr' ? {} : { background: FARBE_AKZENT };
  return (
    <Modal titel={state.titel} onClose={onCancel}>
      <p className="text-sm text-slate-600">{state.nachricht}</p>
      <div className="flex justify-end gap-3 pt-2">
        <button className={btnSecondary} onClick={onCancel}>Abbrechen</button>
        <button className={klasse} style={style} onClick={() => { state.onBestaetigen(); onCancel(); }}>
          {state.bestaetigenLabel}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reine Hilfsfunktionen (keine neue Turnierlogik, nur Ableitungen aus den
// bereits vorhandenen Daten)
// ---------------------------------------------------------------------------

function berechneSpielerStats(spielerList: Spieler[], partienList: Partie[]): Record<number, SpielerStats> {
  const stats: Record<number, SpielerStats> = {};
  spielerList.forEach(s => (stats[s.id] = { spiele: 0, siege: 0, remis: 0, niederlagen: 0, freirunden: 0 }));

  partienList.forEach(p => {
    if (p.status !== 'beendet' || !p.ergebnis) return;
    if (p.ergebnis === 'FREISPIEL') {
      if (stats[p.weiss_id]) stats[p.weiss_id].freirunden += 1;
      return;
    }
    if (!p.schwarz_id) return;
    if (!stats[p.weiss_id] || !stats[p.schwarz_id]) return;

    stats[p.weiss_id].spiele += 1;
    stats[p.schwarz_id].spiele += 1;

    if (p.ergebnis === '1-0') { stats[p.weiss_id].siege += 1; stats[p.schwarz_id].niederlagen += 1; }
    else if (p.ergebnis === '0-1') { stats[p.schwarz_id].siege += 1; stats[p.weiss_id].niederlagen += 1; }
    else if (p.ergebnis === '0.5-0.5') { stats[p.weiss_id].remis += 1; stats[p.schwarz_id].remis += 1; }
  });

  return stats;
}

function anzahlBegegnungen(partienList: Partie[], idA: number, idB: number, ausgenommenPartieId?: number): number {
  return partienList.filter(p =>
    p.id !== ausgenommenPartieId &&
    p.ergebnis !== 'FREISPIEL' &&
    ((p.weiss_id === idA && p.schwarz_id === idB) || (p.weiss_id === idB && p.schwarz_id === idA))
  ).length;
}

function ergebnisFuerSpieler(p: Partie, spielerId: number): { text: string; farbe: string } {
  if (p.ergebnis === 'FREISPIEL') return { text: 'Freispiel', farbe: 'text-[#8A6116]' };
  if (!p.ergebnis) return { text: 'offen', farbe: 'text-slate-400' };
  const istWeiss = p.weiss_id === spielerId;
  if (p.ergebnis === '0.5-0.5') return { text: 'Remis', farbe: 'text-slate-600' };
  if ((istWeiss && p.ergebnis === '1-0') || (!istWeiss && p.ergebnis === '0-1')) return { text: 'Gewonnen', farbe: 'text-[#256C43]' };
  return { text: 'Verloren', farbe: 'text-[#8E2733]' };
}

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------

export default function Home() {
  const [aktiveAnsicht, setAktiveAnsicht] = useState<Ansicht>('start');
  const [spielerList, setSpielerList] = useState<Spieler[]>([]);
  const [partienList, setPartienList] = useState<Partie[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const [neuerSpielerName, setNeuerSpielerName] = useState('');
  const [neuerSpielerGruppe, setNeuerSpielerGruppe] = useState<Gruppe>('Mittel');
  const [editSpieler, setEditSpieler] = useState<Spieler | null>(null);
  const [editName, setEditName] = useState('');
  const [editGruppe, setEditGruppe] = useState<Gruppe>('Mittel');

  const [verwaltungRunde, setVerwaltungRunde] = useState<number>(1);

  const [pairingChangeFor, setPairingChangeFor] = useState<Partie | null>(null);
  const [neuerGegnerId, setNeuerGegnerId] = useState<number | null>(null);

  const [filterSpieler, setFilterSpieler] = useState<number | 'alle'>('alle');
  const [filterRunde, setFilterRunde] = useState<number | 'alle'>('alle');

  const [loeschBestaetigung, setLoeschBestaetigung] = useState('');

  async function loadData() {
    const { data: spielerData } = await supabase.from('spieler').select('*').order('name', { ascending: true });
    if (spielerData) setSpielerList(spielerData as Spieler[]);

    const { data: partienData } = await supabase.from('partien').select('*').order('runde', { ascending: false }).order('id', { ascending: true });
    if (partienData) {
      setPartienList(partienData as Partie[]);
      const maxR = partienData.reduce((max, p) => (p.runde > max ? p.runde : max), 1);
      setVerwaltungRunde(maxR);
    }
  }

  useEffect(() => { loadData(); }, []);

  const maxRunde = partienList.reduce((max, p) => (p.runde > max ? p.runde : max), 0);
  const anwesendeSpieler = spielerList.filter(s => s.anwesend);
  const aktuellePartien = partienList.filter(p => p.runde === maxRunde);
  const offenePartien = aktuellePartien.filter(p => p.status === 'offen').length;
  const stats = useMemo(() => berechneSpielerStats(spielerList, partienList), [spielerList, partienList]);
  const alleRunden = useMemo(() => Array.from(new Set(partienList.map(p => p.runde))).sort((a, b) => a - b), [partienList]);

  const getSpieler = (id: number | null) => spielerList.find(s => s.id === id);

  const sortierteTabelle = useMemo(() => {
    return [...spielerList].sort((a, b) => {
      if (b.punkte !== a.punkte) return b.punkte - a.punkte;
      return (b.buchholz || 0) - (a.buchholz || 0);
    });
  }, [spielerList]);

  // -- Aktionen -------------------------------------------------------------

  async function toggleAnwesenheit(id: number, current: boolean) {
    await supabase.from('spieler').update({ anwesend: !current }).eq('id', id);
    await loadData();
  }

  async function starteAuslosung() {
    if (anwesendeSpieler.length < 2) {
      setNotice({ ton: 'fehler', text: 'Es werden mindestens zwei anwesende Spieler benötigt, um Paarungen zu berechnen.' });
      return;
    }
    setLoading(true);
    const naechsteRunde = maxRunde === 0 || (offenePartien === 0 && aktuellePartien.length > 0) ? maxRunde + 1 : (maxRunde === 0 ? 1 : maxRunde);

    if (offenePartien > 0 && aktuellePartien.length > 0) {
      await supabase.from('partien').delete().eq('runde', maxRunde).eq('status', 'offen');
    }

    const gemischt = [...anwesendeSpieler].sort(() => Math.random() - 0.5);
    const neuePartien = [];
    for (let i = 0; i < gemischt.length; i += 2) {
      if (i + 1 < gemischt.length) {
        neuePartien.push({ runde: naechsteRunde, weiss_id: gemischt[i].id, schwarz_id: gemischt[i + 1].id, ergebnis: null, status: 'offen' });
      } else {
        neuePartien.push({ runde: naechsteRunde, weiss_id: gemischt[i].id, schwarz_id: null, ergebnis: 'FREISPIEL', status: 'beendet' });
      }
    }
    await supabase.from('partien').insert(neuePartien);
    await berechneAllePunkteNeu();
    setLoading(false);
    setNotice({ ton: 'erfolg', text: `Runde ${naechsteRunde} wurde ausgelost.` });
  }

  function auslosenKlick() {
    if (offenePartien > 0) {
      setConfirmState({
        titel: 'Paarungen neu berechnen?',
        nachricht: `Es gibt noch ${offenePartien} offene Partie(n) in Runde ${maxRunde}. Beim Neuberechnen werden die bisherigen, noch offenen Paarungen dieser Runde ersetzt.`,
        bestaetigenLabel: 'Neu auslosen',
        ton: 'warnung',
        onBestaetigen: starteAuslosung,
      });
    } else {
      starteAuslosung();
    }
  }

  async function handleErgebnis(partieId: number, ergebnis: string) {
    await supabase.from('partien').update({ ergebnis, status: 'beendet' }).eq('id', partieId);
    await berechneAllePunkteNeu();
  }

  async function berechneAllePunkteNeu() {
    const { data: allePartien } = await supabase.from('partien').select('*');
    if (!allePartien) return;

    const punkteMap: Record<number, number> = {};
    spielerList.forEach(s => (punkteMap[s.id] = 0));
    allePartien.forEach(p => {
      if (p.status === 'beendet' && p.ergebnis) {
        if (p.ergebnis === '1-0') punkteMap[p.weiss_id] = (punkteMap[p.weiss_id] || 0) + 1.0;
        else if (p.ergebnis === '0-1' && p.schwarz_id) punkteMap[p.schwarz_id] = (punkteMap[p.schwarz_id] || 0) + 1.0;
        else if (p.ergebnis === '0.5-0.5') {
          punkteMap[p.weiss_id] = (punkteMap[p.weiss_id] || 0) + 0.5;
          if (p.schwarz_id) punkteMap[p.schwarz_id] = (punkteMap[p.schwarz_id] || 0) + 0.5;
        } else if (p.ergebnis === 'FREISPIEL') punkteMap[p.weiss_id] = (punkteMap[p.weiss_id] || 0) + 1.0;
      }
    });

    const buchholzMap: Record<number, number> = {};
    spielerList.forEach(s => (buchholzMap[s.id] = 0));
    allePartien.forEach(p => {
      if (p.status === 'beendet' && p.schwarz_id && p.ergebnis !== 'FREISPIEL') {
        buchholzMap[p.weiss_id] = (buchholzMap[p.weiss_id] || 0) + (punkteMap[p.schwarz_id] || 0);
        buchholzMap[p.schwarz_id] = (buchholzMap[p.schwarz_id] || 0) + (punkteMap[p.weiss_id] || 0);
      }
    });

    for (const sp of spielerList) {
      await supabase.from('spieler').update({ punkte: punkteMap[sp.id] || 0, buchholz: buchholzMap[sp.id] || 0 }).eq('id', sp.id);
    }
    await loadData();
  }

  async function addSpieler() {
    if (!neuerSpielerName.trim()) return;
    await supabase.from('spieler').insert([{ name: neuerSpielerName.trim(), gruppe: neuerSpielerGruppe, anwesend: true, punkte: 0, buchholz: 0 }]);
    setNeuerSpielerName('');
    await loadData();
  }

  function loeschenKlick(sp: Spieler) {
    setConfirmState({
      titel: 'Spieler löschen?',
      nachricht: `${sp.name} wird endgültig aus dem Turnier entfernt. Bereits gespielte Partien bleiben in der Historie sichtbar.`,
      bestaetigenLabel: 'Löschen',
      ton: 'gefahr',
      onBestaetigen: async () => { await supabase.from('spieler').delete().eq('id', sp.id); await loadData(); },
    });
  }

  function editSpielerOeffnen(sp: Spieler) {
    setEditSpieler(sp); setEditName(sp.name); setEditGruppe(sp.gruppe);
  }

  async function editSpielerSpeichern() {
    if (!editSpieler || !editName.trim()) return;
    await supabase.from('spieler').update({ name: editName.trim(), gruppe: editGruppe }).eq('id', editSpieler.id);
    setEditSpieler(null);
    await loadData();
  }

  function pairingAendernOeffnen(p: Partie) {
    setPairingChangeFor(p);
    setNeuerGegnerId(p.schwarz_id);
  }

  async function pairingAendernSpeichern() {
    if (!pairingChangeFor || !neuerGegnerId) return;
    const alterGegnerId = pairingChangeFor.schwarz_id;
    await supabase.from('partien').update({ schwarz_id: neuerGegnerId, ergebnis: null, status: 'offen' }).eq('id', pairingChangeFor.id);
    setPairingChangeFor(null);
    await berechneAllePunkteNeu();
    const alterGegner = getSpieler(alterGegnerId);
    if (alterGegner) {
      setNotice({ ton: 'info', text: `Hinweis: ${alterGegner.name} hat dadurch aktuell keinen Gegner mehr in dieser Runde. Bitte manuell neu zuordnen oder ein Freispiel vergeben.` });
    }
  }

  function tabellenzeileZuHistorie(id: number) {
    setFilterSpieler(id);
    setFilterRunde('alle');
    setAktiveAnsicht('spielhistorie');
  }

  const navItems: { id: Ansicht; name: string; icon: any }[] = [
    { id: 'start', name: 'Startseite', icon: LayoutDashboard },
    { id: 'runde', name: 'Aktuelle Runde', icon: PlayCircle },
    { id: 'tabelle', name: 'Tabelle', icon: Trophy },
    { id: 'spieler', name: 'Spieler', icon: Users },
    { id: 'spielhistorie', name: 'Spielhistorie', icon: History },
    { id: 'verwaltung', name: 'Verwaltung', icon: ClipboardList },
    { id: 'einstellungen', name: 'Einstellungen', icon: Settings },
  ];

  function gehezu(id: Ansicht) { setAktiveAnsicht(id); setIsMobileMenuOpen(false); }

  const gespielteImRunde = aktuellePartien.length - offenePartien;

  return (
    <div className={`${plexSans.className} min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800`}>
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center sticky top-0 z-30">
        <div>
          <div className="font-semibold text-slate-900 leading-tight">Schachturnier</div>
          <div className="text-xs text-slate-400 leading-tight">{navItems.find(n => n.id === aktiveAnsicht)?.name}</div>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 border border-slate-200 rounded-lg text-slate-600">
          <ClipboardList size={18} />
        </button>
      </div>

      <nav className={`${isMobileMenuOpen ? 'block' : 'hidden'} md:block w-full md:w-60 bg-white border-r border-slate-200 flex-shrink-0 md:sticky md:top-0 md:h-screen overflow-y-auto z-20`}>
        <div className="p-6 hidden md:block">
          <div className="font-semibold text-slate-900 text-base">Schachturnier</div>
          <div className="text-xs text-slate-400 mt-0.5">Saison 2026/27</div>
        </div>
        <div className="px-3 py-2 space-y-0.5">
          {navItems.map(item => {
            const aktiv = aktiveAnsicht === item.id;
            return (
              <button
                key={item.id}
                onClick={() => gehezu(item.id)}
                className={`w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-lg text-left text-sm border-l-[3px] transition-colors ${aktiv ? 'font-semibold' : 'font-medium text-slate-600 border-transparent hover:bg-slate-50'}`}
                style={aktiv ? { background: '#EEF4F2', color: FARBE_AKZENT_DUNKEL, borderColor: FARBE_AKZENT } : {}}
              >
                <item.icon size={17} style={aktiv ? { color: FARBE_AKZENT } : undefined} className={aktiv ? '' : 'text-slate-400'} />
                {item.name}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 p-4 md:p-8 max-w-4xl w-full">
        {notice && <div className="mb-6"><Hinweisbanner notice={notice} onClose={() => setNotice(null)} /></div>}

        {aktiveAnsicht === 'start' && (
          <div className="space-y-6">
            <header>
              <h1 className="text-2xl font-semibold text-slate-900">Schachturnier</h1>
              <p className="text-slate-500 text-sm mt-0.5">Saison 2026/27</p>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Karte>
                <div className="text-xs font-medium text-slate-500">Aktuelle Runde</div>
                <div className={`${plexMono.className} text-3xl font-semibold text-slate-900 mt-2`}>{maxRunde || '–'}</div>
              </Karte>
              <Karte>
                <div className="text-xs font-medium text-slate-500">Anwesende Spieler</div>
                <div className={`${plexMono.className} text-3xl font-semibold text-slate-900 mt-2`}>{anwesendeSpieler.length}<span className="text-slate-400 text-lg">/{spielerList.length}</span></div>
              </Karte>
              <Karte>
                <div className="text-xs font-medium text-slate-500">Partien gespielt</div>
                <div className={`${plexMono.className} text-3xl font-semibold text-slate-900 mt-2`}>{gespielteImRunde}<span className="text-slate-400 text-lg">/{aktuellePartien.length}</span></div>
              </Karte>
            </div>

            <Karte className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-500">Nächster Schritt</div>
                <p className="text-slate-900 mt-1">
                  {maxRunde === 0 && 'Anwesenheit festlegen und die erste Runde auslosen.'}
                  {maxRunde > 0 && offenePartien > 0 && `Noch ${offenePartien} Ergebnis${offenePartien === 1 ? '' : 'se'} in Runde ${maxRunde} eintragen.`}
                  {maxRunde > 0 && offenePartien === 0 && `Alle Ergebnisse der Runde ${maxRunde} sind eingetragen.`}
                </p>
              </div>
              <button onClick={() => gehezu('runde')} className={btnPrimary} style={{ background: FARBE_AKZENT }}>
                Zur aktuellen Runde <ArrowRight size={16} />
              </button>
            </Karte>
          </div>
        )}

        {aktiveAnsicht === 'runde' && (
          <div className="space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">
                {maxRunde === 0 ? 'Vorbereitung' : `Runde ${maxRunde}`}
              </h1>
              <button onClick={auslosenKlick} disabled={loading} className={btnPrimary} style={{ background: FARBE_AKZENT }}>
                {aktuellePartien.length > 0 ? 'Paarungen neu berechnen' : 'Paarungen berechnen'}
              </button>
            </header>

            <Karte>
              <h2 className="font-semibold text-slate-900 mb-4 text-sm">Anwesenheit</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                {spielerList.map(sp => (
                  <label key={sp.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-b-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sp.anwesend}
                      onChange={() => toggleAnwesenheit(sp.id, sp.anwesend)}
                      className="w-4 h-4 rounded accent-[#2F6153]"
                    />
                    <span className={`text-sm flex-1 ${sp.anwesend ? 'text-slate-900' : 'text-slate-400'}`}>{sp.name}</span>
                    <GruppenBadge gruppe={sp.gruppe} />
                  </label>
                ))}
                {spielerList.length === 0 && <LeererZustand text="Noch keine Spieler angelegt." />}
              </div>
            </Karte>

            <div className="space-y-4">
              {aktuellePartien.map(p => {
                const w = getSpieler(p.weiss_id);
                const s = getSpieler(p.schwarz_id);

                if (!p.schwarz_id || p.ergebnis === 'FREISPIEL') {
                  return (
                    <Karte key={p.id} className="flex items-center justify-between" style={{ background: '#FBF3E2', borderColor: '#EBD6A6' }}>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8A6116' }}>Freispiel</div>
                        <div className="text-lg font-semibold text-slate-900 mt-0.5">{w?.name}</div>
                      </div>
                      <span className="px-3 py-1 rounded-md text-sm font-semibold" style={{ background: '#F3E1B8', color: '#8A6116' }}>+1 Punkt</span>
                    </Karte>
                  );
                }

                const wiederholt = anzahlBegegnungen(partienList, p.weiss_id, p.schwarz_id, p.id) > 0;

                return (
                  <Karte key={p.id} className="space-y-4">
                    {wiederholt && (
                      <div className="text-xs px-2 py-1 rounded-md inline-block" style={{ background: '#FBF3E2', color: '#8A6116' }}>
                        Diese beiden haben bereits gegeneinander gespielt.
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">{w?.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <FarbSchachfeld farbe="Weiß" />
                          {w && <GruppenBadge gruppe={w.gruppe} />}
                        </div>
                      </div>
                      <span className="text-sm text-slate-400 shrink-0">gegen</span>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-slate-900">{s?.name}</div>
                        <div className="flex items-center gap-2 mt-1 justify-end">
                          {s && <GruppenBadge gruppe={s.gruppe} />}
                          <FarbSchachfeld farbe="Schwarz" />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleErgebnis(p.id, '1-0')}
                        className="flex-1 py-3 rounded-lg font-semibold text-sm border transition-colors"
                        style={p.ergebnis === '1-0' ? { background: '#EAF6EF', borderColor: '#3F8361', color: '#256C43' } : { borderColor: '#CBD5E1', color: '#475569' }}
                      >
                        Weiß gewinnt
                      </button>
                      <button
                        onClick={() => handleErgebnis(p.id, '0.5-0.5')}
                        className="flex-1 py-3 rounded-lg font-semibold text-sm border transition-colors"
                        style={p.ergebnis === '0.5-0.5' ? { background: '#F1F5F9', borderColor: '#94A3B8', color: '#334155' } : { borderColor: '#CBD5E1', color: '#475569' }}
                      >
                        Remis
                      </button>
                      <button
                        onClick={() => handleErgebnis(p.id, '0-1')}
                        className="flex-1 py-3 rounded-lg font-semibold text-sm border transition-colors"
                        style={p.ergebnis === '0-1' ? { background: '#EAF6EF', borderColor: '#3F8361', color: '#256C43' } : { borderColor: '#CBD5E1', color: '#475569' }}
                      >
                        Schwarz gewinnt
                      </button>
                    </div>

                    <div className="flex justify-between items-center pt-1">
                      {p.ergebnis && p.status === 'beendet' ? (
                        <span className="text-xs text-slate-400 flex items-center gap-1"><CircleCheck size={13} /> Ergebnis gespeichert</span>
                      ) : <span />}
                      <button onClick={() => pairingAendernOeffnen(p)} className={btnGhostSmall} style={{ color: FARBE_AKZENT }}>
                        Paarung ändern <ChevronRight size={14} />
                      </button>
                    </div>
                  </Karte>
                );
              })}
              {aktuellePartien.length === 0 && <LeererZustand text="Noch keine Paarungen für diese Runde." />}
            </div>
          </div>
        )}

        {aktiveAnsicht === 'tabelle' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold text-slate-900">Tabelle</h1>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[560px]">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="p-3 font-medium">Platz</th>
                    <th className="p-3 font-medium">Spieler</th>
                    <th className="p-3 font-medium text-center">Spiele</th>
                    <th className="p-3 font-medium text-center">Siege</th>
                    <th className="p-3 font-medium text-center">Remis</th>
                    <th className="p-3 font-medium text-center">Niederl.</th>
                    <th className="p-3 font-medium text-center">Punkte</th>
                    <th className="p-3 font-medium text-center text-slate-400">Buchholz</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortierteTabelle.map((sp, idx) => {
                    const st = stats[sp.id] || { spiele: 0, siege: 0, remis: 0, niederlagen: 0, freirunden: 0 };
                    return (
                      <tr key={sp.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => tabellenzeileZuHistorie(sp.id)}>
                        <td className="p-3 text-slate-400 font-medium">{idx + 1}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2 font-medium text-slate-900">{sp.name} <GruppenBadge gruppe={sp.gruppe} /></div>
                        </td>
                        <td className="p-3 text-center text-slate-600">{st.spiele}</td>
                        <td className="p-3 text-center text-slate-600">{st.siege}</td>
                        <td className="p-3 text-center text-slate-600">{st.remis}</td>
                        <td className="p-3 text-center text-slate-600">{st.niederlagen}</td>
                        <td className="p-3 text-center"><Punktzahl value={sp.punkte} /></td>
                        <td className={`${plexMono.className} p-3 text-center text-slate-400 text-xs`}>{sp.buchholz ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sortierteTabelle.length === 0 && <LeererZustand text="Noch keine Spieler angelegt." />}
            </div>
            <p className="text-xs text-slate-400">Bei Punktegleichstand entscheidet die Buchholz-Wertung. Zeile anklicken für die Spielhistorie.</p>
          </div>
        )}

        {aktiveAnsicht === 'spieler' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold text-slate-900">Spieler</h1>
            <div className="space-y-2">
              {spielerList.map(sp => {
                const st = stats[sp.id] || { spiele: 0, siege: 0, remis: 0, niederlagen: 0, freirunden: 0 };
                return (
                  <Karte key={sp.id} className="flex items-center justify-between py-3 border-l-4" style={{ borderLeftColor: GRUPPEN_FARBEN[sp.gruppe].dot }}>
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{sp.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <GruppenBadge gruppe={sp.gruppe} />
                          <span className="text-xs text-slate-400">{st.spiele} Partien</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Punktzahl value={sp.punkte} groß />
                      <button onClick={() => tabellenzeileZuHistorie(sp.id)} className={btnSecondary}>Details</button>
                    </div>
                  </Karte>
                );
              })}
              {spielerList.length === 0 && <LeererZustand text="Noch keine Spieler angelegt. Das geht unter „Verwaltung“." />}
            </div>
          </div>
        )}

        {aktiveAnsicht === 'spielhistorie' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold text-slate-900">Spielhistorie</h1>

            <div className="flex flex-col sm:flex-row gap-3">
              <select value={filterSpieler} onChange={e => setFilterSpieler(e.target.value === 'alle' ? 'alle' : Number(e.target.value))} className="p-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="alle">Alle Spieler</option>
                {spielerList.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
              <select value={filterRunde} onChange={e => setFilterRunde(e.target.value === 'alle' ? 'alle' : Number(e.target.value))} className="p-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="alle">Alle Runden</option>
                {alleRunden.map(r => <option key={r} value={r}>Runde {r}</option>)}
              </select>
            </div>

            {filterSpieler !== 'alle' && (() => {
              const sp = getSpieler(filterSpieler);
              const st = stats[filterSpieler];
              if (!sp || !st) return null;
              return (
                <Karte className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  <div><span className="text-slate-400">Spieler </span><span className="font-semibold text-slate-900">{sp.name}</span></div>
                  <div><span className="text-slate-400">Spiele </span><span className="font-medium">{st.spiele}</span></div>
                  <div><span className="text-slate-400">Siege </span><span className="font-medium">{st.siege}</span></div>
                  <div><span className="text-slate-400">Remis </span><span className="font-medium">{st.remis}</span></div>
                  <div><span className="text-slate-400">Niederlagen </span><span className="font-medium">{st.niederlagen}</span></div>
                  <div><span className="text-slate-400">Freirunden </span><span className="font-medium">{st.freirunden}</span></div>
                  <div><span className="text-slate-400">Punkte </span><Punktzahl value={sp.punkte} /></div>
                </Karte>
              );
            })()}

            <div className="space-y-2">
              {partienList
                .filter(p => (filterSpieler === 'alle' || p.weiss_id === filterSpieler || p.schwarz_id === filterSpieler))
                .filter(p => (filterRunde === 'alle' || p.runde === filterRunde))
                .sort((a, b) => b.runde - a.runde)
                .map(p => {
                  const w = getSpieler(p.weiss_id);
                  const s = getSpieler(p.schwarz_id);
                  const bezugsId = filterSpieler !== 'alle' ? filterSpieler : p.weiss_id;
                  const { text, farbe } = ergebnisFuerSpieler(p, bezugsId as number);
                  return (
                    <Karte key={p.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <span className={`${plexMono.className} text-xs text-slate-400 w-16 shrink-0`}>Runde {p.runde}</span>
                        <span className="text-sm text-slate-900">
                          {w?.name} {s ? <>– {s.name}</> : <span className="italic text-slate-400">(Freispiel)</span>}
                        </span>
                      </div>
                      <span className={`text-sm font-medium ${farbe}`}>{text}</span>
                    </Karte>
                  );
                })}
              {partienList.length === 0 && <LeererZustand text="Es wurden noch keine Partien gespielt." />}
            </div>
          </div>
        )}

        {aktiveAnsicht === 'verwaltung' && (
          <div className="space-y-8">
            <h1 className="text-2xl font-semibold text-slate-900">Verwaltung</h1>

            <section className="space-y-3">
              <h2 className="font-semibold text-slate-900 text-sm">Spieler verwalten</h2>
              <Karte>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-slate-500">Name</label>
                    <input value={neuerSpielerName} onChange={e => setNeuerSpielerName(e.target.value)} className="w-full mt-1 p-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Name des Spielers" />
                  </div>
                  <div className="sm:w-44">
                    <label className="text-xs font-medium text-slate-500">Gruppe</label>
                    <select value={neuerSpielerGruppe} onChange={e => setNeuerSpielerGruppe(e.target.value as Gruppe)} className="w-full mt-1 p-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                      <option>Leicht</option><option>Mittel</option><option>Schwer</option>
                    </select>
                  </div>
                  <button onClick={addSpieler} className={btnPrimary} style={{ background: FARBE_AKZENT }}>Hinzufügen</button>
                </div>
              </Karte>
              <div className="space-y-2">
                {spielerList.map(sp => (
                  <Karte key={sp.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-slate-900">{sp.name}</span>
                      <GruppenBadge gruppe={sp.gruppe} />
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => editSpielerOeffnen(sp)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><Pencil size={16} /></button>
                      <button onClick={() => loeschenKlick(sp)} className="p-2 text-[#B3261E] hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  </Karte>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold text-slate-900 text-sm">Anwesenheit korrigieren</h2>
              <Karte className="flex items-center justify-between">
                <p className="text-sm text-slate-600">Die Anwesenheitsliste für die laufende Runde wird auf der Seite „Aktuelle Runde“ geführt.</p>
                <button onClick={() => gehezu('runde')} className={btnSecondary}>Öffnen</button>
              </Karte>
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold text-slate-900 text-sm">Runden &amp; Ergebnisse korrigieren</h2>
              <Karte>
                <select value={verwaltungRunde} onChange={e => setVerwaltungRunde(Number(e.target.value))} className="p-2.5 border border-slate-300 rounded-lg text-sm font-medium bg-white">
                  {alleRunden.map(r => <option key={r} value={r}>Runde {r}</option>)}
                </select>
                {alleRunden.length === 0 && <p className="text-sm text-slate-400 italic mt-3">Es liegen noch keine Runden vor.</p>}
              </Karte>
              <div className="space-y-2">
                {partienList.filter(p => p.runde === verwaltungRunde).map(p => {
                  const w = getSpieler(p.weiss_id);
                  const s = getSpieler(p.schwarz_id);
                  if (!p.schwarz_id || p.ergebnis === 'FREISPIEL') {
                    return (
                      <Karte key={p.id} className="flex justify-between items-center py-3" style={{ background: '#FBF3E2', borderColor: '#EBD6A6' }}>
                        <span className="text-sm"><span className="font-semibold uppercase text-xs mr-2" style={{ color: '#8A6116' }}>Freispiel</span>{w?.name}</span>
                      </Karte>
                    );
                  }
                  return (
                    <Karte key={p.id} className="space-y-3 py-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-slate-900">{w?.name} <span className="text-slate-400 font-normal">gegen</span> {s?.name}</span>
                        <button onClick={() => pairingAendernOeffnen(p)} className={btnGhostSmall} style={{ color: FARBE_AKZENT }}>Paarung ändern</button>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleErgebnis(p.id, '1-0')} className={`flex-1 py-2 rounded-lg text-xs font-semibold border ${p.ergebnis === '1-0' ? 'text-white' : 'text-slate-600 border-slate-300'}`} style={p.ergebnis === '1-0' ? { background: FARBE_AKZENT, borderColor: FARBE_AKZENT } : {}}>Weiß gewinnt</button>
                        <button onClick={() => handleErgebnis(p.id, '0.5-0.5')} className={`flex-1 py-2 rounded-lg text-xs font-semibold border ${p.ergebnis === '0.5-0.5' ? 'text-white bg-slate-500 border-slate-500' : 'text-slate-600 border-slate-300'}`}>Remis</button>
                        <button onClick={() => handleErgebnis(p.id, '0-1')} className={`flex-1 py-2 rounded-lg text-xs font-semibold border ${p.ergebnis === '0-1' ? 'text-white' : 'text-slate-600 border-slate-300'}`} style={p.ergebnis === '0-1' ? { background: FARBE_AKZENT, borderColor: FARBE_AKZENT } : {}}>Schwarz gewinnt</button>
                      </div>
                    </Karte>
                  );
                })}
                {alleRunden.length > 0 && partienList.filter(p => p.runde === verwaltungRunde).length === 0 && <LeererZustand text="Keine Partien in dieser Runde." />}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold text-slate-900 text-sm">Daten überprüfen</h2>
              <Karte className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Spieler insgesamt</span><span className="font-medium">{spielerList.length}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Offene Partien insgesamt</span><span className="font-medium">{partienList.filter(p => p.status === 'offen').length}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Gespielte Runden</span><span className="font-medium">{alleRunden.length}</span></div>
              </Karte>
            </section>
          </div>
        )}

        {aktiveAnsicht === 'einstellungen' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold text-slate-900">Einstellungen</h1>
            <section className="space-y-3">
              <h2 className="font-semibold text-slate-900 text-sm">Saison</h2>
              <Karte style={{ background: '#FBEAEC', borderColor: '#F0C4CA' }}>
                <h3 className="font-semibold flex items-center gap-2" style={{ color: '#8E2733' }}><AlertTriangle size={18} /> Saison zurücksetzen</h3>
                <p className="text-sm mt-2" style={{ color: '#8E2733' }}>
                  Damit werden alle Ergebnisse, Paarungen, Punkte und Spielhistorien dieser Saison gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden.
                </p>
                <p className="text-sm mt-3" style={{ color: '#8E2733' }}>Gib zur Bestätigung exakt ein: <span className={`${plexMono.className} font-semibold`}>SchachturnierEnde</span></p>
                <div className="flex flex-col sm:flex-row gap-3 mt-3">
                  <input value={loeschBestaetigung} onChange={e => setLoeschBestaetigung(e.target.value)} placeholder="SchachturnierEnde" className="flex-1 p-2.5 border rounded-lg text-sm" style={{ borderColor: '#F0C4CA' }} />
                  <button
                    disabled={loeschBestaetigung !== 'SchachturnierEnde'}
                    onClick={async () => {
                      await supabase.from('partien').delete().neq('id', 0);
                      await supabase.from('spieler').update({ punkte: 0, buchholz: 0 }).neq('id', 0);
                      setLoeschBestaetigung('');
                      await loadData();
                      setNotice({ ton: 'erfolg', text: 'Die Saison wurde zurückgesetzt.' });
                    }}
                    className={btnDanger}
                  >
                    Zurücksetzen
                  </button>
                </div>
              </Karte>
            </section>
          </div>
        )}
      </main>

      {editSpieler && (
        <Modal titel="Spieler bearbeiten" onClose={() => setEditSpieler(null)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full mt-1 p-2.5 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Gruppe</label>
              <select value={editGruppe} onChange={e => setEditGruppe(e.target.value as Gruppe)} className="w-full mt-1 p-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                <option>Leicht</option><option>Mittel</option><option>Schwer</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className={btnSecondary} onClick={() => setEditSpieler(null)}>Abbrechen</button>
            <button className={btnPrimary} style={{ background: FARBE_AKZENT }} onClick={editSpielerSpeichern}>Speichern</button>
          </div>
        </Modal>
      )}

      {pairingChangeFor && (() => {
        const w = getSpieler(pairingChangeFor.weiss_id);
        const kandidaten = spielerList.filter(sp =>
          sp.id !== pairingChangeFor.weiss_id &&
          (sp.id === pairingChangeFor.schwarz_id || sp.anwesend) &&
          !partienList.some(p => p.runde === pairingChangeFor.runde && p.id !== pairingChangeFor.id && (p.weiss_id === sp.id || p.schwarz_id === sp.id))
        );
        const rematch = neuerGegnerId ? anzahlBegegnungen(partienList, pairingChangeFor.weiss_id, neuerGegnerId, pairingChangeFor.id) : 0;
        return (
          <Modal titel="Paarung ändern" onClose={() => setPairingChangeFor(null)}>
            <div className="space-y-3">
              <div className="text-sm text-slate-900 font-medium">{w?.name} <span className="text-slate-400 font-normal">gegen</span></div>
              <select value={neuerGegnerId ?? ''} onChange={e => setNeuerGegnerId(Number(e.target.value))} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                {kandidaten.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
              {rematch > 0 && (
                <div className="text-sm px-3 py-2 rounded-lg" style={{ background: '#FBF3E2', color: '#8A6116' }}>
                  Hinweis: Diese beiden Spieler haben bereits {rematch === 1 ? 'einmal' : `${rematch}-mal`} gegeneinander gespielt.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className={btnSecondary} onClick={() => setPairingChangeFor(null)}>Abbrechen</button>
              <button className={btnPrimary} style={{ background: FARBE_AKZENT }} onClick={pairingAendernSpeichern}>
                {rematch > 0 ? 'Änderung trotzdem übernehmen' : 'Speichern'}
              </button>
            </div>
          </Modal>
        );
      })()}

      {confirmState && <BestaetigungsDialog state={confirmState} onCancel={() => setConfirmState(null)} />}
    </div>
  );
}


