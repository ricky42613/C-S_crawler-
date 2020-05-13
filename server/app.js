var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var GAIS = require('../gais_api/gais')
var async = require('async')
var config = {
    db_location: "nudb1.ddns.net:5804",
    pool_db: "test_pool",
    record: "test_record",
    pattern_db: "pattern",
    src_link_cntdb: "source_ave_link",
    black_list: ['undefined', '../', 'javascript:', 'mailto:']
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
app.locals.client_list = []
var total_pool_len = 50000
var shutdown_signal = false

function shutdown() {
    shutdown_signal = true
    console.log(`返還${app.locals.link_pool.length}個連結`)
    async.eachLimit(app.locals.link_pool, 20, function(item, cb) {
        (async function() {
            console.log(item.UrlCode)
            await DB.update(config.pool_db, { key: item.UrlCode }, 'text', "@fetch:false")
            cb()
        })()
    }, function(err) {
        if (err) {
            console.log(err)
        }
        process.exit()
    })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function getRandom(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};
async function get_from_pool(skip) {
    var ps = total_pool_len - app.locals.link_pool.length
    if (skip == -1) {
        skip = getRandom(1, 10)
    }
    console.log("開始檢查pool")
    if (ps > 0 && !shutdown_signal) {
        console.log("開始補充")
        var rsp = await DB.query(config.pool_db, "@fetch:false", skip, 10000)
        if (rsp.status) {
            rsp.data.result.recs = rsp.data.result.recs.filter(item => {
                return !item.hasOwnProperty('error')
            })
            rsp = rsp.data.result.recs.slice(0, ps).map(item => {
                return item.rec
            })
            rsp.forEach(function(item, index, object) {
                if (app.locals.link_pool.indexOf(item) == -1) {
                    object.splice(index, 1);
                }
            });
            app.locals.link_pool = app.locals.link_pool.concat(rsp)
            app.locals.link_pool = app.locals.link_pool.unique()
            console.log("取回link record，目前池裡共" + app.locals.link_pool.length + "筆")
            if (rsp.length) {
                let cnt = 0
                async.forever(function(cb) {
                    if (cnt == rsp.length || shutdown_signal) {
                        cb('done')
                    } else {
                        var promise = new Promise(function(resolve, reject) {
                            console.log(`更新${rsp[cnt].UrlCode}`)
                            let update = await DB.update(config.pool_db, { key: rsp[cnt].UrlCode }, 'text', "@fetch:true")
                            if (update.status) {
                                resolve(0)
                            } else {
                                resolve(1)
                            }
                        }).then(val => {
                            if (!val) {
                                cnt++
                            }
                            cb(null)
                        })
                    }
                }, function(err) {
                    console.log('已更新取回url')
                })
            }
        }
    } //get url per 5 minutes
}

get_from_pool(1)
setInterval(get_from_pool, 60 * 1000, 1)

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