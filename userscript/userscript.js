// ==UserScript==
// @name         webrtc-network
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  communication via webrtc
// @author       w7msjxqa2d
// @grant        none
// @include http://*
// @include https://*
// ==/UserScript==

var DEBUG_MODE = true;
var COLOR_DEBUG = "red";

(function () {
    'use strict';
    if (window.top !== window.self) {
        debugLog('Frame detected');
        return;
    }
    debugLog("Userscript is running");

    function loadScript(url, callback)
    {
        var head = document.getElementsByTagName('head')[0];
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = url;

        script.onreadystatechange = callback;
        script.onload = callback;

        head.appendChild(script);
    }
    var loadJquery = function() {
        loadScript("https://code.jquery.com/jquery-3.2.1.min.js", loadsweetjs);
    };
    var loadsweetjs = function() {
        loadScript("https://webrtc-classif-dhtnetwork.herokuapp.com/cdn/sweetalert.min.js", load2);
    };

    var load1 = function() {
        loadScript("https://webrtc-classif-dhtnetwork.herokuapp.com/cdn/adapter.js", load2);
    };
    var load2 = function() {
        loadScript("https://webrtc-classif-dhtnetwork.herokuapp.com/cdn/classificator.js", load3);
    };
    var load3 = function() {
        loadScript("https://webrtc-classif-dhtnetwork.herokuapp.com/cdn/application.js", load4);
    };
    var load4 = function() {
        var tag_css = document.createElement('link');
        tag_css.rel = 'stylesheet';
        tag_css.href = 'https://webrtc-classif-dhtnetwork.herokuapp.com/cdn/sweetalert.css';
        tag_css.type = 'text/css';
        var tag_head = document.getElementsByTagName('head');
        tag_head[0].appendChild(tag_css);
    };
    loadScript("https://webrtc-classif-dhtnetwork.herokuapp.com/cdn/socket.io.js", loadJquery);
})();

function debugLog(message)
{
    if (DEBUG_MODE)
        console.log('%c%s', 'color:' + COLOR_DEBUG, message);
}