var cheerio = require('cheerio')
var async = require('async')

const text_tag = ['b', 'u', 'em', 'strong', 'font', 'p', 'span', 'h1', 'h2', 'h3', 'h4']
const weight_table = {
    'h1': 8,
    'h2': 8,
    'p': 8,
    'div': 4,
    'span': 2
}

function get_main_text(body) {
    return new Promise(function(resolve, reject) {
        let $ = cheerio.load(body)
        $('script').remove()
        $('style').remove()
        $('noscript').remove()
        $('iframe').remove()
        $('image').remove()
        let blocks = $('div').get()
        let Text_tags_ratio = 0
        let Maintext = ""
        let mainblock
        async.waterfall([
            function(callback) {
                blocks.forEach(item => {
                    let maintext = ""
                    let score = 0
                    $(item).find('div').each((idx, inneritem1) => {
                        $(inneritem1).contents().filter(function() {
                            return this.type === 'text'
                        }).each((idx, inneritem2) => {
                            // if ($(inneritem2).text().length > 6) {
                            maintext = maintext + $(inneritem2).text().trim().replace(/[\n|\t|\r]/g, "")
                            score = score + $(inneritem2).text().trim().replace(/[\n|\t|\r]/g, "").length * weight_table['div']
                                // }
                        })
                    })
                    let main_tags = $(item).find(text_tag.join(',')).get()
                    let inner_tag_len = $(item).find('*').filter((i, e) => {
                        let not_count = text_tag.concat(['a', 'br', 'div'])
                        return not_count.indexOf(e.name) == -1
                    }).length
                    if (inner_tag_len <= 0) {
                        inner_tag_len = 1
                    }
                    main_tags.forEach(inner_item => {
                        $(inner_item).contents().filter(function() {
                            return this.type === 'text'
                        }).each((idx, inner_item2) => {
                            if ($(inner_item2).text().length) {
                                let gettext = $(inner_item2).text().trim().replace(/[\n|\t|\r]/g, "")
                                maintext = maintext + gettext
                                let tagName = $(inner_item)[0].tagName.toLowerCase()
                                let coef = weight_table[tagName] == undefined ? 1 : weight_table[tagName]
                                score = score + coef * gettext.length
                            }
                        });
                    })

                    if (maintext.length > 40 && inner_tag_len > 3) {
                        let text_tags_ratio = score / inner_tag_len
                        if (text_tags_ratio >= Text_tags_ratio) {
                            Text_tags_ratio = text_tags_ratio
                            Maintext = maintext
                            mainblock = item
                            final_item = item
                        }
                    }
                })
                if (Maintext < 40) {
                    callback(null)
                } else {
                    $(mainblock).find('a').get().map(item => {
                        let link_text = $(item).text()
                        if (link_text.length) {
                            link_text = '$link$' + link_text + '$/link$'
                            $(item).text(link_text)
                        }
                    })
                    Maintext = $(mainblock).text().replace(/\$link\$/g, "<linktext>").replace(/\$\/link\$/g, "</linktext>").replace(/[\r|\n|\t]/g, "")
                    resolve([mainblock, Maintext])
                }
            },
            function(callback) {
                Maintext = ""
                $('div').each((idx, inneritem1) => {
                    $(inneritem1).contents().filter(function() {
                        return this.type === 'text'
                    }).each((idx, inneritem2) => {
                        if ($(inneritem2).text().length > 6) {
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
                    resolve(['null', Maintext])
                }
            },
            function(callback) {
                Maintext = $('body').text().trim().replace(/[\r|\n|\t]/g, "")
                resolve(['null', Maintext])
            }
        ])
    })
}

module.exports.ParseHTML = get_main_text