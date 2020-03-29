var cheerio = require('cheerio')
var cluster = require('cluster')
var request = require('request')
var dns = require('dns')
var GetMain = require('../gais_api/parseMain')
var dnscache= require('dnscache')({
    "enable":true,
    "ttl":300,
    "cachesize":1000
})
var urL = require('url')
var md5 = require('md5')
var CPU_num = require('os').cpus().length
var config = {
    main_site: [
        "https://travel.ettoday.net/focus/%E6%97%A5%E6%9C%AC%E6%97%85%E9%81%8A/",
        "https://www.japaholic.com/tw/travel/",
        "https://www.welcome2japan.hk/",
        "https://www.haplaytour.com/blog/",
        "https://www.klook.com/zh-TW/blog/",
        "https://yoke918.com/",



    ],
    machine: "nudb1.ddns.net:5804",
    server:"http://127.0.0.1:3000"
}
var is_fillup = 0
var GAIS = require('../gais_api/gais')
var DB = new GAIS(config.machine)
var url_pool = config.main_site
console.log("本機器共" + CPU_num + "個處理器")
const black_key_list = ['undefined']

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

function filter_black(url) {
    let flag = true
    black_key_list.forEach(item => {
        if (url.indexOf(item) != -1) {
            flag = false
        }
    })
    return flag
}

function get_source(text){
    let start = text.indexOf(".")
    text = text.slice(start+1)
    let end = text.indexOf(".")
    if(end!=-1){
        text = text.slice(0,end)
    }
    return text
}

function parse_url_in_body(url, body) {
    let $ = cheerio.load(body)
    let main_url = urL.parse(url)
    let main_site = main_url.protocol + "//" + main_url.hostname
    let links_in_page = $('a').get().map(item => {
        let data = {}
        if (typeof $(item).attr('href') != "undefined") {
            if ($(item).attr('href').slice(0,4).indexOf('http') != -1) {
                data.url = $(item).attr('href')
            } else if($(item).attr('href')[0]=='/'){
                if($(item).attr('href')[1]=='/'){
                    data.url = main_url.protocol + $(item).attr('href')
                }else{
                    data.url = main_site + $(item).attr('href')
                }
            } else{
                let cut = url.lastIndexOf('/') + 1
                let basic = url.slice(0,cut)
                data.url = basic + $(item).attr('href')
            }
            data.fetch = false
            data.fetch_time = ""
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
    links_in_page = links_in_page.filter(item => {
        return filter_black(item.url)
    })
    links_in_page = links_in_page.unique()
    return links_in_page
}

function mytimer(cb) {
    let timer = setInterval(() => {
        if (is_fillup == 0) {
            cb('pass')
            clearInterval(timer)
            return
        }
    }, 2000);
}

function query_unfetch(){
    return new Promise(function(resolve,reject){
        request({
            url:`${config.server}/get_url`,
            method:'GET'
        },function(e,r,b){
            if(e){
                console.log(e)
            }else{
                let rsp = JSON.parse(r.body)
                if(rsp.status){
                    rsp = rsp.url_list.map(item=>{
                        return item.url
                    })
                    resolve(rsp)
                }else{
                    console.log(rsp.msg)
                }
            }
        })
    })
}

function run() {
    if (cluster.isMaster) {
        var w1 = cluster.fork()
        var w2 = cluster.fork()
        var w3 = cluster.fork()
        var w4 = cluster.fork()
        w1.send({ type: "url", url: url_pool.shift() })
        w1.on('message', function(msg) {
            if (msg.type == "response") {
                console.log("w1 " + msg.msg)
            } else if (msg.type == "block") {
                url_pool.push(msg.url)
            }
            mytimer(async rst => {
                is_fillup = 1
                w1.send({ type: "url", url: url_pool.shift() })
                console.log("Master給予worker1 1個連結,剩餘" + url_pool.length + "個連結")
                if (url_pool.length == 0) {
                    w2.send({ type: "pause" })
                    w3.send({ type: "pause" })
                    w4.send({ type: "pause" })
                    console.log("連結已用完，補充連結")
                    url_pool = await query_unfetch()
                    w2.send({ type: "continue" })
                    w3.send({ type: "continue" })
                    w4.send({ type: "continue" })
                }
                is_fillup = 0
            })
        })
        w2.send({ type: "url", url: url_pool.shift() })
        w2.on('message', function(msg) {
            if (msg.type == "response") {
                console.log("w2 " + msg.msg)
            } else if (msg.type == "block") {
                url_pool.push(msg.url)
            }
            mytimer(async rst => {
                is_fillup = 1
                w2.send({ type: "url", url: url_pool.shift() })
                console.log("Master給予worker2 1個連結,剩餘" + url_pool.length + "個連結")
                if (url_pool.length == 0) {
                    w1.send({ type: "pause" })
                    w3.send({ type: "pause" })
                    w4.send({ type: "pause" })
                    console.log("連結已用完，補充連結")
                    url_pool = await query_unfetch()
                    w1.send({ type: "continue" })
                    w3.send({ type: "continue" })
                    w4.send({ type: "continue" })
                }
                is_fillup = 0
            })
        })
        w3.send({ type: "url", url: url_pool.shift() })
        w3.on('message', function(msg) {
            if (msg.type == "response") {
                console.log("w3 " + msg.msg)
            } else if (msg.type == "block") {
                url_pool.push(msg.url)
            }
            mytimer(async rst => {
                is_fillup = 1
                w3.send({ type: "url", url: url_pool.shift() })
                console.log("Master給予worker3 1個連結,剩餘" + url_pool.length + "個連結")
                if (url_pool.length == 0) {
                    w1.send({ type: "pause" })
                    w2.send({ type: "pause" })
                    w4.send({ type: "pause" })
                    console.log("連結已用完，補充連結")
                    url_pool = await query_unfetch()
                    w1.send({ type: "continue" })
                    w2.send({ type: "continue" })
                    w4.send({ type: "continue" })
                }
                is_fillup = 0
            })
        })
        w4.send({ type: "url", url: url_pool.shift() })
        w4.on('message', function(msg) {
            if (msg.type == "response") {
                console.log("w4 " + msg.msg)
            } else if (msg.type == "block") {
                url_pool.push(msg.url)
            }
            mytimer(async rst => {
                is_fillup = 1
                w4.send({ type: "url", url: url_pool.shift() })
                console.log("Master給予worker4 1個連結,剩餘" + url_pool.length + "個連結")
                if (url_pool.length == 0) {
                    w1.send({ type: "pause" })
                    w2.send({ type: "pause" })
                    w3.send({ type: "pause" })
                    console.log("連結已用完，補充連結")
                    url_pool = await query_unfetch()
                    w1.send({ type: "continue" })
                    w2.send({ type: "continue" })
                    w3.send({ type: "continue" })
                }
                is_fillup = 0
            })
        })
    } else {
        let ctrl = 0
        process.on('message', function(msg) {
            if (msg.type == "pause") {
                console.log("get pause signal")
                ctrl = 1
            } else if (msg.type == "continue") {
                console.log("get continue signal")
                ctrl = 0
            } else if (msg.type == "url") {
                let url = msg.url
                request({
                    url: url,
                    method: 'GET'
                }, async function(e, r, b) {
                    if (e) {
                        setTimeout(function() {
                            let timer = setInterval(() => {
                                if (!ctrl) {
                                    process.send({ type: "response", msg: "fail " + url })
                                    clearInterval(timer)
                                    return
                                }
                            }, 1000)
                        }, 2000)
                    } else {
                        let $ = cheerio.load(r.body)
                        let data = {}
                        data.title = $('title').text().trim()
                        data.url = url
                        data.UrlCode = md5(url)
                        data.fetch_time = new Date()
                        data.mainText = GetMain.ParseHTML(r.body)
                        data.key_words = $('meta[name="keywords"]').attr("content")
                        data.description = $('meta[name="description"]').attr("content")
                        // data.post_time = $('li[itemprop="datePublished"]').length == 0 ? "" : $($('li[itemprop="datePublished"]')[0]).attr("content")
                        data.domain = urL.parse(url).hostname
                        data.domainCode = md5(data.domain)
                        let find_dns = await get_ip(data.domain)
                        if (find_dns == "error") {
                            data.host_ip = "404"
                        } else {
                            data.host_ip = find_dns
                        }
                        await DB.update('link_pool2',{key:data.UrlCode}, "@fetch_time:" + data.fetch_time)
                        if (data.mainText.length < 30) {
                            setTimeout(function() {
                                let timer = setInterval(() => {
                                    if (!ctrl) {
                                        process.send({ type: "response", msg: "finish " + url })
                                        clearInterval(timer)
                                        return
                                    }
                                }, 1000);
                            }, 2000)
                        } else {
                            let link_pool = parse_url_in_body(url, r.body)
                            await DB.insert('link_pool2',link_pool)
                            await DB.insert('link_record',data)
                            setTimeout(function() {
                                let timer = setInterval(() => {
                                    if (!ctrl) {
                                        process.send({ type: "response", msg: "finish " + url })
                                        clearInterval(timer)
                                        return
                                    }
                                }, 1000);
                            }, 2000)
                        }
                    }
                })
            }
        })
    }
}

run()