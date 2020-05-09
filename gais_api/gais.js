var request = require('request')

function Gais(domain) {
    this._domain = domain
}
var method = Gais.prototype
method.pat_query = function(db, q, p, ps) {
    var domain = this._domain
    var query_api = `http://${domain}/nudb/query`
    return new Promise(function(resolve, reject) {
        request.post({
            url: query_api,
            form: {
                db: db,
                p: parseInt(p),
                ps: parseInt(ps),
                out: 'json',
                pat: q
            }
        }, function(e, r, b) {
            if (e) {
                console.log(e)
                let msg = {}
                msg.status = false,
                    msg.err = e
                resolve(msg)
            } else {
                let msg = {}
                msg.status = true
                msg.data = JSON.parse(r.body)
                resolve(msg)
            }
        })
    })
}


method.query = function(db, q, p, ps) {
    var domain = this._domain
    var query_api = `http://${domain}/nudb/query`
    return new Promise(function(resolve, reject) {
        request.post({
            url: query_api,
            form: {
                db: db,
                p: parseInt(p),
                ps: parseInt(ps),
                out: 'json',
                q: q
            }
        }, function(e, r, b) {
            if (e) {
                console.log(e)
                let msg = {}
                msg.status = false,
                    msg.err = e
                resolve(msg)
            } else {
                let msg = {}
                msg.status = true
                msg.data = JSON.parse(r.body)
                resolve(msg)
            }
        })
    })
}

method.insert = function(db, record) {
    var domain = this._domain
    return new Promise(function(resolve, reject) {
        let db_api = `http://${domain}/nudb/rput`
        let option = {}
        option.db = db
        option.format = 'json'
        option.record = JSON.stringify(record)
        if (db == "pattern") {
            console.log(option)
        }
        request.post({
            url: db_api,
            form: option
        }, function(e, r, b) {
            if (e) {
                console.log('新增失敗')
                console.log(e.code)
                let msg = {}
                msg.status = false
                msg.err = e
                resolve(msg)
            } else {
                let msg = {}
                msg.status = true
                msg.data = JSON.parse(r.body)
                try {
                    console.log(`儲存${msg.data.result.length}筆資料至${db}`)
                } catch (e) {
                    console.log(msg)
                }
                resolve(msg)
            }
        })
    })
}

method.update = function(db, identify, format, field) {
    var domain = this._domain
    return new Promise(function(resolve, reject) {
        let db_api = `http://${domain}/nudb/rupdate`
        let option = {}
        let flag = 0
        if (format == 'text') {
            option.field = field
        } else {
            option.record = JSON.stringify(field)
        }
        option.format = format
        option.db = db
        if (identify.key != undefined) {
            option.key = identify.key
            flag = 1
        } else if (identify.rid != undefined) {
            option.rid = identify.rid
            flag = 1
        }
        if (flag) {
            request.post({
                url: db_api,
                form: option
            }, function(e, r, b) {
                if (e) {
                    console.log('更新失敗')
                    console.log(e.code)
                    let msg = {}
                    msg.status = false
                    msg.err = e
                    resolve(msg)
                } else {
                    let msg = {}
                    msg.status = true
                    msg.data = JSON.parse(r.body)
                    if (db == 'pattern') {
                        console.log(r.body)
                    }
                    if (JSON.parse(r.body).error != undefined) {
                        console.log(option)
                    }
                    resolve(msg)
                }
            })
        } else {
            resolve({ status: false, err: "缺少key/rid" })
        }
    })
}


module.exports = Gais