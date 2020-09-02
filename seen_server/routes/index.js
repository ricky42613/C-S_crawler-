var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/url_recycle', async function(req, res, next) {
    let url_list = JSON.parse(req.body.data)
    req.app.locals.pending_pool = req.app.locals.pending_pool.concat(url_list);
    res.json({ status: true });
})

module.exports = router;