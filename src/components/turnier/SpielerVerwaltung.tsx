'use client';

import React, { useState } from 'react';
import { UserPlus, Trash2, Users, History, AlertTriangle, Search } from 'lucide-react';
import type { EntityId, Partie, Spieler } from '@/types';
import { Button } from '@/components/ui/Button';

interface SpielerVerwaltungProps {
  spielerList: Spieler[];
  allMatches: Partie[];
  playerMap: Map<EntityId, Spieler>;
  onAddSpieler: (neuerSpieler: Omit<Spieler, 'id'>) => void;
  onRemoveSpieler: (id: EntityId) => void;
  onUpdateSpieler: (id: EntityId, updates: Partial<Spieler>) => void;
  isAdmin: boolean;
}

type Liga = 'Schwer' | 'Mittel' | 'Leicht';

function getMatchPoints(match: Partie, playerId: EntityId): number {
  if (match.schwarz_id === null) return match.weiss_id === playerId ? 1 : 0;
  if (match.ergebnis === '0.5-0.5') return 0.5;
  if (match.ergebnis === '1-0') return match.weiss_id === playerId ? 1 : 0;
  if (match.ergebnis === '0-1') return match.schwarz_id === playerId ? 1 : 0;
  return 0;
}

function getResultLabel(match: Partie, playerId: EntityId): string {
  if (match.schwarz_id === null) return 'Freilos';
  if (!match.ergebnis || match.status !== 'beendet') return 'Offen';
  const points = getMatchPoints(match, playerId);
  return points === 1 ? 'Sieg' : points === 0.5 ? 'Remis' : 'Niederlage';
}

function getPlayerMatches(matches: Partie[], playerId: EntityId): Partie[] {
  return matches
    .filter((match) => match.weiss_id === playerId || match.schwarz_id === playerId)
    .sort((a, b) => a.runde - b.runde || String(a.id).localeCompare(String(b.id)));
}

export function SpielerVerwaltung({
  spielerList,
  allMatches,
  playerMap,
  onAddSpieler,
  onRemoveSpieler,
  onUpdateSpieler,
  isAdmin,
}: SpielerVerwaltungProps) {
  // Unter-Reiter: 'verwalten' oder 'historie'
  const [activeSubTab, setActiveSubTab] = useState<'verwalten' | 'historie'>(isAdmin ? 'verwalten' : 'historie');

  // Formular-State für neuen Spieler
  const [name, setName] = useState('');
  const [gruppe, setGruppe] = useState<Liga>('Mittel');
  const [dwz, setDwz] = useState<string>('');

  // Suchfilter & Lösch-Bestätigung
  const [searchTerm, setSearchTerm] = useState('');
  const [spielerToLoeoschen, setSpielerToLoeoschen] = useState<Spieler | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<EntityId | ''>(spielerList[0]?.id ?? '');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedDwz = parseInt(dwz, 10);
    const validDwz = dwz.trim() && !isNaN(parsedDwz) ? parsedDwz : null;

    onAddSpieler({
      name: name.trim(),
      gruppe,
      dwz: validDwz,
      punkte: 0,
      buchholz: 0,
      anwesend: true,
    });

    // Formular zurücksetzen
    setName('');
    setDwz('');
  };

  const confirmLoeschen = () => {
    if (spielerToLoeoschen) {
      onRemoveSpieler(spielerToLoeoschen.id);
      setSpielerToLoeoschen(null);
    }
  };

  const gefilterteSpieler = spielerList.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const selectedPlayer = spielerList.find((spieler) => spieler.id === selectedPlayerId) ?? null;
  const selectedMatches = selectedPlayer ? getPlayerMatches(allMatches, selectedPlayer.id) : [];
  const completedMatches = selectedMatches.filter((match) => match.status === 'beendet' && match.ergebnis);
  const playedMatches = completedMatches.filter((match) => match.schwarz_id !== null);
  const wins = playedMatches.filter((match) => getMatchPoints(match, selectedPlayer!.id) === 1).length;
  const draws = playedMatches.filter((match) => getMatchPoints(match, selectedPlayer!.id) === 0.5).length;
  const losses = playedMatches.filter((match) => getMatchPoints(match, selectedPlayer!.id) === 0).length;
  const whiteMatches = playedMatches.filter((match) => match.weiss_id === selectedPlayer?.id).length;
  const blackMatches = playedMatches.filter((match) => match.schwarz_id === selectedPlayer?.id).length;
  const receivedBye = completedMatches.filter((match) => match.schwarz_id === null && match.weiss_id === selectedPlayer?.id && (match.ergebnis === 'freispiel' || match.ergebnis === '1-0 (Freispiel)')).length;

  const handleLigaChange = (spieler: Spieler, neueLiga: Liga) => {
    if (spieler.gruppe !== neueLiga) onUpdateSpieler(spieler.id, { gruppe: neueLiga });
  };

  const handleDwzUpdate = (spieler: Spieler, value: string) => {
    const parsedDwz = parseInt(value, 10);
    onUpdateSpieler(spieler.id, { dwz: value.trim() && !isNaN(parsedDwz) ? parsedDwz : null });
  };

  return (
    <div className="space-y-6">
      {/* 1. Sub-Tabs Navigation */}
      <div className="flex border-b border-slate-200">
        {isAdmin && <button
          onClick={() => setActiveSubTab('verwalten')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            activeSubTab === 'verwalten'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="h-4 w-4" />
          Spieler hinzufügen / entfernen
        </button>}

        <button
          onClick={() => setActiveSubTab('historie')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            activeSubTab === 'historie'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="h-4 w-4" />
          Spielerhistorie
        </button>
      </div>

      {/* 2. REITER: SPIELER HISTORIE */}
      {activeSubTab === 'historie' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Spieler auswählen</label>
            <select
              value={selectedPlayerId}
              onChange={(event) => setSelectedPlayerId(spielerList.find((spieler) => String(spieler.id) === event.target.value)?.id ?? '')}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-md"
            >
              <option value="">Bitte Spieler auswählen</option>
              {spielerList.map((spieler) => <option key={spieler.id} value={spieler.id}>{spieler.name}</option>)}
            </select>
          </div>

          {!selectedPlayer && <div className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">Bitte wähle einen Spieler aus.</div>}

          {selectedPlayer && <>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="text-xs font-semibold text-slate-600">Name
                  <input key={`name-${selectedPlayer.id}`} readOnly={!isAdmin} defaultValue={selectedPlayer.name} onBlur={(event) => { const value = event.target.value.trim(); if (isAdmin && value && value !== selectedPlayer.name) onUpdateSpieler(selectedPlayer.id, { name: value }); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">DWZ
                  <input key={`dwz-${selectedPlayer.id}-${selectedPlayer.dwz ?? 'leer'}`} readOnly={!isAdmin} type="number" defaultValue={selectedPlayer.dwz ?? ''} onBlur={(event) => { if (isAdmin) handleDwzUpdate(selectedPlayer, event.target.value); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">Gruppe
                  <select disabled={!isAdmin} value={selectedPlayer.gruppe || 'Leicht'} onChange={(event) => handleLigaChange(selectedPlayer, event.target.value as Liga)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="Schwer">Schwer</option><option value="Mittel">Mittel</option><option value="Leicht">Leicht</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['Absolvierte Spiele', playedMatches.length],
                ['Punkte', selectedPlayer.punkte],
                ['Buchholz', selectedPlayer.buchholz],
                ['Freispiele erhalten', receivedBye],
                ['Siege / Remis / Niederlagen', `${wins} / ${draws} / ${losses}`],
                ['Weiß-Spiele', whiteMatches],
                ['Schwarz-Spiele', blackMatches],
              ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold text-slate-900">{value}</div></div>)}
            </div>

            {selectedMatches.length === 0 ? <div className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">Noch keine Partien in dieser Saison absolviert</div> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs uppercase text-slate-500"><th className="px-4 py-3">Runde</th><th className="px-4 py-3">Datum</th><th className="px-4 py-3">Gegner</th><th className="px-4 py-3">Eigene Farbe</th><th className="px-4 py-3">Ergebnis</th><th className="px-4 py-3 text-right">Punkte nach der Runde</th></tr></thead><tbody className="divide-y divide-slate-100">{selectedMatches.map((match, index) => { const priorPoints = selectedMatches.slice(0, index).reduce((total, previous) => total + getMatchPoints(previous, selectedPlayer.id), 0); const opponentId = match.weiss_id === selectedPlayer.id ? match.schwarz_id : match.weiss_id; const opponent = opponentId === null ? null : playerMap.get(opponentId); const pointsAfterRound = priorPoints + getMatchPoints(match, selectedPlayer.id); return <tr key={match.id}><td className="px-4 py-3 font-medium">{match.runde}</td><td className="px-4 py-3 text-slate-500">{match.datum || '-'}</td><td className="px-4 py-3">{opponent?.name || 'Freilos'}</td><td className="px-4 py-3">{match.schwarz_id === null ? '-' : match.weiss_id === selectedPlayer.id ? 'Weiß' : 'Schwarz'}</td><td className="px-4 py-3">{getResultLabel(match, selectedPlayer.id)}</td><td className="px-4 py-3 text-right font-semibold">{pointsAfterRound}</td></tr>; })}</tbody></table></div>}
          </>}
        </div>
      )}

      {/* 3. REITER: SPIELER HINZUFÜGEN / ENTFERNEN */}
      {activeSubTab === 'verwalten' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Linke Spalte: Formular zum Hinzufügen */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <UserPlus className="h-5 w-5 text-amber-500" />
              Neuen Spieler anlegen
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Füge dem Turnier einen neuen Teilnehmer hinzu.
            </p>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Name des Spielers *
                </label>
                <input
                  type="text"
                  required
                  placeholder="z. B. Max Mustermann"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Start-Liga / Gruppe
                </label>
                <select
                  value={gruppe}
                  onChange={(e) => setGruppe(e.target.value as 'Schwer' | 'Mittel' | 'Leicht')}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="Schwer">Schwer</option>
                  <option value="Mittel">Mittel</option>
                  <option value="Leicht">Leicht</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  DWZ / Wertungszahl (Optional)
                </label>
                <input
                  type="number"
                  placeholder="z. B. 1650"
                  value={dwz}
                  onChange={(e) => setDwz(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <Button type="submit" className="w-full justify-center">
                Spieler hinzufügen
              </Button>
            </form>
          </div>

          {/* Rechte Spalte: Liste aller Spieler & Löschen */}
          <div className="space-y-4 lg:col-span-2">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h3 className="text-lg font-bold text-slate-900">
                Registrierte Spieler ({spielerList.length})
              </h3>

              {/* Suchfeld */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Spieler suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {gefilterteSpieler.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">
                Keine Spieler gefunden.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {gefilterteSpieler.map((spieler) => (
                  <div
                    key={spieler.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{spieler.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <select
                          value={spieler.gruppe || 'Leicht'}
                          onChange={(event) => handleLigaChange(spieler, event.target.value as Liga)}
                          className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700"
                          aria-label={`Liga von ${spieler.name}`}
                        >
                          <option value="Schwer">Schwer</option>
                          <option value="Mittel">Mittel</option>
                          <option value="Leicht">Leicht</option>
                        </select>
                        {spieler.dwz && <span>DWZ: {spieler.dwz}</span>}
                        <span>• {spieler.punkte || 0} Pkt.</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setSpielerToLoeoschen(spieler)}
                      title="Spieler entfernen"
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Sicherheitsabfrage vor dem Löschen */}
      {spielerToLoeoschen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-bold">Spieler wirklich entfernen?</h3>
            </div>

            <p className="text-sm text-slate-600">
              Möchtest du <strong>{spielerToLoeoschen.name}</strong> wirklich aus dem Turnier entfernen?
              {spielerToLoeoschen.punkte > 0 && (
                <span className="mt-2 block font-medium text-red-600">
                  Achtung: Dieser Spieler hat bereits {spielerToLoeoschen.punkte} Punkte erzielt!
                </span>
              )}
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => setSpielerToLoeoschen(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmLoeschen}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-red-700 transition"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}