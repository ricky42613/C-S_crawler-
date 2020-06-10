#execute preprocess for each slice
pm2 start preprocess.js -- 1 4096000
pm2 start preprocess.js -f -- 4096001 4096000
pm2 start preprocess.js -f -- 8192001 4096000
pm2 start preprocess.js -f -- 12288001 4096000
pm2 start preprocess.js -f -- 16384001 4096000
pm2 start preprocess.js -f -- 20480001 2860055