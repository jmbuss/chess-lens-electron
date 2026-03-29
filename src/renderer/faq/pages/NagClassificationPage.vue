<template>
  <div class="max-w-3xl mx-auto px-6 py-10 space-y-8">
    <header>
      <h1 class="text-2xl font-bold text-primary font-display">Move Classifications</h1>
      <p class="mt-2 text-sm text-secondary">
        How Chess Lens evaluates the quality of every move in your game.
      </p>
    </header>

    <!-- ===================== HOW IT WORKS TODAY ===================== -->
    <section class="space-y-6">
      <h2 class="text-lg font-semibold text-primary">How It Works Today</h2>

      <div class="space-y-4 text-sm text-secondary leading-relaxed">
        <p>
          After each move is played, Chess Lens uses Stockfish to evaluate the position before and
          after the move. From those evaluations it computes a single number called
          <strong class="text-primary">Expected Points Loss (EPL)</strong>, which measures how much
          winning probability the move cost the player. A perfect move has an EPL of zero; a move
          that throws away a winning position has a large EPL.
        </p>

        <h3 class="text-base font-medium text-primary pt-2">Expected Points</h3>
        <p>
          Stockfish reports Win / Draw / Loss probabilities for every position (values from 0 to
          1000). Chess Lens converts these into a single Expected Points value between 0 and 1,
          from White's perspective:
        </p>
        <p class="font-mono text-xs bg-muted px-3 py-2 rounded">
          EP = (Win + Draw / 2) / 1000
        </p>
        <p>
          An EP of 1.0 means White is certain to win; 0.0 means White is certain to lose; 0.5 is
          dead equal.
        </p>

        <h3 class="text-base font-medium text-primary pt-2">Expected Points Loss</h3>
        <p>
          EPL is the drop in Expected Points caused by the move, measured from the mover's
          perspective. If White plays a move that drops EP from 0.70 to 0.55, White's EPL is 0.15.
          If Black plays a move that shifts EP from 0.40 to 0.50 (which is worse for Black), Black's
          EPL is 0.10. A move that improves the position has an EPL of zero (improving moves are
          never penalized).
        </p>

        <h3 class="text-base font-medium text-primary pt-2">Classification Thresholds</h3>
        <p>
          Each move is assigned one of the following labels based on its EPL and whether it was the
          engine's top recommendation:
        </p>

        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-4 font-medium text-primary">Classification</th>
                <th class="text-left py-2 pr-4 font-medium text-primary">Symbol</th>
                <th class="text-left py-2 font-medium text-primary">Rule</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4 font-medium text-nag-blunder">Blunder</td>
                <td class="py-2 pr-4 font-mono">??</td>
                <td class="py-2">EPL &ge; 0.20 &mdash; a move that throws away at least 20% winning probability</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-nag-mistake">Mistake</td>
                <td class="py-2 pr-4 font-mono">?</td>
                <td class="py-2">EPL &ge; 0.10 &mdash; a significant loss in winning chances</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-nag-dubious">Inaccuracy</td>
                <td class="py-2 pr-4 font-mono">?!</td>
                <td class="py-2">EPL &ge; 0.05 &mdash; a small but measurable slip</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-nag-good">Best</td>
                <td class="py-2 pr-4">&mdash;</td>
                <td class="py-2">EPL &le; 0 and the move matches the engine's top recommendation</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-nag-good">Excellent</td>
                <td class="py-2 pr-4">&mdash;</td>
                <td class="py-2">EPL &lt; 0.02 &mdash; practically no winning probability lost</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-medium text-nag-good">Good</td>
                <td class="py-2 pr-4 font-mono">!</td>
                <td class="py-2">EPL &lt; 0.05 &mdash; a solid move with only a tiny cost</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 text-secondary">Neutral</td>
                <td class="py-2 pr-4">&mdash;</td>
                <td class="py-2">Everything else &mdash; a reasonable move that doesn't fall into the categories above</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 text-nag-book">Book Move</td>
                <td class="py-2 pr-4">&mdash;</td>
                <td class="py-2">The position is still within the opening book; no EPL classification is applied</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          The thresholds above follow the Expected Points model used by Chess.com. Classifications
          are checked in order from worst to best: a move with EPL of 0.25 is a Blunder, not a
          Mistake, because the Blunder threshold is checked first.
        </p>

        <h3 class="text-base font-medium text-primary pt-2">Best Move</h3>
        <p>
          A move is labeled <strong class="text-primary">Best</strong> only when two conditions
          are met: the EPL is zero or negative (the move didn't lose any winning probability) and
          the move is exactly the move the engine would have played. Many moves can have very low
          EPL without being the engine's top choice &mdash; those are classified as Excellent or
          Good instead.
        </p>

        <h3 class="text-base font-medium text-primary pt-2">Book Moves</h3>
        <p>
          When a position is still within the opening book, the move is labeled as a Book Move and
          no EPL-based classification is applied. Book moves don't count toward accuracy or NAG
          statistics because they reflect preparation rather than over-the-board calculation.
        </p>
      </div>
    </section>

    <!-- ===================== WHAT'S COMING NEXT ===================== -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-primary">What's Coming Next</h2>

      <div class="space-y-3 text-sm text-secondary leading-relaxed">
        <p>
          The current classification system covers the core quality tiers. Future updates will add
          several special classifications that go beyond simple EPL thresholds:
        </p>
        <ul class="list-disc list-inside space-y-1.5 pl-1">
          <li>
            <strong class="text-primary">Brilliant</strong> (!!): A move that is exceptionally
            hard to find, sacrifices material or ignores an obvious threat, yet is objectively the
            best or nearly the best option.
          </li>
          <li>
            <strong class="text-primary">Great</strong>: A strong move in a complex position where
            many alternatives were significantly worse.
          </li>
          <li>
            <strong class="text-primary">Interesting</strong> (!?): A creative or unusual move that
            is not objectively the best but introduces complications that could be difficult for the
            opponent to navigate.
          </li>
          <li>
            <strong class="text-primary">Miss</strong>: A move played in a position where a
            decisive tactic was available but the player failed to find it.
          </li>
        </ul>
        <p>
          These classifications require additional rules beyond EPL (such as evaluating the
          complexity of the position, the available alternatives, and whether material was
          sacrificed) and are currently under development.
        </p>
      </div>
    </section>
  </div>
</template>
