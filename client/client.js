var cheerio = require('cheerio')
var async = require('async')
var request = require('request')
var dns = require('dns')
var dnscache = require('dnscache')({
        "enable": true,
        "ttl": 300,
        "cachesize": 1000
    })
    // var memcached = require('memcached')
    // var cache = new memcached('localhost:8888')
var GetMain = require('../gais_api/parseMain')
var GAIS = require('../gais_api/gais')
var urL = require('url')
var md5 = require('md5')
var events = require('events')
var em = new events.EventEmitter()
var minify = require('html-minifier').minify
var config = {
    user: "",
    machine: "nubot70.taiwin.tw:5802",
    server: "http://140.123.101.150:3080",
    pool_db: "dict_pool",
    record_db: "dict_record",
    pattern_db: "pattern",
    linkcnt_db: "src_ave_link",
    triple_db: "link_triple",
    fail_time_limit: 10,
    pool_size: 1000,
    batch_size: 30,
    timeout: 500,
    req_timeout: 10000,
    wait_pool_fill: 3000
}
var DB = new GAIS(config.machine)
var url_pool = []
var detect_table = []
var black_key_list = ['undefined', '../', 'javascript:', 'mailto:']
var src_pat_ctrl = 0
var linkcnt_ctrl = 0

function shutDown() {
    console.log('process準備終止')
    request({
        url: `${config.server}/died`,
        method: 'POST',
        form: {
            url_pool: JSON.stringify(url_pool),
            user: config.user
        }
    }, function(e, r, b) {
        if (e) {
            console.log('發生錯誤')
            console.log(e)
        } else {
            rsp = JSON.parse(r.body)
            if (rsp.status) {
                console.log('返還完成')
            } else {
                console.log('發生錯誤')
                console.log(rsp.msg)
            }
        }
        process.exit()
    })
}

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

em.on('ban', function(data) { //爬蟲阻擋偵測
    console.log(`${data}被ban了\n最後fetch到的內容為${detect_table[md5(data)].content}`)
})

/*em.on('check_src_pat', function(data) { //取得source的pattern db
    //data:pat_${src}
    let timer = setInterval(function() {
        if (!src_pat_ctrl) {
            src_pat_ctrl = 1
            cache.get(data, function(err, rsp) {
                if (err) {
                    console.log(err)
                    src_pat_ctrl = 0
                    clearInterval(timer)
                } else {
                    if (typeof(rsp) == 'undefined') {
                        get_pat_record(data, (success, msg) => {
                            if (success) {
                                cache.set(data, JSON.stringify(msg), 3 * 60 * 60, err => {
                                    if (err) {
                                        console.log(err)
                                    }
                                    src_pat_ctrl = 0
                                    clearInterval(timer)
                                })
                            } else {
                                console.log(msg)
                                src_pat_ctrl = 0
                                clearInterval(timer)
                            }
                        })
                    } else {
                        src_pat_ctrl = 0
                        clearInterval(timer)
                    }
                }
            })
        }
    }, 500)
})

em.on('get_src_ave_linkcnt', function(data) { //取得source的平均連結數量資訊
    //data:linkcnt_${src}
    let timer = setInterval(function() {
        if (!linkcnt_ctrl) {
            linkcnt_ctrl = 1
            cache.get(data, function(err, rsp) {
                if (err) {
                    console.log(err)
                    linkcnt_ctrl = 0
                    clearInterval(timer)
                } else {
                    if (typeof(rsp) == 'undefined') {
                        get_linkcnt_record(data, (success, msg) => {
                            if (success) {
                                cache.set(data, msg, 3 * 60 * 60, err => {
                                    if (err) {
                                        console.log(err)
                                    }
                                    linkcnt_ctrl = 0
                                    clearInterval(timer)
                                })
                            } else {
                                console.log(msg)
                                linkcnt_ctrl = 0
                                clearInterval(timer)
                            }
                        })
                    } else {
                        linkcnt_ctrl = 0
                        clearInterval(timer)
                    }
                }
            })
        }
    }, 500)
})*/

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

function get_linkcnt_record(src, cb) {
    request({
        url: `${config.server}/linkcnt_db?src=${src}`,
        method: 'GET'
    }, function(e, r, b) {
        if (e) {
            console.log(e)
            cb(false, e)
        } else {
            let rsp = JSON.parse(r.body)
            if (rsp.status) {
                cb(true, rsp.data)
            } else {
                cb(false, rsp.msg)
            }
        }
    })
}

function update_linkcnt_record(src, data, cb) {
    let body = {}
    body.src = src
    body.page_cnt = data.page_cnt
    body.a_cnt = data.a_cnt
    request({
        method: 'POST',
        url: `${config.server}/edit_linkcnt_db`,
        form: body
    }, function(e, r, b) {
        if (e) {
            console.log(e)
            cb(false, e)
        } else {
            let rsp = JSON.parse(r.body)
            if (rsp.status) {
                cb(true, rsp.data)
            } else {
                cb(false, rsp.msg)
            }
        }
    })
}

function get_pat_record(src, cb) {
    request({
        url: `${config.server}/linkcnt_db?src=${src}`,
        method: 'GET'
    }, function(e, r, b) {
        if (e) {
            console.log(e)
            cb(false, e)
        } else {
            let rsp = JSON.parse(r.body)
            if (rsp.status) {
                cb(true, rsp.data)
            } else {
                cb(false, rsp.msg)
            }
        }
    })
}

function update_pat_record(src, data, cb) {
    let body = {}
    body.src = src
    body.pat_table = JSON.stringify(data)
    request({
        method: 'POST',
        url: `${config.server}/edit_pat_db`,
        form: body
    }, function(e, r, b) {
        if (e) {
            console.log(e)
            cb(false, e)
        } else {
            try {
                let rsp = JSON.parse(r.body)
                if (rsp.status) {
                    cb(true, rsp.data)
                } else {
                    cb(false, rsp.msg)
                }
            } catch (e) {
                console.log(e)
                cb(false, e)
            }
        }
    })
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

function get_ip(hostname) {
    return new Promise(function(resolve, reject) {
        dns.lookup(hostname, function(err, addr, family) {
            if (err) {
                resolve("error")
            } else {
                resolve(addr)
            }
        })
    })
}

function get_url_from_server(cb) {
    if (config.user.length) {
        let api = `${config.server}/get_url?size=${config.pool_size}&user=${config.user}`
        request({
            url: api,
            method: 'GET'
        }, function(e, r, b) {
            if (e) {
                console.log(e)
            } else {
                let rsp = JSON.parse(r.body)
                let data = {}
                if (rsp.status) {
                    let pool = rsp.url_list.map(item => {
                        return item.url
                    })
                    data.status = true
                    data.pool = pool
                    cb(data)
                } else {
                    data.status = false
                    data.msg = rsp.msg
                    cb(data)
                }
            }
        })
    } else {
        cb({
            status: false,
            msg: '請先註冊'
        })
    }
}

function get_source(text) {
    try {
        let start = text.indexOf(".")
        text2 = text.slice(start + 1)
        let end = text2.indexOf(".")
        if (end != -1) {
            text = text2.slice(0, end)
        } else {
            text = text.slice(0, start)
        }
        return text
    } catch (e) {
        return 'err'
    }
}

function filter_black(url, in_source) {
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

function parse_url_in_body(url, body) {
    let $ = cheerio.load(body)
    let main_url = urL.parse(url)
    let main_site = main_url.protocol + "//" + main_url.hostname
    let links_in_page = $('a').get().map(item => {
        let data = {}
        if (typeof $(item).attr('href') != "undefined") {
            if ($(item).attr('href').slice(0, 4).indexOf('http') != -1) {
                data.url = $(item).attr('href')
            } else if ($(item).attr('href')[0] == '/') {
                if ($(item).attr('href')[1] == '/') {
                    data.url = main_url.protocol + $(item).attr('href').trim()
                } else {
                    data.url = main_site + $(item).attr('href').trim()
                }
            } else {
                let cut = url.lastIndexOf('/') + 1
                let basic = url.slice(0, cut)
                data.url = basic + $(item).attr('href')
            }
            data.fetch = "false"
            data.fetch_time = "--"
            data.link_text = $(item).text()
            if (data.url.indexOf('#') != -1) {
                let idx = data.url.indexOf('#')
                data.url = data.url.slice(0, idx)
            }
            data.UrlCode = md5(data.url)
            data.source = get_source(main_url.hostname)
        } else {
            data.url = "undefined"
        }
        return data
    })
    links_in_page = links_in_page.unique()
    links_in_page = links_in_page.filter(item => {
        return filter_black(item.url, get_source(main_url.hostname))
    })
    let link_triples = links_in_page.map(item => {
        let triple = {}
        triple.target = item.url
        triple.link_text = item.link_text
        triple.source = url
        triple.tid = md5(triple.target + triple.source)
        return triple
    })
    let response = {
        link_triples: link_triples,
        link_in_page: links_in_page
    }
    return response
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
                if (e.code == 'ERR_UNESCAPED_CHARACTERS') {
                    fetch_url(encodeURI(url), rsp => {
                        cb(rsp)
                    })
                } else {
                    data.status = false
                    data.msg = 'err'
                    cb(data)
                }
            } else {
                if (r.statusCode.toString()[0] != 5 && r.statusCode.toString()[0] != 4) {
                    data.status = true
                    data.msg = r.body
                    cb(data)
                } else {
                    data.status = false
                    data.msg = r.statusCode.toString()
                    cb(data)
                }
            }
        })
    } catch (e) {
        let data = {}
        data.status = false
        data.msg = 'break_url'
        cb(data)
    }
}

function register(cb) {
    request({
        url: `${config.server}/add_client`,
        method: 'GET'
    }, function(e, r, b) {
        if (e) {
            console.log(e)
            register(user => {
                cb(user)
            })
        } else {
            let rsp = JSON.parse(r.body)
            cb(rsp.user)
        }
    })
}

var promise = new Promise(async function(resolve, reject) {
    register(user => {
        config.user = user
        console.log(`user name is ${user}`)
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
                }
            })
        }, config.wait_pool_fill);
    })
}).then(() => {
    let save_data = []
    let save_url = []
    let link_triples = []
    let link_cnt_per_src = {}
    let pat_table = {}
    async.forever(function(cb) {
        async.waterfall([
            function(cb_mid) {
                let url_list = url_pool.splice(0, config.batch_size)
                console.log(`開始處理${url_list.length}個連結`)
                let cnt = 0
                let total_len = url_list.length
                async.eachLimit(url_list, config.batch_size, function(url, cb) {
                    (async function() {
                        let domain = urL.parse(encodeURI(url.trim())).hostname
                            // em.emit('check_src_pat', `pat_${get_source(domain)}`)
                            // em.emit('get_src_ave_linkcnt', `linkcnt_${get_source(domain)}`)
                        let domainCode = md5(domain)
                        if (detect_table[domainCode] == undefined || detect_table[domainCode].cnt < config.fail_time_limit) {
                            fetch_url(url.trim(), async(rsp_msg) => {
                                if (rsp_msg.status) {
                                    let body = rsp_msg.msg
                                    let $ = cheerio.load(body)
                                    let data = {}
                                    data.title = $('title').text().trim()
                                    data.url = url
                                    data.UrlCode = md5(url)
                                    data.fetch_time = new Date()
                                    data.key_words = $('meta[name="keywords"]').attr("content")
                                    data.description = $('meta[name="description"]').attr("content")
                                    $('script').remove()
                                    $('style').remove()
                                    $('noscript').remove()
                                    $('*').each(function(idx, elem) {
                                        for (var key in elem.attribs) {
                                            if (key != 'id' && key != 'class') {
                                                $(this).removeAttr(key)
                                            }
                                        }
                                    });
                                    data.domain = domain
                                    data.domainCode = domainCode
                                    let main_t = await GetMain.ParseHTML(body)
                                    data.mainText = main_t[1]
                                    if (main_t[0] != 'null') {
                                        $(main_t[0]).addClass("my_main_block")
                                        $(main_t[0]).find('*').each((idx, inneritem) => {
                                            let key = $(inneritem).text().replace(/[\n|\t|\r|\s]/g, "").toString()
                                            if (!is_time($(inneritem).text().replace(/[\n|\t|\r]/g, ""))) {
                                                if (key.length < 30 && key.length) {
                                                    if (pat_table[get_source(domain)] != undefined) {
                                                        if (pat_table[get_source(domain)][key] != undefined) {
                                                            pat_table[get_source(domain)][key] += 1
                                                        } else {
                                                            pat_table[get_source(domain)][key] = 1
                                                        }
                                                    } else {
                                                        pat_table[get_source(domain)] = {}
                                                        pat_table[get_source(domain)][key] = 1
                                                    }
                                                }
                                            }
                                        })
                                    }
                                    try {
                                        data.body = minify($('body').html(), { collapseWhitespace: true, removeEmptyElements: true, removeComments: true })
                                    } catch (e) {}
                                    // let ban = 0
                                    if (detect_table[domainCode] == undefined) {
                                        detect_table[domainCode] = { content: main_t[1], cnt: 1 }
                                    } else {
                                        if (detect_table[domainCode].content == main_t[1]) {
                                            detect_table[domainCode].cnt++;
                                            if (detect_table[domainCode].cnt == config.fail_time_limit) {
                                                em.emit('ban', domain)
                                                ban = 1
                                            }
                                        } else {
                                            detect_table[domainCode] = { content: main_t, cnt: 1 }
                                        }
                                    }
                                    // if (!ban) {
                                    let find_dns = await get_ip(data.domain)
                                    if (find_dns == "error") {
                                        data.host_ip = "404"
                                    } else {
                                        data.host_ip = find_dns
                                    }
                                    let urls_in_page = parse_url_in_body(data.url, body)
                                    if (link_cnt_per_src[get_source(domain)] != undefined) {
                                        link_cnt_per_src[get_source(domain)].page_cnt += 1
                                        link_cnt_per_src[get_source(domain)].a_cnt += urls_in_page.link_in_page.length
                                    } else {
                                        link_cnt_per_src[get_source(domain)] = {}
                                        link_cnt_per_src[get_source(domain)].page_cnt = 1
                                        link_cnt_per_src[get_source(domain)].a_cnt = urls_in_page.link_in_page.length
                                    }
                                    save_url = save_url.concat(urls_in_page.link_in_page)
                                    link_triples = link_triples.concat(urls_in_page.link_triples)
                                    DB.update(config.pool_db, { key: data.UrlCode }, 'text', "@fetch_time:" + data.fetch_time)
                                    save_data.push(data);
                                    // }
                                    cb()
                                } else if (rsp_msg.msg == 'err') {
                                    if (detect_table[domainCode] == undefined) {
                                        detect_table[domainCode] = { content: 'err', cnt: 1 }
                                    } else {
                                        if (detect_table[domainCode].content == 'err') {
                                            detect_table[domainCode].cnt++;
                                            if (detect_table[domainCode].cnt == config.fail_time_limit) {
                                                em.emit('ban', domain)
                                            }
                                        } else {
                                            detect_table[domainCode] = { content: 'err', cnt: 1 }
                                        }
                                    }
                                    DB.update(config.pool_db, { key: md5(url) }, 'text', "@fetch:false")
                                    cb()
                                } else if (rsp_msg.msg == 'break_url') {
                                    console.log(`${url} is broken`)
                                    cb()
                                } else {
                                    cb()
                                }
                            })
                        } else {
                            DB.update(config.pool_db, { key: md5(url) }, 'text', "@fetch:false")
                            cb()
                        }
                    })()
                }, function(err) {
                    if (err) {
                        console.log(err)
                    }
                    cb_mid(null)
                })
            },
            function(cb_mid2) {
                if (url_pool.length == 0) {
                    for (let src in link_cnt_per_src) {
                        update_linkcnt_record(src, link_cnt_per_src[src], (success, rst) => {
                            // if (success) {
                            //     cache.set(`linkcnt_${src}`, rst, 3 * 60 * 60, function(err) {
                            //         if (err) {
                            //             console.log(err)
                            //         }
                            //     })
                            // } else {
                            //     console.log(rst)
                            // }
                        });
                    }
                    //         for (let src in pat_table) {
                    //             // update_pat_record(src, pat_table[src], (success, rst) => {
                    //             if (success) {
                    //                 cache.set(`pat_${src}`, rst, 3 * 60 * 60, function(err) {
                    //                     if (err) {
                    //                         console.log(err)
                    //                     }
                    //                 })
                    //             } else {
                    //                 console.log(rst)
                    //             }
                    //         // })
                    // }
                    save_url = save_url.unique()
                    console.log(`預計儲存record${save_data.length}`)
                    if (save_data.length) {
                        DB.insert(config.record_db, save_data)
                    }
                    if (save_url.length) {
                        DB.insert(config.pool_db, save_url)
                    }
                    if (link_triples.length) {
                        DB.insert(config.triple_db, link_triples)
                    }
                    save_data = []
                    save_url = []
                    link_triples = []
                    link_cnt_per_src = {}
                    pat_table = {}
                    console.log('pool已空，向server請求連結')
                    let timer = setInterval(() => {
                        get_url_from_server(r => {
                            if (r.status) {
                                if (r.pool.length) {
                                    url_pool = r.pool
                                    cb(null)
                                    clearInterval(timer)
                                }
                            } else {
                                if (r.msg != 'queue已空') {
                                    cb(r.msg)
                                    clearInterval(timer)
                                }
                            }
                        })
                    }, config.wait_pool_fill);
                } else {
                    setTimeout(() => {
                        cb(null)
                    }, config.timeout);
                }
            }
        ])
    }, function(err) {
        console.log(err)
    })
});
//time out code :ESOCKETTIMEDOUT