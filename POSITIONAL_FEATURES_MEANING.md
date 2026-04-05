I want to improve the readability of the eval raw positional features. Can you help me refactor the positional features tab to use color to show better or worse per the feature for white and black? Can you also create an FAQ page specifically for this so that it's clear what each feature means?

Reading The Output
A good way to read evalraw is:

_w / _b usually mean “feature value for White / Black”
Most fields are not signed. They are counts, flags, or magnitudes
To tell who is better, compare the two sides for the same feature
Some features are “more is better”
Some are “more is worse”
King-safety fields are the most important exception: they are indexed by the side being attacked, so bigger usually means worse for that side
Material
pawn_count, knight_count, bishop_count, rook_count, queen_count: raw piece counts for that side. Higher is usually better for that side.
Pawn Structure
passed_pawns: passed pawns for that side. Higher is better for that side.
isolated_pawns: pawns with no friendly pawn on adjacent files. Higher is worse for that side.
doubled_pawns: pawns stacked on the same file. Higher is worse for that side.
backward_pawns: backward pawns by Stockfish’s definition. Higher is worse for that side.
connected_pawns: pawns that have support or phalanx relation. Higher is better for that side.
supported_pawns: pawns supported by a friendly pawn from behind/diagonal structure. Higher is better.
phalanx_pawns: pawns side-by-side on same rank. Higher is usually better.
blocked_pawns: pawns blocked by enemy pawns under this extraction logic. Higher is usually worse.
Mobility
These are summed mobility square counts for that side’s pieces.

knight_mobility: higher is better for that side.
bishop_mobility: higher is better.
rook_mobility: higher is better.
queen_mobility: higher is better.
More mobility usually means freer piece play, but in some tactical positions huge mobility can coexist with danger.

Piece Placement
knight_outpost: knights on true outposts. Higher is better for that side.
bishop_outpost: bishops on outposts. Higher is better.
reachable_outpost: knights that can reach an outpost. Higher is better/potentially better.
bad_outpost: side outposts with poor targets. Higher is worse for that side.
bishop_long_diagonal: bishops seeing both center squares. Higher is better.
bishop_pair: 1 means the side has the bishop pair. Good for that side.
bishop_pawns_same_color: friendly pawns on the bishop’s color complex, summed across bishops. Higher is usually worse for that side.
bishop_xray_pawns: enemy pawns the bishop x-rays. Higher is generally better for that side.
minor_behind_pawn: knight/bishop shielded by a pawn. Higher is usually better.
rook_on_open_file: rooks on fully open files. Higher is better.
rook_on_semiopen_file: rooks on semi-open files. Higher is usually better.
rook_on_queen_file: rooks sharing a file with a queen. Usually good/active for that side.
rook_on_king_ring: rooks exerting pressure near enemy king ring. Higher is better for that side.
bishop_on_king_ring: bishops pressuring enemy king ring. Higher is better.
trapped_rook: trapped rooks. Higher is worse for that side.
weak_queen: queen vulnerable to pin/discovery logic. Higher is worse for that side.
queen_infiltration: queen deep in enemy camp on a weak square. Higher is better.
King Safety
These are indexed by the side whose king is being judged. So king_danger_w means “danger around White’s king”.

king_attackers_count: attacking force pointed at that king. Higher is worse for that king’s side.
king_attackers_weight: weighted severity of those attackers. Higher is worse.
king_attacks_count: count of attacks into king-adjacent squares. Higher is worse.
king_danger: Stockfish’s composite king-danger term. Higher is much worse for that king’s side.
king_flank_attack: enemy pressure on that king’s flank. Higher is worse.
king_flank_defense: friendly defensive coverage on that flank. Higher is better for that king’s side.
unsafe_checks: possible unsafe checking lines/squares counted in the king model. Higher is worse.
king_ring_weak: weak squares in the king ring. Higher is worse.
blockers_for_king: own pieces pinned/blocking lines around the king. Higher is usually worse.
king_pawnless_flank: 1 means the king sits on a flank with no pawns there. Usually worse.
Threats
These are indexed by the attacking side. So weak_pieces_w means “White is attacking weak black pieces”.

weak_pieces: enemy pieces weak and under attack. Higher is better for the attacking side.
hanging_pieces: weak enemy pieces with especially poor protection. Higher is better for attacker.
restricted_pieces: enemy movement squares restricted by pressure. Higher is better for attacker.
threat_by_safe_pawn: enemy non-pawn pieces attacked by relatively safe pawns. Higher is very good for attacker.
threat_by_pawn_push: enemy pieces that become threatened after safe pawn pushes. Higher is good.
threat_by_king: 1 means the king itself attacks a weak enemy piece. Usually good for attacker, often in endgames.
knight_on_queen: knight-based pressure on enemy queen. Higher is good for attacker.
slider_on_queen: bishop/rook pressure on enemy queen. Higher is good.
weak_queen_protection: weak enemy pieces defended only by the queen. Higher is good for attacker.
Passed Pawn Extras
These are for the side owning the passed pawns.

passed_pawn_best_rank: best relative rank among that side’s passed pawns. Higher is better.
free_passed_pawns: passed pawns with an empty block square. Higher is better.
Space
space_count: safe central/near-central space bonus count for that side. Higher is better, mainly opening/middlegame.
Position Metadata
can_castle_kingside: 1 means that side still can castle kingside. Usually good/flexible.
can_castle_queenside: 1 means that side still can castle queenside. Usually good/flexible.
non_pawn_material: raw Stockfish internal material value excluding pawns. Higher means more heavy/minor material for that side.
Global Eval-Context Features
phase: 128 is opening/middlegame-ish, 0 is pure endgame.
complexity: higher means more winning chances / more practical complexity in the winnability model.
scale_factor: lower means more drawish / harder to convert; 64 is normal, 0 is dead draw territory.
outflanking: king-placement relation used by winnability. Positive is generally better for the stronger side, but by itself it is contextual.
pawns_on_both_flanks: 1 means pawns exist on both wings. Usually means richer winning chances.
almost_unwinnable: 1 means the position has drawish structural traits in the winnability model.
infiltration: 1 means one king has crossed into advanced territory used by the winnability heuristic.
opposite_bishops: 1 means opposite-colored bishops. Usually more drawish, especially in lighter-material endings.
side_to_move: 0 = White, 1 = Black.
rule50_count: higher means closer to 50-move draw pressure.
final_eval: current engine eval after its processing, in centipawn-like units, from the side to move’s perspective in your current implementation. Positive is good for the side to move, negative is bad for the side to move.
Practical Heuristic
When scanning a position quickly:

Good for a side: more mobility, more space, more outposts, more rook file activity, more passed-pawn progress, more threat counts
Bad for a side: more isolated/doubled/backward/blocked pawns, more trapped rooks, more weak queen hits
Very bad for a side: high king_danger, king_ring_weak, unsafe_checks, king_flank_attack
If you want, I can turn this into a compact field-by-field JSON or TypeScript doc block you can paste next to your vector schema.

