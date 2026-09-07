require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    ActivityType,
    ChannelType
} = require("discord.js");

const {
    joinVoiceChannel,
    VoiceConnectionStatus,
    entersState
} = require("@discordjs/voice");

const config = require("./config.json");

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

if (!config.Guild || !config.Channel) {
    console.error("❌ Guild or Channel is missing from config.json.");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

let connection = null;

function setBotStatus() {
    const statusConfig = config.Status;

    if (!statusConfig || statusConfig.enabled === false) {
        return;
    }

    const typeMap = {
        playing: ActivityType.Playing,
        streaming: ActivityType.Streaming,
        watching: ActivityType.Watching,
        listening: ActivityType.Listening,
        custom: ActivityType.Custom
    };

    const activityType =
        typeMap[String(statusConfig.type).toLowerCase()] ??
        ActivityType.Playing;

    const activity = {
        name: statusConfig.text || "Discord",
        type: activityType
    };

    if (activityType === ActivityType.Streaming) {
        activity.url =
            statusConfig.url || "https://www.twitch.tv/discord";
    }

    client.user.setPresence({
        status: statusConfig.status || "online",
        activities: [activity]
    });

    console.log(
        `✅ Status: ${statusConfig.type} ${statusConfig.text}`
    );
}

async function joinVC() {
    try {
        const guild = client.guilds.cache.get(config.Guild);

        if (!guild) {
            console.error(`❌ Guild not found: ${config.Guild}`);
            return;
        }

        const voiceChannel = guild.channels.cache.get(config.Channel);

        if (!voiceChannel) {
            console.error(`❌ Voice channel not found: ${config.Channel}`);
            return;
        }

        if (voiceChannel.type !== ChannelType.GuildVoice) {
            console.error("❌ Configured channel is not a voice channel.");
            return;
        }

        if (connection) {
            try {
                connection.destroy();
            } catch (_) {}

            connection = null;
        }

        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: true,
            selfDeaf: true
        });

        console.log(`🔊 Joining: ${voiceChannel.name}`);

        connection.on(
            VoiceConnectionStatus.Ready,
            () => {
                console.log("✅ Voice connection ready.");
            }
        );

        connection.on(
            VoiceConnectionStatus.Disconnected,
            async () => {
                console.log("⚠️ Voice connection disconnected.");

                try {
                    await Promise.race([
                        entersState(
                            connection,
                            VoiceConnectionStatus.Signalling,
                            5_000
                        ),
                        entersState(
                            connection,
                            VoiceConnectionStatus.Connecting,
                            5_000
                        )
                    ]);

                    console.log("🔄 Voice connection recovering...");
                } catch {
                    console.log("🔄 Reconnecting...");

                    try {
                        connection.destroy();
                    } catch (_) {}

                    connection = null;

                    setTimeout(() => {
                        joinVC().catch(console.error);
                    }, 3_000);
                }
            }
        );

    } catch (error) {
        console.error("❌ Failed to join voice channel:");
        console.error(error);
    }
}

client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    setBotStatus();

    await joinVC();
});

client.on("voiceStateUpdate", async (oldState, newState) => {
    if (!client.user || newState.id !== client.user.id) {
        return;
    }

    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;

    if (oldChannel === newChannel) {
        return;
    }

    // Bot was disconnected
    if (!newChannel) {
        console.log("⚠️ Bot was disconnected.");

        setTimeout(() => {
            joinVC().catch(console.error);
        }, 2_000);

        return;
    }

    // Bot was moved to another channel
    if (newChannel !== config.Channel) {
        console.log(
            "⚠️ Bot was moved. Returning to configured channel."
        );

        setTimeout(() => {
            joinVC().catch(console.error);
        }, 1_000);
    }
});

client.on("error", (error) => {
    console.error("❌ Discord client error:");
    console.error(error);
});

process.on("unhandledRejection", (error) => {
    console.error("❌ Unhandled promise rejection:");
    console.error(error);
});

process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught exception:");
    console.error(error);
});

console.log(
    "Token loaded:",
    process.env.DISCORD_TOKEN ? "YES" : "NO"
);

// Login using the Discord BOT token from Render
client.login(process.env.DISCORD_TOKEN);
