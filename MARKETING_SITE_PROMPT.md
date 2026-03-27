Build a modern, polished marketing landing page for "Chess Lens" — a desktop chess analysis application for serious chess players who want to improve. The site should be a single-page design with smooth scroll sections, dark theme with chess-inspired aesthetics, and a clean, premium feel (think Linear or Raycast-style marketing sites).

## Brand & Tone
- Product name: Chess Lens
- Tone: Confident, modern, approachable but serious. Aimed at intermediate to advanced chess players who care about improvement, not just engine eval bars.
- Color palette: Dark background (#0a0a0a or similar), with accent colors inspired by chess (emerald green or electric blue for CTAs, subtle warm tones for highlights). Use chess-piece iconography sparingly.

## Sections (in order)

### 1. Hero Section
- Bold headline conveying the core value: "See your chess the way it was meant to be seen" or similar.
- Subtitle: Position Chess Lens as a desktop app that makes your chess games searchable and deeply analyzed — combining engine analysis with human-like move prediction so you can find patterns in your play, understand your weaknesses, and actually improve. Not just red and green eval bars.
- Primary CTA: Email signup form ("Get early access" or "Join the waitlist") — collect email address with a submit button.
- Secondary CTA: "Learn more" smooth-scrolls down.
- Show a stylized screenshot or mockup area of the analysis dashboard (use a placeholder image area).

### 2. The Problem / Why Chess Lens
- Address the pain points:
  - Existing tools just show you engine evaluations — a number that says you blundered, but doesn't help you understand *why* or *how a player at your level would think*.
  - You've played thousands of games but can't answer basic questions about your own chess: "How often do I blunder in the opening?" "Do I lose more to tactical or positional mistakes?" "What types of endgames do I struggle in?" Your games are data, but no tool lets you actually search and learn from them.
  - Web-based analysis tools feel like afterthoughts, not purpose-built workstations.
  - Your games are scattered across platforms with no unified analysis workflow. Mistakes you made last month are forgotten, not catalogued and learned from.
- Frame Chess Lens as the answer: a local-first chess analysis workstation that doesn't just analyze your games — it makes them searchable, finds patterns in your mistakes, and shows you exactly where and how to improve.

### 3. Key Features
Display as a feature grid or alternating left/right sections with icons or illustrations. Group the first two as a "headline feature" pair — these are the biggest differentiators and should get the most visual real estate:

#### Headline Features (give these extra visual weight — larger cards, screenshots, or dedicated alternating sections)

- **Searchable Chess Games**: Your games become a personal chess database you can actually query. Ask questions like: "How often do I blunder in the opening?" "How do I perform in pawn endgames?" "Do I lose more to tactical mistakes or positional errors?" Chess Lens indexes your analyzed games so you can search across hundreds or thousands of games and get real answers about your play.

- **Positions Library — Your Mistakes, Catalogued**: Chess Lens automatically saves and categorizes the critical positions from your games: blunders, strategic mistakes where you chose the wrong plan, tactical positions where you missed the shot. Over time, you build a personal library of your weaknesses — and you can see patterns: the same types of positions where you keep going wrong, the recurring blind spots you didn't know you had. Stop making the same mistakes. Start recognizing them.

#### Core Features

- **Engine + Human Model Fusion**: Combines Stockfish for objective evaluation with Maia neural network for human-like move predictions at your rating level. Understand not just the best move, but what a player like you would play and where your thinking diverges from both engines and humans.

- **Full-Game Automated Analysis**: One-click deep analysis of entire games with multiple presets (fast, deep, study). Every move is classified, evaluated, and annotated — with mistake probability distributions, not just "blunder/inaccuracy/mistake."

- **Interactive Eval Chart with Game Phases**: Visualize evaluation over the entire game with phase-colored backgrounds showing opening, middlegame, and endgame transitions. Click any point to jump to that position.

- **Chess.com Integration & Sync**: Connect your Chess.com account and sync your games automatically. All your games stored locally in a fast SQLite database — your data, on your machine.

- **Resizable Analysis Workspace**: A professional-grade layout with PGN viewer, board, engine lines, and analysis tabs — all in resizable panels you can arrange to your preference.

- **Variation Explorer**: Play out alternative lines directly on the board. Variations are persisted and analyzed, building a full game tree you can revisit.

- **Local-First & Offline**: Everything runs on your machine. No cloud dependency, no latency, no subscription to access your own analysis. Your games and analysis are always available.

- **Native Desktop Experience**: Built as a real desktop application (not a browser tab). Keyboard navigation, dark mode, and a purpose-built UI designed for focused analysis sessions.

### 4. Coming Soon / Roadmap
Display as a timeline or card grid with "coming soon" badges:

- **Similar Position Search**: Find positions across your game history that are structurally similar — discover recurring themes and patterns in your play you never noticed.
- **Mistake Trend Analysis**: Track how your mistake patterns change over time. Are you blundering less in the opening? Are your endgames improving? See your progress backed by data from your own games.
- **Lichess Integration**: Sync games from Lichess alongside Chess.com.
- **Advanced Filtering & Sorting**: Filter your game library by opening, result, time control, rating range, and more.
- **Opening Repertoire Tracking**: See how your actual play maps to your intended repertoire.
- **Export & Sharing**: Export annotated PGNs and share analysis with coaches or study partners.

### 5. How It Works
Simple 3-step visual:
1. **Connect** — Link your Chess.com account and sync your games
2. **Analyze** — Run automated analysis powered by Stockfish + Maia on any game
3. **Search & Improve** — Query your games, browse your positions library, and find the patterns holding you back

### 6. What Makes Chess Lens Different
A comparison-style section or short bullet points:
- Unlike Lichess/Chess.com analysis: Combines engine eval with rating-appropriate human move predictions (Maia). Makes your games searchable — ask questions about your play across your entire game history, not just one game at a time.
- Unlike online tools: Desktop-native, local-first, works offline, no subscription for engine access
- Unlike ChessBase: Modern UI, approachable for club players, not just titled players. Automatically categorizes your mistakes and builds a personal positions library — no manual tagging required.
- Unlike generic engines: Classifies moves by mistake probability, shows game phases, and builds a persistent analysis tree. Tells you *what kind* of mistakes you make (tactical vs positional, opening vs endgame) so you know what to study.

### 7. About the Developer
- Brief section with a personal, credible tone — not a full bio, just enough to signal that this is built by someone who knows chess and software deeply.
- Headline: "Built by a chess player, for chess players" or similar.
- Short paragraph: Chess Lens is built by Jason Buss — a software engineer and chess enthusiast who got tired of existing tools not answering the questions that actually matter for improvement. This is a passion project born from real frustration with the gap between what chess analysis tools offer and what players actually need.
- Links (displayed as clean icon+text buttons or inline links):
  - GitHub: https://github.com/jmbuss
  - Email: bussterjason@gmail.com
- Include a short line like: "Interested in working together, or building something like this at scale? I'd love to hear from you." — keeps the door open for job opportunities without being explicit about job-seeking.
- Keep the design understated — small avatar or icon, clean layout, not a full "team" section.

### 8. Final CTA Section
- Repeat the email signup form
- Headline: "Ready to see your chess differently?"
- Subtitle: "Join the waitlist for early access. We'll let you know when Chess Lens is ready."
- Email input + submit button
- Small note: "Available for macOS. Windows and Linux coming soon."

## Technical Requirements
- Responsive design (mobile-friendly)
- Email form should POST to a configurable endpoint (use a placeholder like /api/subscribe or integrate with a service like Buttondown, ConvertKit, or Mailchimp — just make the integration point clear and swappable)
- Smooth scroll navigation
- Subtle animations on scroll (fade-in sections, etc.)
- SEO-friendly: proper meta tags, Open Graph tags, descriptive title/description
- Fast loading — minimal JS, no heavy frameworks needed (static HTML/CSS/JS is fine, or use Astro/Next.js if preferred)
- Include a simple sticky header with: Logo, Features link, Roadmap link, About link, and "Get Early Access" CTA button

## Design References
- Linear.app marketing site (dark, clean, premium)
- Raycast.com (feature sections, developer-tool aesthetic)
- Warp.dev (dark theme, product screenshots, clear value props)