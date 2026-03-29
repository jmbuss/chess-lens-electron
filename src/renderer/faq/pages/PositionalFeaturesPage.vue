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

    <!-- ===================== WHAT'S COMING NEXT ===================== -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-primary">What's Coming Next</h2>

      <div class="space-y-3 text-sm text-secondary leading-relaxed">
        <p>
          The current positional features system gives a per-position snapshot and a game-level
          summary. Planned enhancements will add move-level explanations:
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
            <strong class="text-primary">Feature attribution service enhancements</strong>:
            Improved aggregation logic for the radar chart, including better handling of positions
            that are close to equal (where the current sign-based split between White and Black
            axes can be noisy).
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
