var express = require('express');
var router = express.Router();
var memcached = require('memcached')
let cache = new memcached('localhost:8787')
var md5 = require('md5')
/* GET home page. */
const max_req = 10
const cache_lifetime = 60
function get_space_from_cache(ipcode){
  return new Promise(function(resolve,reject){
    let ip_record = []
    for(let i=0;i<max_req;i++){
      ip_record.push(ipcode+i)
    }  
    let flag = -1
    cache.getMulti(ip_record,(err,data)=>{
      if(err){
        console.log(err)
      }else{
        for(let i=0;i<max_req;i++){
          if(data[`${ipcode}${i}`]==undefined){
            flag = i
          }
        }
      }
      resolve(flag)
    })
  })
}

router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/get_url',async function(req,res,next){
  var size = parseInt(req.query.size).toString() == "NaN" ? 250:parseInt(req.query.size)
  console.log(size)
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  var ipcode = md5(ip)
  var space = await get_space_from_cache(ipcode)
  if(space == -1){
    res.json({
      status:false,
      msg:'超過請求限制'
    })
  }else{
    if(size>500){
      res.json({
        status:false,
        msg:"每次限取500筆"
      })
    }else{
      console.log(`${ipcode}${space}`)
      cache.set(`${ipcode}${space}`,'true',cache_lifetime,function(err){
        if(err){
          console.log(err)
          res.json({
            status:false,
            msg:err
          })
        }else{
          let data = {}
          data.status = true
          data.url_list = req.app.locals.link_pool.slice(0,size)
          req.app.locals.link_pool = req.app.locals.link_pool.slice(size)
          res.json(data)
        }
      })
    }
  }
})

module.exports = router;
