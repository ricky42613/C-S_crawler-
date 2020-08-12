var express = require('express');
var router = express.Router();
// var memcached = require('memcached')
// var cache = new memcached('localhost:8787')
var md5 = require('md5')
var async = require('async')
var urL = require('url')
var GetMain = require('../../gais_api/parseMain')
var GAIS = require('../../gais_api/gais')
var request = require('request')
var cheerio = require('cheerio')
const max_req = 10;
// const cache_lifetime = 60

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

Array.prototype.shuffle = function() {
    var j, x, i;
    for (i = this.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = this[i];
        this[i] = this[j];
        this[j] = x;
    }
    return this;
}

function update_rec(db, key, format, rec) {
    return new Promise(async function(resolve, reject) {
        let r = await DB.update(db, { key: key }, format, rec)
        if (!r.status) {
            setTimeout(async function() {
                await update_rec(db, key, format, rec)
                resolve()
            }, 1000)
        } else {
            resolve()
        }
    })
}

function save_rec(db, data) {
    return new Promise(async function(resolve, reject) {
        let r = await DB.insert(db, data)
        if (!r.status) {
            setTimeout(async function() {
                await save_rec(db, data)
                resolve()
            }, 1000)
        } else {
            resolve()
        }
    })
}

router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.get('/get_url', async function(req, res, next) {
    var size = parseInt(req.query.size).toString() == "NaN" ? 1000 : parseInt(req.query.size)
    if (size > 1000) {
        res.json({
            status: false,
            msg: "每次限取1000筆"
        })
    } else {
        let data = {}
        data.status = true
        data.url_list = req.app.locals.link_pool.splice(0, size)
        if (data.url_list.length) {
            console.log(`pool原長度${req.app.locals.link_pool.length}`)
            console.log(`pool切割後長度${req.app.locals.link_pool.length}`)
            res.json(data)
        } else {
            res.json({
                status: false,
                msg: 'queue已空'
            })
        }
    }
})

router.post('/url_recycle', function(req, res, next) {
    try {
        let url_list = JSON.parse(req.body.data)
        new_url_list = url_list.shuffle()
        let diff_cnt = 0
        for (let i = 0; i < url_list.length; i++) {
            if (new_url_list[i] != url_list[i]) {
                diff_cnt++
            }
        }
        console.log(`diffenent rate:${diff_cnt/url_list.length}`)
        save_rec(req.app.locals.parse_config.pool_db, new_url_list)
        res.json({ status: true })
    } catch (e) {
        console.log(e)
        res.json({
            status: false,
            msg: e
        })
    }
})

module.exports = router;