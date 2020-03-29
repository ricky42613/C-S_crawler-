var cheerio = require('cheerio')
var async = require('async')

const text_tag = ['b','I','u','em','strong','font','p','span']
const weight_table = {
    'p' : 8,
    'div' : 4,
    'span' : 2
}

function get_main_text(body) {
    return new Promise(function(resolve, reject) {
        let $ = cheerio.load(body)
        let blocks = $('div').get()
        let Text_tags_ratio = 0
        let Maintext = ""
        async.waterfall([
            function(callback) {
                blocks.forEach(item => {
                    let maintext = ""
                    let score = 0
                    $(item).find('div').each((idx, inneritem1) => {
                        $(inneritem1).contents().filter(function() {
                            return this.type === 'text'
                        }).each((idx, inneritem2) => {
                            if($(inneritem2).text().length>6){
                                maintext = maintext + $(inneritem2).text().trim()
                                score = score + $(inneritem2).text().trim().length * weight_table['div']
                            }
                        })
                    })
                    let p_tags = $(item).find(text_tag.join(',')).get()
                    let inner_tag_len = $(item).find('*').filter((i, e) => {
                        let not_count = text_tag.concat(['a','br','div','img','script'])
                        return not_count.indexOf(e.name) == -1
                    }).length 
                    if (inner_tag_len <= 0) {
                        inner_tag_len = 1
                    }
                    p_tags.forEach(inner_item => {
                        let gettext = $(inner_item).text().trim().replace(/[\n|\t|\r]/g, "")
                        if(inner_item.name != 'span' || gettext.length>8){
                            if(gettext.length>5){
                                maintext = maintext + gettext + '\n'
                                let coef = weight_table['coef'] == undefined? 1 : weight_table['coef']
                                score = score + coef*gettext.length
                            }
                        }
                    })

                    if (maintext.length > 40 && inner_tag_len > 3) {                    
                        let text_tags_ratio = score / inner_tag_len
                        if (text_tags_ratio >= Text_tags_ratio) {
                            Text_tags_ratio = text_tags_ratio
                            Maintext = maintext
                            final_item = item
                        }
                    }
                })
                if (Maintext < 40) {
                    callback(null)
                } else {
                    resolve(Maintext)
                }
            },
            function(callback) {
                Maintext = ""
                $('div').each((idx, inneritem1) => {
                    $(inneritem1).contents().filter(function() {
                        return this.type === 'text'
                    }).each((idx, inneritem2) => {
                        if($(inneritem2).text().length>6){
                            Maintext = Maintext + $(inneritem2).text().trim()
                        }
                    })
                })
                $(text_tag.join(',')).get().forEach(item => {
                    Maintext = Maintext + $(item).text().trim().replace(/[\r|\n|\t]/g, "")
                })
                if (Maintext.length < 40) {
                    callback(null)
                } else {
                    resolve(Maintext)
                }
            },
            function(callback) {
                Maintext = $('body').text().trim().replace(/[\r|\n|\t]/g, "")
                resolve(Maintext)
            }
        ])
    })
}

module.exports.ParseHTML = get_main_text