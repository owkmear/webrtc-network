"use strict";

var DEBUG_MODE = true;
var COLOR_DEBUG = "blue";
var COLOR_EXCEPTION = "red";
var COLOR_RESULT = "blue";
var LOG_COUNT = 20;
var RESPONSE_TIME = 1000;
var TRAINING_MODE = false;
var TRAINING_MODE_2 = false;
var HOSTNAME = window.location.hostname;
var ROOT = 'https://signallingserverfe4e8e9b6b.herokuapp.com';

var answersFromPeers = []; // Для сбора ответов от пиров

class Storage {
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch(e) {
            if (e == QUOTA_EXCEEDED_ERR)
                console.log("Local storage is full");
        }
    }
    get(key) {
        return localStorage.getItem(key);
    }
    
    requestCategory() {
        
    }
}
var store = new Storage();
store.set("nature.ru", "природа");
store.set("auto.ru", "автомобили");
store.set("news.ru", "новости");
store.set("127.0.0.1", "цирк");

// Events.js
class EventEmitter {

    constructor() {
        debugLog('Object Events created');
        
        this.lastToken = 0;
        //this.subscribers = null;
        this.subscribers = {};
    }

    destroy() {
        this.subscribers = null;
    }

    emit(event) {
        var emitArgs = [].slice.call(arguments, 1);
        for (var k in this.subscribers) {
            var scb = this.subscribers[k];
            if (scb.event === event) {
                scb.subscriber.apply(scb.ctx, emitArgs);
            }
        }
    }

    on(event, subscriber, ctx) {
        var token = ++this.lastToken;
        this.subscribers[token] = {
            event: event,
            subscriber: subscriber,
            ctx: ctx
        };
        return token;
    }

    off(token) {
        delete this.subscribers[token];
    }
}

var Events = {

    Emitter: EventEmitter,

    listen: function() {
        this._listen('addEventListener', arguments);
    },

    unlisten: function() {
        this._unlisten('removeEventListener', arguments);
    },

    on: function() {
        this._listen('on', arguments);
    },

    off: function() {
        this._unlisten('off', arguments);
    },

    _listen: function(method, argsObject) {
        var args = [].slice.apply(argsObject);
        var object = args[0];
        var handlers = args[1];
        var context = args[2];
        var bindArgs = args.slice(2);
        for (var k in handlers) {
            var bound = context[k + '_bound'] = handlers[k].bind.apply(handlers[k], bindArgs);
            object[method](k, bound);
        }
    },

    _unlisten: function(method, args) {
        var object = args[0];
        var handlers = args[1];
        var context = args[2];
        for (var k in handlers) {
            object[method](k, context[k + '_bound']);
        }
    }
};

// PeerConnection.js
class PeerConnection extends Events.Emitter {
    constructor(socket, peerUser, isInitiator) {
        super(); // this.parent();

        this.CHANNEL_NAME = 'data';

        this.iceServers = [{
            url: 'stun:stun.l.google.com:19302'
        }, {
            url: 'stun:stun.anyfirewall.com:3478'
        }, {
            url: 'turn:turn.bistri.com:80',
            credential: 'homeo',
            username: 'homeo'
        }, {
            url: 'turn:turn.anyfirewall.com:443?transport=tcp',
            credential: 'webrtc',
            username: 'webrtc'
        }];

        this.socket = null;
        this.isInitiator = false;
        this.dataChannelReady = false;
        this.peerConnection = null;
        this.dataChannel = null;
        this.remoteDescriptionReady = false;
        this.pendingCandidates = null;
        this.lastMessageOrd = null;
        
        // Сам конструктор
        //window.peer = this;
        debugLog('Object PeerConnection created');

        this.socket = socket;
        this.peerUser = peerUser;
        this.isInitiator = isInitiator;
        this.pendingCandidates = [];
        this.peerHandlers = {
            'icecandidate': this.onLocalIceCandidate,
            'iceconnectionstatechange': this.onIceConnectionStateChanged,
            'datachannel': this.onDataChannel
        };
        this.dataChannelHandlers = {
            'open': this.onDataChannelOpen,
            'close': this.onDataChannelClose,
            'message': this.onDataChannelMessage
        };
        this.connect();
    }

    destroy() {
        // TODO: вызвать метод родителя
        //this.parent();
        this.subscribers = null;

        this.closePeerConnection();
    }

    connect() {
        this.peerConnection = new RTCPeerConnection({
            iceServers: this.iceServers
        });
        Events.listen(this.peerConnection, this.peerHandlers, this);
        if (this.isInitiator) {
            this.openDataChannel(
                this.peerConnection.createDataChannel(this.CHANNEL_NAME, {
                    ordered: false
                }));
        }
        if (this.isInitiator) {
            this.setLocalDescriptionAndSend();
        }
    }

    closePeerConnection() {
        this.closeDataChannel();
        Events.unlisten(this.peerConnection, this.peerHandlers, this);
        if (this.peerConnection.signalingState !== 'closed') {
            this.peerConnection.close();
        }
    }

    setSdp(sdp) {
        var self = this;
        // Create session description from sdp data
        var rsd = new RTCSessionDescription(sdp);
        // And set it as remote description for peer connection
        self.peerConnection.setRemoteDescription(rsd)
            .then(function() {
                self.remoteDescriptionReady = true;
                self.log('Got SDP from remote peer', 'green');
                // Add all received remote candidates
                while (self.pendingCandidates.length) {
                    self.addRemoteCandidate(self.pendingCandidates.pop());
                }
                // Got offer? send answer
                if (!self.isInitiator) {
                    self.setLocalDescriptionAndSend();
                }
            });
    }

    setLocalDescriptionAndSend() {
        var self = this;
        self.getDescription()
            .then(function(localDescription) {
                self.peerConnection.setLocalDescription(localDescription)
                    .then(function() {
                        self.log('Sending SDP', 'green');
                        self.sendSdp(self.peerUser.userId, localDescription);
                    });
            })
            .catch(function(error) {
                self.log('onSdpError: ' + error.message, 'red');
            });
    }

    getDescription() {
        return this.isInitiator ?
            this.peerConnection.createOffer() :
            this.peerConnection.createAnswer();
    }

    addIceCandidate(candidate) {
        if (this.remoteDescriptionReady) {
            this.addRemoteCandidate(candidate);
        } else {
            this.pendingCandidates.push(candidate);
        }
    }

    addRemoteCandidate(candidate) {
        try {
            this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            this.log('Added his ICE-candidate:' + candidate.candidate, 'gray');
        } catch (err) {
            this.log('Error adding remote ice candidate' + err.message, 'red');
        }
    }

    // When ice framework discoveres new ice candidate, we should send it
    // to opponent, so he knows how to reach us
    onLocalIceCandidate(event) {
        if (event.candidate) {
            this.log('Send my ICE-candidate: ' + event.candidate.candidate, 'gray');
            this.sendIceCandidate(this.peerUser.userId, event.candidate);
        } else {
            this.log('No more candidates', 'gray');
        }
    }

    // Connectivity has changed? For example someone turned off wifi
    onIceConnectionStateChanged(event) {
        this.log('Connection state: ' + event.target.iceConnectionState, 'green');
    }

    onDataChannel(event) {
        if (!this.isInitiator) {
            this.openDataChannel(event.channel);
        }
    }

    openDataChannel(channel) {
        this.dataChannel = channel;
        Events.listen(this.dataChannel, this.dataChannelHandlers, this);
    }

    closeDataChannel() {
        Events.unlisten(this.dataChannel, this.dataChannelHandlers, this);
        this.dataChannel.close();
    }

    // NSC
    sendServerMessage(message) {
        this.socket.emit('server_message', {
            candidate: message
        });
    }

    // NSC
    /*sendData: function(data) {
        console.log('call sendData()');
        //sendChannel.send(data);
        this.dataChannel.send(data);
        //console.log('Sent Data: ' + data);
    },*/

    // Data channel
    sendMessage(message) {
        /*if (!this.dataChannelReady) {
            exceptionLog('Data channel is not ready');
            return;
        }*/
        
        // TODO: ловить эксепшион bag_1
        this.dataChannel.send(message);
    }

    onDataChannelOpen() {
        debugLog('call onDataChannelOpen()');
        this.dataChannelReady = true;
        this.emit('open');
    }

    // Слушает входящие сообщения от пиров
    onDataChannelMessage(event) {
        var obj = JSON.parse(event.data);
        //var stor = new Storage();
        if (obj.type === "сlassifReq") {
            var classification = store.get(obj.site);

            // Готовим ответ
            var answer = {};
            answer.type = "сlassifReqAnswer";
            answer.site = obj.site;
            answer.classification = classification;

            // Отправляем на запросивший пир ответ
            var json = JSON.stringify(answer);
            room.peers[obj.peerId].sendMessage(json);
		}
        
		else if (obj.type === "setClassif") {
            //var classification = stor.set(obj.site);

            // Отправляем на запросивший пир ответ
            /*var answer = {};
            answer.type = "answer";
            answer.site = obj.site;
            answer.classification = classification;*/
            debugLog("получен запрос на установку классификации сайта");

		}
		
        // Установка полученной классификации или классификация своими силами
        else if (obj.type === "сlassifReqAnswer") {
        
            var answer = {};
            answer.classification = obj.classification;
            answer.type = obj.type;
            answer.site = obj.site;
            answersFromPeers.push(answer);

            room.peerAnswers--;

        }
        
        else
            exceptionLog('Получен неверный формат сообщения от других пиров');

    }

    onDataChannelClose() {
        this.dataChannelReady = false;
        this.emit('closed');
    }

    sendSdp(userId, sdp) {
        this.socket.emit('sdp', {
            userId: userId,
            sdp: sdp
        });
    }

    sendIceCandidate(userId, candidate) {
        this.socket.emit('ice_candidate', {
            userId: userId,
            candidate: candidate
        });
    }

    log(message, color) {
        console.log('%c[Peer-%d, %s] %s', 'color:' + color, this.peerUser.userId,
            this.peerConnection.signalingState, message);
    }
}

// RoomConnection.js
class RoomConnection extends Events.Emitter {
    constructor(roomName, socket) {
        super();

        this.peers = null;
        this.socket = null;
        this.roomName = null;
        this.roomInfo = null;
        this.pendingSdp = null;
        this.pendidateCandidates = null;

        debugLog('Object RoomConnection created');
        window.room = this; // NSC

        this.socket = socket;
        this.roomName = roomName;
        this.pendingSdp = {};
        this.pendingCandidates = {};
        this.peerAnswers = 0;

        this.socketHandlers = {
            'sdp': this.onSdp,
            'ice_candidate': this.onIceCandidate,
            'room': this.onJoinedRoom,
            'user_join': this.onUserJoin,
            'user_ready': this.onUserReady,
            'user_leave': this.onUserLeave,
            'error': this.onError
        };

        this.peerConnectionHandlers = {
            'open': this.onPeerChannelOpen,
            'close': this.onPeerChannelClose,
            'message': this.onPeerMessage
        };

        Events.on(this.socket, this.socketHandlers, this);
    }

    getPeers() {

        debugLog('Peers table refresh');
        // Include styles
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = '#b282bc39cfe849aa8fb9940cfbdce51a{position:fixed;right:20px;top:50px;background:#fff;border-collapse:collapse}.c123490e089c41f18017fad9b973e9f4,.e08ba001706c4e18a3a4dd89a9e11b37{border:1px solid #000}';
        document.getElementsByTagName('head')[0].appendChild(style);

        var table = document.createElement('table');
        table.id = 'b282bc39cfe849aa8fb9940cfbdce51a';

        var tr = document.createElement('tr');

        var th1 = document.createElement('th');
        var th2 = document.createElement('th');
        var th3 = document.createElement('th');

        th1.className = 'c123490e089c41f18017fad9b973e9f4';
        th2.className = 'c123490e089c41f18017fad9b973e9f4';
        th3.className = 'c123490e089c41f18017fad9b973e9f4';

        var text1 = document.createTextNode('Peer ID');
        var text2 = document.createTextNode('Page');
        var text3 = document.createTextNode('Classification');

        th1.appendChild(text1);
        th2.appendChild(text2);
        th3.appendChild(text3);

        tr.appendChild(th1);
        tr.appendChild(th2);
        tr.appendChild(th3);

        table.appendChild(tr);

        for (var p in this.peers) {
            var tr = document.createElement('tr');

            var td1 = document.createElement('td');
            var td2 = document.createElement('td');
            var td3 = document.createElement('td');

            td1.className = 'e08ba001706c4e18a3a4dd89a9e11b37';
            td2.className = 'e08ba001706c4e18a3a4dd89a9e11b37';
            td3.className = 'e08ba001706c4e18a3a4dd89a9e11b37';

            var text1 = document.createTextNode(p.toString());
            var text2 = document.createTextNode('none');
            var text3 = document.createTextNode('none');

            td1.appendChild(text1);
            td2.appendChild(text2);
            td3.appendChild(text3);

            tr.appendChild(td1);
            tr.appendChild(td2);
            tr.appendChild(td3);

            table.appendChild(tr);
        }

        var element = document.getElementById('b282bc39cfe849aa8fb9940cfbdce51a');
        if (typeof(element) != 'undefined' && element != null) {
            document.body.replaceChild(table, element);
        } else {
            document.body.appendChild(table);
        }
    }

    destroy() {
        this.subscribers = null;
        Events.off(this.socket, this.socketHandlers, this);
    }

    connect() {
        this.sendJoin(this.roomName);
    }

    initPeerConnection(user, isInitiator) {
        var cnt = new PeerConnection(this.socket, user, isInitiator);
        Events.on(cnt, this.peerConnectionHandlers, this, cnt, user);

        var userId = user.userId;
        var pendingSdp = this.pendingSdp[userId];
        if (pendingSdp) {
            cnt.setSdp(pendingSdp);
            delete this.pendingSdp[userId];
        }
        var pendingCandidates = this.pendingCandidates[userId];
        if (pendingCandidates) {
            pendingCandidates.forEach(cnt.addIceCandidate, cnt);
            delete this.pendingCandidates[userId];
        }
        return cnt;
    }

    onSdp(message) {
        var userId = message.userId;
        if (!this.peers[userId]) {
            this.log('Adding pending sdp from another player. id = ' + userId, 'gray');
            this.pendingSdp[userId] = message.sdp;
            return;
        }
        this.peers[userId].setSdp(message.sdp);
    }

    onIceCandidate(message) {
        var userId = message.userId;
        if (!this.peers[userId]) {
            this.log('Adding pending candidate from another player. id =' + userId, 'gray');
            if (!this.pendingCandidates[userId]) {
                this.pendingCandidates[userId] = [];
            }
            this.pendingCandidates[userId].push(message.candidate);
            return;
        }
        this.peers[userId].addIceCandidate(message.candidate);
    }

    onJoinedRoom(roomInfo) {
        this.emit('joined', roomInfo);
        this.roomInfo = roomInfo;
        this.peers = {};
        for (var k in this.roomInfo.users) {
            var user = this.roomInfo.users[k];
            if (user.userId !== this.roomInfo.userId) {
                this.peers[user.userId] = this.initPeerConnection(this.roomInfo.users[k], true);
            }
        }
    }

    onError(error) {
        this.log('Error connecting to room' + error.message, 'red');
    }

    onUserJoin(user) {
        var peerConnection = this.initPeerConnection(user, false);
        this.roomInfo.users.push(user);
        this.peers[user.userId] = peerConnection;
    }

    onUserReady(user) {
        this.log('Another player ready. id = ' + user.userId, 'orange');
        this.emit('user_ready', user);
    }

    onPeerChannelOpen(peer, user) {
        this.emit('peer_open', user, peer);
    }

    onPeerChannelClose(peer, user) {
        this.emit('peer_close', user, peer);
    }

    onPeerMessage(peer, user, message) {
        this.emit('peer_message', message, user, peer);
    }

    onUserLeave(goneUser) {
        try {
            if (!this.peers[goneUser.userId]) {
                return;
            }
            var cnt = this.peers[goneUser.userId];
            Events.off(cnt, this.peerConnectionHandlers, this);
            cnt.destroy();
            delete this.peers[goneUser.userId];
            delete this.roomInfo.users[goneUser.userId];
            this.emit('user_leave', goneUser);
            console.log('User ' + goneUser.userId + ' leave');
        } catch(e) {
            exceptionLog('Исключение поймано для юзера ' + goneUser.userId);
            this.forceUserDelete(goneUser);
        }
    }

    forceUserDelete(goneUser) {
        delete this.peers[goneUser.userId];
        delete this.roomInfo.users[goneUser.userId];
        this.emit('user_leave', goneUser);
        console.log('User ' + goneUser.userId + ' drop');
    }

    sendJoin(roomName) {
        this.socket.emit('join', {
            roomName: roomName
        });
    }

    sendLeave() {
        this.socket.emit(MessageType.LEAVE);
    }

    broadcastMessage(message) {
        this.broadcast(MessageBuilder.serialize(message));
    }

    sendMessageTo(userId, message) {
        console.log('Call sendMessageTo: ' + userId + ' ' + message);
        var peer = this.peers[userId];
        this.peerSend(peer, MessageBuilder.serialize(message));
    }

    broadcast(arrayBuffer) {
        for (var p in this.peers) {
            this.peerSend(this.peers[p], arrayBuffer);
        }
    }

    peerSend(peer, data) {
        peer.sendMessage(data);
    }

    log(message, color) {
        console.log('%c%s', 'color:' + color, message);
    }

    // Запрос классификации у пиров в сети
    classifReq() {
        this.broadcast("сlassifReq", HOSTNAME);
        
        // Ожидание ответа от пиров, после чего выполняется принятие решения о классификации
        setTimeout(function() {

            // Создаем словарь частоты
            var frequency = [];
            var count = 0;
            
            // Удаляем все null'ы - которые не смогли классифицировать
            for (var i = 0; i < answersFromPeers.length; i++) {
                if (answersFromPeers[i].classification !== null)
                {
                    count++;
                    if (answersFromPeers[i].classification in frequency)
                        frequency[answersFromPeers[i].classification]++;
                    else
                        frequency[answersFromPeers[i].classification] = 1;
                }
            }
            
            // Если классификация не пришла
            if (count === 0) {
                
                // Используем Байес
                window.c = new Classificator();
                c.loadKeyWordDatabase();
                c.loadWordsWithoutSubject();
                var cat = c.getCategory(document.documentElement.innerHTML);
                if (cat === null) {
                    debugLog('Категория не определена');
                    swal("Классификация", "Категория не определена", "success");
                
                    
                }
                else {
                    //debugLog('Категория: ' + cat);
                    swal({
                      title: cat,
                      text: "Категория определена верно?",
                      type: "info",
                      showCancelButton: true,
                      confirmButtonColor: "#DD6B55",
                      confirmButtonText: "Верно",
                      cancelButtonText: "Неверно",
                      closeOnConfirm: false,
                      closeOnCancel: false
                    },
                    function(isConfirm){
                      if (isConfirm) {
                        //swal("Deleted!", "Your imaginary file has been deleted.", "success");
                        store.set(HOSTNAME, cat);
                        swal.close();
                      } else {
                        //swal("Cancelled", "Your imaginary file is safe :)", "error");

                        debugLog('Категория не определена. Установка категории');
                        //var classif = prompt('Введите классификацию:');
                        swal({
                            title: "Сайт не удалось классифицировать",
                            text: "Введите классификацию для этого сайта:",
                            type: "input",
                            showCancelButton: true,
                            closeOnConfirm: false,
                            animation: "slide-from-top",
                            inputPlaceholder: "Классификация"
                        },
                        function(inputValue){
                            if (inputValue === "" || inputValue === false) {
                                console.log('Ничего не введено');
                            }
                            else
                                //console.log('Ввели: ' + inputValue);
                                //classif = inputValue;
                                store.set(HOSTNAME, inputValue);
                            swal.close();
                        });
                      }
                    });
                }
            }
            
            // Если классификация пришла
            else {
                var maxCount = 0;
                var maxCat = '';
                for (var item in frequency) {
                    if (frequency[item] > maxCount) {
                        maxCount = frequency[item];
                        maxCat = item;
                    }
                }
                
                if (maxCat === null) {
                    debugLog('Категория не получена от других пиров');
                    var classif = prompt('Введите классификацию:');
                    
                    
                    
                    
                    swal({
                        title: "Сайт не удалось классифицировать",
                        text: "Введите классификацию для этого сайта:",
                        type: "input",
                        showCancelButton: true,
                        closeOnConfirm: false,
                        animation: "slide-from-top",
                        inputPlaceholder: "Классификация"
                    },
                    function(inputValue){
                        if (inputValue === "" || inputValue === false) {
                            console.log('Ничего не введено');
                        }
                        else
                            console.log('Ввели: ' + inputValue);
                            classif = inputValue;
                        swal.close();
                    });

                    classif = classif.toLowerCase();
                    store.set(HOSTNAME, classif);
                }
                else {
                    swal("Сайт классифицирован", "Категория: " + maxCat, "success");
                    store.set(HOSTNAME, maxCat);
                }
            }
            answersFromPeers = [];
        }, RESPONSE_TIME);
    }
	
    // Установить классификацию для остальных
    setClassif() {
        debugLog("call setClassif()");
        this.broadcast("setClassif", window.location.hostname);      
    }

    // NSC
    broadcast(type, site) {
        var obj = {};
        obj.type = type;
        obj.site = site;
        obj.peerId = window.localPeer;

        var json = JSON.stringify(obj);
        for (var p in this.peers) {
            this.peers[p].sendMessage(json);
            this.peerAnswers++;
        }
    }
}

// Application.js
class GameRoom {
    constructor(socketUrl) {
        this.roomId = null;
        this.roomConnection = null;
        this.socket = null;
        debugLog('My object Application created');
        // Все подключения скидываем в одну комнату
        this.roomId = 1;
        this.socket = io(socketUrl);
        this.roomConnection = new RoomConnection(this.roomId, this.socket);
        this.roomConnection.on('joined', this.onJoinedRoom, this);
        this.roomConnection.connect();
        
        setTimeout(function() {
            room.classifReq();
        }, 2000);
    }

    onJoinedRoom(roomInfo) {
        window.localPeer = roomInfo.userId;
    }
}



function test() {
    window.c = new Classificator();
    c.loadKeyWordDatabase();
    
    c.loadWordsWithoutSubject();
    var cat = c.getCategory(document.documentElement.innerHTML);
    
    if (cat === null) {
        debugLog('Категория не определена');
        swal({
            title: "Сайт не удалось классифицировать",
            text: "Введите классификацию для этого сайта:",
            type: "input",
            showCancelButton: true,
            closeOnConfirm: false,
            animation: "slide-from-top",
            inputPlaceholder: "Классификация"
        },
        function(inputValue){
            if (inputValue === "" || inputValue === false) {
                console.log('Ничего не введено');
            }
            else
                console.log('Ввели: ' + inputValue);
            swal.close();
        });
    }
    else {
        debugLog('Категория: ' + cat);
        swal("Сайт классифицирован", "Категория: " + cat, "success");
    }
}

function debugLog(message) {
    if (DEBUG_MODE) {
        var date = new Date();
        var time = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
        console.log('%c[' + time + '] %s', 'color:' + COLOR_DEBUG, message);
    }
}

function exceptionLog(message) {
    if (DEBUG_MODE) {
        var date = new Date();
        var time = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
        console.log('%c[' + time + '] %s', 'color:' + COLOR_EXCEPTION, message);
    }
}

function resultLog(message) {
    if (DEBUG_MODE) {
        var date = new Date();
        var time = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
        console.log('%c[' + time + '] %s', 'color:' + COLOR_RESULT, message);
    }
}

var log = console.log.bind(console);

// Старт приложения
//var gameRoom = new GameRoom('https://' + window.location.hostname); // Herokuapp

//var gameRoom = new GameRoom('http://' + window.location.hostname + ':3000'); // Local client + local server
var gameRoom = new GameRoom('https://webrtc-classif-dhtnetwork.herokuapp.com'); // Local client + remote server