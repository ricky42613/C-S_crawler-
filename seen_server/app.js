var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var request = require('request')
var fs = require('fs');
var readline = require('readline')
const util = require('util');
const exec = util.promisify(require('child_process').exec);

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var config = {
    url_checker: "http://127.0.0.1:8080",
    pool_file: "../server/url_pools.txt",
    file_idx: 1
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
                if (line.length) {
                    line_data.push(line)
                }
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

function get_from_file() {
    return new Promise(async function(resolve, reject) {
        if (fs.existsSync(app.locals.pending_file)) {
            await get_file_idx()
            let line_data = await readFromN2M(app.locals.pending_file, app.locals.parse_config.file_idx, app.locals.parse_config.file_idx + 1000);
            app.locals.parse_config.file_idx += line_data.length
            console.log(line_data.length)
            fs.writeFileSync("./config", app.locals.parse_config.file_idx + "\n")
            resolve(line_data)
        } else {
            resolve([])
        }
    })
}

var app = express();

app.locals.parse_config = config
app.locals.pending_file = "./pending.txt"

setInterval(async function() {
    let line_data = await get_from_file()
    console.log(line_data)
    if (line_data.length) {
        request.post({
            url: config.url_checker + "/check_list",
            body: line_data.join("\n")
        }, function(e, r, b) {
            if (e) {
                console.log(e)
            } else {
                console.log(r.body)
                fs.appendFile(app.locals.parse_config.pool_file, r.body, function(err) {
                    if (err) {
                        console.log(err)
                    }
                })
            }
        })
    }
}, 500)

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

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

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;