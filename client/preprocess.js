var async = require('async')
var request = require('request')
var GetMain = require('../gais_api/parseMain')
var cheerio = require('cheerio')
var GAIS = require('../gais_api/gais')
var urL = require('url')
var md5 = require('md5')
var fs = require('fs')
var dns = require('dns')

var sourceDB = 'http://nubot70.taiwin.tw:5802'
var targetDB = new GAIS('gaisdb.ccu.edu.tw:5805')
var record_db = "original_rec"
var start = parseInt(process.argv[2])
var url_file_path = `./url_${start}.txt`
var f_url = fs.openSync(url_file_path, "a+")
var conf = `./config_${start}`
var url_file_cnt = 1
var triple_file_path = `./triple_${start}.txt`
var f_triple = fs.openSync(triple_file_path, "a+")
var triple_file_cnt = 1
var total_size = parseInt(process.argv[3])
var END_RID = start + total_size
var black_key_list = ['undefined', '../', 'javascript:', 'mailto:']
var shutdown_signal = 0
var batch = 10
var batch_cnt = 0

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

function query_rid(rid_list, cb) {
    let form = {}
    form.rid = rid_list.join(",")
    form.db = 'sw_txt'
    form.out = 'json'
    form.getrec = 'y'
    form.select = '@url:'
    request.post({
        url: `${sourceDB}/nudb/rget`,
        form: form
    }, function(e, r, b) {
        let data = {}
        if (e) {
            data.status = false
            data.msg = e
        } else {
            data.status = true
            let url_list = JSON.parse(r.body).result.filter(item => {
                return item.hasOwnProperty('rec')
            })
            data.record = url_list
        }
        cb(data)
    })
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

function get_source(text) {
    try {
        let begin = text.indexOf(".")
        text2 = text.slice(begin + 1)
        let end = text2.indexOf(".")
        if (end != -1) {
            text = text2.slice(0, end)
        } else {
            text = text.slice(0, begin)
        }
        return text
    } catch (e) {
        return 'err'
    }
}

function filter_black(url, in_domain) {
    let flag = true
    black_key_list.forEach(item => {
        if (url.indexOf(item) != -1) {
            flag = false
        }
        if (flag) {
            if (urL.parse(url).hostname != in_domain) {
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
        return filter_black(item.url, main_url.hostname)
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
        if (url.slice(-3) == "pdf") {
            let data = {}
            data.status = false
            data.msg = 'not html file'
            cb(data)
        } else {
            request({
                url: url,
                method: 'GET',
                timeout: 3000,
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
                    try {
                        if (r.statusCode.toString()[0] != 5 && r.statusCode.toString()[0] != 4) {
                            if (r.headers["content-type"].indexOf("text/html") == -1) {
                                data.status = false
                                data.msg = 'not html file'
                            } else {
                                data.status = true
                                data.msg = r.body
                            }
                            cb(data)
                        } else {
                            data.status = false
                            data.msg = r.statusCode.toString()
                            cb(data)
                        }
                    } catch (e) {
                        data.status = false
                        data.msg = 'err'
                    }
                }
            })
        }
    } catch (e) {
        let data = {}
        data.status = false
        data.msg = 'break_url'
        cb(data)
    }
}

function save_rec(db, data) {
    return new Promise(async function(resolve, reject) {
        let r = await targetDB.insert(db, data)
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
var p = new Promise(function(resolve, reject) {
    console.log("start")
    if (fs.existsSync(conf)) {
        fs.readFile(conf, "utf-8", function(err, data) {
            if (err) {
                console.log(err)
            } else {
                start = parseInt(data)
            }
            resolve()
        })
    } else {
        console.log(start)
        resolve()
    }
}).then(() => {
    console.log(`從${start}處開始爬取`)
    async.forever(function(next) {
        if (shutdown_signal) {
            next('done')
        } else if (start < END_RID) {
            var p = new Promise(function(resolve, reject) {
                let rid_list = []
                batch_cnt = 0
                for (let i = 0; i < 4096; i++) {
                    if (start + i < END_RID) {
                        rid_list.push(start + i)
                    }
                }

                query_rid(rid_list, rsp => {
                    if (rsp.status) {
                        console.log(`開始從rid:${rid_list[0]}起處理4096筆資料`)
                        async.forever(function(inner_next) {
                            if (shutdown_signal) {
                                inner_next('done')
                            } else {
                                let current_batch = rsp.record.splice(0, batch)
                                batch_cnt += 1
                                console.log(`batch_cnt:${batch_cnt},start:${start},batch:${batch}`)
                                let offset = start + (batch_cnt * batch)
                                fs.writeFileSync(conf, `${offset}`, err => {
                                    if (err) {
                                        console.log(err)
                                    }
                                })
                                if (current_batch.length) {
                                    // let cnt = 0
                                    // let batch_len = current_batch.length
                                    async.eachLimit(current_batch, 30, function(item, callback) {
                                        try {
                                            let url = item.rec.url
                                            fetch_url(url, async rst => {
                                                if (rst.status) {
                                                    let body = rst.msg
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
                                                    data.domain = urL.parse(encodeURI(url.trim())).hostname
                                                    data.domainCode = data.domain == null ? "" : md5(data.domain)
                                                    let main_t = await GetMain.ParseHTML(body)
                                                    data.mainText = main_t[1]
                                                    let find_dns = await get_ip(data.domain)
                                                    if (find_dns == "error") {
                                                        data.host_ip = "404"
                                                    } else {
                                                        data.host_ip = find_dns
                                                    }
                                                    let urls_in_page = parse_url_in_body(data.url, body)
                                                    let save_url_str = ""
                                                    urls_in_page.link_in_page.forEach(item => {
                                                        for (key in item) {
                                                            save_url_str += `@${key}:${item[key]}\n`
                                                        }
                                                    })
                                                    let save_triple_str = ""
                                                    urls_in_page.link_triples.forEach(item => {
                                                        for (key in item) {
                                                            save_triple_str += `@${key}:${item[key]}\n`
                                                        }
                                                    })
                                                    await save_rec(record_db, data)
                                                        // save_rec(record_db, data)
                                                    if (fs.existsSync(url_file_path)) {
                                                        //file exists
                                                        let stats = fs.statSync(url_file_path)
                                                        let fileSizeInBytes = stats["size"]
                                                        if (fileSizeInBytes > 200000000) {
                                                            url_file_path = url_file_path + "-" + url_file_cnt
                                                            url_file_cnt++
                                                            fs.closeSync(f_url)
                                                            f_url = fs.openSync(triple_file_path, "a+")
                                                        }
                                                    }
                                                    //here
                                                    fs.write(f_url, save_url_str, function(err, fd) {
                                                        if (err) {
                                                            console.log(err)
                                                        }
                                                        if (fs.existsSync(triple_file_path)) {
                                                            let stats = fs.statSync(triple_file_path)
                                                            let fileSizeInBytes = stats["size"]
                                                            if (fileSizeInBytes > 200000000) {
                                                                triple_file_path = triple_file_path + "-" + triple_file_cnt
                                                                triple_file_cnt++
                                                                fs.closeSync(f_triple)
                                                                f_triple = fs.openSync(triple_file_path, "a+")
                                                            }
                                                        }
                                                        fs.write(f_triple, save_triple_str, function(err, fd) {
                                                            if (err) {
                                                                console.log(err)
                                                            }
                                                            // cnt++
                                                            // if (cnt == batch_len) {
                                                            //     inner_next(null)
                                                            // }
                                                        })
                                                    })
                                                    callback()
                                                } else {
                                                    console.log(url)
                                                    console.log(rst.msg)
                                                    callback()
                                                }
                                            })
                                        } catch (e) {
                                            console.log(e)
                                            callback()
                                        }
                                    }, function(err) {
                                        if (err) {
                                            console.log(err);
                                        }
                                        inner_next(null)
                                    });
                                    // current_batch.forEach(item => {
                                    //     if (shutdown_signal) {
                                    //         callback('shutdown')
                                    //     } else {
                                    //         let url = item.rec.url
                                    // fetch_url(url, async rst => {
                                    //     if (rst.status) {
                                    //         let body = rst.msg
                                    //         let $ = cheerio.load(body)
                                    //         let data = {}
                                    //         data.title = $('title').text().trim()
                                    //         data.url = url
                                    //         data.UrlCode = md5(url)
                                    //         data.fetch_time = new Date()
                                    //         data.key_words = $('meta[name="keywords"]').attr("content")
                                    //         data.description = $('meta[name="description"]').attr("content")
                                    //         $('script').remove()
                                    //         $('style').remove()
                                    //         $('noscript').remove()
                                    //         $('*').each(function(idx, elem) {
                                    //             for (var key in elem.attribs) {
                                    //                 if (key != 'id' && key != 'class') {
                                    //                     $(this).removeAttr(key)
                                    //                 }
                                    //             }
                                    //         });
                                    //         data.domain = urL.parse(encodeURI(url.trim())).hostname
                                    //         data.domainCode = data.domain == null ? "" : md5(data.domain)
                                    //         let main_t = await GetMain.ParseHTML(body)
                                    //         data.mainText = main_t[1]
                                    //         let find_dns = await get_ip(data.domain)
                                    //         if (find_dns == "error") {
                                    //             data.host_ip = "404"
                                    //         } else {
                                    //             data.host_ip = find_dns
                                    //         }
                                    //         let urls_in_page = parse_url_in_body(data.url, body)
                                    //         let save_url_str = ""
                                    //         urls_in_page.link_in_page.forEach(item => {
                                    //             for (key in item) {
                                    //                 save_url_str += `@${key}:${item[key]}\n`
                                    //             }
                                    //         })
                                    //         let save_triple_str = ""
                                    //         urls_in_page.link_triples.forEach(item => {
                                    //             for (key in item) {
                                    //                 save_triple_str += `@${key}:${item[key]}\n`
                                    //             }
                                    //         })
                                    //         await save_rec(record_db, data)
                                    //             // save_rec(record_db, data)
                                    //         if (fs.existsSync(url_file_path)) {
                                    //             //file exists
                                    //             let stats = fs.statSync(url_file_path)
                                    //             let fileSizeInBytes = stats["size"]
                                    //             if (fileSizeInBytes > 200000000) {
                                    //                 url_file_path = url_file_path + "-" + url_file_cnt
                                    //                 url_file_cnt++
                                    //                 fs.closeSync(f_url)
                                    //                 f_url = fs.openSync(triple_file_path, "a+")
                                    //             }
                                    //         }
                                    //         //here
                                    //         fs.write(f_url, save_url_str, function(err, fd) {
                                    //             if (err) {
                                    //                 console.log(err)
                                    //             }
                                    //             if (fs.existsSync(triple_file_path)) {
                                    //                 let stats = fs.statSync(triple_file_path)
                                    //                 let fileSizeInBytes = stats["size"]
                                    //                 if (fileSizeInBytes > 200000000) {
                                    //                     triple_file_path = triple_file_path + "-" + triple_file_cnt
                                    //                     triple_file_cnt++
                                    //                     fs.closeSync(f_triple)
                                    //                     f_triple = fs.openSync(triple_file_path, "a+")
                                    //                 }
                                    //             }
                                    //             fs.write(f_triple, save_triple_str, function(err, fd) {
                                    //                 if (err) {
                                    //                     console.log(err)
                                    //                 }
                                    //                 // cnt++
                                    //                 // if (cnt == batch_len) {
                                    //                 //     inner_next(null)
                                    //                 // }
                                    //             })
                                    //         })
                                    //         cnt++
                                    //         if (cnt == batch_len) {
                                    //             inner_next(null)
                                    //         }
                                    //     } else {
                                    //         console.log(url)
                                    //         console.log(rst.msg)
                                    //         cnt++
                                    //         if (cnt == batch_len) {
                                    //             inner_next(null)
                                    //         }
                                    //     }
                                    // })
                                    //     }
                                    // });
                                } else {
                                    start += 4096
                                    inner_next('done')
                                }
                            }
                        }, function(e) {
                            if (e) {
                                console.log(e)
                            }
                            next(null)
                        })
                    } else {
                        console.log(rid_list)
                        console.log(rsp.msg)
                        next(null)
                    }
                })
            })
        } else {
            next('done')
        }
    }, function(e) {
        console.log(e)
    })
})