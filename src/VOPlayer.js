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
