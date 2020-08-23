var express = require('express');
var router = express.Router();
var fs = require('fs')
var md5 = require('md5')
var async = require('async')
var request = require('request')

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

function check_list(url_checker, url_list, i) {
    return new Promise(function(resolve, reject) {
        request({
            url: `${url_checker}/check?query=${md5(url_list[i])}&is_md5=true`,
            method: 'GET'
        }, async function(e, r, b) {
            if (e) {
                console.log(e)
                i++
                if (i == url_list.length) {
                    resolve([])
                } else {
                    var next_url_list = await check_list(url_checker, url_list, i)
                    resolve(new_url_list)
                }
            } else {
                var new_url_list = []
                if (r.body == "false") {
                    new_url_list.push(url_list[i])
                }
                i++
                if (i == url_list.length) {
                    resolve(new_url_list)
                } else {
                    var next_url_list = await check_list(url_checker, url_list, i)
                    new_url_list = new_url_list.concat(next_url_list)
                    resolve(new_url_list)
                }
            }
        })
    })
}

router.post('/url_recycle', async function(req, res, next) {
    try {
        let url_list = JSON.parse(req.body.data)
        let new_url_list = await check_list(req.app.locals.parse_config.url_checker, url_list, 0)
        console.log(new_url_list);
        // new_url_list = new_url_list.shuffle()
        if (new_url_list.length) {
            let str = ""
            new_url_list.forEach(item => {
                str += '@url:' + item + '\n'
            })
            fs.appendFile(req.app.locals.parse_config.pool_file, str, function(err) {
                if (err) {
                    console.log(err)
                }
                res.json({ status: true })
            })
        } else {
            res.json({ status: true })
        }
    } catch (e) {
        console.log(e)
        res.json({
            status: false,
            msg: e
        })
    }
})

module.exports = router;