Things I need to fix:

GameTree
1. The only way to make it work is to mark everything raw (markRaw)

Engines
1. Expose threads and hash as config options.
2. Need to show Mate in number eval
3. need to have a way to restart engines


Analysis
1. calling stop reports best move and caches in tanstack, probably don't want to cache if you cancel after like 2 depth


GamesTable
1. syncing games and performing analysis can cause the whole app to run out of memory


MISC
1. clicking aorund too quickly can cause multiple engines to start up at once


