var GAIS = require('./gais')
var DB = new GAIS("nubot70.taiwin.tw:5802")
var md5 = require('md5')
var async = require('async')
var i = 380
async.forever(function(next) {
    let p = new Promise(async function(resolve, reject) {
        let rsp = await DB.select_query("sw_txt", "", i, 10000, "@url:")
        console.log(i)
        if (rsp.status) {
            if (rsp.data.result.recs.length) {
                let insert_data = rsp.data.result.recs.map(item => {
                    let data = {}
                    data.url = item.rec.url
                    data.UrlCode = md5(data.url)
                    data.fetch = "false"
                    data.fetch_time = ""
                    return data
                });
                let r = await DB.insert("dict_pool", insert_data)
                if (r.status) {
                    resolve(1)
                } else {
                    resolve(0)
                }
            } else {
                resolve(2)
            }
        } else {
            resolve(0)

        }
    }).then(val => {
        if (val == 0) {
            next(null)
        } else if (val == 1) {
            i++
            next(null)
        } else if (val == 2) {
            next('done')
        }
    })
}, function(e) {
    console.log(e)
})