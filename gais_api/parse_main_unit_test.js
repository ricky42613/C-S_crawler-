var request = require('request')
var GetMain = require('../gais_api/parseMain')
var cheerio = require('cheerio')

let url = "https://www.setn.com/News.aspx?NewsID=728908"

request({
    url: url,
    method: 'GET'
}, async function(e, r, b) {
    if (e) {
        console.log(e)
    } else {
        let main = await GetMain.ParseHTML(r.body)
        let $ = cheerio.load(r.body)
        let text_len = $('body').text().replace(/[\n|\t|\r|\s]/g, "").length
        let link_len = 0
        $('a').each((idx, item) => {
            link_len += $(item).text().replace(/[\n|\t|\r|\s]/g, "").length
        })
        console.log(main[0])
        console.log(link_len / text_len)
    }
})

// domain_code
// p_cnt
// a_cnt