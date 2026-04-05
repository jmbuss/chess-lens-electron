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

    <!-- ===================== FEATURE ATTRIBUTION CURVES ===================== -->
    <section class="space-y-6">
      <h2 class="text-lg font-semibold text-primary">Feature Attribution Curves</h2>

      <div class="space-y-4 text-sm text-secondary leading-relaxed">
        <p>
          The <strong class="text-primary">Feature Curves</strong> tab in the analysis console
          sits next to the Eval Curve tab and shows how individual structural components evolved
          over the course of the game.
        </p>
        <p>
          Rather than displaying all thirteen evaluation components at once, Chess Lens
          automatically selects the <strong class="text-primary">five features that correlated
          most strongly with eval movement</strong> in that specific game. Correlation is computed
          using Pearson&rsquo;s correlation between each feature&rsquo;s blended
          middlegame/endgame total score and the Stockfish evaluation at each position.
        </p>
        <p>
          Each selected feature is normalized to a common &minus;1 to +1 scale so the curves
          are visually comparable regardless of the different magnitudes of, say, king safety
          versus space. Hovering over the chart shows the <em>raw</em> centipawn values so you
          can see the actual engine numbers behind each curve.
        </p>
        <p>
          This lets you see, for example, that your evaluation improved because of mobility and
          passed pawns &mdash; not because of a single tactical blow &mdash; or that a collapse
          in king safety tracked closely with the drop in your overall position.
        </p>
      </div>
    </section>

    <!-- ===================== POSITIONAL FEATURES TAB ===================== -->
    <section class="space-y-6">
      <h2 class="text-lg font-semibold text-primary">Positional Features Tab</h2>

      <div class="space-y-4 text-sm text-secondary leading-relaxed">
        <p>
          The <strong class="text-primary">Positional Features</strong> tab in the analysis
          viewer (alongside Game Analysis and Position Analysis) shows everything Chess Lens
          captured from the evaluation engine for the current position.
        </p>
        <p>
          It shows two separate data sources:
        </p>
        <ul class="list-disc list-inside space-y-1.5 pl-1">
          <li>
            <strong class="text-primary">Eval Outputs</strong> &mdash; a table of all thirteen
            evaluation categories, showing the White contribution, Black contribution, and total
            score in both middlegame and endgame components. Values are in pawns from
            White&rsquo;s perspective.
          </li>
          <li>
            <strong class="text-primary">Eval Raw Inputs</strong> &mdash; the raw counts and flags
            that go <em>into</em> the evaluation before any weighting or blending. White and Black
            values are shown side by side with color coding:
            <strong class="text-green-600 dark:text-green-400">green</strong> when a side has the
            advantage on that feature, and
            <strong class="text-red-500 dark:text-red-400">red</strong> when disadvantaged.
          </li>
        </ul>
        <p>
          A small <strong class="text-primary">↑</strong> arrow next to a feature label means
          &ldquo;higher is better for that side,&rdquo; while
          <strong class="text-primary">↓</strong> means &ldquo;higher is worse.&rdquo;
        </p>
      </div>
    </section>

    <!-- ===================== RAW FEATURE REFERENCE ===================== -->
    <section class="space-y-6">
      <h2 class="text-lg font-semibold text-primary">Raw Feature Reference</h2>

      <div class="space-y-4 text-sm text-secondary leading-relaxed">
        <p>
          Below is a complete reference for every raw input feature extracted from the Stockfish
          Classic engine. Features with a <span class="text-primary">_w</span> /
          <span class="text-primary">_b</span> suffix store separate values for White and Black.
          The table notes whether higher values are
          <strong class="text-green-600 dark:text-green-400">better</strong> or
          <strong class="text-red-500 dark:text-red-400">worse</strong> for the side that owns
          the value.
        </p>

        <!-- Material -->
        <h3 class="text-base font-medium text-primary pt-2">Material</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-4 font-medium text-primary w-44">Feature</th>
                <th class="text-center py-2 px-3 font-medium text-primary w-20">Polarity</th>
                <th class="text-left py-2 font-medium text-primary">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">pawn_count</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Raw pawn count for that side.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">knight_count</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Raw knight count.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">bishop_count</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Raw bishop count.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">rook_count</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Raw rook count.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">queen_count</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Raw queen count.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">non_pawn_material</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Stockfish internal material value excluding pawns. Higher means more heavy/minor material.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pawn Structure -->
        <h3 class="text-base font-medium text-primary pt-2">Pawn Structure</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-4 font-medium text-primary w-44">Feature</th>
                <th class="text-center py-2 px-3 font-medium text-primary w-20">Polarity</th>
                <th class="text-left py-2 font-medium text-primary">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">passed_pawns</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Pawns with no opposing pawn blocking or guarding their advance. More is better.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">isolated_pawns</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Pawns with no friendly pawn on adjacent files. Weak targets.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">doubled_pawns</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Pawns stacked on the same file. Harder to advance and defend.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">backward_pawns</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Pawns that cannot advance safely and lack pawn support from behind.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">connected_pawns</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Pawns that support each other or form a phalanx relationship.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">supported_pawns</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Pawns defended by a friendly pawn from behind/diagonal.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">phalanx_pawns</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Pawns side-by-side on the same rank, controlling squares together.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">blocked_pawns</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Pawns blocked from advancing by enemy pawns.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">passed_pawn_best_rank</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">The most advanced rank among that side&rsquo;s passed pawns.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">free_passed_pawns</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Passed pawns with an empty square ahead &mdash; ready to advance.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobility -->
        <h3 class="text-base font-medium text-primary pt-2">Mobility</h3>
        <p>Summed safe-square counts for each piece type. More mobility usually means freer piece play.</p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-4 font-medium text-primary w-44">Feature</th>
                <th class="text-center py-2 px-3 font-medium text-primary w-20">Polarity</th>
                <th class="text-left py-2 font-medium text-primary">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">knight_mobility</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Number of safe squares available to knights.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">bishop_mobility</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Number of safe squares available to bishops.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">rook_mobility</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Number of safe squares available to rooks.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">queen_mobility</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Number of safe squares available to queens.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Piece Placement -->
        <h3 class="text-base font-medium text-primary pt-2">Piece Placement</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-4 font-medium text-primary w-44">Feature</th>
                <th class="text-center py-2 px-3 font-medium text-primary w-20">Polarity</th>
                <th class="text-left py-2 font-medium text-primary">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">knight_outpost</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Knights on true outpost squares (supported, can&rsquo;t be attacked by enemy pawns).</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">bishop_outpost</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Bishops on outpost squares.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">reachable_outpost</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Knights that can reach an outpost square in one or two moves.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">bad_outpost</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Outposts with poor targets &mdash; nominally good squares but low practical value.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">bishop_long_diagonal</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Bishops seeing both center squares on a long diagonal.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">bishop_pair</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">1 means the side has both bishops. Particularly strong in open positions.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">bishop_pawns_same_color</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Friendly pawns on the same color complex as the bishop, reducing its scope.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">bishop_xray_pawns</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Enemy pawns the bishop X-rays (potential long-term targets).</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">minor_behind_pawn</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Knights or bishops shielded behind a friendly pawn.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">rook_on_open_file</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Rooks on fully open files (no pawns of either color).</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">rook_on_semiopen_file</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Rooks on semi-open files (no friendly pawn, enemy pawn present).</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">rook_on_queen_file</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Rooks sharing a file with a queen &mdash; active placement.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">rook_on_king_ring</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Rooks exerting pressure near the enemy king ring.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">bishop_on_king_ring</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Bishops pressuring the enemy king ring.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">trapped_rook</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Rooks with severely limited mobility, often trapped by the king or pawns.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">weak_queen</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Queen vulnerable to pin or discovery tactics.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">queen_infiltration</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Queen deep in enemy territory on a weak square.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- King Safety -->
        <h3 class="text-base font-medium text-primary pt-2">King Safety</h3>
        <p>
          King safety features are indexed by the side whose king is being judged.
          So <span class="font-mono text-primary">king_danger_w</span> means
          &ldquo;danger around White&rsquo;s king&rdquo; &mdash; higher values are worse
          for that king&rsquo;s side.
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-4 font-medium text-primary w-44">Feature</th>
                <th class="text-center py-2 px-3 font-medium text-primary w-20">Polarity</th>
                <th class="text-left py-2 font-medium text-primary">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">king_attackers_count</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Number of enemy pieces attacking that king&rsquo;s zone.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">king_attackers_weight</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Weighted severity of those attackers (heavier pieces count more).</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">king_attacks_count</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Count of attacks into squares adjacent to that king.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">king_danger</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Stockfish&rsquo;s composite king-danger score. High values signal serious danger.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">king_flank_attack</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Enemy pressure on that king&rsquo;s flank.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">king_flank_defense</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Friendly defensive coverage on the king&rsquo;s flank.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">unsafe_checks</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Possible checking lines/squares counted in the king safety model.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">king_ring_weak</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Weak squares in the king ring (poorly defended).</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">blockers_for_king</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">Own pieces pinned or blocking lines around the king.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">king_pawnless_flank</td>
                <td class="py-2 px-3 text-center text-red-500 dark:text-red-400">↑ worse</td>
                <td class="py-2">1 means the king sits on a flank with no friendly pawns for shelter.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">can_castle_kingside</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">1 means that side still has the option to castle kingside.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">can_castle_queenside</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">1 means that side still has the option to castle queenside.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Threats -->
        <h3 class="text-base font-medium text-primary pt-2">Threats</h3>
        <p>
          Threat features are indexed by the attacking side. So
          <span class="font-mono text-primary">weak_pieces_w</span> means
          &ldquo;White is attacking weak Black pieces&rdquo; &mdash; higher values are
          better for the attacker.
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-4 font-medium text-primary w-44">Feature</th>
                <th class="text-center py-2 px-3 font-medium text-primary w-20">Polarity</th>
                <th class="text-left py-2 font-medium text-primary">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">weak_pieces</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Enemy pieces that are weak and under attack.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">hanging_pieces</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Weak enemy pieces with especially poor protection.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">restricted_pieces</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Enemy pieces whose movement is restricted by pressure.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">threat_by_safe_pawn</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Enemy non-pawn pieces attacked by a well-protected pawn.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">threat_by_pawn_push</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Enemy pieces that would be threatened after a safe pawn push.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">threat_by_king</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">1 means the king itself attacks a weak enemy piece (common in endgames).</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">knight_on_queen</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Knight-based pressure on the enemy queen.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">slider_on_queen</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Bishop or rook pressure on the enemy queen.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">weak_queen_protection</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Weak enemy pieces whose only defender is the queen.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Space -->
        <h3 class="text-base font-medium text-primary pt-2">Space</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-4 font-medium text-primary w-44">Feature</th>
                <th class="text-center py-2 px-3 font-medium text-primary w-20">Polarity</th>
                <th class="text-left py-2 font-medium text-primary">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">space_count</td>
                <td class="py-2 px-3 text-center text-green-600 dark:text-green-400">↑ better</td>
                <td class="py-2">Safe central and near-central squares controlled. Most relevant in opening/middlegame.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Global Features -->
        <h3 class="text-base font-medium text-primary pt-2">Global &amp; Eval-Context Features</h3>
        <p>These features are not per-side &mdash; they describe the overall position.</p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 pr-4 font-medium text-primary w-44">Feature</th>
                <th class="text-left py-2 font-medium text-primary">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">phase</td>
                <td class="py-2">128 = opening/middlegame, 0 = pure endgame. Controls how middlegame vs endgame weights are blended.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">complexity</td>
                <td class="py-2">Higher means more winning chances and practical complexity in the winnability model.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">scale_factor</td>
                <td class="py-2">Lower means more drawish / harder to convert. 64 is normal, 0 is dead draw territory.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">outflanking</td>
                <td class="py-2">King-placement relation used by the winnability model. Contextual &mdash; positive is generally better for the stronger side.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">pawns_on_both_flanks</td>
                <td class="py-2">1 means pawns exist on both wings, usually indicating richer winning chances.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">almost_unwinnable</td>
                <td class="py-2">1 means the position has drawish structural traits in the winnability model.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">infiltration</td>
                <td class="py-2">1 means one king has crossed into advanced territory (winnability heuristic).</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">opposite_bishops</td>
                <td class="py-2">1 means opposite-colored bishops, usually more drawish in lighter material.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">side_to_move</td>
                <td class="py-2">0 = White to move, 1 = Black to move.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">rule50_count</td>
                <td class="py-2">Moves toward the 50-move draw rule. Higher means closer to forced draw.</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-primary">final_eval</td>
                <td class="py-2">Engine evaluation after all processing, in centipawn-like units from the side to move&rsquo;s perspective.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Quick Heuristic -->
        <h3 class="text-base font-medium text-primary pt-4">Quick Reading Heuristic</h3>
        <p>When scanning a position&rsquo;s raw features:</p>
        <ul class="list-disc list-inside space-y-1.5 pl-1">
          <li>
            <strong class="text-green-600 dark:text-green-400">Good for a side</strong>: more
            mobility, space, outposts, rook file activity, passed-pawn progress, and threat counts.
          </li>
          <li>
            <strong class="text-red-500 dark:text-red-400">Bad for a side</strong>: more isolated,
            doubled, backward, or blocked pawns; trapped rooks; weak queen hits.
          </li>
          <li>
            <strong class="text-red-500 dark:text-red-400">Very bad for a side</strong>: high
            king_danger, king_ring_weak, unsafe_checks, and king_flank_attack values.
          </li>
        </ul>
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
        </ul>
      </div>
    </section>
  </div>
</template>
