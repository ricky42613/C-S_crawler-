var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var GAIS = require('../gais_api/gais')
var DB = new GAIS('nudb1.ddns.net:5804')
var async = require('async')
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

app.locals.link_pool = []
var total_pool_len = 3000
function getRandom(min,max){
  return Math.floor(Math.random()*(max-min+1))+min;
};
async function get_from_pool(skip){
  var ps = total_pool_len-app.locals.link_pool.length
  if(skip == -1){
    skip = getRandom(1,10)
  }
  console.log(skip)
  console.log("開始檢查pool")
  if(ps>0){
    var rsp = await DB.query("link_pool2","@fetch:false",skip,3000)
    if(rsp.status){
      rsp.data.result.recs = rsp.data.result.recs.filter(item => {
        return !item.hasOwnProperty('error')
      })
      rsp = rsp.data.result.recs.slice(0,ps).map(item=>{
        return item.rec
      })
      app.locals.link_pool = app.locals.link_pool.concat(rsp)
      app.locals.link_pool = app.locals.link_pool.unique()
      total_pool_len = app.locals.link_pool.length
      console.log("取回link record，目前池裡共"+app.locals.link_pool.length+"筆")
      async.eachLimit(rsp,5,function(item,cb){
        var promise = new Promise(async function(resolve,reject){
          await DB.update('link_pool2',{key:item.UrlCode}, "@fetch:true")
          resolve("ok")
        },function(err){
          console.log(err)
        })
      }).then(rsp=>{
        cb()
      })
    }
  }    //get url per 5 minutes
}

get_from_pool(1)
setInterval(get_from_pool,5*1000,-1)

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
