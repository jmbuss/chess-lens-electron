<template>
  <div class="max-w-3xl mx-auto px-6 py-10 space-y-8">
    <header>
      <h1 class="text-2xl font-bold text-primary font-display">Positional Features</h1>
      <p class="mt-2 text-sm text-secondary">
        How Chess Lens breaks down a position into structural components and summarizes them across
        a game.
      </p>
    </header>

    <!-- ===================== HOW IT WORKS TODAY ===================== -->
    <section class="space-y-6">
      <h2 class="text-lg font-semibold text-primary">How It Works Today</h2>

      <div class="space-y-4 text-sm text-secondary leading-relaxed">
        <h3 class="text-base font-medium text-primary">Position-Level Evaluation</h3>
        <p>
          For every position in the game, Chess Lens runs a separate Stockfish Classic engine
          that performs a static evaluation. Unlike the main Stockfish NNUE engine (which produces
          a single overall score), the classic engine breaks its evaluation into individual
          structural components. Each component has separate middlegame and endgame values for
          White and Black, measured in pawns.
        </p>
        <p>
          The app blends the middlegame and endgame values based on the game phase &mdash; early
          positions lean on the middlegame scores, late positions lean on the endgame scores.
        </p>

        <h3 class="text-base font-medium text-primary pt-2">What Each Component Measures</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-4 font-medium text-primary">Component</th>
                <th class="text-left py-2 font-medium text-primary">What it captures</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Material</td>
                <td class="py-2">Raw piece count advantage (queen = 9, rook = 5, etc.)</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Imbalance</td>
                <td class="py-2">Adjustments for piece interactions &mdash; e.g. bishop pair bonus, rook vs two minors</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Pawn Structure</td>
                <td class="py-2">Pawn chain health: isolated, doubled, backward, and connected pawns</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Passed Pawns</td>
                <td class="py-2">Bonus for pawns that have no opposing pawns blocking their path to promotion</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Knights</td>
                <td class="py-2">Knight placement quality: outposts, proximity to the center and enemy king</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Bishops</td>
                <td class="py-2">Bishop activity: open diagonals, fianchetto bonuses, bad bishops behind own pawns</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Rooks</td>
                <td class="py-2">Rook activity: open and semi-open files, rooks on the seventh rank</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Queens</td>
                <td class="py-2">Queen placement and activity relative to the position's structure</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Mobility</td>
                <td class="py-2">How many safe squares each side's pieces can reach &mdash; a cramped position scores low</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">King Safety</td>
                <td class="py-2">Pawn shelter, attacking pieces near the king, and exposure to checks</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Threats</td>
                <td class="py-2">Pieces and pawns that are attacked or hanging, pins, and forks</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Space</td>
                <td class="py-2">Territory controlled behind the pawn chain &mdash; more space means more room for pieces</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-primary">Winnable</td>
                <td class="py-2">A scaling factor that adjusts the total based on how likely the advantage is to be converted (e.g. opposite-colored bishop endgames are hard to win)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 class="text-base font-medium text-primary pt-2">The Radar Chart</h3>
        <p>
          The game summary radar chart aggregates positional features across all analyzed positions
          in the main line to give you a bird's-eye view of how each side's structural strengths
          played out over the course of the game. It shows six axes:
          <strong class="text-primary">Pawn Structure</strong> (combining pawns and passed pawns),
          <strong class="text-primary">Space</strong>,
          <strong class="text-primary">Mobility</strong>,
          <strong class="text-primary">King Safety</strong>,
          <strong class="text-primary">Threats</strong>, and
          <strong class="text-primary">Imbalance</strong>.
          Material is shown separately rather than as a radar axis because its scale dominates the
          other components.
        </p>

        <h3 class="text-base font-medium text-primary pt-2">Noise Reduction</h3>
        <p>
          Not every position contributes equally to the game summary. Two mechanisms filter out
          noise:
        </p>
        <ul class="list-disc list-inside space-y-1.5 pl-1">
          <li>
            <strong class="text-primary">Eval-delta gating</strong>: Positions where the evaluation
            barely changed from the previous move (quiet recaptures, equal trades) are suppressed.
            Only positions with a meaningful evaluation shift contribute their full feature values.
          </li>
          <li>
            <strong class="text-primary">WDL volatility weighting</strong>: Positions in regions of
            the game where the expected outcome is fluctuating (strategically contested phases)
            carry more weight than positions in one-sided stretches. This is measured by the
            standard deviation of Expected Points values in a sliding window around each position.
          </li>
        </ul>
        <p>
          Positions where White has the advantage contribute to White's radar axes, and positions
          where Black has the advantage contribute to Black's. Each axis is normalized so the
          stronger side on that dimension scores 1.0 and the other side is relative to it.
        </p>
      </div>
    </section>

    <!-- ===================== RAW FEATURES & SIMILARITY ===================== -->
    <section class="space-y-6">
      <h2 class="text-lg font-semibold text-primary">Raw Features &amp; Similarity Search</h2>

      <div class="space-y-4 text-sm text-secondary leading-relaxed">
        <h3 class="text-base font-medium text-primary">Two Data Sources</h3>
        <p>
          Chess Lens captures two complementary views from the same Stockfish Classic evaluation:
        </p>
        <ul class="list-disc list-inside space-y-1.5 pl-1">
          <li>
            <strong class="text-primary">Eval outputs</strong> &mdash; the weighted, phase-blended
            centipawn scores per category (Material, Mobility, King Safety, etc.) that power the
            radar chart above. These tell you <em>how much</em> each factor contributed to the
            position assessment.
          </li>
          <li>
            <strong class="text-primary">Eval raw inputs</strong> &mdash; the raw counts, flags,
            and intermediate values <em>before</em> they get weighted and blended. Things like
            &ldquo;White has 2 passed pawns,&rdquo; &ldquo;Black's knight mobility is 6 squares,&rdquo;
            or &ldquo;game phase is 95/128.&rdquo; These are stored as individual queryable columns
            (129 features total) and power similarity search.
          </li>
        </ul>

        <h3 class="text-base font-medium text-primary pt-2">Similarity Search</h3>
        <p>
          When you look for similar positions, Chess Lens selects a curated subset of 75 raw
          features (material counts, pawn structure, mobility, piece placement, king safety, threats,
          and space for both sides, plus global features like game phase). These are normalized to
          comparable scales and packed into a vector for nearest-neighbor search. Positions with
          similar raw characteristics &mdash; regardless of exact piece placement &mdash; will rank
          as similar.
        </p>
        <p>
          All 129 raw features are stored as individual database columns, so you can also query
          positions directly by specific criteria (e.g. &ldquo;find all positions where White has 2
          passed pawns and a trapped rook&rdquo;) as future query features are added.
        </p>
      </div>
    </section>

    <!-- ===================== WHAT'S COMING NEXT ===================== -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-primary">What's Coming Next</h2>

      <div class="space-y-3 text-sm text-secondary leading-relaxed">
        <p>
          Planned enhancements will add move-level explanations and richer position queries:
        </p>
        <ul class="list-disc list-inside space-y-1.5 pl-1">
          <li>
            <strong class="text-primary">Move-level feature attribution</strong>: For each move,
            show which structural components changed the most (e.g. "this move improved your
            mobility by +0.3 pawns but weakened king safety by &minus;0.2 pawns"). This will help
            explain <em>why</em> a move was classified as an inaccuracy or blunder, not just that
            it was one.
          </li>
          <li>
            <strong class="text-primary">Position queries</strong>: Search across all analyzed games
            for positions matching specific raw feature criteria &mdash; for example, finding every
            position where you had a space advantage but weak king safety.
          </li>
          <li>
            <strong class="text-primary">Detailed per-position breakdown</strong>: A visualization
            showing raw feature counts alongside their weighted contributions, giving a complete
            picture of what the evaluation function sees.
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
