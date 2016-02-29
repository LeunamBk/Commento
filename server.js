/*
 * Module dependencies
 */
var express = require('express');
var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');
var wait = require("wait.for");
var stylus = require('stylus');
var nib = require('nib');
var logger = require('morgan');
var iconv  = require('iconv-lite');

var app = express()
function compile(str, path) {
    return stylus(str)
        .set('filename', path)
        .use(nib())
}
app.set('views', __dirname + '/views')
app.set('view engine', 'jade')
app.use(logger('dev'))
app.use(stylus.middleware(
    { src: __dirname + '/public'
        , compile: compile
    }
))
app.use(express.static(__dirname + '/public'))


Articles = {

    baseUrl : "",
    forumTag : "",
    commentTag : "",
    commentsNextPageTag : "",
    forumsData : {title: "", release: "", forum: []},

    init : function(){
        this.getForums();
        this.getForumSite();
        this.saveAsJson();

    },

    getForums : function(){
        var html = wait.for(this.requestWaitForWrapper, this.baseUrl);
        var $ = cheerio.load(html);
        var articles = [];

        // We'll use the unique header class as a starting point.
        $(this.forumTag).each(function () {
            var article = {title: "", release: "", link: "", forum: []};

            // Let's store the data we filter into a variable so we can easily see what's going on.
            var data = $(this);

            var link = data.children().last().attr('href');
            var title = data.parent().parent().find('a').text();
            title = title.replace("mehr...Forum","");
            title = title.replace("mehr...VideoForum","");
            title = title.replace("mehr...Video","");

            // remove false positive with dont start with http
            if (/^(f|ht)tps?:\/\//i.test(link)) {
                article.title = title;
                article.link = link;
                articles.push(article);
                console.log(title)

            }
        });

        this.setForumUrls(articles);

    },

    getForumUrls : function(){ return forumUrls; },
    setForumUrls : function(url){
        forumUrls = url;
    },

    getForumSite : function(){
        var urls = this.getForumUrls();
        for(var node = 0; node < urls.length; node++){
            urls[node]['forum'].push({comments: []});

            var html = wait.for(this.requestWaitForWrapper, urls[node].link);
            var $ = cheerio.load(html);

            // get first page comments
            this.getCommentsData($, node, urls[node].link);
            this.getNextPageComments($, node);
        }
    },

    getCommentsData : function($, node, url){
        var comments = [];
        $(this.commentTag).each(function(){
            var data = $(this);
            var comment = {
                id : data.children().first().text(),
                href : data.children().first().attr('href'),
                time : Articles.spToTimestamp(data.children().eq(1).not('b').text()),
                authorName : data.children().eq(1).find('a').text(),
                header : data.children().find('h2').text(),
                text : data.children().find('.postContent').text()
            };
            if(data.children().find('.quote').text() != ""){
                comment.quote = {href:data.children().find('.quote a').attr('href')};
            }
            console.log(comment)
            comments.push(comment)
        });

        var obj = this.getForumUrls();
        console.log(obj[node]['forum'])
        obj[node]['forum'][0]['comments'] = obj[node]['forum'][0]['comments'].concat(comments);
        this.setForumUrls(obj)

    },

    getNextPageComments : function($, node){

        var nextPageUrl = $(this.commentsNextPageTag).attr('href');

        if (typeof nextPageUrl != "undefined") {
            nextPageUrl = this.baseUrl + nextPageUrl;
            var html = wait.for(this.requestWaitForWrapper, nextPageUrl);
            var $ = cheerio.load(html);
            this.getCommentsData($, node, nextPageUrl);
            this.getNextPageComments($, node);
        }

    },

    spToTimestamp : function(dateStr){
        // format as js date type retrive with Date("dateString")
        var time = [];
        var strSplit = dateStr.split(':');
        // arrow notation doasnt work in cheerio
        // strSplit.forEach(elem => time.push(elem.match(/\d+/)[0]));
        strSplit.forEach(function(elem){
            time.push(elem.match(/\d+/)[0]);
        });
        if(dateStr.search('Heute') != -1){
            var date = new Date();
            date.setHours(time[0], time[1], 00);
        }else if(dateStr.search('Gestern') != -1){
            var date = new Date();
            date.setDate(date.getDate() - 1);
            date.setHours(time[0], time[1], 00);
        }
        return date;

    },

    requestWaitForWrapper : function(url, callback) {
        request(url, { encoding: null}, function(error, response, html) {
            if (error)
                callback(error, response);
            else if (response.statusCode == 200) {
                html = iconv.decode(new Buffer(html), "ISO-8859-1");
                callback(null, html);
            }
            else
                callback(new Error("Status not 200 OK"), response);
        });
    },

    saveAsJson : function() {

        fs.writeFile('data/'+this.outputFileName+'.json', JSON.stringify(this.getForumUrls(), null, 4), function (err) {
            console.log('File successfully written! - Check your project directory for the output.json file');
        })

    }

};


//spiegel forumTag = ".module-title"
//spiegel Page Count Tag = ".js-article-comments-box-page-count"
function spiegel(){
    var spiegel =  Articles;
    spiegel.baseUrl = 'http://www.spiegel.de';
    spiegel.forumTag = '.spInteractionMarks';
    spiegel.commentTag = '.postbit';
    spiegel.commentsNextPageTag = '.next';
    spiegel.outputFileName = 'spiegel';

    spiegel.init();
}

function zeit(){
    var zeit = Articles;
    zeit.baseUrl = 'http://www.zeit.de/index';
    zeit.forumTag = '.js-update-commentcount';
    zeit.commentTag = '.comment__container';
    zeit.commentsNextPageTag = '.pager__button pager__button--next';
    zeit.commentTextTag = '.comment__body';
    zeit.commentMetaTag = ".comment-meta__date";
    zeit.commentRatingTag = ".js-comment-recommendations";
    zeit.commentAuthorNameTag = ".comment-meta__name";
    zeit.outputFileName = 'zeit';

    zeit.getForums = function(){

        var html = wait.for(this.requestWaitForWrapper, this.baseUrl);
        var $ = cheerio.load(html);
        var articles = [];

        // We'll use the unique header class as a starting point.
        $(this.forumTag).each(function () {

            var article = {title: "", release: "", link: "", forum: []};

            // Let's store the data we filter into a variable so we can easily see what's going on.
            var data = $(this);

            var link = data.attr('href');
            var title = data.parent().parent().find('h2').find('span:nth-last-of-type(1)').text();

            article.title = title;
            article.link = link;
            articles.push(article);

        });

        this.setForumUrls(articles);

    };

    zeit.getCommentsData = function($, node, url){
        var comments = [];
        var self = this;
        $(this.commentTag).each(function(){
            var data = $(this);
            var comment = {
                id : (data.find(self.commentMetaTag).text()).trim().split(" ")[0],
                href : data.find(self.commentMetaTag).attr('href'),
                rating : data.find(self.commentRatingTag).text(),
                time : zeit.ztToTimestamp((data.find(self.commentMetaTag).text()).trim()),
                authorName : (data.find(self.commentAuthorNameTag).text()).trim(),
                text : (data.find(self.commentTextTag).text()).trim()
            };
            if(data.children().find('.quote').text() != ""){
                comment.quote = {href:data.children().find('.quote a').attr('href')};
            }
            comments.push(comment)
        });

        var obj = this.getForumUrls();
        obj[node]['forum'][0]['comments'] = obj[node]['forum'][0]['comments'].concat(comments);
        this.setForumUrls(obj)

    };

    zeit.ztToTimestamp = function(dateStr){
        // format as js date type retrive with Date("dateString")
        var strSplit = dateStr.split(' ');
        if(dateStr.search('Stunde') != -1){
            var hours = strSplit[strSplit.length-2];
            var date = new Date();
            date.setHours(date.getHours()-hours, date.getMinutes(), 00);
        }else if(dateStr.search('Minute') != -1){
            var minutes = strSplit[strSplit.length-2];
            var date = new Date();
            date.setHours(date.getHours(), date.getMinutes()-minutes, 00);
        }
        return date;
    };

    zeit.requestWaitForWrapper = function(url, callback) {
        request(url, { encoding: null}, function(error, response, html) {
            if (error)
                callback(error, response);
            else if (response.statusCode == 200) {
                callback(null, html);
            }
            else
                callback(new Error("Status not 200 OK"), response);
        });
    };

    zeit.init();

}

function main(){
    zeit();
    spiegel();
};

app.get('/scrape', function(req, res) {
    /*
    wait.launchFiber(spiegel);

    wait.launchFiber(zeit);
*/
    var spiegelData = require('./data/spiegel.json');
    var zeitData = require('./data/zeit.json');

    res.render('index',
        { spiegel : spiegelData,
            zeit : zeitData }
    );
});

app.listen('8081')

console.log('Magic happens on port 8081');

exports = module.exports = app; 
