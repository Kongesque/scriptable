const username = "kongesque"; // replace with your github username
const token = Keychain.get("github_token_here"); // replace this with your token
const theme = "auto"; // "auto", "dark", or "light"
const FONT_NAME = "Menlo";
const BOX_SIZE = 10;
const BOX_SPACING = 4;

const df = new DateFormatter();
df.dateFormat = "yyyy-MM-dd";
df.locale = "en-US";

const rawParam = (args.widgetParameter || theme).toLowerCase();
let themeParam = "auto";

if (rawParam.includes("dark")) {
    themeParam = "dark";
} else if (rawParam.includes("light")) {
    themeParam = "light";
}

const heatmapThemes = {
    light: {
        bg: ["#ffffff", "#ffffff", "#ffffff"],
        text: "#000000",
        accent: "#116329",
        box: ["#eff2f5", "#aceebb", "#4ac26b", "#2da44e", "#116329"]
    },
    dark: {
        bg: ["#0d1117", "#0d1117", "#0d1117"],
        text: "#ffffff",
        accent: "#56d364",
        box: ["#2e2f37", "#0e4429", "#196c2e", "#2ea043", "#56d364"]
    }
};

const noContributionTheme = {
    light: {
        bg: ["#ffffff", "#ffffff", "#ffffff"],
        text: "#000000",
        box: ["#eff2f5", "#ffcdd2", "#ef9a9a", "#e57373", "#d32f2f"],
        accent: "#d32f2f"
    },
    dark: {
        bg: ["#0d1117", "#0d1117", "#0d1117"],
        text: "#ffffff",
        box: ["#2e2f37", "#5c1e1e", "#8c2b2b", "#c62828", "#ff5252"],
        accent: "#ff5252"
    }
};

// Cache configuration
const CACHE_DIR = ".cache";
const CACHE_FILE = "github_stats_cache.json";
const CACHE_DURATION = 60 * 60 * 1000; // 60 minutes in milliseconds

// Cache management class
class CacheManager {
    constructor() {
        this.fm = FileManager.iCloud();
        this.cacheDir = this.fm.joinPath(this.fm.documentsDirectory(), CACHE_DIR);
        this.cacheFile = this.fm.joinPath(this.cacheDir, CACHE_FILE);

        this.ensureCacheDir();
    }

    ensureCacheDir() {
        try {
            if (!this.fm.fileExists(this.cacheDir)) {
                this.fm.createDirectory(this.cacheDir, true);
            }
        } catch (error) {
            console.error("Failed to create cache directory:", error);
        }
    }

    async saveCache(data) {
        try {
            const cacheData = {
                timestamp: Date.now(),
                data: data
            };

            const jsonString = JSON.stringify(cacheData);

            this.fm.writeString(this.cacheFile, jsonString);
        } catch (error) {
            console.error("Failed to save cache:", error);
            console.error(`Error details: ${error.message}`);
        }
    }

    async loadCache(ignoreExpiry = false) {
        try {
            if (!this.fm.fileExists(this.cacheFile)) {
                return null;
            }

            // Download from iCloud first
            await this.fm.downloadFileFromiCloud(this.cacheFile);
            const cacheContent = this.fm.readString(this.cacheFile);
            const cacheData = JSON.parse(cacheContent);

            // Check if cache is still valid
            const isValid = (Date.now() - cacheData.timestamp) < CACHE_DURATION;

            if (!isValid && !ignoreExpiry) {
                return null;
            }

            return cacheData.data;
        } catch (error) {
            console.error("Failed to load cache:", error);
            return null;
        }
    }
}

// Initialize cache manager
const cacheManager = new CacheManager();

function mapThemeColors(themeObj, darkThemeObj = null) {
    if (darkThemeObj) {
        return {
            bg: themeObj.bg.map((c, i) => Color.dynamic(new Color(c), new Color(darkThemeObj.bg[i]))),
            text: Color.dynamic(new Color(themeObj.text), new Color(darkThemeObj.text)),
            accent: Color.dynamic(new Color(themeObj.accent), new Color(darkThemeObj.accent)),
            box: themeObj.box.map((c, i) => Color.dynamic(new Color(c), new Color(darkThemeObj.box[i])))
        };
    }
    return {
        bg: themeObj.bg.map(c => new Color(c)),
        text: new Color(themeObj.text),
        accent: new Color(themeObj.accent),
        box: themeObj.box.map(c => new Color(c))
    };
}

function resolveTheme(themeSet) {
    if (themeParam === "auto") {
        return mapThemeColors(themeSet.light, themeSet.dark);
    }
    return mapThemeColors(themeSet[themeParam] || themeSet.light);
}

function getTheme() {
    return resolveTheme(heatmapThemes);
}

function getHeatmapColor(count, themeBoxes, q) {
    if (count === 0) return themeBoxes[0];
    if (count >= q * 3) return themeBoxes[4];
    if (count >= q * 2) return themeBoxes[3];
    if (count >= q * 1) return themeBoxes[2];
    return themeBoxes[1];
}

function createGradientBackground(theme) {
    const gradient = new LinearGradient();
    gradient.colors = theme.bg;
    gradient.locations = [0.0, 0.5, 1.0];
    return gradient;
}

async function fetchHeatmapData() {
    // 1. Try to load from cache first
    try {
        const cachedData = await cacheManager.loadCache();
        if (cachedData && cachedData.heatmapData) {

            return { ...cachedData.heatmapData, isCached: true, cacheTimestamp: cachedData.timestamp };
        }
    } catch (e) {
        console.warn("⚠️ Cache check failed, proceeding to network:", e);
    }

    // 2. If no cache or expired, fetch from network
    try {

        const now = new Date();
        const toDate = new Date(now);
        toDate.setDate(now.getDate() + 1);

        const fromDate = new Date(now);
        fromDate.setDate(now.getDate() - 147); // 21 weeks

        const query = `{
            user(login: "${username}") {
                contributionsCollection(from: "${fromDate.toISOString()}", to: "${toDate.toISOString()}") {
                totalCommitContributions
                contributionCalendar {
                    totalContributions
                    weeks {
                    contributionDays {
                        contributionCount
                        date
                    }
                    }
                }
                }
            }
        }`;

        const req = new Request("https://api.github.com/graphql");
        req.method = "POST";
        req.headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        };
        req.body = JSON.stringify({ query });

        const json = await req.loadJSON();

        if (!json.data || !json.data.user) {
            throw new Error("Invalid response from GitHub API");
        }

        const contribData = json.data.user.contributionsCollection;

        // calculate streak
        const weeks = contribData.contributionCalendar.weeks;
        const todayStr = df.string(new Date());

        let currentStreak = 0;
        let hasContributionToday = false;
        let streakBroken = false;
        let maxContribution = 0;

        let lastContributionDate = null;

        // Iterate backwards through weeks
        for (let w = weeks.length - 1; w >= 0; w--) {
            const days = weeks[w].contributionDays;
            // Iterate backwards through days
            for (let d = days.length - 1; d >= 0; d--) {
                const day = days[d];

                // Skip future dates
                if (day.date > todayStr) continue;

                if (day.contributionCount > maxContribution) {
                    maxContribution = day.contributionCount;
                }

                // Check if this is today
                if (day.date === todayStr) {
                    if (day.contributionCount > 0) {
                        hasContributionToday = true;
                    }
                }

                if (day.contributionCount > 0) {
                    currentStreak++;
                    if (!lastContributionDate) {
                        lastContributionDate = new Date(day.date);
                    }
                } else if (day.date !== todayStr) {
                    // Zero contributions and not today -> streak broken
                    streakBroken = true;
                    break;
                }
            }
            if (streakBroken) break;
        }

        const result = {
            ...contribData,
            currentStreak,
            hasContributionToday,
            maxContribution,
            lastContributionDate: lastContributionDate ? lastContributionDate.toISOString() : null
        };

        // Save to cache
        await cacheManager.saveCache({
            heatmapData: result,
            timestamp: Date.now()
        });

        return result;
    } catch (error) {
        console.error("❌ Failed to fetch heatmap data: " + error.message);
        // Fallback: Try to load expired cache
        const cachedData = await cacheManager.loadCache(true); // true = ignore expiry
        if (cachedData && cachedData.heatmapData) {

            return { ...cachedData.heatmapData, isCached: true, cacheTimestamp: cachedData.timestamp };
        }
        throw error;
    }
}

function createErrorWidget(message) {
    const widget = new ListWidget();
    widget.backgroundGradient = createGradientBackground(getTheme());

    const errorText = widget.addText(message);
    errorText.font = new Font(FONT_NAME, 14);
    errorText.textColor = Color.red();
    errorText.centerAlignText();

    return widget;
}

async function createHeatmapWidget() {
    try {
        const data = await fetchHeatmapData();
        const theme = getTheme();

        const hasContributionToday = data.hasContributionToday;

        if (!hasContributionToday) {
            const ncTheme = resolveTheme(noContributionTheme);
            theme.box = ncTheme.box;
            theme.accent = ncTheme.accent;
        }

        const weeks = data.contributionCalendar.weeks;
        const streak = data.currentStreak;

        const widget = new ListWidget();
        widget.backgroundGradient = createGradientBackground(theme);
        widget.setPadding(11, 11, 21, 11);
        widget.url = `https://github.com/${username}`;

        // Add last updated indicator if data is from cache
        if (data.isCached && data.cacheTimestamp) {
            const topRow = widget.addStack();
            topRow.layoutHorizontally();
            topRow.addSpacer();

            const timeFmt = new DateFormatter();
            timeFmt.useShortTimeStyle();
            const timeStr = timeFmt.string(new Date(data.cacheTimestamp));

            const updateText = topRow.addText(`↻ ${timeStr}`);
            updateText.font = new Font(FONT_NAME, 9);
            updateText.textColor = Color.gray();
            updateText.textOpacity = 0.6;

            topRow.addSpacer(26);
        }

        widget.addSpacer();

        const grid = widget.addStack();
        grid.layoutHorizontally();
        grid.centerAlignContent();

        const displayWeeks = weeks.slice(-20);
        const maxContribution = data.maxContribution || 0;

        grid.addSpacer();

        const todayStr = df.string(new Date());
        const q = maxContribution / 4;

        for (let w = 0; w < displayWeeks.length; w++) {
            const col = grid.addStack();
            col.layoutVertically();
            col.spacing = BOX_SPACING;

            for (let d = 0; d < 7; d++) {
                const day = displayWeeks[w].contributionDays[d];
                const cell = col.addStack();
                cell.size = new Size(BOX_SIZE, BOX_SIZE);

                if (!day || day.date > todayStr) {
                    cell.backgroundColor = Color.clear();
                } else {
                    cell.backgroundColor = getHeatmapColor(day?.contributionCount || 0, theme.box, q);
                }
                cell.cornerRadius = 2;
            }
            if (w < displayWeeks.length - 1) {
                grid.addSpacer(BOX_SPACING);
            }
        }

        grid.addSpacer();
        widget.addSpacer();

        const footer = widget.addStack();
        footer.layoutHorizontally();
        footer.centerAlignContent();

        footer.addSpacer(26);

        // Left: Username
        const userText = footer.addText(`@${username}`);
        userText.textColor = theme.text;
        userText.font = new Font(FONT_NAME, 11);
        userText.opacity = 0.8;

        footer.addSpacer();

        // Right: Streak / Last Commit
        let statusText = "";
        let statusColor = theme.text;

        if (hasContributionToday) {
            statusText = `${streak} ${streak === 1 ? "day" : "days"} streak`;
            statusColor = theme.accent; // Green (or theme accent)
        } else {
            let lastDate = null;
            if (data.lastContributionDate) {
                const dateFromData = new Date(data.lastContributionDate);
                lastDate = new Date(dateFromData.getUTCFullYear(), dateFromData.getUTCMonth(), dateFromData.getUTCDate());
            }

            if (lastDate) {
                const now = new Date();
                // Reset time part for accurate day calculation
                now.setHours(0, 0, 0, 0);
                lastDate.setHours(0, 0, 0, 0);

                const diffTime = Math.abs(now - lastDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays < 7) {
                    statusText = diffDays === 1 ? "Last commit yesterday" : `Last commit ${diffDays} days ago`;
                } else {
                    statusText = `Last commit ${df.string(lastDate)}`;
                }
            } else {
                statusText = "No recent commits";
            }

            statusColor = theme.accent;
        }

        const totalText = footer.addText(statusText);
        totalText.textColor = statusColor;
        totalText.font = new Font(FONT_NAME, 11);

        footer.addSpacer(26);

        return widget;
    } catch (error) {
        console.error("Failed to create heatmap widget:", error);
        return createErrorWidget("Failed to load heatmap data\nCheck internet connection");
    }
}

const widget = await createHeatmapWidget();

if (!config.runsInWidget) await widget.presentMedium();
Script.setWidget(widget);
Script.complete();