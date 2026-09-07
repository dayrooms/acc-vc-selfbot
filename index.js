const {
    Client,
    GatewayIntentBits,
    ChannelType,
    ActivityType
} = require("discord.js");

const {
    joinVoiceChannel,
    VoiceConnectionStatus,
    entersState
} = require("@discordjs/voice");

const config = require("./config.json");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});


/* =========================
   STATUS / ACTIVITY
========================= */

function setBotStatus() {
    if (!config.Status || config.Status.enabled === false) {
        client.user.setPresence({
            activities: [],
            status: "online"
        });

        return;
    }

    const status = config.Status.status || "online";
    const type = (config.Status.type || "playing").toLowerCase();
    const text = config.Status.text || "";

    let activityType;

    switch (type) {
        case "playing":
            activityType = ActivityType.Playing;
            break;

        case "streaming":
            activityType = ActivityType.Streaming;
            break;

        case "listening":
            activityType = ActivityType.Listening;
            break;

        case "watching":
            activityType = ActivityType.Watching;
            break;

        case "custom":
            activityType = ActivityType.Custom;
            break;

        default:
            console.log(`Unknown activity type "${type}". Using Playing.`);
            activityType = ActivityType.Playing;
    }

    const activity = {
        name: text,
        type: activityType
    };

    // Streaming activities need a URL.
    if (activityType === ActivityType.Streaming) {
        activity.url =
            config.Status.url ||
            "https://www.twitch.tv/discord";
    }

    client.user.setPresence({
        activities: [activity],
        status: status
    });

    console.log(
        `Status set: ${type} "${text}" (${status})`
    );
}


/* =========================
   READY
========================= */

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Set status
    setBotStatus();

    // Join voice channel
    try {
        await joinVC();
    } catch (error) {
        console.error("Failed to join voice channel:", error);
    }
});


/* =========================
   JOIN VOICE CHANNEL
========================= */

async function joinVC() {
    const guild = client.guilds.cache.get(config.Guild);

    if (!guild) {
        throw new Error(
            `Guild ${config.Guild} was not found.`
        );
    }

    const voiceChannel = guild.channels.cache.get(
        config.Channel
    );

    if (!voiceChannel) {
        throw new Error(
            `Voice channel ${config.Channel} was not found.`
        );
    }

    if (voiceChannel.type !== ChannelType.GuildVoice) {
        throw new Error(
            "Configured channel is not a voice channel."
        );
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,

        // Change these if desired.
        selfDeaf: true,
        selfMute: true
    });

    connection.on(
        VoiceConnectionStatus.Ready,
        () => {
            console.log(
                `Connected to ${voiceChannel.name}`
            );
        }
    );

    connection.on(
        VoiceConnectionStatus.Disconnected,
        async () => {
            console.log(
                "Voice connection disconnected. Attempting to reconnect..."
            );

            try {
                await Promise.race([
                    entersState(
                        connection,
                        VoiceConnectionStatus.Signalling,
                        5000
                    ),

                    entersState(
                        connection,
                        VoiceConnectionStatus.Connecting,
                        5000
                    )
                ]);

                console.log("Reconnected.");
            } catch {
                console.log(
                    "Reconnection failed. Joining again..."
                );

                try {
                    connection.destroy();
                    await joinVC();
                } catch (error) {
                    console.error(
                        "Failed to reconnect:",
                        error
                    );
                }
            }
        }
    );
}


/* =========================
   VOICE STATE MONITOR
========================= */

client.on(
    "voiceStateUpdate",
    async (oldState, newState) => {

        // Only react to THIS bot.
        if (newState.id !== client.user.id) {
            return;
        }

        // Bot disconnected.
        if (
            oldState.channelId &&
            !newState.channelId
        ) {
            console.log(
                "Bot was disconnected. Rejoining..."
            );

            await joinVC();
            return;
        }

        // Bot was moved.
        if (
            oldState.channelId &&
            newState.channelId &&
            newState.channelId !== config.Channel
        ) {
            console.log(
                "Bot was moved. Returning to configured channel..."
            );

            await joinVC();
        }
    }
);


/* =========================
   LOGIN
========================= */

client.login(config.Token);
