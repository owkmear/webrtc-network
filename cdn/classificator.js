class Classificator {

    constructor(name) {
        console.log('object Classificator was created');
        
        // Категории
        this.keyWordDatabase = [];
        
        // Общие слова, не несущие тематику
        this.wordsWithoutSubject = null;
    }
    
    // Интерфейс для хранения списка классифицированных сайтов
    storageSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            if (e == QUOTA_EXCEEDED_ERR)
                console.log("Local storage is full");
        }
    }
    storageGet(key) {
        return localStorage.getItem(key);
    }


    
    loadKeyWordDatabaseLocal(database) {
        this.keyWordDatabase = database;
    }

    loadKeyWordDatabase() {
        var db = this.keyWordDatabase;
        var data = this.loadDb();
        data.forEach(function(item1) {
            
            var catExist = -1;
            var count = 0;
            db.forEach(function(item2){
                if (item2.name === item1.category)
                    catExist = count;
                count++;
            });
            if (catExist !== -1) {
                var wordExist = false;
                db[catExist].dic.forEach(function(item3){
                    if (item3.name === item1.name)
                        wordExist = true;
                });
                if (!wordExist) {
                    var item = {};
                    item.name = item1.word;
                    item.weight = Number(item1.weight);
                    db[catExist].dic.push(item);
                }
            }
            else {
                var cat = {};
                cat.name = item1.category;
                cat.dic = [];
                var item = {};
                item.name = item1.word;
                item.weight = Number(item1.weight);
                cat.dic.push(item);
                db.push(cat);
            }
        });
    }
    
    loadDb() {
        var result;
        $.ajax({
            url: ROOT + '/keywords/',
            method: 'GET',
            success: function(data) {
                result = data;
            },
            async: false
        });
        return result;
    }
    
    saveDb() {
        var self = this;
        console.log('call savedb()');
        this.keyWordDatabase.forEach(function(item1){
            item1.dic.forEach(function(item2){
                self.addWord(item1.name, item2.name, item2.weight);
            });
        });
    }    
    
    // Добавление или замена слова в БД
    addWord(cat, word, weight) {
        var db = this.loadDb();
        var id = -1;
        db.forEach(function(item){
            if (item.category === cat && item.word === word)
                id = item.id;
        });
        if (id === -1) { // Нет слова - POST
            $.ajax({
                url: ROOT + '/keywords/',
                method: 'POST',
                data: {'category': cat, 'word': word, 'weight': weight},
                success: function(){
                },
                async: false
            });
        }
        else {
            $.ajax({
                url: ROOT + '/keywords/' + id,
                method: 'PUT',
                data: {'category': cat, 'word': word, 'weight': weight},
                success: function(){
                }
            });
        }
    }
    
    // На вход страница - document.documentElement.innerHTML
    getCategory(page) {
        // Ищем все русские слова в тексте
        var regexp = /[АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя]+/ig;
        var result;
        var tokens = [];
        while (result = regexp.exec(page)) {
            var token = {};
            // Пропускаем каждое слово через стеммер
            token.data = this.stemmer(result[0].toLowerCase());
            tokens.push(token);
        }

        // Создаем словарь частоты слов
        var frequency = [];
        for (var i = 0; i < tokens.length; i++) {
            if (tokens[i].data in frequency)
                frequency[tokens[i].data]++;
            else
                frequency[tokens[i].data] = 1;
        }

        // Удаляем слова, не несущие тематику
        for (var item in frequency) {
            if (this.wordsWithoutSubject.indexOf(item) > 0)
                delete frequency[item];
        }

        // Удаляем слова, меньшие двух букв
        for (var item in frequency) {
            if (item.length <= 2)
                delete frequency[item];
        }

        // Удаляем все слова, повторяющиеся менее двух раз
        for (var item in frequency) {
            if (frequency[item] <= 1)
                delete frequency[item];
        }

        var words = [];
        for (var item in frequency) {
            var token = [];
            token.name = item;
            token.count = frequency[item];
            words.push(token);
        }

        // Сортируем словарь
        function compare(A, B) {
            return B.count - A.count;
        };
        words.sort(compare);
       
        // Определяем тематику текста, сложность O(n^2)
        var maxMatCat = null;
        var maxMatCatCount = 0;
        var categoryPoints = [];
        this.keyWordDatabase.forEach(function(item1) { // суд

            var catCount = 0;
            item1.dic.forEach(function(item2) { // присяжн (name: "присяжн", weight: 0.4)
                //console.log(item2);

                words.forEach(function(item3) { // дорог
                    if (item3.name === item2.name) { // дорог === присяжн
                        //catCount++;
                        catCount += item3.count * item2.weight;
                        //console.log('Найдено: ' + item3.name + ' количество ' + item3.count + ' с весом ' + item2.weight);
                        //TODO: break;
                    }
                });
            });
            //console.log(item1.name + ' = ' + catCount);
            
            // Выводим только найденные категории
            if (catCount > 0) {
                var cat = {};
                cat.name = item1.name;
                cat.points = catCount;
                categoryPoints.push(cat);
            }
            if (catCount > maxMatCatCount) {
                maxMatCatCount = catCount;
                maxMatCat = item1.name;
            }
        });
        
        var count = 0;
        words.forEach(function(item) {
            if (count < LOG_COUNT)
                resultLog('Найдено: ' + item.name + ' - ' + item.count);
            count++;
        });

        return maxMatCat;
    }

    stemmer(word) {

        var DICT = {
            RVRE: /^(.*?[аеиоуыэюя])(.*)$/i,
            PERFECTIVEGROUND_1: /([ая])(в|вши|вшись)$/gi,
            PERFECTIVEGROUND_2: /(ив|ивши|ившись|ыв|ывши|ывшись)$/i,
            REFLEXIVE: /(с[яь])$/i,
            ADJECTIVE: /(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/i,
            PARTICIPLE_1: /([ая])(ем|нн|вш|ющ|щ)$/gi,
            PARTICIPLE_2: /(ивш|ывш|ующ)$/i,
            VERB_1: /([ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)$/gi,
            VERB_2: /(ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)$/i,
            NOUN: /(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/i,
            DERIVATIONAL: /.*[^аеиоуыэюя]+[аеиоуыэюя].*ость?$/i,
            DER: /ость?$/i,
            SUPERLATIVE: /(ейше|ейш)$/i,
            I: /и$/i,
            P: /ь$/i,
            NN: /нн$/i
        };
   
        word = word.replace(/ё/gi, 'e');
        var wParts = word.match(DICT.RVRE);
        if (!wParts) {
            return word;
        }
        var start = wParts[1];
        var rv = wParts[2];
        var temp = rv.replace(DICT.PERFECTIVEGROUND_2, '');
        if (temp == rv) {
            temp = rv.replace(DICT.PERFECTIVEGROUND_1, '$1');
        }
        if (temp == rv) {
            rv = rv.replace(DICT.REFLEXIVE, '');
            temp = rv.replace(DICT.ADJECTIVE, '');
            if (temp != rv) {
                rv = temp;
                temp = rv.replace(DICT.PARTICIPLE_2, '');
                if (temp == rv) {
                    rv = rv.replace(DICT.PARTICIPLE_1, '$1');
                }
            } else {
                temp = rv.replace(DICT.VERB_2, '');
                if (temp == rv) {
                    temp = rv.replace(DICT.VERB_1, '$1');
                }
                if (temp == rv) {
                    rv = rv.replace(DICT.NOUN, '');
                } else {
                    rv = temp;
                }
            }
        } else {
            rv = temp;
        }
        rv = rv.replace(DICT.I, '');
        if (rv.match(DICT.DERIVATIONAL)) {
            rv = rv.replace(DICT.DER, '');
        }
        temp = rv.replace(DICT.P, '');
        if (temp == rv) {
            rv = rv.replace(DICT.SUPERLATIVE, '');
            rv = rv.replace(DICT.NN, 'н');
        } else {
            rv = temp;
        }
        return start + rv;
    };
    
    getDb() {
        this.keyWordDatabase.forEach(function(item1) {
            console.log('Категория: ' + item1.name);
            item1.dic.forEach(function(item2) { // name: "присяжн", weight: 0.4
                console.log('  * ' + item2.name + ' ' + item2.weight);
            });
        });
    }
    
    // Добавление в БД новых данных по категории
    addDataToDb(catName, words) {
        // Проверка наличия категории. Если ее нет, то создаем новую и заносим в нее данные
        var db = this.keyWordDatabase;
        var exist = -1;
        var count = 0;
        this.keyWordDatabase.forEach(function(item) { // суд
            if (item.name === catName)
                exist = count;
            count++;
        });
        var max = 0;
        words.forEach(function(item){
            if (item.count > max)
                max = item.count;
        });
        
        if (exist !== -1) {

            words.forEach(function(item1){ // заключен 8
                var existWord = -1;
                var count = 0;

                db[exist].dic.forEach(function(item2) { // name: "присяжн", weight: 0.4
                    if (item1.name === item2.name)
                        existWord = count;
                    count++;
                });
                if (existWord !== -1) {
                    db[exist].dic[existWord].weight = Number(((db[exist].dic[existWord].weight + item1.count / max) / 2).toFixed(1));
                }
                else {
                    var newItem = {};
                    newItem.name = item1.name;
                    newItem.weight = Number((item1.count / max).toFixed(1));
                    db[exist].dic.push(newItem);
                }
            });
            
        }
        else {
            console.log('Категории ' + catName + ' нет, создаем новую категорию');

            var cat = {};
            cat.name = catName;
            cat.dic = [];
            words.forEach(function(item){
                var newItem = {};
                newItem.name = item.name;
                newItem.weight = Number((item.count / max).toFixed(1));
                cat.dic.push(newItem);
            });
            db.push(cat);  
        }
    }
}

class DHT {

    constructor(name) {
        // Создание ID пира
        this.id = guid();
        console.log('ID этой ноды: ' + this.id);
        
        this.sites = []; // Список классифицированных сайтов
        this.nearest = []; // Список ближайших пиров
    }

    hash(key) {
        return Sha1.hash(key);
    }
    
    add(site, value) {
        var record = {};
        record.hash = this.hash(site);
        record.value = value;
        this.sites.push(record);
    }
    
    find(site) {
        this.nearest.forEach(function(item){
            room.sendMessage(item);
        });
    }
}

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}

class Sha1 {

    /**
     * Generates SHA-1 hash of string.
     *
     * @param   {string} msg - (Unicode) string to be hashed.
     * @param   {Object} [options]
     * @param   {string} [options.msgFormat=string] - Message format: 'string' for JavaScript string
     *   (gets converted to UTF-8 for hashing); 'hex-bytes' for string of hex bytes ('616263' ≡ 'abc') .
     * @param   {string} [options.outFormat=hex] - Output format: 'hex' for string of contiguous
     *   hex bytes; 'hex-w' for grouping hex bytes into groups of (4 byte / 8 character) words.
     * @returns {string} Hash of msg as hex character string.
     */
    static hash(msg, options) {
        const defaults = { msgFormat: 'string', outFormat: 'hex' };
        const opt = Object.assign(defaults, options);

        switch (opt.msgFormat) {
            default: // default is to convert string to UTF-8, as SHA only deals with byte-streams
            case 'string':   msg = utf8Encode(msg);       break;
            case 'hex-bytes':msg = hexBytesToString(msg); break; // mostly for running tests
        }

        // constants [§4.2.1]
        const K = [ 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6 ];

        // initial hash value [§5.3.1]
        const H = [ 0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0 ];

        // PREPROCESSING [§6.1.1]

        msg += String.fromCharCode(0x80);  // add trailing '1' bit (+ 0's padding) to string [§5.1.1]

        // convert string msg into 512-bit/16-integer blocks arrays of ints [§5.2.1]
        const l = msg.length/4 + 2; // length (in 32-bit integers) of msg + ‘1’ + appended length
        const N = Math.ceil(l/16);  // number of 16-integer-blocks required to hold 'l' ints
        const M = new Array(N);

        for (let i=0; i<N; i++) {
            M[i] = new Array(16);
            for (let j=0; j<16; j++) {  // encode 4 chars per integer, big-endian encoding
                M[i][j] = (msg.charCodeAt(i*64+j*4+0)<<24) | (msg.charCodeAt(i*64+j*4+1)<<16)
                        | (msg.charCodeAt(i*64+j*4+2)<< 8) | (msg.charCodeAt(i*64+j*4+3)<< 0);
            } // note running off the end of msg is ok 'cos bitwise ops on NaN return 0
        }
        // add length (in bits) into final pair of 32-bit integers (big-endian) [§5.1.1]
        // note: most significant word would be (len-1)*8 >>> 32, but since JS converts
        // bitwise-op args to 32 bits, we need to simulate this by arithmetic operators
        M[N-1][14] = ((msg.length-1)*8) / Math.pow(2, 32); M[N-1][14] = Math.floor(M[N-1][14]);
        M[N-1][15] = ((msg.length-1)*8) & 0xffffffff;

        // HASH COMPUTATION [§6.1.2]

        for (let i=0; i<N; i++) {
            const W = new Array(80);

            // 1 - prepare message schedule 'W'
            for (let t=0;  t<16; t++) W[t] = M[i][t];
            for (let t=16; t<80; t++) W[t] = Sha1.ROTL(W[t-3] ^ W[t-8] ^ W[t-14] ^ W[t-16], 1);

            // 2 - initialise five working variables a, b, c, d, e with previous hash value
            let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4];

            // 3 - main loop (use JavaScript '>>> 0' to emulate UInt32 variables)
            for (let t=0; t<80; t++) {
                const s = Math.floor(t/20); // seq for blocks of 'f' functions and 'K' constants
                const T = (Sha1.ROTL(a,5) + Sha1.f(s,b,c,d) + e + K[s] + W[t]) >>> 0;
                e = d;
                d = c;
                c = Sha1.ROTL(b, 30) >>> 0;
                b = a;
                a = T;
            }

            // 4 - compute the new intermediate hash value (note 'addition modulo 2^32' – JavaScript
            // '>>> 0' coerces to unsigned UInt32 which achieves modulo 2^32 addition)
            H[0] = (H[0]+a) >>> 0;
            H[1] = (H[1]+b) >>> 0;
            H[2] = (H[2]+c) >>> 0;
            H[3] = (H[3]+d) >>> 0;
            H[4] = (H[4]+e) >>> 0;
        }

        // convert H0..H4 to hex strings (with leading zeros)
        for (let h=0; h<H.length; h++) H[h] = ('00000000'+H[h].toString(16)).slice(-8);

        // concatenate H0..H4, with separator if required
        const separator = opt.outFormat=='hex-w' ? ' ' : '';

        return H.join(separator);

        /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

        function utf8Encode(str) {
            try {
                return new TextEncoder().encode(str, 'utf-8').reduce((prev, curr) => prev + String.fromCharCode(curr), '');
            } catch (e) { // no TextEncoder available?
                return unescape(encodeURIComponent(str)); // monsur.hossa.in/2012/07/20/utf-8-in-javascript.html
            }
        }

        function hexBytesToString(hexStr) { // convert string of hex numbers to a string of chars (eg '616263' -> 'abc').
            const str = hexStr.replace(' ', ''); // allow space-separated groups
            return str=='' ? '' : str.match(/.{2}/g).map(byte => String.fromCharCode(parseInt(byte, 16))).join('');
        }
    }


    /**
     * Function 'f' [§4.1.1].
     * @private
     */
    static f(s, x, y, z)  {
        switch (s) {
            case 0: return (x & y) ^ (~x & z);          // Ch()
            case 1: return  x ^ y  ^  z;                // Parity()
            case 2: return (x & y) ^ (x & z) ^ (y & z); // Maj()
            case 3: return  x ^ y  ^  z;                // Parity()
        }
    }


    /**
     * Rotates left (circular left shift) value x by n positions [§3.2.5].
     * @private
     */
    static ROTL(x, n) {
        return (x<<n) | (x>>>(32-n));
    }
}
