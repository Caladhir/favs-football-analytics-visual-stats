// src/features/match/PredictionBox.jsx
/**
 * Minimalni "quick odds" widget (heuristika):
 * - Ako liga ima viši priority (league_priority manji broj = jača liga), malko nagnuti prema home timu.
 * - Ako recent H2H ima bolji skor za jednu stranu, dodaj +.
 * Ovo je placeholder do pravog modela (reference koje si poslao).
 */
export default function PredictionBox({ id, match, h2h }) {
  if (!match) return null;

  const base = 0.33; // neutral baseline
  let home = base,
    draw = base,
    away = base;

  // liga/priority
  if (match.league_priority !== null && match.league_priority !== undefined) {
    // heuristika: domaćin +0.04 kod "jačih"/nižih vrijednosti
    home += 0.04;
    away -= 0.02;
    draw -= 0.02;
  }

  // H2H bias
  const last5 = (h2h || []).slice(0, 5);
  const h2hHome =
    last5.filter(
      (m) =>
        (m.home_team === match.home_team &&
          (m.home_score ?? 0) > (m.away_score ?? 0)) ||
        (m.away_team === match.home_team &&
          (m.away_score ?? 0) > (m.home_score ?? 0))
    ).length || 0;
  const h2hAway =
    last5.filter(
      (m) =>
        (m.home_team === match.away_team &&
          (m.home_score ?? 0) > (m.away_score ?? 0)) ||
        (m.away_team === match.away_team &&
          (m.away_score ?? 0) > (m.home_score ?? 0))
    ).length || 0;

  if (h2hHome > h2hAway) home += 0.05;
  if (h2hAway > h2hHome) away += 0.05;

  // normalize
  const sum = home + draw + away;
  const pct = (x) => Math.round((x / sum) * 100);

  return (
    <section id={id} className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
        <h3 className="mb-3 text-lg font-semibold text-zinc-200">
          Prediction (beta)
        </h3>
        <div className="grid gap-2 md:grid-cols-3">
          <Odd label={match.home_team} value={pct(home)} />
          <Odd label="Draw" value={pct(draw)} />
          <Odd label={match.away_team} value={pct(away)} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Ovo je jednostavna heuristika. Kad budemo spremni s pravim modelom
          (npr. xG forma, ELO, Poisson), samo zamijenimo kalkulaciju unutar ove
          komponente.
        </p>
      </div>
    </section>
  );
}

function Odd({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-3">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="text-2xl font-bold text-zinc-100">{value}%</div>
      <div className="mt-2 h-2 w-full rounded-full bg-zinc-800">
        <div
          className="h-2 rounded-full bg-emerald-500"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
