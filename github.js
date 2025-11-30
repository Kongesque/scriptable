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
        box: ["#2e2f37", "#196c2e", "#196c2e", "#2ea043", "#56d364"]
    }
};

// Cache configuration
const CACHE_DIR = ".cache";
const CACHE_FILE = "github_stats_cache.json";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Cache management class
class CacheManager {
    constructor() {
        this.fm = FileManager.iCloud();
        this.cacheDir = this.fm.joinPath(this.fm.documentsDirectory(), CACHE_DIR);
        this.cacheFile = this.fm.joinPath(this.cacheDir, CACHE_FILE);
        console.log(`Cache directory path: ${this.cacheDir}`);
        console.log(`Cache file path: ${this.cacheFile}`);
        this.ensureCacheDir();
    }

    ensureCacheDir() {
        try {
            if (!this.fm.fileExists(this.cacheDir)) {
                console.log("Creating cache directory...");
                this.fm.createDirectory(this.cacheDir, true);
                console.log("Cache directory created successfully");
            } else {
                console.log("Cache directory already exists");
            }
        } catch (error) {
            console.error("Failed to create cache directory:", error);
        }
    }

    async saveCache(data) {
        try {
            console.log(`Attempting to save cache with data: ${Object.keys(data).join(', ')}`);

            const cacheData = {
                timestamp: Date.now(),
                data: data
            };

            const jsonString = JSON.stringify(cacheData, null, 2);
            console.log(`Writing cache data, size: ${jsonString.length} characters`);

            this.fm.writeString(this.cacheFile, jsonString);
            console.log("Cache saved successfully!");
        } catch (error) {
            console.error("Failed to save cache:", error);
            console.error(`Error details: ${error.message}`);
        }
    }

    async loadCache() {
        try {
            if (!this.fm.fileExists(this.cacheFile)) {
                console.log("No cache file found");
                return null;
            }

            // Download from iCloud first
            await this.fm.downloadFileFromiCloud(this.cacheFile);
            const cacheContent = this.fm.readString(this.cacheFile);
            const cacheData = JSON.parse(cacheContent);

            // Check if cache is still valid (within 24 hours)
            const isValid = (Date.now() - cacheData.timestamp) < CACHE_DURATION;

            if (!isValid) {
                console.log("Cache expired");
                return null;
            }

            console.log("Cache loaded successfully");
            return cacheData.data;
        } catch (error) {
            console.error("Failed to load cache:", error);
            return null;
        }
    }
}

// Initialize cache manager
const cacheManager = new CacheManager();

function getTheme() {
    if (themeParam === "auto") {
        const light = heatmapThemes.light;
        const dark = heatmapThemes.dark;
        return {
            bg: light.bg.map((c, i) => Color.dynamic(new Color(c), new Color(dark.bg[i]))),
            text: Color.dynamic(new Color(light.text), new Color(dark.text)),
            accent: Color.dynamic(new Color(light.accent), new Color(dark.accent)),
            box: light.box.map((c, i) => Color.dynamic(new Color(c), new Color(dark.box[i])))
        };
    }
    const theme = heatmapThemes[themeParam] || heatmapThemes.light;
    return {
        bg: theme.bg.map(c => new Color(c)),
        text: new Color(theme.text),
        accent: new Color(theme.accent),
        box: theme.box.map(c => new Color(c))
    };
}

function getHeatmapColor(count, themeBoxes) {
    if (count === 0) return themeBoxes[0];
    if (count >= 20) return themeBoxes[4];
    if (count >= 10) return themeBoxes[3];
    if (count >= 5) return themeBoxes[2];
    if (count >= 1) return themeBoxes[1];
    return themeBoxes[0];
}

function createGradientBackground(theme) {
    const gradient = new LinearGradient();
    gradient.colors = theme.bg;
    gradient.locations = [0.0, 0.5, 1.0];
    return gradient;
}

async function fetchHeatmapData() {
    try {
        console.log("🌐 Fetching fresh heatmap data...");
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
        const allDays = contribData.contributionCalendar.weeks.flatMap(w => w.contributionDays);
        const todayStr = df.string(new Date());

        let currentStreak = 0;
        for (let i = allDays.length - 1; i >= 0; i--) {
            const d = allDays[i];
            if (d.date > todayStr) {
                continue;
            }
            if (d.contributionCount > 0) {
                currentStreak++;
            } else if (d.date !== todayStr) {
                break;
            }
        }

        const result = {
            ...contribData,
            currentStreak
        };

        console.log("✅ Fresh heatmap data fetched successfully");

        // Save to cache
        await cacheManager.saveCache({
            heatmapData: result,
            timestamp: Date.now()
        });

        return result;
    } catch (error) {
        console.error("❌ Failed to fetch heatmap data: " + error.message);
        const cachedData = await cacheManager.loadCache();
        if (cachedData && cachedData.heatmapData) {
            console.log("✅ Using cached heatmap data as fallback");
            return { ...cachedData.heatmapData, isCached: true };
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

        // Check if today has contributions
        const todayStr = df.string(new Date());
        const allContributionDays = data.contributionCalendar.weeks.flatMap(w => w.contributionDays);
        const todayData = allContributionDays.find(d => d.date === todayStr);
        const hasContributionToday = todayData && todayData.contributionCount > 0;

        if (!hasContributionToday) {
            const lightRed = ["#eff2f5", "#ffcdd2", "#ef9a9a", "#e57373", "#d32f2f"];
            const darkRed = ["#2e2f37", "#5c1e1e", "#8c2b2b", "#c62828", "#ff5252"];

            if (themeParam === "auto") {
                theme.box = lightRed.map((c, i) => Color.dynamic(new Color(c), new Color(darkRed[i])));
                theme.accent = Color.dynamic(new Color("#d32f2f"), new Color("#ff5252"));
            } else if (themeParam === "dark") {
                theme.box = darkRed.map(c => new Color(c));
                theme.accent = new Color("#ff5252");
            } else {
                theme.box = lightRed.map(c => new Color(c));
                theme.accent = new Color("#d32f2f");
            }
        }

        const weeks = data.contributionCalendar.weeks;
        const streak = data.currentStreak;

        const widget = new ListWidget();
        widget.backgroundGradient = createGradientBackground(theme);
        widget.setPadding(11, 11, 21, 11);
        widget.url = `https://github.com/${username}`;

        // Add offline indicator if data is from cache
        if (data.isCached) {
            const topRow = widget.addStack();
            topRow.layoutHorizontally();
            topRow.addSpacer();
            const offlineIndicator = topRow.addText("Offline");
            offlineIndicator.font = new Font(`${FONT_NAME}-Bold`, 8);
            offlineIndicator.textColor = Color.orange();
            topRow.addSpacer(12);
            widget.addSpacer(2);
        }

        widget.addSpacer();

        const grid = widget.addStack();
        grid.layoutHorizontally();
        grid.centerAlignContent();

        const displayWeeks = weeks.slice(-20);

        grid.addSpacer();

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
                    cell.backgroundColor = getHeatmapColor(day?.contributionCount || 0, theme.box);
                }
                cell.cornerRadius = 2;
            }
            grid.addSpacer(BOX_SPACING);
        }

        grid.addSpacer();
        widget.addSpacer();

        const footer = widget.addStack();
        footer.layoutHorizontally();
        footer.centerAlignContent();

        footer.addSpacer(24);

        // Left: Username
        const userText = footer.addText(`@${username}`);
        userText.textColor = theme.text;
        userText.font = new Font(FONT_NAME, 11);
        userText.opacity = 0.8;

        footer.addSpacer();

        // Right: Streak
        const totalText = footer.addText(`${streak} `);
        totalText.textColor = theme.text;
        totalText.font = new Font(FONT_NAME, 11);
        const totalText2 = footer.addText(`${streak === 1 ? "day" : "days"} streak`);
        totalText2.textColor = theme.text;
        totalText2.font = new Font(FONT_NAME, 11);

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