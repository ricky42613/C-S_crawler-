var cheerio = require('cheerio')
var async = require('async')
var request = require('request')
var dns = require('dns')
var fs = require('fs')
var dnscache = require('dnscache')({
    "enable": true,
    "ttl": 300,
    "cachesize": 1000
});

var GetMain = require('../gais_api/parseMain')
var GAIS = require('../gais_api/gais')
var urL = require('url')
var md5 = require('md5')
var config = {
    machine: "onlybtw.ddns.net:5802",
    server: "http://127.0.0.1:3080",
    extend_pool_db: "wns_url_extend",
    pool_size: 1000,
    batch_size: 30,
    req_timeout: 3000,
    wait_pool_fill: 3000
}
var DB = new GAIS(config.machine)
var url_pool = []
var black_key_list = ['undefined', '../', 'javascript:', 'mailto:']

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

function get_url_from_server(cb) {
    let api = `${config.server}/get_url?size=${config.pool_size}`
    request({
        url: api,
        method: 'GET'
    }, function(e, r, b) {
        if (e) {
            let data = {}
            data.status = false
            data.msg = e
            cb(data)
        } else {
            let rsp = JSON.parse(r.body)
            let data = {}
            if (rsp.status) {
                data.status = true
                data.pool = rsp.url_list
                cb(data)
            } else {
                data.status = false
                data.msg = rsp.msg
                cb(data)
            }
        }
    })
}

function fetch_url(url, cb) {
    try {
        request({
            url: url,
            method: 'GET',
            timeout: config.req_timeout
        }, function(e, r, b) {
            let data = {}
            if (e) {
                data.status = false
                data.msg = e.code
                cb(data)
            } else {
                if (typeof r.headers["content-type"] == "undefined") {
                    data.status = false
                    data.msg = 'not html file'
                } else if (r.headers["content-type"].indexOf("text/html") == -1) {
                    data.status = false
                    data.msg = 'not html file'
                } else if (r.statusCode.toString()[0] != 5 && r.statusCode.toString()[0] != 4) {
                    data.status = true
                    data.msg = r.body
                } else {
                    data.status = false
                    data.msg = r.statusCode.toString()
                }
                cb(data)
            }
        })
    } catch (e) {
        let data = {}
        data.status = false
        data.msg = 'break_url'
        cb(data)
    }
}

function filter_black(url) {
    let flag = true
    black_key_list.forEach(item => {
        if (url.indexOf(item) != -1) {
            flag = false
        }
    })
    return flag
}

function filter_domain(url, in_domain) {
    let flag = true
    black_key_list.forEach(item => {
        let domain = urL.parse(url).hostname
        if (domain != in_domain) {
            flag = false
        }
    })
    return flag
}

function parse_url_in_body(url, body) {
    let $ = cheerio.load(body)
    let main_url = urL.parse(url)
    let main_site = main_url.protocol + "//" + main_url.hostname
    let links_in_page = $('a').get().map(item => {
        let data = {}
        if (typeof $(item).attr('href') != "undefined") {
            if ($(item).attr('href').trim().slice(0, 4).indexOf('http') != -1) {
                data.url = $(item).attr('href')
            } else if ($(item).attr('href').trim()[0] == '/') {
                if ($(item).attr('href').trim()[1] == '/') {
                    data.url = main_url.protocol + $(item).attr('href').trim()
                } else {
                    data.url = main_site + $(item).attr('href').trim()
                }
            } else if ($(item).attr('href').trim()[0] == ':') {
                data.url = main_url.protocol.slice(0, -1) + $(item).attr('href').trim()
            } else if ($(item).attr('href').trim()[0] == '#') {
                data.url = 'undefined'
            } else {
                let cut = url.lastIndexOf('/') + 1
                let basic = url.slice(0, cut)
                data.url = basic + $(item).attr('href')
            }
            if (data.url.indexOf('#') != -1) { //去除fragment
                let idx = data.url.indexOf('#')
                data.url = data.url.slice(0, idx)
            }
            data.url = encodeURI(data.url)
            data.fetch = "false"
            data.fetch_time = "--"
            data.link_text = $(item).text().replace(/[\n|\t|\r|\s]/g, "")
            if (data.link_text.length == 0) {
                data.link_text = "no text"
            }
            data.UrlCode = md5(data.url)
            data.domain = main_url.hostname
        } else {
            data.url = "undefined"
        }
        return data
    })
    links_in_page = links_in_page.unique()
    links_in_page = links_in_page.filter(item => {
        return filter_black(item.url)
    })
    let new_links = links_in_page.filter(item => {
        return filter_domain(item.url, main_url.hostname)
    })
    let link_triples = links_in_page.filter(item => {
        return !filter_domain(item.url, main_url.hostname)
    }).map(item => {
        let rst = ""
        rst += url
        rst += " $ "
        rst += item.link_text
        rst += " $ "
        rst += item.url
        return rst
    })
    let response = {
        link_triples: link_triples,
        new_links: new_links
    }
    return response
}

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

var promise = new Promise(async function(resolve, reject) {
    let timer = setInterval(() => {
        get_url_from_server(r => {
            if (r.status) {
                if (r.pool.length) {
                    url_pool = r.pool
                    console.log(`取得${r.pool.length}筆url`)
                    resolve()
                    clearInterval(timer)
                } else {
                    console.log("取回數量0,重新索取")
                }
            } else {
                console.log(r.msg)
            }
        })
    }, config.wait_pool_fill);
}).then(() => {
    async.forever(function(outer_callback) {
        async.waterfall([
            function(next) { //處理完當前的pool
                async.forever(function(callback) {
                    if (url_pool.length) {
                        let url_list = url_pool.splice(0, config.batch_size)
                        console.log(`處理${url_list.length}筆資料`)
                        async.each(url_list, function(item, inner_callback) {
                            let url = item.url
                            fetch_url(url, async function(rsp) {
                                if (rsp.status) {
                                    let rec_str = ""
                                    let body = rsp.msg
                                    let $ = cheerio.load(body)
                                    rec_str += `@title:${$('title').text().trim()}\n`
                                    rec_str += `@url:${url}\n`
                                    rec_str += `@UrlCode:${md5(url)}\n`
                                    let current_time = new Date()
                                    rec_str += `@fetch_time:${current_time}\n`
                                    if (typeof $('meta[name="keywords"]').attr("content") == "undefined") {
                                        rec_str += `@key_words:\n`
                                    } else {
                                        rec_str += `@key_words:${$('meta[name="keywords"]').attr("content")}\n`
                                    }
                                    if (typeof $('meta[name="description"]').attr("content") == "undefined") {
                                        rec_str += `@description:\n`
                                    } else {
                                        rec_str += `@description:${$('meta[name="description"]').attr("content")}\n`
                                    }
                                    let domain = urL.parse(encodeURI(url.trim())).hostname
                                    rec_str += `@domain:${domain}\n`
                                    let main_content = await GetMain.ParseHTML(body)
                                    rec_str += `@main_content:${main_content[1]}`
                                        //save record
                                    fs.appendFileSync("record", rec_str)
                                    let page_url_info = parse_url_in_body(url, body)
                                    if (page_url_info.link_triples.length) {
                                        fs.appendFileSync("linktriple", page_url_info.link_triples.join("\n")) // save new link triples
                                    }
                                    if (page_url_info.new_links.length) {
                                        await save_rec(config.extend_pool_db, page_url_info.new_links)
                                    }
                                    await update_rec(item.UrlCode, 'text', `@fetch_time:${current_time},@fetch:true`);
                                    inner_callback()
                                } else {
                                    if (typeof rsp.msg == "undefined") {
                                        rsp.msg = "err"
                                    }
                                    if (rsp.msg.toString() != "ETIMEDOUT" && rsp.msg.toString() != "ESOCKETTIMEDOUT") {
                                        let current_time = new Date()
                                        await update_rec(item.UrlCode, 'text', `@fetch_time:${current_time},@fetch:true`);
                                    }
                                    inner_callback()
                                }
                            })
                        }, function(err) {
                            if (err) {
                                console.log(err)
                            }
                            callback(null)
                        })
                    } else {
                        callback('done')
                    }
                }, function(err) {
                    next(null)
                })
            },
            function(next2) {
                let timer = setInterval(() => {
                    get_url_from_server(r => {
                        if (r.status) {
                            if (r.pool.length) {
                                url_pool = r.pool
                                console.log(`取得${r.pool.length}筆url`)
                                clearInterval(timer)
                                next2('done')
                            } else {
                                console.log("取回數量0,重新索取")
                            }
                        } else {
                            console.log(r.msg)
                        }
                    })
                }, config.wait_pool_fill);
            }
        ], function(err) {
            outer_callback(null)
        })
    })
})