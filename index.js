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

    // Streaming activities require a Twitch/YouTube-style URL.
    if (activityType === ActivityType.Streaming) {
        activity.url =
            statusConfig.url || "https://www.twitch.tv/discord";
    }

    client.user.setPresence({
        status: statusConfig.status || "online",
        activities: [activity]
    });

    console.log(
        `✅ Status set: ${statusConfig.type} ${statusConfig.text}`
    );
}

async function joinVC() {
    try {
        const guild = client.guilds.cache.get(config.Guild);

        if (!guild) {
            console.error(
                `❌ Could not find guild ${config.Guild}.`
            );
            return;
        }

        const voiceChannel = guild.channels.cache.get(config.Channel);

        if (!voiceChannel) {
            console.error(
                `❌ Could not find voice channel ${config.Channel}.`
            );
            return;
        }

        if (voiceChannel.type !== ChannelType.GuildVoice) {
            console.error("❌ Configured channel is not a voice channel.");
            return;
        }

        // Destroy the old connection if one exists.
        if (connection) {
            try {
                connection.destroy();
            } catch (_) {}
        }

        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,

            // Bot stays muted/deafened.
            selfMute: true,
            selfDeaf: true
        });

        console.log(
            `🔊 Joining voice channel: ${voiceChannel.name}`
        );

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
                    console.log("🔄 Reconnecting to voice channel...");

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
    // Only react when the BOT's own voice state changes.
    if (!client.user || newState.id !== client.user.id) {
        return;
    }

    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;

    if (oldChannel === newChannel) {
        return;
    }

    // Bot was disconnected.
    if (!newChannel) {
        console.log("⚠️ Bot was disconnected from voice.");
        setTimeout(() => {
            joinVC().catch(console.error);
        }, 2_000);

        return;
    }

    // Bot was moved to another voice channel.
    if (newChannel !== config.Channel) {
        console.log("⚠️ Bot was moved. Returning to configured channel.");

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
    token ? "YES" : "NO"
);

client.login(token).catch((error) => {
    console.error("❌ Discord login failed.");
    console.error(error);
});
