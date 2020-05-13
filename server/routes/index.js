var express = require('express');
var router = express.Router();
var memcached = require('memcached')
var cache = new memcached('localhost:8787')
var md5 = require('md5')
var async = require('async')
var urL = require('url')
var GetMain = require('../../gais_api/parseMain')
var GAIS = require('../../gais_api/gais')
var request = require('request')
var cheerio = require('cheerio')
var events = require('events')
var em = new events.EventEmitter()
    /* GET home page. */
const max_req = 10
const cache_lifetime = 60

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

function get_source(text) {
    let start = text.indexOf(".")
    text2 = text.slice(start + 1)
    let end = text2.indexOf(".")
    if (end != -1) {
        text = text2.slice(0, end)
    } else {
        text = text.slice(0, start)
    }
    return text
}

function filter_black(url, black_key_list, in_source) {
    let flag = true
    black_key_list.forEach(item => {
        if (url.indexOf(item) != -1) {
            flag = false
        }
        if (flag) {
            let source = get_source(urL.parse(url).hostname)
            if (source != in_source) {
                flag = false
            }
        }
    })
    return flag
}

function parse_url_in_body(url, body, black_key_list) {
    let $ = cheerio.load(body)
    let main_url = urL.parse(url)
    let main_site = main_url.protocol + "//" + main_url.hostname
    let ori_source = get_source(main_url.hostname)
    let links_in_page = $('a').get().map(item => {
        let data = {}
        if (typeof $(item).attr('href') != "undefined" && $(item).attr('href') != 'javascript:void(0)') {
            if ($(item).attr('href').slice(0, 4).indexOf('http') != -1) {
                data.url = $(item).attr('href')
            } else if ($(item).attr('href')[0] == '/') {
                if ($(item).attr('href')[1] == '/') {
                    data.url = main_url.protocol + $(item).attr('href')
                } else {
                    data.url = main_site + $(item).attr('href')
                }
            } else {
                let cut = url.lastIndexOf('/') + 1
                let basic = url.slice(0, cut)
                data.url = basic + $(item).attr('href')
            }
            data.fetch = "false"
            data.fetch_time = "--"
            if (data.url.indexOf('#') != -1) {
                let idx = data.url.indexOf('#')
                data.url = data.url.slice(0, idx)
            }
            data.UrlCode = md5(data.url)
            data.source = get_source(main_url.hostname)
            if (data.source != ori_source) {
                data.url = "undefined"
            }
        } else {
            data.url = "undefined"
        }
        return data
    })
    links_in_page = links_in_page.filter(item => {
        return filter_black(item.url, black_key_list, get_source(main_url.hostname))
    })
    links_in_page = links_in_page.unique()
    return links_in_page
}

function is_time(str) {
    let num_arr = str.split(/[^0-9]/)
    num_arr = num_arr.filter(item => {
        return item.length > 0
    })
    if (num_arr.length > 6 || num_arr < 2) {
        return false
    } else {
        let y_cnt = 0
        num_arr = num_arr.filter(item => {
            let flag1 = parseInt(item) > 1990 && parseInt(item) < 2020
            let flag2 = parseInt(item) > 60 && parseInt(item) < 120
            if (flag1 || flag2) {
                y_cnt++
            }
            return flag1 || flag2
        })
        num_arr = num_arr.filter(item => {
            let flag = parseInt(item) < 60
            return flag
        })
        if (y_cnt < 2 && num_arr.length == 0) {
            return true
        } else {
            return false
        }
    }
}

function send_req(url, black_list, pat_table, cb) {
    try {
        request({
            url: url,
            method: 'GET'
        }, async function(e, r, b) {
            if (e) {
                console.log(e)
                cb([], pat_table)
            } else {
                let urls_in_page = parse_url_in_body(url, r.body, black_list)
                let $ = cheerio.load(r.body)
                let main = await GetMain.ParseHTML(r.body)
                if (main[0] != 'null') {
                    $(main[0]).find('*').each((idx, inneritem) => {
                        let key = $(inneritem).text().replace(/[\n|\t|\r|\s]/g, "").toString()
                        if (!is_time($(inneritem).text().replace(/[\n|\t|\r]/g, ""))) {
                            if (key.length < 30 && key.length) {
                                if (pat_table[key] != undefined) {
                                    pat_table[key]++
                                } else {
                                    pat_table[key] = 1
                                }
                            }
                        }
                    })
                }
                cb(urls_in_page, pat_table)
            }
        })
    } catch (e) {
        cb([], pat_table)
    }
}

function get_space_from_cache(user) {
    return new Promise(function(resolve, reject) {
        let user_record = []
        for (let i = 0; i < max_req; i++) {
            user_record.push(user + i)
        }
        let flag = -1
        cache.getMulti(user_record, (err, data) => {
            if (err) {
                console.log(err)
            } else {
                for (let i = 0; i < max_req; i++) {
                    if (data[`${user}${i}`] == undefined) {
                        flag = i
                    }
                }
            }
            resolve(flag)
        })
    })
}

function _uuid() {
    var d = Date.now();
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        d += performance.now(); //use high-precision timer if available
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.get('/add_client', function(req, res, next) {
    let data = {
        id: _uuid(),
        last_time: new Date()
    }
    req.app.locals.client_list.forEach(item => {
        while (item.id == data.id) {
            data.id = _uuid()
        }
    })
    req.app.locals.client_list.push(data)
    res.json({
        status: true,
        user: data.id
    })
})

router.get('/get_url', async function(req, res, next) {
    var size = parseInt(req.query.size).toString() == "NaN" ? 1000 : parseInt(req.query.size)
    var user = req.query.user
    var space = await get_space_from_cache(user)
    if (space == -1) {
        res.json({
            status: false,
            msg: '超過請求限制'
        })
    } else {
        if (size > 1000) {
            res.json({
                status: false,
                msg: "每次限取1000筆"
            })
        } else {
            cache.set(`${user}${space}`, 'true', cache_lifetime, function(err) {
                if (err) {
                    console.log(err)
                    res.json({
                        status: false,
                        msg: err
                    })
                } else {
                    let data = {}
                    data.status = true
                    let location = -1
                    req.app.locals.client_list.forEach((item, idx) => {
                        if (item.id == user) {
                            location = idx * size
                        }
                    })
                    req.app.locals.client_list[location / size].last_time = new Date()
                    if (location == -1) {
                        res.json({
                            status: false,
                            msg: '使用者已消失'
                        })
                    } else {
                        data.url_list = req.app.locals.link_pool.slice(location, location + size)
                        if (data.url_list.length) {
                            console.log(`pool原長度${req.app.locals.link_pool.length}`)
                            req.app.locals.link_pool.splice(location, size)
                            console.log(`pool切割後長度${req.app.locals.link_pool.length}`)
                            res.json(data)
                        } else {
                            res.json({
                                status: false,
                                msg: 'queue已空'
                            })
                        }
                    }
                }
            })
        }
    }
})

router.get('/add_seed', async function(req, res, next) {
    console.log("開使fetch")
    var DB = new GAIS(req.app.locals.parse_config.db_location)
    var url_list = []
    let data = {}
    data.url = req.query.seed
    let domain = urL.parse(data.url).hostname
    data.fetch = "false"
    data.fetch_time = "--"
    data.UrlCode = md5(data.url)
    data.source = get_source(domain)
    var limit = 2000
    var rsp = await DB.query(req.app.locals.parse_config.pool_db, `@source:${data.source}`, 1, limit)
    console.log(rsp)
    if (rsp.status) {
        if (!rsp.data.result.cnt) {
            url_list.push(data)
            res.json({
                status: true
            })
            var i = 0
            var dir_detect = {}
            var pat_table = {}
            dir_detect.src = data.source
            dir_detect.page_cnt = 0
            dir_detect.a_cnt = 0
            async.forever(function(next) {
                console.log(url_list.length)
                if (url_list.length > limit) {
                    next('done')
                } else {
                    send_req(url_list[i].url, req.app.locals.parse_config.black_list, pat_table, (newlist, p_table) => {
                        url_list = url_list.concat(newlist)
                        url_list = url_list.unique()
                        dir_detect.page_cnt += 1
                        pat_table = p_table
                        i++
                        next(null)
                    })
                }
            }, function(err) {
                console.log(err)
                dir_detect.a_cnt = url_list.length
                    // console.log(dir_detect)
                var pat_list = {}
                pat_list.src = data.source
                pat_list.pats = []
                for (var key in pat_table) {
                    if (pat_table[key] > 1) {
                        let pat = {}
                        pat.text = key
                        pat.cnt = pat_table[key]
                        pat_list.pats.push(pat)
                    }
                }
                pat_list.pats = pat_list.pats
                console.log(pat_list)
                    // console.log(pat_list)
                DB.insert(req.app.locals.parse_config.pool_db, url_list)
                DB.insert(req.app.locals.parse_config.src_link_cntdb, dir_detect)
                DB.insert(req.app.locals.parse_config.pattern_db, pat_list)
            })
        } else {
            res.json({
                status: false,
                msg: 'source已經有url在db內'
            })
        }
    } else {
        console.log(rsp.err)
        res.json({
            status: false,
            msg: err
        })
    }
})

router.get('/pat_db', async function(req, res, next) {
    var src = req.query.src
    var DB = new GAIS(req.app.locals.parse_config.db_location)
    let pat_rec = await DB.query(req.app.locals.parse_config.pattern_db, `@src:=${src}`, 1, 1)
    if (pat_rec.status) {
        if (pat_rec.data.result.cnt) {
            // console.log(pat_rec.data.result.recs[0].rec.pats)
            var pat = JSON.parse(pat_rec.data.result.recs[0].rec.pats)
            var pat_table = {}
            pat.forEach(item => {
                pat_table[item.text] = item.cnt
            })
            res.json({
                status: true,
                data: pat_table
            })
        } else {
            res.json({
                status: true,
                data: {}
            })
        }
    } else {
        console.log(pat_rec.msg)
        res.json({
            status: false,
            msg: pat_rec.msg
        })
    }
})

router.post('/edit_pat_db', async function(req, res, next) {
    console.log("更新pattern db")
    var src = req.body.src
    var DB = new GAIS(req.app.locals.parse_config.db_location)
    let pat_rec = await DB.query(req.app.locals.parse_config.pattern_db, `@src:=${src}`, 1, 1)
    console.log(pat_rec)
    if (pat_rec.status) {
        if (pat_rec.data.result.cnt) {
            var pat = JSON.parse(pat_rec.data.result.recs[0].rec.pats)
            var pat_table = JSON.parse(req.body.pat_table)
            pat.forEach(item => {
                if (pat_table[item.text] == undefined) {
                    pat_table[item.text] = parseInt(item.cnt)
                } else {
                    pat_table[item.text] = parseInt(item.cnt) + parseInt(pat_table[item.text])
                }
            })
            var pat_list = {}
            pat_list.pats = []
            pat_list.src = src
            for (var key in pat_table) {
                if (pat_table[key] > 1) {
                    let pat = {}
                    pat.text = key
                    pat.cnt = pat_table[key]
                    pat_list.pats.push(pat)
                }
            }
            pat_list.pats = JSON.stringify(pat_list.pats)
            DB.update(req.app.locals.parse_config.pattern_db, { key: src }, 'json', pat_list)
            res.json({
                status: true,
                data: pat_table
            })
        } else {
            var pat_table = JSON.parse(req.body.pat_table)
            var pat_list = {}
            pat_list.src = src
            pat_list.pats = []
            for (var key in pat_table) {
                if (pat_table[key] > 1) {
                    let pat = {}
                    pat.text = key
                    pat.cnt = pat_table[key]
                    pat_list.pats.push(pat)
                }
            }
            pat_list.pats = JSON.stringify(pat_list.pats)
            DB.insert(req.app.locals.parse_config.pattern_db, pat_list)
            res.json({
                status: true,
                data: pat_table
            })
        }
    } else {
        console.log(pat_rec.msg)
        res.json({
            status: false,
            msg: pat_rec.msg
        })
    }
})


router.get('/linkcnt_db', async function(req, res, next) {
    var DB = new GAIS(req.app.locals.parse_config.db_location)
    var cnt_rec = await DB.query(req.app.locals.parse_config.src_link_cntdb, `@src:=${req.query.src}`, 1, 1)
    if (cnt_rec.status) {
        if (cnt_rec.data.result.cnt) {
            var cnt_data = cnt_rec.data.result.recs[0]
            var cnt_table = {}
            cnt_table.a_cnt = cnt_data.a_cnt
            cnt_table.page_cnt = cnt_data.page_cnt
            res.json({
                status: true,
                data: cnt_table
            })
        } else {
            res.json({
                status: true,
                data: { page_cnt: 0, a_cnt: 0 }
            })
        }
    } else {
        console.log(cnt_rec.msg)
        res.json({
            status: false,
            msg: cnt_rec.msg
        })
    }
})

router.post('/edit_linkcnt_db', async function(req, res, next) {
    console.log("更新linkcnt db")
    var DB = new GAIS(req.app.locals.parse_config.db_location)
    var cnt_rec = await DB.query(req.app.locals.parse_config.src_link_cntdb, `@src:=${req.body.src}`, 1, 1)
    if (cnt_rec.status) {
        if (cnt_rec.data.result.cnt) {
            var cnt_data = cnt_rec.data.result.recs[0]
            var cnt_table = {}
            cnt_table.src = req.body.src
            cnt_table.a_cnt = parseInt(cnt_data.rec.a_cnt) + parseInt(req.body.a_cnt)
            cnt_table.page_cnt = parseInt(cnt_data.rec.page_cnt) + parseInt(req.body.page_cnt)
            var update_rst = await DB.update(req.app.locals.parse_config.src_link_cntdb, { key: req.body.src }, 'json', cnt_table)
            res.json({
                status: true,
                data: cnt_table
            })
        } else {
            var cnt_table = {}
            cnt_table.a_cnt = parseInt(req.body.a_cnt)
            cnt_table.page_cnt = parseInt(req.body.page_cnt)
            cnt_table.src = req.body.src
            DB.insert(req.app.locals.parse_config.src_link_cntdb, cnt_table)
            res.json({
                status: true,
                data: cnt_table
            })
        }
    } else {
        // console.log(cnt_rec.msg)
        res.json({
            status: false,
            msg: cnt_rec.msg
        })
    }
})

router.post('/died', function(req, res, next) {
    try {
        console.log(`${req.body.user} leave`)
        var back_pool = JSON.parse(req.body.url_pool)
        if (back_pool.length) {
            console.log("-----------------------")
            console.log(req.app.locals.link_pool.length)
            req.app.locals.link_pool = req.app.locals.link_pool.concat(back_pool)
            console.log(req.app.locals.link_pool.length)
            console.log("-----------------------")
        }
        let location = -1
        req.app.locals.client_list.forEach((item, idx) => {
            if (item.id == req.body.user) {
                location = idx
            }
        })
        if (location != -1) {
            req.app.locals.client_list.splice(location, 1)
            console.log(req.app.locals.client_list)
        }
        res.json({
            status: true
        })

    } catch (e) {
        console.log(e)
        res.json({ status: false, msg: e })
    }
})

module.exports = router;