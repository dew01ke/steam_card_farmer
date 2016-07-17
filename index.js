var express = require('express');
var fs = require('fs');
var bodyParser = require('body-parser');
var SteamUser = require('steam-user');
var cheerio = require('cheerio');
var request = require('request');
var app = express();
var layout = require('express-ejs-layouts');

app.set('port', (process.env.PORT || 5000));
app.set('view engine', 'ejs');
app.set('layout', 'layout');
app.use(layout);

app.use(bodyParser.urlencoded({
    extended: true
}));

var db = {
    'test1': {password: 'test1', client: undefined, guard_code: '', status: 0, guard: 0, work: 0, idler: undefined, cookies: request.jar(), games: [], currentGame: 0},
    'test2': {password: 'test2', client: undefined, guard_code: '', status: 0, guard: 0, work: 0, idler: undefined, cookies: request.jar(), games: [], currentGame: 0},
    'test3': {password: 'test3', client: undefined, guard_code: '', status: 0, guard: 0, work: 0, idler: undefined, cookies: request.jar(), games: [], currentGame: 0}
};

app.get('/', function (req, res) {
    res.render('index', {
        title: 'Steam Card Farmer v1',
        database: db
    });
});

app.post('/add', function(req, res){
    var _username_ = req.body.username;
    var _password_ = req.body.password;

    db[_username_] = {password: _password_, client: undefined, guard_code: '', status: 0, guard: 0, work: 0, idler: undefined, cookies: request.jar(), games: [], currentGame: 0};

    db[_username_].client = new SteamUser({
        'singleSentryfile': false,
        'promptSteamGuardCode': false,
        'dataDirectory': null
    });

    if (fs.existsSync("sentry." + _username_ + ".hash")) {
        console.log("Attaching sentry file named as " + "sentry." + _username_ + ".hash");
        var sentry_hash = fs.readFileSync("sentry." + _username_ + ".hash");
        db[_username_].client.setSentry(sentry_hash);
    }

    db[_username_].client.logOn({
        "accountName": _username_,
        "password": db[_username_].password,
        "rememberPassword": true
    });

    db[_username_].client.on('error', function(e) {
        console.log("User error: " + e);
        db[_username_].client.logOff();
    });

    db[_username_].client.on('disconnected', function(eresult, msg) {
        console.log(_username_ + ": disconnected with " + msg + " (" + eresult + ")");

        db[_username_].idler = function() {};

        db[_username_].currentGame = 0;
        db[_username_].work = 0;
        db[_username_].guard = 0;
        db[_username_].status = 0;
    });

    db[_username_].client.on('sentry', function(sentry) {
        var format = "sentry." + _username_ + ".hash";
        fs.writeFileSync(format, sentry);
        console.log("We got sentry, file successfully saved!");
    });

    db[_username_].client.on('loggedOn', function() {
        console.log("Logged onto Steam as " + db[_username_].client.steamID.getSteamID64());
        db[_username_].client.setPersona(SteamUser.EPersonaState.LookingToTrade);

        db[_username_].status = 1;
        db[_username_].guard = 2;
    });

    db[_username_].client.on('steamGuard', function(domain, callback, lastCodeWrong) {
        if (db[_username_].guard == 0) {
            console.log("Need user action!");
            db[_username_].guard = 1;
        } else {
            if (db[_username_] != '') {
                console.log("Trying to send steam guard code " + db[_username_].guard_code);
                lastCodeWrong = true;
                callback(db[_username_].guard_code);
            } else {
                console.log("Critical error! Code is null!");
            }

        }
    });

    db[_username_].client.on('friendMessage', function(senderID, message) {
        console.log("[Message from " + senderID + "]: " + message + " [my: " + db[_username_].client.steamID.getSteamID64() + "]");
    });

    db[_username_].client.on('webSession', function(sessionID, cookies) {
        cookies.forEach(function(cookie) {
            db[_username_].cookies.setCookie(cookie, 'http://steamcommunity.com');
        });

        var req = request.defaults({jar: db[_username_].cookies});

        req.get("http://steamcommunity.com/my/badges/?sort=p", function(err, response, body) {
            if (err || response.statusCode != 200) {
                console.log("Couldn't request badge page");
                return;
            }

            db[_username_].games = [];

            var $ = cheerio.load(body);
            $('.badge_row').each(function() {
                var badge = $(this); //this bage row
                var badge_game_title = badge.find('.badge_title').html().match(/\s+(.*?)\s+&#xA0;/); //get current game title

                var badge_game_cards = badge.find('.progress_info_bold').html(); //load wrapper of card remaining text

                if (badge_game_cards) {
                    var badge_game_cards_remaining = badge.find('.progress_info_bold').html().match(/(\d+) card/);
                    var badge_game_appid = badge.find('.badge_row_overlay').attr('href').match(/\/gamecards\/(\d+)/);

                    if (badge_game_cards_remaining) {
                        db[_username_].games.push({'id': badge_game_appid[1], 'title': badge_game_title[1], 'remaining': badge_game_cards_remaining[1]});
                    }
                }
            });

            console.log(_username_ + ': card information updated!');
        });
    });

    res.redirect('/');
});

app.post('/code', function(req, res){
    var _username_ = req.body.username;
    var _code_ = req.body.code;

    console.log("Accepting code from user = " + _code_);

    //set code
    db[_username_].guard_code = _code_;

    //login off
    db[_username_].client.logOff();

    //trying new login
    db[_username_].client.logOn({
        "accountName": _username_,
        "password": db[_username_].password,
        "rememberPassword": true
    });

    res.redirect('/');
});

app.post('/remove', function(req, res){
    var _username_ = req.body.username;

    if (typeof db[_username_].client === 'object') {
        db[_username_].client.logOff();
    }

    delete db[_username_];

    res.redirect('/');
});

app.post('/login', function(req, res){
    var _username_ = req.body.username;

    db[_username_].client.logOn({
        "accountName": _username_,
        "password": db[_username_].password,
        "rememberPassword": true
    });

    res.redirect('/');
});

app.post('/logout', function(req, res){
    var _username_ = req.body.username;

    db[_username_].status = 0;
    db[_username_].guard = 0;

    db[_username_].client.logOff();
    console.log(_username_ + " logout");

    res.redirect('/');
});

app.post('/start', function(req, res){
    var _username_ = req.body.username;

    console.log(_username_ + ": idle process has been started");

    db[_username_].idler = function(min) {
        if (Object.keys(db[_username_].games).length > 0) {

            db[_username_].work = 1;

            setTimeout(function () {
                var currentGame = db[_username_].games[0]['id'];
                var remainingCards = db[_username_].games[0]['remaining'];
                var checkTime = 35;

                console.log(_username_ + ": processing game #" + currentGame);

                db[_username_].currentGame = currentGame;
                db[_username_].client.gamesPlayed(parseInt(currentGame, 10));

                db[_username_].client.webLogOn();

                if (remainingCards == 1) checkTime = 10;
                if (remainingCards >= 3) checkTime = 20;
                if (remainingCards >= 5) checkTime = 40;

                db[_username_].idler(checkTime);
            }, min * 60 * 1000);
        } else {
            db[_username_].idler = function() {};
            db[_username_].work = 0;
            db[_username_].currentGame = 0;
        }
    };
    db[_username_].idler(0.01);

    res.redirect('/');
});

app.post('/stop', function(req, res){
    var _username_ = req.body.username;

    console.log(_username_ + ": idle process stopped");
    db[_username_].work = 0;
    db[_username_].idler = function() {};

    res.redirect('/');
});

app.listen(app.get('port'), function () {
    console.log('Example app listening on port ' + app.get('port'));
});

//process.on('SIGINT', function() {
//    console.log("Logging off and shutting down");
//});