Things I need to fix:

GameTree


Engines
1. Expose threads and hash as config options.
2. Need to show Mate in number eval
3. need to have a way to restart engines


Design System



Analysis
1. calling stop reports best move and caches in tanstack, probably don't want to cache if you cancel after like 2 depth


GamesTable
1. syncing games and performing analysis can cause the whole app to run out of memory
2. syncing games is super slow initially, causes noticeable ux lag
3. sync doesn't run on load, you have to click the button


MISC
1. clicking aorund too quickly can cause multiple engines to start up at once


LIBRARIES:
