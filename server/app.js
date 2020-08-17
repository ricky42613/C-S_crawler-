var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var GAIS = require('../gais_api/gais')
var fs = require('fs')
var BloomFilter = require('bloom-filter');
var fs = require('fs');
var readline = require('readline');
var md5 = require('md5')

var config = {
    db_location: "onlybtw.ddns.net:5802",
    pool_db: "wns_url_extend",
    black_list: ['undefined', '../', 'javascript:', 'mailto:'],
    pool_file: "./url_pools.txt",
    file_idx: 1
}
var DB = new GAIS(config.db_location)
Array.prototype.unique = function() {
    let table = {}
    let final_list = []
    for (let i = 0; i < this.length; i++) {
        if (typeof table[this[i].UrlCode] == "undefined") {
            table[this[i].UrlCode] = 1
            final_list.push(this[i])
        }
    }
    return final_list
}

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

app.locals.parse_config = config
app.locals.link_pool = []
let bloom_item_cnt = 17199254740991
var falsePositiveRate = 0.01;
app.locals.filter = BloomFilter.create(bloom_item_cnt, falsePositiveRate);
var total_pool_len = 50000
var shutdown_signal = false


function update_rec(key, format, rec) {
    return new Promise(async function(resolve, reject) {
        let r = await DB.update(config.pool_db, { key: key }, format, rec)
        if (!r.status) {
            setTimeout(async function() {
                await update_rec(key, format, rec)
                resolve()
            }, 1000)
        } else {
            resolve()
        }
    })
}

function readFromN2M(filename, n, m) {
    return new Promise(function(resolve, reject) {
        const lineReader = readline.createInterface({
            input: fs.createReadStream(filename),
        });

        let lineNumber = 0;
        let line_data = []
        lineReader.on('line', function(line) {
            lineNumber++;
            if (lineNumber >= n && lineNumber < m) {
                line_data.push(line.slice(5))
            }
            if (lineNumber > m) {
                lineReader.close();
            }
        });
        lineReader.on('close', function() {
            resolve(line_data)
        })
    })
};

async function get_from_file() {
    await get_file_idx()
    console.log(app.locals.parse_config.file_idx)
    let size = total_pool_len - app.locals.link_pool.length
    console.log(app.locals.parse_config.file_idx)
    if (size) {
        let line_data = await readFromN2M(app.locals.parse_config.pool_file, app.locals.parse_config.file_idx, app.locals.parse_config.file_idx + size);
        app.locals.parse_config.file_idx += line_data.length
        app.locals.link_pool = app.locals.link_pool.concat(line_data)
        console.log(`補充${line_data.length}筆資料至pool`);
        console.log(`目前池裡有${app.locals.link_pool.length}筆資料`)
        fs.writeFileSync("./config", app.locals.parse_config.file_idx + "\n")
    }
}

// function shutdown() {
//     shutdown_signal = true
//     let cnt = 0
//     console.log(`返還${app.locals.link_pool.length}個連結`)
//     async.eachLimit(app.locals.link_pool, 20, function(item, cb) {
//         (async function() {
//             await update_rec(item.UrlCode, 'text', '@fetch:false')
//             cnt++
//             if (cnt % 100 == 0) {
//                 console.log(`已更新${cnt}個url`)
//             }
//             cb()
//         })()
//     }, function(err) {
//         if (err) {
//             console.log(err)
//         }
//         process.exit()
//     })
// }

// process.on('SIGINT', shutdown)
// process.on('SIGTERM', shutdown)

// function getRandom(min, max) {
//     return Math.floor(Math.random() * (max - min + 1)) + min;
// };

// var round = 1;
// async function get_from_pool(skip) {
// var ps = total_pool_len - app.locals.link_pool.length;
// if (skip == -1) {
//     skip = round
//     round += 1
//     if (round > 10) {
//         round = 1
//     }
// }
// console.log("開始檢查pool")
// if (ps > 0 && !shutdown_signal) {
//     console.log("開始補充")
// var rsp = await DB.query(config.pool_db, "@fetch:false", skip, ps)
// if (rsp.status) {
//     rsp.data.result.recs = rsp.data.result.recs.filter(item => {
//         return !item.hasOwnProperty('error')
//     })
//     if (rsp.data.result.recs.length == 0) {
//         round = 1
//     }
//     rsp = rsp.data.result.recs.slice(0, ps).map(item => {
//         return item.rec
//     })
//     rsp.forEach(function(item, index, object) {
//         if (app.locals.link_pool.indexOf(item) == -1) {
//             object.splice(index, 1);
//         }
//     });
//     app.locals.link_pool = app.locals.link_pool.concat(rsp)
//     app.locals.link_pool = app.locals.link_pool.unique()
//     console.log("取回link record，目前池裡共" + app.locals.link_pool.length + "筆");
// }
//     } //get url per 5 minutes
// }

function get_file_idx() {
    return new Promise(function(resolve, reject) {
        if (fs.existsSync("./config")) {
            fs.readFile("./config", (err, txt) => {
                if (err) {
                    console.log(err)
                } else {
                    app.locals.parse_config.file_idx = parseInt(txt)
                }
                resolve()
            })
        } else {
            resolve()
        }
    })
}

function init(filename) {
    const lineReader = readline.createInterface({
        input: fs.createReadStream(filename),
    });
    lineReader.on('line', function(line) {
        let check_item = new Buffer(md5(line.slice(5)), 'hex')
        if (!app.locals.filter.contains(check_item)) {
            app.locals.filter.insert(check_item)
        }
    });
    lineReader.on('close', function() {
        console.log("finish")
    })
}

// get_from_pool(1)
init(app.locals.parse_config.pool_file)
get_from_file()
setInterval(get_from_file, 60 * 1000);
// setInterval(get_from_pool, 60 * 1000, -1)

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;