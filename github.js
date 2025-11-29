
const username = "kongesque"; // replace with your github username
const token = Keychain.get("github_token_here"); // replace this with you token
const theme = "auto"; // "auto", "dark", or "light"
const FONT_NAME = "Menlo";

const rawParam = (args.widgetParameter || theme).toLowerCase();
let themeParam = "auto";

if (rawParam.includes("dark")) {
    themeParam = "dark";
} else if (rawParam.includes("light")) {
    themeParam = "light";
}

const heatmapThemes = {
    auto: Device.isUsingDarkAppearance()
        ? {
            bg: ["#0d1117", "#0d1117", "#0d1117"],
            text: "#ffffff",
            accent: "#56d364",
            box: ["#2e2f37", "#196c2e", "#196c2e", "#2ea043", "#56d364"]
        }
        : {
            bg: ["#ffffff", "#ffffff", "#ffffff"],
            text: "#000000",
            accent: "#116329",
            box: ["#eff2f5", "#aceebb", "#4ac26b", "#2da44e", "#116329"]
        },
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

            // Ensure directory exists before writing
            this.ensureCacheDir();

            const cacheData = {
                timestamp: Date.now(),
                data: data
            };

            const jsonString = JSON.stringify(cacheData, null, 2);
            console.log(`Writing cache data, size: ${jsonString.length} characters`);

            this.fm.writeString(this.cacheFile, jsonString);

            // Download from iCloud to ensure it's available
            if (this.fm.fileExists(this.cacheFile)) {
                await this.fm.downloadFileFromiCloud(this.cacheFile);
                const fileSize = this.fm.fileSize(this.cacheFile);
                console.log(`Cache saved successfully! File size: ${fileSize} bytes`);
            } else {
                console.error("Cache file was not created!");
            }
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

// Helper function to check internet connectivity
async function isOnline() {
    try {
        const req = new Request("https://www.google.com");
        req.timeoutInterval = 5; // 5 second timeout
        await req.load();
        return true;
    } catch (error) {
        console.log("No internet connection detected");
        return false;
    }
}

function getHeatmapColor(count) {
    const boxes = heatmapThemes[themeParam].box;
    if (count === 0) return new Color(boxes[0]);
    if (count >= 20) return new Color(boxes[4]);
    if (count >= 10) return new Color(boxes[3]);
    if (count >= 5) return new Color(boxes[2]);
    if (count >= 1) return new Color(boxes[1]);
    return new Color(boxes[0]);
}

function createGradientBackground() {
    const theme = heatmapThemes[themeParam];
    const gradient = new LinearGradient();
    gradient.colors = theme.bg.map(c => new Color(c));
    gradient.locations = [0.0, 0.5, 1.0];
    return gradient;
}

async function fetchHeatmapData() {
    const online = await isOnline();

    // If offline, use cache immediately
    if (!online) {
        console.log("Offline mode - loading heatmap data from cache");
        const cachedData = await cacheManager.loadCache();
        if (cachedData && cachedData.heatmapData) {
            console.log("✅ Using cached heatmap data (offline)");
            return cachedData.heatmapData;
        }
        throw new Error("No internet connection and no valid cache available");
    }

    // If online, try to fetch fresh data
    try {
        console.log("🌐 Online mode - fetching fresh heatmap data");
        const now = new Date();
        const toDate = new Date(now);
        toDate.setDate(now.getDate() + 1); // Add 1 day to ensure we cover 'today' in all timezones

        const fromDate = new Date(now);
        fromDate.setDate(now.getDate() - 133); // ~19 weeks

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
        const contribData = json.data.user.contributionsCollection;

        // calculate streak
        const allDays = contribData.contributionCalendar.weeks.flatMap(w => w.contributionDays);
        const df = new DateFormatter();
        df.dateFormat = "yyyy-MM-dd";
        const todayStr = df.string(new Date());

        let currentStreak = 0;
        for (let i = allDays.length - 1; i >= 0; i--) {
            const d = allDays[i];
            if (d.date === todayStr) continue;
            if (d.contributionCount > 0) currentStreak++;
            else break;
        }

        const result = {
            ...contribData,
            currentStreak
        };

        console.log("✅ Fresh heatmap data fetched successfully");

        // Save to cache
        console.log("Saving heatmap data to cache...");
        await cacheManager.saveCache({
            heatmapData: result,
            timestamp: Date.now()
        });

        return result;
    } catch (error) {
        console.error("❌ Failed to fetch heatmap data:", error);
        const cachedData = await cacheManager.loadCache();
        if (cachedData && cachedData.heatmapData) {
            console.log("✅ Using cached heatmap data as fallback");
            return cachedData.heatmapData;
        }
        throw error;
    }
}

function createErrorWidget(message) {
    const widget = new ListWidget();
    widget.backgroundGradient = createGradientBackground();

    const errorText = widget.addText(message);
    errorText.font = new Font(FONT_NAME, 14);
    errorText.textColor = Color.red();
    errorText.centerAlignText();

    return widget;
}

async function createHeatmapWidget() {
    try {
        const data = await fetchHeatmapData();
        const online = await isOnline();

        const weeks = data.contributionCalendar.weeks;
        const total = data.contributionCalendar.totalContributions;
        const streak = data.currentStreak;

        const widget = new ListWidget();
        widget.backgroundGradient = createGradientBackground();
        widget.setPadding(11, 11, 21, 11);

        // Add offline indicator at top right if needed
        if (!online) {
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

        const boxSize = 10;
        const boxSpacing = 4;
        const displayWeeks = weeks;

        grid.addSpacer();

        // Date formatter for future check
        const df = new DateFormatter();
        df.dateFormat = "yyyy-MM-dd";
        const todayStr = df.string(new Date());

        for (let w = 0; w < displayWeeks.length; w++) {
            const col = grid.addStack();
            col.layoutVertically();
            col.spacing = boxSpacing;

            for (let d = 0; d < 7; d++) {
                const day = displayWeeks[w].contributionDays[d];
                const cell = col.addStack();
                cell.size = new Size(boxSize, boxSize);

                if (day && day.date > todayStr) {
                    cell.backgroundColor = Color.clear();
                } else {
                    cell.backgroundColor = getHeatmapColor(day?.contributionCount || 0);
                }
                cell.cornerRadius = 2;
            }
            grid.addSpacer(boxSpacing);
        }

        grid.addSpacer();
        widget.addSpacer();

        const footer = widget.addStack();
        footer.layoutHorizontally();
        footer.centerAlignContent();

        footer.addSpacer(28);

        // Left: Username
        const userText = footer.addText(`@${username}`);
        userText.textColor = new Color(heatmapThemes[themeParam]?.text || "#ffffff");
        userText.font = new Font(FONT_NAME, 11);
        userText.opacity = 0.8;

        footer.addSpacer();

        // Right: Streak
        const totalText = footer.addText(`${streak} `);
        totalText.textColor = new Color(heatmapThemes[themeParam]?.text || "#ffffff");
        totalText.font = new Font(FONT_NAME, 11);
        const totalText2 = footer.addText(`${streak === 1 ? "day" : "days"} streak`);
        totalText2.textColor = new Color(heatmapThemes[themeParam]?.text || "#ffffff");
        totalText2.font = new Font(FONT_NAME, 11);

        footer.addSpacer(32);

        return widget;
    } catch (error) {
        console.error("Failed to create heatmap widget:", error);
        return createErrorWidget("Failed to load heatmap data\nCheck internet connection");
    }
}

// ===================================
const widget = await createHeatmapWidget();

if (!config.runsInWidget) await widget.presentMedium();
Script.setWidget(widget);
Script.complete();