import type { 
  AuslosungVorschlag, 
  EntityId, 
  MatchResult, 
  PairingOptions, 
  PaarungVorschau,
  Partie, 
  RankingEntry, 
  Spieler 
} from '@/types';

interface ScoreData { 
  punkte: number; 
  gegner: EntityId[]; 
}

export function resultPoints(result: MatchResult, color: 'white' | 'black'): number {
  if (result === '1-0') return color === 'white' ? 6 : 2;
  if (result === '0-1') return color === 'black' ? 6 : 2;
  if (result === '0.5-0.5') return 4;
  if (result === '1-0 (Freispiel)' || result === 'freispiel') return color === 'white' ? 4 : 0;
  if (result === 'entschuldigt') return color === 'white' ? 1 : 0;
  return 0;
}

export function calculateRankings(players: Spieler[], matches: Partie[]): RankingEntry[] {
  const scores = new Map<string, ScoreData>(
    players.map((player) => [String(player.id), { punkte: 0, gegner: [] }])
  );

  matches.forEach((match) => {
    if (match.status !== 'beendet' || !match.ergebnis) return;
    const white = scores.get(String(match.weiss_id));
    if (white) white.punkte += resultPoints(match.ergebnis, 'white');
    if (match.schwarz_id === null) return;
    const black = scores.get(String(match.schwarz_id));
    if (black) black.punkte += resultPoints(match.ergebnis, 'black');
    if (white) white.gegner.push(match.schwarz_id);
    if (black) black.gegner.push(match.weiss_id);
  });

  return players
    .map((player) => {
      const score = scores.get(String(player.id)) ?? { punkte: 0, gegner: [] };
      const buchholz = score.gegner.reduce<number>(
        (total, opponentId) => total + (scores.get(String(opponentId))?.punkte ?? 0),
        0
      );
      return { 
        ...player, 
        punkte: score.punkte, 
        buchholz, 
        rang: 0, 
        sonnebornBerger: 0, 
        direkteDuellPunkte: 0, 
        eloKorrektur: 0 
      };
    })
    .sort((a, b) => b.punkte - a.punkte || b.buchholz - a.buchholz || a.name.localeCompare(b.name, 'de'))
    .map((player, index) => ({ ...player, rang: index + 1 }));
}

export function sortPlayers(players: Spieler[]): Spieler[] {
  return [...players].sort(
    (a, b) => b.punkte - a.punkte || b.buchholz - a.buchholz || a.name.localeCompare(b.name, 'de')
  );
}

function swissPairings(players: Spieler[], options: PairingOptions): Omit<Partie, 'id'>[] {
  const sorted = sortPlayers(players);
  const pairings: Omit<Partie, 'id'>[] = [];
  for (let index = 0; index < sorted.length; index += 2) {
    const white = sorted[index];
    const black = sorted[index + 1];
    pairings.push({ 
      runde: options.round, 
      datum: options.date, 
      weiss_id: white.id, 
      schwarz_id: black?.id ?? null, 
      ergebnis: black ? null : '1-0 (Freispiel)', 
      status: black ? 'offen' : 'beendet' 
    });
  }
  return pairings;
}

function roundRobinPairings(players: Spieler[], options: PairingOptions): Omit<Partie, 'id'>[] {
  if (players.length < 2) return swissPairings(players, options);
  const ordered = [...players];
  if (ordered.length % 2) ordered.push({ ...ordered[0], id: `bye-${options.round}` });
  const pairings: Omit<Partie, 'id'>[] = [];
  for (let index = 0; index < ordered.length / 2; index += 1) {
    const white = ordered[index];
    const black = ordered[ordered.length - index - 1];
    if (String(white.id).startsWith('bye-') || String(black.id).startsWith('bye-')) {
      const player = String(white.id).startsWith('bye-') ? black : white;
      pairings.push({ 
        runde: options.round, 
        datum: options.date, 
        weiss_id: player.id, 
        schwarz_id: null, 
        ergebnis: '1-0 (Freispiel)', 
        status: 'beendet' 
      });
    } else {
      pairings.push({ 
        runde: options.round, 
        datum: options.date, 
        weiss_id: white.id, 
        schwarz_id: black.id, 
        ergebnis: null, 
        status: 'offen' 
      });
    }
  }
  return pairings;
}

export function generatePairings(players: Spieler[], options: PairingOptions): Omit<Partie, 'id'>[] {
  const leagues = options.leagues ?? [];
  const leagueNames = leagues.length 
    ? leagues.sort((a, b) => a.reihenfolge - b.reihenfolge).map((league) => league.name) 
    : [...new Set(players.map((player) => player.gruppe || 'Leicht'))];

  return leagueNames.flatMap((leagueName) => {
    const leaguePlayers = players.filter(
      (player) => (player.gruppe || 'Leicht').toLowerCase() === leagueName.toLowerCase() && player.anwesend
    );
    const league = leagues.find((item) => item.name.toLowerCase() === leagueName.toLowerCase());
    return (league?.pairingStrategy ?? options.strategy ?? 'swiss') === 'round-robin' 
      ? roundRobinPairings(leaguePlayers, options) 
      : swissPairings(leaguePlayers, options);
  });
}

// Hilfsfunktion: Analysiert bisherige Farben & Freilose der Spieler
function erstelleSpielerStatistik(players: Spieler[], bisherigePartien: Partie[]) {
  const stats = new Map<EntityId, { weissCount: number; schwarzCount: number; hatFreilos: boolean }>();
  
  players.forEach(p => stats.set(p.id, { weissCount: 0, schwarzCount: 0, hatFreilos: false }));

  bisherigePartien.forEach(m => {
    if (m.weiss_id && stats.has(m.weiss_id)) {
      const s = stats.get(m.weiss_id)!;
      if (m.schwarz_id === null) s.hatFreilos = true;
      else s.weissCount++;
    }
    if (m.schwarz_id && stats.has(m.schwarz_id)) {
      const s = stats.get(m.schwarz_id)!;
      s.schwarzCount++;
    }
  });

  return stats;
}

export function generiereAuslosungsVorschlaege(
  anwesendeSpieler: Spieler[],
  bisherigePartien: Partie[] = []
): AuslosungVorschlag[] {
  const stats = erstelleSpielerStatistik(anwesendeSpieler, bisherigePartien);

  // Spieler nach Ligen & Punkten sortieren
  const sortierer = (a: Spieler, b: Spieler) => (b.punkte || 0) - (a.punkte || 0);
  
  const schwer = anwesendeSpieler.filter(s => (s.gruppe || 'Leicht').toLowerCase() === 'schwer').sort(sortierer);
  const mittel = anwesendeSpieler.filter(s => (s.gruppe || 'Leicht').toLowerCase() === 'mittel').sort(sortierer);
  const leicht = anwesendeSpieler.filter(s => (s.gruppe || 'Leicht').toLowerCase() === 'leicht').sort(sortierer);

  const schwerUngerade = schwer.length % 2 !== 0;
  const mittelUngerade = mittel.length % 2 !== 0;
  const leichtUngerade = leicht.length % 2 !== 0;

  if (!schwerUngerade && !mittelUngerade && !leichtUngerade) {
    return [];
  }

  const vorschlaege: AuslosungVorschlag[] = [];

  // VORSCHLAG 1: Cross-Match / Aufrücken (Schwer & Mittel ausgleichen)
  if (schwerUngerade && mittel.length > 0) {
    const aufrueckerMittel = mittel[0]; // Bester Mittel-Spieler
    const gegnerSchwer = schwer[schwer.length - 1]; // Passender Gegner aus Schwer

    const mStats = stats.get(aufrueckerMittel.id);

    // Farbwahl begründen
    const aufrueckerKriegtWeiss = (mStats?.schwarzCount || 0) >= (mStats?.weissCount || 0);
    const weissName = aufrueckerKriegtWeiss ? aufrueckerMittel.name : gegnerSchwer.name;
    const schwarzName = aufrueckerKriegtWeiss ? gegnerSchwer.name : aufrueckerMittel.name;

    const vorschauPaarung: PaarungVorschau = {
      weissName,
      schwarzName,
      liga: 'Cross-Match (Schwer vs. Mittel)',
      begruendung: `${aufrueckerMittel.name} (Mittel, ${aufrueckerMittel.punkte || 0} Pkt.) rückt auf. Farbausgleich: ${weissName} hat bisher mehr Schwarz gespielt.`
    };

    vorschlaege.push({
      id: 'cross-match-schwer-mittel',
      titel: 'Sonderduell: Schwer vs. Mittel (Kein Freilos in Top-Ligen)',
      beschreibung: 'Der führende Mittel-Spieler fordert die Schwere Liga heraus. Alle Spieler spielen!',
      empfohlen: true,
      begruendungGesamt: `Vermeidet Spielfrei. ${aufrueckerMittel.name} führt die Liga Mittel an und wird für ein Top-Match hochgestuft.`,
      paarungen: [vorschauPaarung],
      anpassungen: {
        mittelVerschobenZuSchwer: 1,
        freilosLigen: leichtUngerade ? ['Leicht'] : []
      }
    });
  }

  // VORSCHLAG 2: Klassisch mit Freilos & transparenter Freilos-Begründung
  const freilosPaarungen: PaarungVorschau[] = [];
  const freilosLigen: string[] = [];

  const ligen = [
    { name: 'Schwer', ungerade: schwerUngerade, liste: schwer },
    { name: 'Mittel', ungerade: mittelUngerade, liste: mittel },
    { name: 'Leicht', ungerade: leichtUngerade, liste: leicht }
  ];

  ligen.forEach(l => {
    if (l.ungerade && l.liste.length > 0) {
      freilosLigen.push(l.name);
      
      // Freilos bevorzugt an jemanden geben, der noch KEIN Freilos hatte & am wenigsten Punkte hat
      const kandidat = [...l.liste].reverse().find(s => !stats.get(s.id)?.hatFreilos) || l.liste[l.liste.length - 1];
      
      freilosPaarungen.push({
        weissName: kandidat.name,
        schwarzName: null,
        liga: l.name,
        begruendung: `${kandidat.name} erhält Freilos (1 Pkt). Grund: Hatte diese Saison bisher noch kein Freilos.`
      });
    }
  });

  vorschlaege.push({
    id: 'klassisch-freilos',
    titel: 'Klassisch (Strenge Ligentrennung mit Freilos)',
    beschreibung: 'Keine Duelle zwischen verschiedenen Ligen. Betroffene Spieler erhalten 1 Punkt kampflos.',
    empfohlen: !schwerUngerade,
    begruendungGesamt: 'Ligen bleiben strikt unter sich. Freilose werden fair an Spieler ohne bisheriges Freilos vergeben.',
    paarungen: freilosPaarungen,
    anpassungen: {
      freilosLigen
    }
  });

  return vorschlaege;
}