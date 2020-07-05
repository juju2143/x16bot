const fs = require('fs');
const { spawn } = require('child_process');
const Twitter = require('twitter');
const { decode } = require('base2048');
const config = require('./config.json');

var client = new Twitter(config.twitter);

function run(xcode, prg=false, id, callback)
{
    const CWD = __dirname+"/"+config.assets;
    const date = id;
    var isprg = prg?"prg":"bas";
    if(prg)
    {
        var arr = decode(xcode);
        const buffer = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
        xcode = buffer;
    }
    fs.writeFile(CWD+"/x16"+date+"."+isprg, xcode, (err)=> {
        if(err)
        {
            callback("unable to open file");
        }
        else
        {
            const emu = spawn("x16emu", ["-"+isprg, CWD+"/x16"+date+"."+isprg, "-run", "-gif", CWD+"/x16"+date+".gif"], {cwd: __dirname+"/"+config.cwd});
            //emu.stdout.pipe(process.stdout);

            setTimeout(()=>emu.kill(), 33000);

            emu.on('exit', (code) => {
                console.log(`x16emu process exited with code ${code}`);
                if(code!=0) callback(`x16emu process exited with code ${code}`);
                else
                {
                    const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "panic", "-y", "-sseof", "-3", "-i", CWD+"/x16"+date+".gif", CWD+"/x16"+date+".opt.gif"]);
                    //ff.stdout.pipe(process.stdout);

                    ff.on("exit", (code) => {
                        console.log(`ffmpeg process exited with code ${code}`);
                        callback(null, CWD+"/x16"+date+(code==0?".opt":"")+".gif");
                    });
                }
            });
        }
    });
}

var stream = client.stream('statuses/filter', {track: config.name});

stream.on('data', function(tweet) {
    var replyto = '@'+tweet.user.screen_name;
    if(tweet.truncated)
        var tweet_text = tweet.extended_tweet.full_text;
    else
        var tweet_text = tweet.text;
    var prg = tweet_text.replace(config.name, "").trim()
    var id = tweet.id_str;
    console.log(replyto+": "+tweet_text);
    function post(err, file)
    {
        if(err) return;
        const mediaData = fs.readFileSync(file);
        const mediaSize = fs.statSync(file).size;
        const mediaType = 'image/gif';

        initUpload()
        .then(appendUpload)
        .then(finalizeUpload)
        .then(mediaId => {
            console.log("replying to "+id);
            client.post('statuses/update', {status: '', in_reply_to_status_id: id, auto_populate_reply_metadata: true, media_ids: mediaId}, function(error, tweet, response) {
                if (!error) {
                    console.log("posted reply");
                }
                else
                {
                    console.log(error);
                }
            });
        });

        function initUpload () {
            return makePost('media/upload', {
                command    : 'INIT',
                total_bytes: mediaSize,
                media_type : mediaType,
            }).then(data => data.media_id_string)
            .catch(error => console.log(error));
        }
        function appendUpload(mediaId) {
            return makePost('media/upload', {
                command      : 'APPEND',
                media_id     : mediaId,
                media        : mediaData,
                segment_index: 0
            }).then(data => mediaId)
            .catch(error => console.log(error));
        }
        function finalizeUpload(mediaId) {
            return makePost('media/upload', {
                command : 'FINALIZE',
                media_id: mediaId
            }).then(data => mediaId)
            .catch(error => console.log(error));
        }
        function makePost(endpoint, params) {
            return new Promise((resolve, reject) => {
                client.post(endpoint, params, (error, data, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(data);
                    }
                });
            });
        }
    }
    try
    {
        var decoded = decode(prg);
        run(decoded, true, id, post);
    }
    catch (e)
    {
        if(/^\d/.test(prg))
            run(prg, false, id, post);
    }
});

stream.on('error', function(error) {
    console.log(error);
});