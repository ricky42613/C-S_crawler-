var memcached = require('memcached')
let cache = new memcached('localhost:8787')
cache.set('test','123',60*60*60,function(err){
    if(err){
        console.log('err')
    }
    cache.set('test2','123',60*60*60,function(err){
        if(err){
            console.log('err')
        }
        cache.getMulti(['test4','test4'],function(err,data){
            if(err){
                console.log('err:',err)
            }else{
                console.log(data)
            }
            cache.end()
        })
    })
})