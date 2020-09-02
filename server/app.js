var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var GAIS = require('../gais_api/gais')
var fs = require('fs')
var readline = require('readline')

var config = {
    db_location: "onlybtw.ddns.net:5802",
    url_checker: "http://127.0.0.1:8080",
    pool_db: "wns_url_extend",
    black_list: ['undefined', '../', 'javascript:', 'mailto:'],
    pool_file: "./url_pools.txt",
    file_idx: 1
}

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
var total_pool_len = 50000

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
    let size = total_pool_len - app.locals.link_pool.length
    if (size) {
        let line_data = await readFromN2M(app.locals.parse_config.pool_file, app.locals.parse_config.file_idx, app.locals.parse_config.file_idx + size);
        app.locals.parse_config.file_idx += line_data.length
        app.locals.link_pool = app.locals.link_pool.concat(line_data)
        console.log(`補充${line_data.length}筆資料至pool`);
        console.log(`目前池裡有${app.locals.link_pool.length}筆資料`)
        fs.writeFileSync("./config", app.locals.parse_config.file_idx + "\n")
    }
}

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

get_from_file()
setInterval(get_from_file, 60 * 1000);

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