export type EntityId = string | number;
export type LigaName = string;
export type MatchResult = '1-0' | '0.5-0.5' | '0-1' | '1-0 (Freispiel)' | 'freispiel' | 'entschuldigt' | 'unentschuldigt' | null;
export type MatchStatus = 'offen' | 'beendet';
export type PairingStrategy = 'swiss' | 'round-robin';
export type TabId = 'aktuelle-runde' | 'vergangene-runden' | 'tabelle' | 'spieler' | 'anwesenheit' | 'einstellungen';

export interface Spieler { id: EntityId; name: string; punkte: number; buchholz: number; gruppe: LigaName; anwesend: boolean; dwz?: number | null; }
export interface Partie { id: EntityId; runde: number; datum: string | null; weiss_id: EntityId; schwarz_id: EntityId | null; ergebnis: MatchResult; status: MatchStatus; isCompleted?: boolean; }
export interface TurnierLiga { id: string; name: string; reihenfolge: number; pairingStrategy?: PairingStrategy; }
export interface RankingEntry extends Spieler { rang: number; sonnebornBerger: number; direkteDuellPunkte: number; eloKorrektur: number; }
export interface PairingOptions { round: number; date: string; strategy?: PairingStrategy; leagues?: TurnierLiga[]; }
export interface NewPlayerInput { name: string; gruppe: LigaName; punkte: number; buchholz: number; anwesend: boolean; }
export interface StatusMessage { type: 'success' | 'error'; text: string; }
export interface AuslosungVorschlag {
  id: string;
  titel: string;
  beschreibung: string;
  empfohlen: boolean;
  // Beschreibt, wer in dieser Runde wo mitspielt
  anpassungen: {
    schwerVerschobenZuMittel?: number;
    mittelVerschobenZuSchwer?: number;
    mittelVerschobenZuLeicht?: number;
    leichtVerschobenZuMittel?: number;
    crossMatchSchwerMittel?: boolean;
    freilosLigen: string[]; // Ligen, die ein Freilos erhalten
  };
}
export interface PaarungVorschau {
  weissName: string;
  schwarzName: string | null; // null = Spielfrei/Freilos
  liga: string;
  begruendung: string; // z.B. "Farbausgleich für Max (hatte 2x Schwarz); erstes Duell"
}

export interface AuslosungVorschlag {
  id: string;
  titel: string;
  beschreibung: string;
  empfohlen: boolean;
  begruendungGesamt: string; // Gesamterklärung der Strategie
  paarungen: PaarungVorschau[]; // Konkrete Namensliste aller Duelle
  anpassungen: {
    schwerVerschobenZuMittel?: number;
    mittelVerschobenZuSchwer?: number;
    mittelVerschobenZuLeicht?: number;
    leichtVerschobenZuMittel?: number;
    crossMatchSchwerMittel?: boolean;
    freilosLigen: string[];
  };
}