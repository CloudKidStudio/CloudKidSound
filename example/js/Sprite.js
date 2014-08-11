$(function(){
	
	// Imports
	var Sound = cloudkid.Sound,
		Application = cloudkid.Application;
	
	if (/[0-9\.]+/.test(document.location.host))
	{
		Debug.connect(document.location.host);
	}

	// We aren't actually using the canvas or application, 
	// but we need to create an Application so that the update
	// will be available to cloudkid.Sound
	new Application();

	var voPlayer = new cloudkid.VOPlayer();
	var voList = [];

	var allAliases = [];

	//set the base path for the flash fallback
	createjs.FlashPlugin.BASE_PATH = "audio/";
	Sound.init([createjs.WebAudioPlugin, createjs.FlashPlugin],
		["ogg", "mp3"],
		function()
		{
			//get the config json
			$.getJSON("audio/config.json", function(data)
			{
				var aliases = $("#aliases"), sprite;
				for(var context in data)
				{
					//add the list of sounds to Sound
					Sound.instance.loadConfig(data[context]);
					//pull out the aliases for our usage
					var manifest = data[context].soundManifest;
					for(var i = 0; i < manifest.length; ++i)
					{
						var alias = manifest[i].id;
						allAliases.push(alias);
						aliases.append('<li><button data-alias="' + alias + 
							'" class="alias disabled ' + 
							'">'+alias+'</button></li>');
					}
				}

				$('body').removeClass('unloaded');

				$(".alias")
					.removeAttr('disabled')
					.removeClass('disabled')
					.click(function()
					{
						var alias = $(this).data('alias');
						if($("#addToggle").hasClass('toggled'))
						{
							voList.push(alias);
							$("#playerList").append('<li>' + alias + '</li>');
						}
						else
						{
							if($("#loopToggle").hasClass('toggled'))
								Sound.instance.play(alias, null, null, false, 0, 0, -1);
							else
								Sound.instance.play(alias);
						}
					});
				$(".control")
					.removeAttr('disabled')
					.removeClass('disabled')
					.click(function()
					{
						var action = $(this).data('action');
						if(action == "mute")
						{
							Sound.instance.setContextMute("sfx", true);
							Sound.instance.setContextMute("music", true);
						}
						else if(action == "unmute")
						{
							Sound.instance.setContextMute("sfx", false);
							Sound.instance.setContextMute("music", false);
						}
						else if(action == "stop")
						{
							voPlayer.stop();
							for(var i = 0; i < allAliases.length; ++i)
								Sound.instance.stop(allAliases[i]);
						}
						else
							Sound.instance[action]();
					});
				$(".voControl")
					.removeAttr('disabled')
					.removeClass('disabled')
					.click(function()
					{
						switch($(this).data('action'))
						{
							case "clear":
								voList.length = 0;
								$("#playerList").empty();
								break;
							case "play":
								voPlayer.playList(voList.slice());
								break;
							case "add":
								if($(this).hasClass('toggled'))
									$(this).removeClass('toggled');
								else
									$(this).addClass('toggled');
								break;
						}
					});
				$("#loopToggle")
					.removeAttr('disabled')
					.removeClass('disabled')
					.click(function()
					{
						if($(this).hasClass('toggled'))
							$(this).removeClass('toggled');
						else
							$(this).addClass('toggled');
					});
			});
		});
});