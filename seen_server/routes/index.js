var express = require('express');
var router = express.Router();
var fs = require("fs")

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/url_recycle', async function(req, res, next) {
    let url_list = JSON.parse(req.body.data)
    console.log(url_list)
    fs.appendFile("pending.txt", url_list.join("\n"), function(err) {
        if (err) {
            console.log(err)
        }
        res.json({ status: true });
    })
})

module.exports = router;