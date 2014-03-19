(function() {
	var Sound = function()
	{
		this._sounds = {};
		this._fades = [];
		this._contexts = {};
		this._pool = [];
		this._update = this._update.bind(this);
		this._markLoaded = this._markLoaded.bind(this);
		this._playAfterLoadBound = this._playAfterLoad.bind(this);
	};
	
	var p = Sound.prototype = {};
	
	var _instance = null;
	
	/** Dictionary of sound objects, containing configuration info and playback objects. */
	p._sounds = null;
	/** Array of SoundInst objects that are being faded in or out. */
	p._fades = null;
	/** Array of SoundInst objects waiting to be used. */
	p._pool = null;
	/** The extension of the supported sound type that will be used. */
	p.supportedSound = null;
	/** Dictionary of SoundContexts. */
	p._contexts = null;

	//sound states
	var UNLOADED = 0;
	var LOADING = 1;
	var LOADED = 2;

	var UPDATE_ALIAS = "CKSOUND";

	Sound.UNHANDLED = "unhandled";
	
	/** Initializes the Sound singleton.
	*	@param supportedSound The extension of the sound file type to use.
	*	@param config An optional sound config object to load.
	*/
	Sound.init = function(supportedSound, config)
	{
		_instance = new Sound();
		_instance.supportedSound = supportedSound;
		if(config)
			_instance.loadConfig(config);
	};
	
	/** The singleton instance of Sound. */
	Object.defineProperty(Sound, "instance",
	{
		get: function() { return _instance; }
	});
	
	/** Loads a config object.
	*	@param config The config to load.
	*	@param defaultContext The optional sound context to load sounds into unless 
			otherwise specified. Sounds do not require a context.
	*/
	p.loadConfig = function(config, defaultContext)
	{
		if(!config)
		{
			Debug.warn("Warning - cloudkid.Sound was told to load a null config");
			return;
		}
		var list = config.soundManifest;
		var path = config.path;
		defaultContext = defaultContext || config.context;
		for(var i = 0, len = list.length; i < len; ++i)
		{
			var s = list[i];
			var temp = this._sounds[s.id] = {
				id: s.id,
				src: path + s.src + this.supportedSound,
				volume: s.volume ? s.volume : 1,
				state: UNLOADED,
				playing: [],
				waitingToPlay: [],
				context: s.context || defaultContext,
				playAfterLoad: false,
				preloadCallback: null
			};
			if(temp.context)
			{
				if(!this._contexts[temp.context])
					this._contexts[temp.context] = new SoundContext(temp.context);
				this._contexts[temp.context].sounds.push(temp);
			}
		}
	};

	/** If a sound exists in the list of recognized sounds.
	*	@param alias The alias of the sound to look for.
	*	@return true if the sound exists, false otherwise.
	*/
	p.exists = function(alias)
	{
		return !!this._sounds[alias];
	};

	/** If a sound is unloaded.
	*	@param alias The alias of the sound to look for.
	*	@return true if the sound is unloaded, false if it is loaded, loading or does not exist.
	*/
	p.isUnloaded = function(alias)
	{
		return this._sounds[alias] ? this._sounds[alias].state == UNLOADED : false;
	};

	/** If a sound is loaded.
	*	@param alias The alias of the sound to look for.
	*	@return true if the sound is loaded, false if it is not loaded or does not exist.
	*/
	p.isLoaded = function(alias)
	{
		return this._sounds[alias] ? this._sounds[alias].state == LOADED : false;
	};

	/** If a sound is in the process of being loaded
	*	@param alias The alias of the sound to look for.
	*	@return true if the sound is currently loading, false if it is loaded, unloaded, or does not exist.
	*/
	p.isLoading = function(alias)
	{
		return this._sounds[alias] ? this._sounds[alias].state == LOADING : false;
	};

	/** If a sound is playing.
	*	@param alias The alias of the sound to look for.
	*	@return true if the sound is currently playing or loading with an intent to play, false if it is not playing or does not exist.
	*/
	p.isPlaying = function(alias)
	{
		var sound = this._sounds[alias];
		return sound ? sound.playing.length + sound.waitingToPlay.length > 0 : false;
	};

	/** Fades a sound from 0 to a specified volume.
	*	@param aliasOrInst The alias of the sound to fade the last played instance of, or an instance returned from play().
	*	@param duration The duration in milliseconds to fade for. The default is 500ms.
	*	@param targetVol The volume to fade to. The default is the sound's default volume.
	*	@param startVol The volume to start from. The default is 0.
	*/
	p.fadeIn = function(aliasOrInst, duration, targetVol, startVol)
	{
		var sound, inst;
		if(typeof(aliasOrInst) == "string")
		{
			sound = this._sounds[aliasOrInst];
			if(!sound) return;
			if(sound.playing.length)
				inst = sound.playing[sound.playing.length - 1];//fade the last played instance
		}
		else
		{
			inst = aliasOrInst;
			sound = this._sounds[inst.alias];
		}
		if(!inst || !inst._channel) return;
		inst._fTime = 0;
		inst._fDur = duration > 0 ? duration : 500;
		var v = startVol > 0 ? startVol : 0;
		inst._channel.setVolume(v);
		inst.curVol = inst._fStart = v;
		inst._fEnd = targetVol || sound.volume;
		if(this._fades.indexOf(inst) == -1)
		{
			this._fades.push(inst);
			if(this._fades.length == 1)
				cloudkid.OS.instance.addUpdateCallback(UPDATE_ALIAS, this._update);
		}
	};

	/** Fades a sound from the current volume to a specified volume. A sound that ends at 0 volume
	*	is stopped after the fade.
	*	@param aliasOrInst The alias of the sound to fade the last played instance of, or an instance returned from play().
	*	@param duration The duration in milliseconds to fade for. The default is 500ms.
	*	@param targetVol The volume to fade to. The default is 0.
	*	@param startVol The volume to fade from. The default is the current volume.
	*/
	p.fadeOut = function(aliasOrInst, duration, targetVol, startVol)
	{
		var sound, inst;
		if(typeof(aliasOrInst) == "string")
		{
			sound = this._sounds[aliasOrInst];
			if(!sound) return;
			if(sound.playing.length)
				inst = sound.playing[sound.playing.length - 1];//fade the last played instance
		}
		else
		{
			inst = aliasOrInst;
			//sound = this._sounds[inst.alias];
		}
		if(!inst || !inst._channel) return;
		inst._fTime = 0;
		inst._fDur = duration > 0 ? duration : 500;
		if(startVol > 0)
		{
			inst._channel.setVolume(startVol);
			inst._fStart = startVol;
		}
		else
			inst._fStart = inst._channel.getVolume();
		inst.curVol = inst._fStart;
		inst._fEnd = targetVol || 0;
		if(this._fades.indexOf(inst) == -1)
		{
			this._fades.push(inst);
			if(this._fades.length == 1)
				cloudkid.OS.instance.addUpdateCallback(UPDATE_ALIAS, this._update);
		}
	};

	/** The update call, used for fading sounds. */
	p._update = function(elapsed)
	{
		var fades = this._fades;
		var trim = 0;
		for(var i = fades.length - 1; i >= 0; --i)
		{
			var inst = fades[i];
			if(inst.paused) continue;
			var time = inst._fTime += elapsed;
			if(time >= inst._fDur)
			{
				if(inst._fEnd === 0)
				{
					var sound = this._sounds[inst.alias];
					sound.playing = sound.playing.splice(sound.playing.indexOf(inst), 1);
					this._stopInst(inst);
				}
				else
				{
					inst.curVol = inst._fEnd;
					inst.updateVolume();
				}
				++trim;
				var swapIndex = fades.length - trim;
				if(i != swapIndex)//don't bother swapping if it is already last
				{
					fades[i] = fades[swapIndex];
				}
			}
			else
			{
				var lerp = time / inst._fDur;
				var vol;
				if(inst._fEnd > inst._fStart)
					vol = inst._fStart + (inst._fEnd - inst._fStart) * lerp;
				else
					vol = inst._fEnd + (inst._fStart - inst._fEnd) * lerp;
				inst.curVol = vol;
				inst.updateVolume();
			}
		}
		fades.length = fades.length - trim;
		if(fades.length === 0)
			cloudkid.OS.instance.removeUpdateCallback(UPDATE_ALIAS);
	};
	
	/** Plays a sound.
	*	@param alias The alias of the sound to play.
	*	@param interrupt If the sound should interrupt previous sounds (SoundJS parameter). Default is false.
	*	@param delay The delay to play the sound at (SoundJS parameter). Default is 0.
	*	@param offset The offset into the sound to play (SoundJS parameter). Default is 0.
	*	@param loop How many times the sound should loop. Use -1 for infinite loops (SoundJS parameter).
			Default is no looping.
	*	@param volume The volume to play the sound at. Omit to use the default.
	*	@param pan The panning to start the sound at. Default is centered.
	*	@param completeCallback An optional function to call when the sound is finished. 
			Passing cloudkid.Sound.UNHANDLED results in cloudkid.Sound not handling the sound 
			and merely returning what SoundJS returns from its play() call.
	*	@param startCallback An optional function to call when the sound starts playback.
			If the sound is loaded, this is called immediately, if not, it calls when the 
			sound is finished loading.
	*	@return An internal SoundInst object that can be used for fading in/out as well as 
			pausing (not yet implemented) and getting the sound's current position.
	*/
	p.play = function (alias, interrupt, delay, offset, loop, volume, pan, completeCallback, startCallback)
	{
		if(loop === true)//Replace with correct infinite looping.
			loop = -1;
		//UNHANDLED is really for legacy code, like the StateManager and Cutscene libraries that are using the sound instance directly to synch animations
		if(completeCallback == Sound.UNHANDLED)//let calling code manage the SoundInstance - this is only allowed if the sound is already loaded
		{
			return createjs.Sound.play(alias, interrupt, delay, offset, loop, volume, pan);
		}

		var sound = this._sounds[alias];
		if(!sound)
		{
			Debug.error("cloudkid.Sound: sound " + alias + " not found!");
			if(completeCallback)
				completeCallback();
			return;
		}
		var state = sound.state;
		var inst, arr;
		volume = (typeof(volume) == "number" && volume > 0) ? volume : sound.volume;
		if(state == LOADED)
		{
			var channel = createjs.Sound.play(alias, interrupt, delay, offset, loop, volume, pan);
			//have Sound manage the playback of the sound
			
			if(!channel || channel.playState == createjs.Sound.PLAY_FAILED)
			{
				if(completeCallback)
					completeCallback();
				return null;
			}
			else
			{
				inst = this._getSoundInst(channel, sound.id);
				inst.curVol = volume;
				sound.playing.push(inst);
				inst._endCallback = completeCallback;
				inst.updateVolume();
				inst.length = channel.getDuration();
				inst._channel.addEventListener("complete", inst._endFunc);
				if(startCallback)
					setTimeout(startCallback, 0);
				return inst;
			}
		}
		else if(state == UNLOADED)
		{
			sound.state = LOADING;
			sound.playAfterLoad = true;
			inst = this._getSoundInst(null, sound.id);
			inst.curVol = volume;
			sound.waitingToPlay.push(inst);
			inst._endCallback = completeCallback;
			inst._startFunc = startCallback;
			if(inst._startParams)
			{
				arr = inst._startParams;
				arr[0] = interrupt;
				arr[1] = delay;
				arr[2] = offset;
				arr[3] = loop;
				arr[4] = pan;
			}
			else
				inst._startParams = [interrupt, delay, offset, loop, pan];
			cloudkid.MediaLoader.instance.load(
				sound.src, //url to load
				this._playAfterLoadBound,//complete callback
				null,//progress callback
				0,//priority
				sound//the sound object (contains properties for PreloadJS/SoundJS)
			);
			return inst;
		}
		else if(state == LOADING)
		{
			//tell the sound to play after loading
			sound.playAfterLoad = true;
			inst = this._getSoundInst(null, sound.id);
			inst.curVol = volume;
			sound.waitingToPlay.push(inst);
			inst._endCallback = completeCallback;
			inst._startFunc = startCallback;
			if(inst._startParams)
			{
				arr = inst._startParams;
				arr[0] = interrupt;
				arr[1] = delay;
				arr[2] = offset;
				arr[3] = loop;
				arr[4] = pan;
			}
			else
				inst._startParams = [interrupt, delay, offset, loop, pan];
			return inst;
		}
	};

	/** Gets a SoundInst, from the pool if available or maks a new one if not.
	*	@param channel A createjs SoundInstance to initialize the object with.
	*	@param id The alias of the sound that is going to be used.
	*	@return The SoundInst that is ready to use.
	*/
	p._getSoundInst = function(channel, id)
	{
		var rtn;
		if(this._pool.length)
			rtn = this._pool.pop();
		else
		{
			rtn = new SoundInst();
			rtn._endFunc = this._onSoundComplete.bind(this, rtn);
		}
		rtn._channel = channel;
		rtn.alias = id;
		rtn.length = channel ? channel.getDuration() : 0;//set or reset this
		return rtn;
	};

	/** Plays a sound after it finishes loading.
	*	@param alias The sound to play.
	*/
	p._playAfterLoad = function(result)
	{
		var alias = typeof result == "string" ? result : result.id;
		var sound = this._sounds[alias];
		sound.state = LOADED;
		
		//If the sound was stopped before it finished loading, then don't play anything
		if(!sound.playAfterLoad) return;
		
		//Go through the list of sound instances that are waiting to start and start them
		var waiting = sound.waitingToPlay;
		for(var i = 0; i < waiting.length; ++i)
		{
			var inst = waiting[i];
			var startParams = inst._startParams;
			var volume = inst.curVol;
			var channel = createjs.Sound.play(alias, startParams[0], startParams[1], startParams[2], startParams[3], volume, startParams[4]);

			if(!channel || channel.playState == createjs.Sound.PLAY_FAILED)
			{
				if(inst._endCallback)
					inst._endCallback();
				this._poolInst(inst);
			}
			else
			{
				sound.playing.push(inst);
				inst._channel = channel;
				inst.length = channel.getDuration();
				inst.updateVolume();
				channel.addEventListener("complete", inst._endFunc);
				if(inst._startFunc)
					inst._startFunc();
				if(inst.paused)//if the sound got paused while loading, then pause it
					channel.pause();
			}
		}
		waiting.length = 0;
	};
	
	/** The callback used for when a sound instance is complete.
	*	@param inst The SoundInst that is complete.
	*	@param callback The callback provided to cloudkid.Sound.play() for when the sound is complete.
	*/
	p._onSoundComplete = function(inst)
	{
		inst._channel.removeEventListener("complete", inst._endFunc);
		var sound = this._sounds[inst.alias];
		sound.playing.splice(sound.playing.indexOf(inst), 1);
		var callback = inst._endCallback;
		this._poolInst(inst);
		if(callback)
			callback();
	};
	
	/** Stops all playing or loading instances of a given sound.
	*	@param alias The alias of the sound to stop.
	*/
	p.stop = function(alias)
	{
		var s = this._sounds[alias];
		if(!s) return;
		if(s.playing.length)
			this._stopSound(s);
		else if(s.state == LOADING)
		{
			s.playAfterLoad = false;
			var waiting = s.waitingToPlay;
			for(var i = 0; i < waiting.length; ++i)
			{
				var inst = waiting[i];
				if(inst._endCallback)
					inst._endCallback();
				this._poolInst(inst);
			}
			waiting.length = 0;
		}
	};
	
	/** Stops all playing SoundInsts for a sound.
	*	@param s The sound to stop.
	*/
	p._stopSound = function(s)
	{
		var arr = s.playing;
		for(var i = arr.length -1; i >= 0; --i)
		{
			this._stopInst(arr[i]);
		}
		arr.length = 0;
	};
	
	/** Stops and repools a specific SoundInst.
	*	@param inst The SoundInst to stop.
	*/
	p._stopInst = function(inst)
	{
		inst._channel.removeEventListener("complete", inst._endFunc);
		inst._channel.stop();
		this._poolInst(inst);
	};
	
	/** Stops all sounds in a given context.
	*	@param context The name of the context to stop.
	*/
	p.stopContext = function(context)
	{
		context = this._contexts[context];
		if(context)
		{
			var arr = context.sounds;
			for(var i = arr.length - 1; i >= 0; --i)
			{
				var s = arr[i];
				if(s.playing.length)
					this._stopSound(s);
				else if(s.state == LOADING)
					s.playAfterLoad = false;
			}
		}
	};

	/** Pauses a specific sound. */
	p.pauseSound = function(alias)
	{
		var sound;
		if(typeof alias == "string")
			sound = this._sounds[alias];
		else
			sound = alias;
		var arr = sound.playing;
		for(var i = arr.length - 1; i >= 0; --i)
			arr[i].pause();
	};

	/** Unpauses a specific sound. */
	p.unpauseSound = function(alias)
	{
		var sound;
		if(typeof alias == "string")
			sound = this._sounds[alias];
		else
			sound = alias;
		var arr = sound.playing;
		for(var i = arr.length - 1; i >= 0; --i)
		{
			arr[i].unpause();
		}
			
	};

	/** Pauses all sounds. */
	p.pauseAll = function()
	{
		var arr = this._sounds;
		for(var i in arr)
			this.pauseSound(arr[i]);
	};

	/** Unpauses all sounds. */
	p.unpauseAll = function()
	{
		var arr = this._sounds;
		for(var i in arr)
			this.unpauseSound(arr[i]);
	};

	/** Sets mute status of all sounds in a context
	*	@param context The name of the context to stop.
	*	@param muted If the context should be muted.
	*/
	p.setContextMute = function(context, muted)
	{
		context = this._contexts[context];
		if(context)
		{
			context.muted = muted;
			var volume = context.volume;
			var arr = context.sounds;
			for(var i = arr.length - 1; i >= 0; --i)
			{
				var s = arr[i];
				if(s.playing.length)
				{
					var playing = s.playing;
					for(var j = playing.length - 1; j >= 0; --j)
					{
						playing[j].updateVolume(muted ? 0 : volume);
					}
				}
			}
		}
	};

	/** Sets volume of a context. Individual sound volumes are multiplied by this value.
	*	@param context The name of the context to stop.
	*	@param volume The volume for the context.
	*/
	p.setContextVolume = function(context, volume)
	{
		context = this._contexts[context];
		if(context)
		{
			var muted = context.muted;
			context.volume = volume;
			var arr = context.sounds;
			for(var i = arr.length - 1; i >= 0; --i)
			{
				var s = arr[i];
				if(s.playing.length)
				{
					var playing = s.playing;
					for(var j = playing.length - 1; j >= 0; --j)
					{
						playing[j].updateVolume(muted ? 0 : volume);
					}
				}
			}
		}
	};
	
	/** Preloads a specific sound.
	*	@param alias The alias of the sound to load.
	*	@param callback The function to call when the sound is finished loading.
	*/
	p.preloadSound = function(alias, callback)
	{
		var sound = this._sounds[alias];
		if(!sound)
		{
			Debug.error("Sound does not exist: " + alias + " - can't preload!");
			return;
		}
		if(sound.state != UNLOADED) return;
		sound.state = LOADING;
		sound.preloadCallback = callback || null;
		cloudkid.MediaLoader.instance.load(
			sound.src, //url to load
			this._markLoaded,//complete callback
			null,//progress callback
			0,//priority
			sound//the sound object (contains properties for PreloadJS/SoundJS)
		);
	};

	/** Preloads a list of sounds.
	*	@param list An array of sound aliases to load.
	*	@param callback The function to call when all sounds have been loaded.
	*/
	p.preload = function(list, callback)
	{
		if(!list || list.length === 0)
		{
			if(callback)
				callback();
			return;
		}

		var tasks = [];
		for(var i = 0, len = list.length; i < len; ++i)
		{
			var sound = this._sounds[list[i]];
			if(sound)
			{
				if(sound.state == UNLOADED)
				{
					sound.state = LOADING;
					//sound is passed last so that SoundJS gets the sound ID
					tasks.push(new cloudkid.LoadTask(sound.id, sound.src, this._markLoaded, null, 0, sound));
				}
			}
			else
			{
				Debug.error("cloudkid.Sound was asked to preload " + list[i] + " but it is not a registered sound!");
			}
		}
		if(tasks.length > 0)
		{
			var manager = new cloudkid.TaskManager(tasks);
			var listener = function()
			{
				manager.removeAllEventListeners();
				manager.destroy();
				if(callback)
					callback();
			};
			manager.addEventListener(cloudkid.TaskManager.ALL_TASKS_DONE, listener);
			manager.startAll();
		}
		else if(callback)
		{
			callback();
		}
	};
	
	/** Marks a sound as loaded. If it needs to play after the load, then it is played.
	*	@param alias The alias of the sound to mark.
	*	@param callback A function to call to show that the sound is loaded.
	*/
	p._markLoaded = function(result)
	{
		var alias = result.id;
		var sound = this._sounds[alias];
		if(sound)
		{
			sound.state = LOADED;
			if(sound.playAfterLoad)
				this._playAfterLoad(alias);
		}
		var callback = sound.preloadCallback;
		if(callback)
		{
			sound.preloadCallback = null;
			callback();
		}
	};
	
	/** Creates a Task for the CloudKid Task library for preloading a list of sounds.
	*	@param id The id of the task.
	*	@param list An array of sound aliases to load.
	*	@param callback The function to call when the task is complete.
	*/
	p.createPreloadTask = function(id, list, callback)
	{
		return new SoundListTask(id, list, callback);
	};
	
	/** Unloads a list of sounds to reclaim memory if possible. 
	*	If the sounds are playing, they are stopped.
	*	@param list An array of sound aliases to unload.
	*/
	p.unload = function(list)
	{
		if(!list) return;
		
		for(var i = 0, len = list.length; i < len; ++i)
		{
			var sound = this._sounds[list[i]];
			if(sound)
			{
				this._stopSound(sound);
				sound.state = UNLOADED;
			}
			createjs.Sound.removeSound(list[i]);
		}
	};

	/** Places a SoundInst back in the pool for reuse.
	*	@param inst The instance to repool.
	*/
	p._poolInst = function(inst)
	{
		inst._endCallback = null;
		inst.alias = null;
		inst._channel = null;
		inst._startFunc = null;
		inst.curVol = 0;
		inst.paused = false;
		this._pool.push(inst);
	};
	
	/** Destroys cloudkid.Sound. This does not unload loaded sounds, destroy SoundJS to do that. */
	p.destroy = function()
	{
		_instance = null;
		this._volumes = null;
		this._fades = null;
		this._contexts = null;
		this._pool = null;
	};
	
	var SoundInst = function()
	{
		this._channel = null;//SoundJS SoundInstance, essentially a sound channel
		this._endFunc = null;//internal callback function
		this._endCallback = null;//user callback function
		this._startFunc = null;//start callback function
		this._startParams = null;//array of params for playing after loading
		this.alias = null;//alias of sound
		this._fTime = 0;//fade timer
		this._fDur = 0;//fade duration
		this._fStart = 0;//fade start volume
		this._fEnd = 0;//fade end volume
		this.curVol = 0;//current volume (not including context volume/muting)
		this.length = 0;//length of audio in milliseconds
		this.paused = false;//if the sound is paused
	};
	
	Object.defineProperty(SoundInst.prototype, "position", 
	{
		get: function(){ return this._channel ? this._channel.getPosition() : 0;}
	});

	SoundInst.prototype.stop = function()
	{
		var s = cloudkid.Sound.instance;
		var sound = s._sounds[this.alias];
		sound.playing.splice(sound.playing.indexOf(this), 1);
		cloudkid.Sound.instance._stopInst(this);
	};

	SoundInst.prototype.updateVolume = function(contextVol)
	{
		if(!this._channel) return;
		if(contextVol === undefined)
		{
			var s = Sound.instance;
			var sound = s._sounds[this.alias];
			if(sound.context)
			{
				var context = s._contexts[sound.context];
				contextVol = context.muted ? 0 : context.volume;
			}
			else
				contextVol = 1;
		}
		this._channel.setVolume(contextVol * this.curVol);
	};

	SoundInst.prototype.pause = function()
	{
		if(this.paused) return;
		this.paused = true;
		if(!this._channel) return;
		this._channel.pause();
	};

	SoundInst.prototype.unpause = function()
	{
		if(!this.paused) return;
		this.paused = false;
		if(!this._channel) return;
		this._channel.resume();
	};

	var SoundListTask = function(id, list, callback)
	{
		this.initialize(id, callback);
		this.list = list;
	};

	SoundListTask.prototype = Object.create(cloudkid.Task.prototype);
	SoundListTask.s = cloudkid.Task.prototype;

	SoundListTask.prototype.start = function(callback)
	{
		_instance.preload(this.list, callback);
	};

	SoundListTask.prototype.destroy = function()
	{
		SoundListTask.s.destroy.apply(this);
		this.list = null;
	};

	var SoundContext = function(id)
	{
		this.id = id;
		this.volume = 1;
		this.muted = false;
		this.sounds = [];
	};

	SoundContext.prototype = {};
	
	namespace('cloudkid').Sound = Sound;
}());
(function() {
	var VOPlayer = function(useCaptions)
	{
		this._audioListener = this._onAudioFinished.bind(this);
		this._update = this._update.bind(this);
		this._updateCaptionPos = this._updateCaptionPos.bind(this);
		if(useCaptions)
			this.captions = new cloudkid.Captions(null, true);
		this._listHelper = [];
	};
	
	var p = VOPlayer.prototype = {};
	
	/** If the VOPlayer should keep a list of all audio it plays for unloading later. */
	p.trackAudio = false;
	/** The list of audio/silence times/functions. Generally you will not need to modify this. */
	p.audioList = null;
	/** The current position in audioList. */
	p._listCounter = 0;
	/** The current audio alias being played. */
	p._currentAudio = null;
	/** The current audio instance being played. */
	p._audioInst = null;
	/** The callback for when the list is finished. */
	p._callback = null;
	/** The bound _onAudioFinished call. */
	p._audioListener = null;
	p._playedAudio = null;
	p._timer = 0;
	/** The cloudkid.Captions object used for captions. */
	p.captions = null;

	p._listHelper = null;
	
	/** If VOPlayer is currently playing (audio or silence) */
	Object.defineProperty(p, "playing",
	{
		get: function() { return this._currentAudio !== null || this._timer > 0; }
	});
	
	/** Plays a single audio alias, interrupting any current playback.
	*	@param id The alias of the audio file to play.
	*	@param callback The function to call when playback is complete.
	*/
	p.play = function(id, callback)
	{
		this.stop();
		
		this._listCounter = -1;
		this._listHelper[0] = id;
		this.audioList = this._listHelper;
		this._callback = callback;
		this._onAudioFinished();
	};
	
	/** Plays a list of audio files, timers, and/or functions, interrupting any current playback.
	*	@param list The array of items to play/call in order.
	*	@param callback The function to call when playback is complete.
	*/
	p.playList = function(list, callback)
	{
		this.stop();

		this._listCounter = -1;
		this.audioList = list;
		this._callback = callback;
		this._onAudioFinished();
	};
	
	/** Callback for when audio/timer is finished to advance to the next item in the list. */
	p._onAudioFinished = function()
	{
		cloudkid.OS.instance.removeUpdateCallback("VOPlayer");//remove any update callback
		if(this.captions && this._audioInst)//if we have captions and an audio instance, set the caption time to the length of the audio
			this.captions.seek(this._audioInst.length);
		this._audioInst = null;//clear the audio instance
		this._listCounter++;//advance list
		if(this._listCounter >= this.audioList.length)//if the list is complete
		{
			if(this.captions)
				this.captions.stop();
			this._currentAudio = null;
			var c = this._callback;
			this._callback = null;
			if(c) c();
		}
		else
		{
			this._currentAudio = this.audioList[this._listCounter];
			if(typeof this._currentAudio == "string")
			{
				//If the sound doesn't exist, then we play it and let it fail, an error should be shown and playback will continue
				this._playAudio();
			}
			else if(typeof this._currentAudio == "function")
			{
				this._currentAudio();//call function
				this._onAudioFinished();//immediately continue
			}
			else// if(typeof this._currentAudio == "number")
			{
				this._timer = this._currentAudio;//set up a timer to wait
				this._currentAudio = null;
				cloudkid.OS.instance.addUpdateCallback("VOPlayer", this._update);
			}
		}
	};

	/** The update callback used for silence timers. */
	p._update = function(elapsed)
	{
		if(this.captions)
			this.captions.updateTime(elapsed);
		this._timer -= elapsed;
		if(this._timer <= 0)
		{
			this._onAudioFinished();
		}
	};

	p._updateCaptionPos = function(elapsed)
	{
		if(!this._audioInst) return;
		this.captions.seek(this._audioInst.position);
	};

	/** Plays the current audio item and begins preloading the next item. */
	p._playAudio = function()
	{
		if(this.trackAudio)
		{
			if(this._playedAudio)
			{
				if(this._playedAudio.indexOf(this._currentAudio) == -1)
					this._playedAudio.push(this._currentAudio);
			}
			else
			{
				this._playedAudio = [this._currentAudio];
			}
		}
		var s = cloudkid.Sound.instance;
		if(!s.exists(this._currentAudio) && this.captions && this.captions.hasCaption(this._currentAudio))
		{
			this.captions.run(this._currentAudio);
			this._timer = this.captions.currentDuration;
			this._currentAudio = null;
			cloudkid.OS.instance.addUpdateCallback("VOPlayer", this._update);
		}
		else
		{
			this._audioInst = s.play(this._currentAudio, null, null, null, null, null, null, this._audioListener);
			if(this.captions)
			{
				this.captions.run(this._currentAudio);
				cloudkid.OS.instance.addUpdateCallback("VOPlayer", this._updateCaptionPos);
			}
		}
		this._isWaiting = false;
		for(var i = 1; this._listCounter + i < this.audioList.length; ++i)
		{
			var next = this.audioList[this._listCounter + i];
			if(typeof next == "string")
			{
				if(!s.isLoaded(next))
				{
					s.preloadSound(next);
				}
				break;
			}
		}
	};
	
	/** Stops playback of any audio/timer. */
	p.stop = function()
	{
		this._isWaiting = false;
		if(this._currentAudio)
		{
			cloudkid.Sound.instance.stop(this._currentAudio);
			this._currentAudio = null;
			this._callback = null;
		}
		if(this.captions)
			this.captions.stop();
	};

	/** Unloads all audio this VOPlayer has played. If trackAudio is false, this won't do anything. */
	p.unloadPlayedAudio = function()
	{
		cloudkid.Sound.instance.unload(this._playedAudio);
		this._playedAudio = null;
	};

	p.destroy = function()
	{
		this.audioList = null;
		this._listHelper = null;
		this._currentAudio = null;
		this._audioInst = null;
		this._callback = null;
		this._audioListener = null;
		this._playedAudio = null;
		if(this.captions)
		{
			this.captions.destroy();
			this.captions = null;
		}
	};
	
	namespace('cloudkid').VOPlayer = VOPlayer;
}());
