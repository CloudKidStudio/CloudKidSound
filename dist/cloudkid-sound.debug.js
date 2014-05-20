!function() {
    "use strict";
    var OS = cloudkid.OS, MediaLoader = cloudkid.MediaLoader, LoadTask = cloudkid.LoadTask, Task = cloudkid.Task, TaskManager = cloudkid.TaskManager, Sound = function() {
        this._sounds = {}, this._fades = [], this._contexts = {}, this._pool = [], this._update = this._update.bind(this), 
        this._markLoaded = this._markLoaded.bind(this), this._playAfterLoadBound = this._playAfterLoad.bind(this);
    }, p = Sound.prototype = {}, _instance = null;
    p._sounds = null, p._fades = null, p._pool = null, p.supportedSound = null, p._contexts = null;
    var UNLOADED = 0, LOADING = 1, LOADED = 2, UPDATE_ALIAS = "CKSOUND";
    Sound.UNHANDLED = "unhandled", Sound.init = function(supportedSound, config) {
        _instance = new Sound(), _instance.supportedSound = supportedSound, config && _instance.loadConfig(config);
    }, Object.defineProperty(Sound, "instance", {
        get: function() {
            return _instance;
        }
    }), p.loadConfig = function(config, defaultContext) {
        if (!config) return void Debug.warn("Warning - cloudkid.Sound was told to load a null config");
        var list = config.soundManifest, path = config.path;
        defaultContext = defaultContext || config.context;
        for (var i = 0, len = list.length; len > i; ++i) {
            var s = list[i], temp = this._sounds[s.id] = {
                id: s.id,
                src: path + s.src + this.supportedSound,
                volume: s.volume ? s.volume : 1,
                state: UNLOADED,
                playing: [],
                waitingToPlay: [],
                context: s.context || defaultContext,
                playAfterLoad: !1,
                preloadCallback: null
            };
            temp.context && (this._contexts[temp.context] || (this._contexts[temp.context] = new SoundContext(temp.context)), 
            this._contexts[temp.context].sounds.push(temp));
        }
    }, p.exists = function(alias) {
        return !!this._sounds[alias];
    }, p.isUnloaded = function(alias) {
        return this._sounds[alias] ? this._sounds[alias].state == UNLOADED : !1;
    }, p.isLoaded = function(alias) {
        return this._sounds[alias] ? this._sounds[alias].state == LOADED : !1;
    }, p.isLoading = function(alias) {
        return this._sounds[alias] ? this._sounds[alias].state == LOADING : !1;
    }, p.isPlaying = function(alias) {
        var sound = this._sounds[alias];
        return sound ? sound.playing.length + sound.waitingToPlay.length > 0 : !1;
    }, p.fadeIn = function(aliasOrInst, duration, targetVol, startVol) {
        var sound, inst;
        if ("string" == typeof aliasOrInst) {
            if (sound = this._sounds[aliasOrInst], !sound) return;
            sound.playing.length && (inst = sound.playing[sound.playing.length - 1]);
        } else inst = aliasOrInst, sound = this._sounds[inst.alias];
        if (inst && inst._channel) {
            inst._fTime = 0, inst._fDur = duration > 0 ? duration : 500;
            var v = startVol > 0 ? startVol : 0;
            inst._channel.setVolume(v), inst.curVol = inst._fStart = v, inst._fEnd = targetVol || sound.volume, 
            -1 == this._fades.indexOf(inst) && (this._fades.push(inst), 1 == this._fades.length && OS.instance.addUpdateCallback(UPDATE_ALIAS, this._update));
        }
    }, p.fadeOut = function(aliasOrInst, duration, targetVol, startVol) {
        var sound, inst;
        if ("string" == typeof aliasOrInst) {
            if (sound = this._sounds[aliasOrInst], !sound) return;
            sound.playing.length && (inst = sound.playing[sound.playing.length - 1]);
        } else inst = aliasOrInst;
        inst && inst._channel && (inst._fTime = 0, inst._fDur = duration > 0 ? duration : 500, 
        startVol > 0 ? (inst._channel.setVolume(startVol), inst._fStart = startVol) : inst._fStart = inst._channel.getVolume(), 
        inst.curVol = inst._fStart, inst._fEnd = targetVol || 0, -1 == this._fades.indexOf(inst) && (this._fades.push(inst), 
        1 == this._fades.length && OS.instance.addUpdateCallback(UPDATE_ALIAS, this._update)));
    }, p._update = function(elapsed) {
        for (var fades = this._fades, trim = 0, i = fades.length - 1; i >= 0; --i) {
            var inst = fades[i];
            if (!inst.paused) {
                var time = inst._fTime += elapsed;
                if (time >= inst._fDur) {
                    if (0 === inst._fEnd) {
                        var sound = this._sounds[inst.alias];
                        sound.playing = sound.playing.splice(sound.playing.indexOf(inst), 1), this._stopInst(inst);
                    } else inst.curVol = inst._fEnd, inst.updateVolume();
                    ++trim;
                    var swapIndex = fades.length - trim;
                    i != swapIndex && (fades[i] = fades[swapIndex]);
                } else {
                    var vol, lerp = time / inst._fDur;
                    vol = inst._fEnd > inst._fStart ? inst._fStart + (inst._fEnd - inst._fStart) * lerp : inst._fEnd + (inst._fStart - inst._fEnd) * lerp, 
                    inst.curVol = vol, inst.updateVolume();
                }
            }
        }
        fades.length = fades.length - trim, 0 === fades.length && OS.instance.removeUpdateCallback(UPDATE_ALIAS);
    }, p.play = function(alias, completeCallback, startCallback, interrupt, delay, offset, loop, volume, pan) {
        if (loop === !0 && (loop = -1), completeCallback == Sound.UNHANDLED) return createjs.Sound.play(alias, interrupt, delay, offset, loop, volume, pan);
        var sound = this._sounds[alias];
        if (!sound) return Debug.error("cloudkid.Sound: sound " + alias + " not found!"), 
        void (completeCallback && completeCallback());
        var inst, arr, state = sound.state;
        if (volume = "number" == typeof volume && volume > 0 ? volume : sound.volume, state == LOADED) {
            var channel = createjs.Sound.play(alias, interrupt, delay, offset, loop, volume, pan);
            return channel && channel.playState != createjs.Sound.PLAY_FAILED ? (inst = this._getSoundInst(channel, sound.id), 
            inst.curVol = volume, sound.playing.push(inst), inst._endCallback = completeCallback, 
            inst.updateVolume(), inst.length = channel.getDuration(), inst._channel.addEventListener("complete", inst._endFunc), 
            startCallback && setTimeout(startCallback, 0), inst) : (completeCallback && completeCallback(), 
            null);
        }
        return state == UNLOADED ? (sound.state = LOADING, sound.playAfterLoad = !0, inst = this._getSoundInst(null, sound.id), 
        inst.curVol = volume, sound.waitingToPlay.push(inst), inst._endCallback = completeCallback, 
        inst._startFunc = startCallback, inst._startParams ? (arr = inst._startParams, arr[0] = interrupt, 
        arr[1] = delay, arr[2] = offset, arr[3] = loop, arr[4] = pan) : inst._startParams = [ interrupt, delay, offset, loop, pan ], 
        MediaLoader.instance.load(sound.src, this._playAfterLoadBound, null, 0, sound), 
        inst) : state == LOADING ? (sound.playAfterLoad = !0, inst = this._getSoundInst(null, sound.id), 
        inst.curVol = volume, sound.waitingToPlay.push(inst), inst._endCallback = completeCallback, 
        inst._startFunc = startCallback, inst._startParams ? (arr = inst._startParams, arr[0] = interrupt, 
        arr[1] = delay, arr[2] = offset, arr[3] = loop, arr[4] = pan) : inst._startParams = [ interrupt, delay, offset, loop, pan ], 
        inst) : void 0;
    }, p._getSoundInst = function(channel, id) {
        var rtn;
        return this._pool.length ? rtn = this._pool.pop() : (rtn = new SoundInst(), rtn._endFunc = this._onSoundComplete.bind(this, rtn)), 
        rtn._channel = channel, rtn.alias = id, rtn.length = channel ? channel.getDuration() : 0, 
        rtn.isValid = !0, rtn;
    }, p._playAfterLoad = function(result) {
        var alias = "string" == typeof result ? result : result.id, sound = this._sounds[alias];
        if (sound.state = LOADED, sound.playAfterLoad) {
            for (var waiting = sound.waitingToPlay, i = 0; i < waiting.length; ++i) {
                var inst = waiting[i], startParams = inst._startParams, volume = inst.curVol, channel = createjs.Sound.play(alias, startParams[0], startParams[1], startParams[2], startParams[3], volume, startParams[4]);
                channel && channel.playState != createjs.Sound.PLAY_FAILED ? (sound.playing.push(inst), 
                inst._channel = channel, inst.length = channel.getDuration(), inst.updateVolume(), 
                channel.addEventListener("complete", inst._endFunc), inst._startFunc && inst._startFunc(), 
                inst.paused && channel.pause()) : (inst._endCallback && inst._endCallback(), this._poolInst(inst));
            }
            waiting.length = 0;
        }
    }, p._onSoundComplete = function(inst) {
        inst._channel.removeEventListener("complete", inst._endFunc);
        var sound = this._sounds[inst.alias];
        sound.playing.splice(sound.playing.indexOf(inst), 1);
        var callback = inst._endCallback;
        this._poolInst(inst), callback && callback();
    }, p.stop = function(alias) {
        var s = this._sounds[alias];
        if (s) if (s.playing.length) this._stopSound(s); else if (s.state == LOADING) {
            s.playAfterLoad = !1;
            for (var waiting = s.waitingToPlay, i = 0; i < waiting.length; ++i) {
                var inst = waiting[i];
                this._poolInst(inst);
            }
            waiting.length = 0;
        }
    }, p._stopSound = function(s) {
        for (var arr = s.playing, i = arr.length - 1; i >= 0; --i) this._stopInst(arr[i]);
        arr.length = 0;
    }, p._stopInst = function(inst) {
        inst._channel.removeEventListener("complete", inst._endFunc), inst._channel.stop(), 
        this._poolInst(inst);
    }, p.stopContext = function(context) {
        if (context = this._contexts[context]) for (var arr = context.sounds, i = arr.length - 1; i >= 0; --i) {
            var s = arr[i];
            s.playing.length ? this._stopSound(s) : s.state == LOADING && (s.playAfterLoad = !1);
        }
    }, p.pauseSound = function(alias) {
        var sound;
        sound = "string" == typeof alias ? this._sounds[alias] : alias;
        for (var arr = sound.playing, i = arr.length - 1; i >= 0; --i) arr[i].pause();
    }, p.unpauseSound = function(alias) {
        var sound;
        sound = "string" == typeof alias ? this._sounds[alias] : alias;
        for (var arr = sound.playing, i = arr.length - 1; i >= 0; --i) arr[i].unpause();
    }, p.pauseAll = function() {
        var arr = this._sounds;
        for (var i in arr) this.pauseSound(arr[i]);
    }, p.unpauseAll = function() {
        var arr = this._sounds;
        for (var i in arr) this.unpauseSound(arr[i]);
    }, p.setContextMute = function(context, muted) {
        if (context = this._contexts[context]) {
            context.muted = muted;
            for (var volume = context.volume, arr = context.sounds, i = arr.length - 1; i >= 0; --i) {
                var s = arr[i];
                if (s.playing.length) for (var playing = s.playing, j = playing.length - 1; j >= 0; --j) playing[j].updateVolume(muted ? 0 : volume);
            }
        }
    }, p.setContextVolume = function(context, volume) {
        if (context = this._contexts[context]) {
            var muted = context.muted;
            context.volume = volume;
            for (var arr = context.sounds, i = arr.length - 1; i >= 0; --i) {
                var s = arr[i];
                if (s.playing.length) for (var playing = s.playing, j = playing.length - 1; j >= 0; --j) playing[j].updateVolume(muted ? 0 : volume);
            }
        }
    }, p.preloadSound = function(alias, callback) {
        var sound = this._sounds[alias];
        return sound ? void (sound.state == UNLOADED && (sound.state = LOADING, sound.preloadCallback = callback || null, 
        MediaLoader.instance.load(sound.src, this._markLoaded, null, 0, sound))) : void Debug.error("Sound does not exist: " + alias + " - can't preload!");
    }, p.preload = function(list, callback) {
        if (!list || 0 === list.length) return void (callback && callback());
        for (var tasks = [], i = 0, len = list.length; len > i; ++i) {
            var sound = this._sounds[list[i]];
            sound ? sound.state == UNLOADED && (sound.state = LOADING, tasks.push(new LoadTask(sound.id, sound.src, this._markLoaded, null, 0, sound))) : Debug.error("cloudkid.Sound was asked to preload " + list[i] + " but it is not a registered sound!");
        }
        tasks.length > 0 ? TaskManager.process(tasks, function() {
            callback && callback();
        }) : callback && callback();
    }, p._markLoaded = function(result) {
        var alias = result.id, sound = this._sounds[alias];
        sound && (sound.state = LOADED, sound.playAfterLoad && this._playAfterLoad(alias));
        var callback = sound.preloadCallback;
        callback && (sound.preloadCallback = null, callback());
    }, p.createPreloadTask = function(id, list, callback) {
        return new SoundListTask(id, list, callback);
    }, p.unload = function(list) {
        if (list) for (var i = 0, len = list.length; len > i; ++i) {
            var sound = this._sounds[list[i]];
            sound && (this._stopSound(sound), sound.state = UNLOADED), createjs.Sound.removeSound(list[i]);
        }
    }, p._poolInst = function(inst) {
        inst._endCallback = null, inst.alias = null, inst._channel = null, inst._startFunc = null, 
        inst.curVol = 0, inst.paused = !1, inst.isValid = !1, this._pool.push(inst);
    }, p.destroy = function() {
        _instance = null, this._volumes = null, this._fades = null, this._contexts = null, 
        this._pool = null;
    };
    var SoundInst = function() {
        this._channel = null, this._endFunc = null, this._endCallback = null, this._startFunc = null, 
        this._startParams = null, this.alias = null, this._fTime = 0, this._fDur = 0, this._fStart = 0, 
        this._fEnd = 0, this.curVol = 0, this.length = 0, this.paused = !1, this.isValid = !0;
    };
    Object.defineProperty(SoundInst.prototype, "position", {
        get: function() {
            return this._channel ? this._channel.getPosition() : 0;
        }
    }), SoundInst.prototype.stop = function() {
        var s = Sound.instance, sound = s._sounds[this.alias];
        sound.playing.splice(sound.playing.indexOf(this), 1), Sound.instance._stopInst(this);
    }, SoundInst.prototype.updateVolume = function(contextVol) {
        if (this._channel) {
            if (void 0 === contextVol) {
                var s = Sound.instance, sound = s._sounds[this.alias];
                if (sound.context) {
                    var context = s._contexts[sound.context];
                    contextVol = context.muted ? 0 : context.volume;
                } else contextVol = 1;
            }
            this._channel.setVolume(contextVol * this.curVol);
        }
    }, SoundInst.prototype.pause = function() {
        this.paused || (this.paused = !0, this._channel && this._channel.pause());
    }, SoundInst.prototype.unpause = function() {
        this.paused && (this.paused = !1, this._channel && this._channel.resume());
    };
    var SoundListTask = function(id, list, callback) {
        this.initialize(id, callback), this.list = list;
    };
    SoundListTask.prototype = Object.create(Task.prototype), SoundListTask.s = Task.prototype, 
    SoundListTask.prototype.start = function(callback) {
        _instance.preload(this.list, callback);
    }, SoundListTask.prototype.destroy = function() {
        SoundListTask.s.destroy.apply(this), this.list = null;
    };
    var SoundContext = function(id) {
        this.id = id, this.volume = 1, this.muted = !1, this.sounds = [];
    };
    SoundContext.prototype = {}, namespace("cloudkid").Sound = Sound;
}(), function() {
    "use strict";
    var Captions, OS, Sound = cloudkid.Sound, VOPlayer = function(useCaptions) {
        Captions = cloudkid.Captions, OS = cloudkid.OS, this._audioListener = this._onAudioFinished.bind(this), 
        this._update = this._update.bind(this), this._updateCaptionPos = this._updateCaptionPos.bind(this), 
        useCaptions && (this.captions = useCaptions instanceof Captions ? useCaptions : new Captions(), 
        this.captions.isSlave = !0), this._listHelper = [];
    }, p = VOPlayer.prototype = {};
    p.trackAudio = !1, p.audioList = null, p._listCounter = 0, p._currentAudio = null, 
    p._audioInst = null, p._callback = null, p._cancelledCallback = null, p._audioListener = null, 
    p._playedAudio = null, p._timer = 0, p.captions = null, p._listHelper = null, Object.defineProperty(p, "playing", {
        get: function() {
            return null !== this._currentAudio || this._timer > 0;
        }
    }), p.play = function(id, callback, cancelledCallback) {
        this.stop(), this._listCounter = -1, this._listHelper[0] = id, this.audioList = this._listHelper, 
        this._callback = callback, this._cancelledCallback = cancelledCallback, this._onAudioFinished();
    }, p.playList = function(list, callback, cancelledCallback) {
        this.stop(), this._listCounter = -1, this.audioList = list, this._callback = callback, 
        this._cancelledCallback = cancelledCallback, this._onAudioFinished();
    }, p._onAudioFinished = function() {
        if (OS.instance.removeUpdateCallback("VOPlayer"), this.captions && this._audioInst && this.captions.seek(this._audioInst.length), 
        this._audioInst = null, this._listCounter++, this._listCounter >= this.audioList.length) {
            this.captions && this.captions.stop(), this._currentAudio = null, this._cancelledCallback = null;
            var c = this._callback;
            this._callback = null, c && c();
        } else this._currentAudio = this.audioList[this._listCounter], "string" == typeof this._currentAudio ? this._playAudio() : "function" == typeof this._currentAudio ? (this._currentAudio(), 
        this._onAudioFinished()) : (this._timer = this._currentAudio, this._currentAudio = null, 
        OS.instance.addUpdateCallback("VOPlayer", this._update));
    }, p._update = function(elapsed) {
        this.captions && this.captions.updateTime(elapsed), this._timer -= elapsed, this._timer <= 0 && this._onAudioFinished();
    }, p._updateCaptionPos = function() {
        this._audioInst && this.captions.seek(this._audioInst.position);
    }, p._playAudio = function() {
        this.trackAudio && (this._playedAudio ? -1 == this._playedAudio.indexOf(this._currentAudio) && this._playedAudio.push(this._currentAudio) : this._playedAudio = [ this._currentAudio ]);
        var s = Sound.instance;
        !s.exists(this._currentAudio) && this.captions && this.captions.hasCaption(this._currentAudio) ? (this.captions.play(this._currentAudio), 
        this._timer = this.captions.currentDuration, this._currentAudio = null, OS.instance.addUpdateCallback("VOPlayer", this._update)) : (this._audioInst = s.play(this._currentAudio, this._audioListener), 
        this.captions && (this.captions.play(this._currentAudio), OS.instance.addUpdateCallback("VOPlayer", this._updateCaptionPos)));
        for (var i = this._listCounter + 1; i < this.audioList.length; ++i) {
            var next = this.audioList[i];
            if ("string" == typeof next) {
                s.isLoaded(next) || s.preloadSound(next);
                break;
            }
        }
    }, p.stop = function() {
        this._currentAudio && (Sound.instance.stop(this._currentAudio), this._currentAudio = null), 
        this.captions && this.captions.stop(), OS.instance.removeUpdateCallback("VOPlayer"), 
        this.audioList = null, this._timer = 0, this._callback = null;
        var c = this._cancelledCallback;
        this._cancelledCallback = null, c && c();
    }, p.unloadPlayedAudio = function() {
        Sound.instance.unload(this._playedAudio), this._playedAudio = null;
    }, p.destroy = function() {
        this.stop(), this.audioList = null, this._listHelper = null, this._currentAudio = null, 
        this._audioInst = null, this._callback = null, this._cancelledCallback = null, this._audioListener = null, 
        this._playedAudio = null, this.captions && (this.captions.destroy(), this.captions = null);
    }, namespace("cloudkid").VOPlayer = VOPlayer;
}();