var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var config = {
    url_checker: "http://127.0.0.1:8080",
    pool_file: "../server/url_pools.txt",
}

var app = express();

app.locals.parse_config = config
app.locals.pending_pool = []

setInterval(function() {
    let urls = app.locals.pending_pool.splice(0, 1000)
    if (urls.length) {
        request.post({
            url: config.url_checker + "/check_list",
            body: urls.join("\n")
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