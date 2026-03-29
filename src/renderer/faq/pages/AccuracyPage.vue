<template>
  <div class="max-w-3xl mx-auto px-6 py-10 space-y-8">
    <header>
      <h1 class="text-2xl font-bold text-primary font-display">Accuracy</h1>
      <p class="mt-2 text-sm text-secondary">
        How Chess Lens scores the quality of your play on a 0&ndash;100 scale.
      </p>
    </header>

    <!-- ===================== HOW IT WORKS TODAY ===================== -->
    <section class="space-y-6">
      <h2 class="text-lg font-semibold text-primary">How It Works Today</h2>

      <div class="space-y-4 text-sm text-secondary leading-relaxed">
        <h3 class="text-base font-medium text-primary">Per-Move Accuracy</h3>
        <p>
          Every non-book move in your game receives an accuracy score from 0 to 100. The score is
          derived from the move's <strong class="text-primary">Expected Points Loss (EPL)</strong>
          &mdash; the same signal used for move classification. A move that loses no winning
          probability scores 100; a move that throws away the game scores close to 0.
        </p>
        <p>
          The mapping from EPL to accuracy uses an exponential decay curve. Small losses barely
          affect the score, but once a move starts costing significant winning chances, the accuracy
          drops sharply. Here are some reference points:
        </p>

        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-6 font-medium text-primary">EPL</th>
                <th class="text-left py-2 pr-6 font-medium text-primary">Accuracy</th>
                <th class="text-left py-2 font-medium text-primary">Roughly equivalent to</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-6 font-mono">0.00</td>
                <td class="py-2 pr-6 font-mono">100%</td>
                <td class="py-2">Perfect &mdash; no winning probability lost</td>
              </tr>
              <tr>
                <td class="py-2 pr-6 font-mono">0.02</td>
                <td class="py-2 pr-6 font-mono">~92%</td>
                <td class="py-2">Excellent move</td>
              </tr>
              <tr>
                <td class="py-2 pr-6 font-mono">0.05</td>
                <td class="py-2 pr-6 font-mono">~80%</td>
                <td class="py-2">Borderline inaccuracy</td>
              </tr>
              <tr>
                <td class="py-2 pr-6 font-mono">0.10</td>
                <td class="py-2 pr-6 font-mono">~62%</td>
                <td class="py-2">Borderline mistake</td>
              </tr>
              <tr>
                <td class="py-2 pr-6 font-mono">0.20</td>
                <td class="py-2 pr-6 font-mono">~36%</td>
                <td class="py-2">Borderline blunder</td>
              </tr>
              <tr>
                <td class="py-2 pr-6 font-mono">0.50</td>
                <td class="py-2 pr-6 font-mono">~6%</td>
                <td class="py-2">Catastrophic blunder</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          Moves that <em>improve</em> the position (negative EPL) are treated as EPL = 0, so they
          always score 100. The accuracy calculation is entirely based on Stockfish's native
          Win/Draw/Loss probabilities, not raw centipawn evaluations.
        </p>

        <h3 class="text-base font-medium text-primary pt-2">Game Accuracy</h3>
        <p>
          Your game accuracy is the average of all your per-move accuracy scores along the main
          line. Only non-book moves where both the current and previous position have WDL data
          contribute to the average. Book moves are excluded because they reflect preparation
          rather than over-the-board play.
        </p>
        <p>
          Game accuracy is computed separately for White and Black, and updates incrementally as
          the analysis progresses &mdash; you can watch your score refine in real time as more
          positions are evaluated.
        </p>

        <h3 class="text-base font-medium text-primary pt-2">Reading the Accuracy Bar</h3>
        <p>
          The colored accuracy bar next to each player's name uses these thresholds:
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-6 font-medium text-primary">Accuracy</th>
                <th class="text-left py-2 font-medium text-primary">Color</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-6 font-mono">85% and above</td>
                <td class="py-2"><span class="inline-block w-3 h-3 rounded-full bg-green-500 mr-1.5 align-middle" /> Green &mdash; excellent play</td>
              </tr>
              <tr>
                <td class="py-2 pr-6 font-mono">70% &ndash; 84%</td>
                <td class="py-2"><span class="inline-block w-3 h-3 rounded-full bg-yellow-500 mr-1.5 align-middle" /> Yellow &mdash; solid play</td>
              </tr>
              <tr>
                <td class="py-2 pr-6 font-mono">55% &ndash; 69%</td>
                <td class="py-2"><span class="inline-block w-3 h-3 rounded-full bg-orange-500 mr-1.5 align-middle" /> Orange &mdash; room for improvement</td>
              </tr>
              <tr>
                <td class="py-2 pr-6 font-mono">Below 55%</td>
                <td class="py-2"><span class="inline-block w-3 h-3 rounded-full bg-red-500 mr-1.5 align-middle" /> Red &mdash; many significant errors</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 class="text-base font-medium text-primary pt-2">What Accuracy Doesn't Capture</h3>
        <p>
          Accuracy treats every move equally. A blunder on move 5 counts the same as a blunder on
          move 40, even though the latter might be in a much more critical position. The current
          score also uses a simple arithmetic mean, so one terrible move in an otherwise flawless
          game has a relatively modest impact on the overall number.
        </p>
      </div>
    </section>

    <!-- ===================== WHAT'S COMING NEXT ===================== -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-primary">What's Coming Next</h2>

      <div class="space-y-3 text-sm text-secondary leading-relaxed">
        <p>
          Two planned enhancements will make the game accuracy score more nuanced:
        </p>
        <ul class="list-disc list-inside space-y-1.5 pl-1">
          <li>
            <strong class="text-primary">Harmonic mean blend</strong>: The game score will blend a
            standard average with a harmonic mean. The harmonic mean penalizes inconsistency &mdash;
            one awful move among many good ones will drag the score down more than a simple average
            would. The blend ratio (roughly 15&ndash;25% harmonic weight) will be tuned so the score
            feels fair without being too punishing.
          </li>
          <li>
            <strong class="text-primary">Volatility-weighted mean</strong>: Moves in critical,
            strategically contested positions will carry more weight than moves in quiet, one-sided
            positions. The weighting will be based on how much the evaluation fluctuates in the
            surrounding moves, so a blunder in a sharp middlegame counts more than one in a
            completely won endgame.
          </li>
        </ul>
        <p>
          Both features will be developed together so their effects can be tuned as a unit.
        </p>
      </div>
    </section>
  </div>
</template>
