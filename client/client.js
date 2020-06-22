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
var cluster = require('cluster');
// var memcached = require('memcached')
// var cache = new memcached('localhost:8888')
var rec_file = "./rec"
var rec_file_cnt = 1
    // var rec_fd = fs.openSync(`${rec_file}${rec_file_cnt}`, "a+")
var GetMain = require('../gais_api/parseMain')
var GAIS = require('../gais_api/gais')
var urL = require('url')
var md5 = require('md5')
var events = require('events')
var em = new events.EventEmitter()
var config = {
    user: "",
    machine: "onlybtw.ddns.net:5802",
    server: "http://140.123.101.150:3080",
    pool_db: "dict_pool",
    record_db: "record3",
    pattern_db: "pattern",
    linkcnt_db: "src_ave_link",
    triple_db: "link_triple",
    fail_time_limit: 10,
    pool_size: 1000,
    batch_size: 30,
    timeout: 500,
    req_timeout: 3000,
    wait_pool_fill: 3000
}
var DB = new GAIS(config.machine)
var url_pool = []
    // var detect_table = []
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
        // if (flag) {
        //     let source = get_source(urL.parse(url).hostname)
        //     if (source != in_source) {
        //         flag = false
        //     }
        // }
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
            data.fetch = "false"
            data.fetch_time = "--"
            data.link_text = $(item).text().replace(/[\n|\t|\r|\s]/g, "")
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
        triple.link_text = item.link_text.replace(/[\n|\t|\r|\s]/g, "")
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
                    data.msg = e.code
                    cb(data)
                }
            } else {
                if (r.headers["content-type"].indexOf("text/html") == -1) {
                    data.status = false
                    data.msg = 'not html file'
                } else if (r.statusCode.toString()[0] != 5 && r.statusCode.toString()[0] != 4) {
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
            console.log(r)
            setTimeout(async function() {
                await save_rec(db, data)
                resolve()
            }, 1000)
        } else {
            resolve()
        }
    })
}

function url_back2server(url_list) {
    return new Promise(function(resolve, reject) {
        request.post({
            url: `${config.server}/url_recycle`,
            form: { data: JSON.stringify(url_list) }
        }, function(e, r, b) {
            if (e) {
                console.log(e)
                resolve()
            } else {
                resolve()
            }
        })
    })
}

// if (cluster.isMaster) {
// let file_worker = cluster.fork();
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
                } else {
                    console.log(r.msg)
                }
            })
        }, config.wait_pool_fill);
    })
}).then(() => {
    let save_data = []
    let save_url = []
    let link_triples = []
    let pat_table = {}
    async.forever(function(cb) {
        async.waterfall([
            function(cb_mid) {
                console.log(`原有${url_pool.length}個連結`)
                let url_list = url_pool.splice(0, config.batch_size)
                console.log(`剩下${url_pool.length}個連結`)
                async.each(url_list, function(item, each_cb) {
                    let url = item.url
                    let domain = urL.parse(encodeURI(url.trim())).hostname
                    let domainCode = domain == null ? "" : md5(domain)
                        // var rec_str = "";
                    fetch_url(url, async(rsp_msg) => {
                        if (rsp_msg.status) {
                            let body = rsp_msg.msg
                            let $ = cheerio.load(body)
                            let data = {}
                            data.title = $('title').text().trim()
                                // rec_str += `@title:${data.title}\n`
                            data.url = url
                                // rec_str += `@url:${data.url}\n`
                            data.UrlCode = md5(url)
                                // rec_str += `@UrlCode:${data.UrlCode}\n`
                            data.fetch_time = new Date()
                                // rec_str += `@fetch_time:${data.fetch_time}\n`
                            data.key_words = $('meta[name="keywords"]').attr("content")
                                // rec_str += `@key_words:${data.key_words}\n`
                            data.description = $('meta[name="description"]').attr("content")
                                // rec_str += `@description:${data.description}\n`
                                // $('script').remove()
                                // $('style').remove()
                                // $('noscript').remove()
                                // $('*').each(function(idx, elem) {
                                //     for (var key in elem.attribs) {
                                //         if (key != 'id' && key != 'class') {
                                //             $(this).removeAttr(key)
                                //         }
                                //     }
                                // });
                            data.domain = domain
                                // rec_str += `@domain:${data.domain}\n`
                            data.domainCode = domainCode
                                // rec_str += `@domainCode:${data.domainCode}\n`
                            let main_t = await GetMain.ParseHTML(body)
                                // data.mainText = main_t[1]
                                // rec_str += `@mainText:${data.mainText}\n`;
                            let find_dns = await get_ip(data.domain)
                            if (find_dns == "error") {
                                data.host_ip = "404"
                            } else {
                                data.host_ip = find_dns
                            }
                            // rec_str += `@host_ip:${data.host_ip}\n`
                            // rec_str += `@body:${$('body').html().replace(/[\n|\t|\r]/g, "")}\n`
                            // file_worker.send({ type: "write", content: rec_str })
                            let urls_in_page = parse_url_in_body(data.url, body)
                                // save_url = save_url.concat(urls_in_page.link_in_page)
                            link_triples = link_triples.concat(urls_in_page.link_triples)
                            update_rec(data.UrlCode, 'text', '@fetch_time' + data.fetch_time);
                            // save_data.push(data);
                            // console.log("start save")
                            // console.time(`save ${url}`)
                            await save_rec(config.record_db, data)
                                // console.timeEnd(`save ${url}`)
                            each_cb(null)
                        } else if (rsp_msg.msg == 'err') {
                            // update_rec(md5(url), 'text', '@fetch:false')
                            console.log(`${url}`)
                            console.log(rsp_msg)
                            each_cb(null)
                        } else if (rsp_msg.msg == 'break_url') {
                            console.log(`${url} is broken`)
                            each_cb(null)
                        } else {
                            console.log(url)
                            console.log(rsp_msg)
                            each_cb(null)
                        }
                    });
                }, function(err) {
                    if (err) {
                        console.log(err)
                    }
                    cb_mid(null)
                })
            },
            function(cb_mid2) {
                if (link_triples.length) {
                    save_rec(config.triple_db, link_triples)
                }
                save_data = []
                link_triples = []
                save_url = save_url.unique()
                console.log(save_url)
                    // if (save_url.length) {
                    //     url_back2server(save_url)
                    // }
                    // save_url = []
                if (url_pool.length == 0) {
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
                                console.log(r.msg)
                            }
                        })
                    }, config.wait_pool_fill);
                } else {
                    cb(null)
                }
            }
        ])
    }, function(err) {
        console.log('leave loop')
        console.log(err)
    })
});
// } else {
//     var rec_fd = fs.openSync(`${rec_file}${rec_file_cnt}`, "a+")
//     process.on('message', function(msg) {
//         if (msg.type == "write") {
//             if (fs.existsSync(`${rec_file}${rec_file_cnt}`)) {
//                 //file exists
//                 let stats = fs.statSync(`${rec_file}${rec_file_cnt}`)
//                 let fileSizeInBytes = stats["size"]
//                 if (fileSizeInBytes > 200000000) {
//                     rec_file_cnt++
//                     fs.closeSync(rec_fd)
//                     rec_fd = fs.openSync(`${rec_file}${rec_file_cnt}`, "a+")
//                 }
//             }
//             fs.writeSync(rec_fd, msg.content + "\n")
//         }
//     })
// }
//time out code :ESOCKETTIMEDOUT