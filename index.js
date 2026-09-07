require("dotenv").config();

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

// ================================
// CHECK CONFIGURATION
// ================================

if (!process.env.DISCORD_TOKEN) {
    console.error("ERROR: DISCORD_TOKEN is not set.");
    process.exit(1);
}

if (!config.Guild) {
    console.error("ERROR: Guild is not set in config.json.");
    process.exit(1);
}

if (!config.Channel) {
    console.error("ERROR: Channel is not set in config.json.");
    process.exit(1);
}


// ================================
// DISCORD CLIENT
// ================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});


// ================================
// SET STATUS
// ================================

function setBotStatus() {

    if (!config.Status || config.Status.enabled === false) {
        client.user.setPresence({
            activities: [],
            status: "online"
        });

        console.log("Status disabled.");
        return;
    }

    const status =
        config.Status.status || "online";

    const type =
        String(config.Status.type || "playing").toLowerCase();

    const text =
        config.Status.text || "";

    let activityType;

    switch (type) {

        case "playing":
            activityType = ActivityType.Playing;
            break;

        case "streaming":
            activityType = ActivityType.Streaming;
            break;

        case "watching":
            activityType = ActivityType.Watching;
            break;

        case "listening":
            activityType = ActivityType.Listening;
            break;

        case "custom":
            activityType = ActivityType.Custom;
            break;

        default:
            console.log(
                `Unknown status type "${type}". Using playing.`
            );

            activityType = ActivityType.Playing;
    }

    const activity = {
        name: text,
        type: activityType
    };

    // Streaming requires a URL.
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
        `Status set: ${type} - ${text}`
    );
}


// ================================
// JOIN VOICE CHANNEL
// ================================

async function joinVC() {

    const guild =
        client.guilds.cache.get(config.Guild);

    if (!guild) {
        throw new Error(
            `Guild ${config.Guild} was not found.`
        );
    }

    const voiceChannel =
        guild.channels.cache.get(config.Channel);

    if (!voiceChannel) {
        throw new Error(
            `Voice channel ${config.Channel} was not found.`
        );
    }

    if (
        voiceChannel.type !==
        ChannelType.GuildVoice
    ) {
        throw new Error(
            "The configured Channel ID is not a voice channel."
        );
    }

    console.log(
        `Connecting to voice channel: ${voiceChannel.name}`
    );

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,

        // Bot joins muted and deafened.
        selfMute: true,
        selfDeaf: true
    });


    // ================================
    // VOICE CONNECTION READY
    // ================================

    connection.on(
        VoiceConnectionStatus.Ready,
        () => {
            console.log(
                `Connected to ${voiceChannel.name}`
            );
        }
    );


    // ================================
    // VOICE DISCONNECTED
    // ================================

    connection.on(
        VoiceConnectionStatus.Disconnected,
        async () => {

            console.log(
                "Voice connection disconnected."
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

                console.log(
                    "Voice connection recovered."
                );

            } catch {

                console.log(
                    "Voice connection could not recover."
                );

                try {

                    connection.destroy();

                    await new Promise(
                        resolve =>
                            setTimeout(resolve, 2000)
                    );

                    await joinVC();

                } catch (error) {

                    console.error(
                        "Failed to reconnect:",
                        error
                    );

                    // Try again after 10 seconds.
                    setTimeout(
                        () => joinVC().catch(console.error),
                        10000
                    );
                }
            }
        }
    );
}


// ================================
// BOT READY
// ================================

client.once("ready", async () => {

    console.log(
        `Logged in as ${client.user.tag}!`
    );

    // Set Discord status.
    setBotStatus();

    // Join configured voice channel.
    try {

        await joinVC();

    } catch (error) {

        console.error(
            "Failed to join voice channel:",
            error
        );
    }
});


// ================================
// WATCH BOT VOICE STATE
// ================================

client.on(
    "voiceStateUpdate",
    async (oldState, newState) => {

        // Only react to THIS bot.
        if (
            newState.id !== client.user.id
        ) {
            return;
        }


        // ============================
        // BOT WAS DISCONNECTED
        // ============================

        if (
            oldState.channelId &&
            !newState.channelId
        ) {

            console.log(
                "Bot was disconnected. Rejoining..."
            );

            try {
                await joinVC();
            } catch (error) {
                console.error(
                    "Failed to rejoin:",
                    error
                );
            }

            return;
        }


        // ============================
        // BOT WAS MOVED
        // ============================

        if (
            oldState.channelId &&
            newState.channelId &&
            newState.channelId !== config.Channel
        ) {

            console.log(
                "Bot was moved to another channel."
            );

            console.log(
                "Returning to configured channel..."
            );

            try {
                await joinVC();
            } catch (error) {
                console.error(
                    "Failed to return:",
                    error
                );
            }
        }
    }
);


// ================================
// LOGIN
// ================================

client.login(
    process.env.DISCORD_TOKEN
);
