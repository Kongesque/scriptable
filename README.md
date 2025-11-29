# 📊 GitHub Contribution Heatmap Widget

A simple, elegant iOS widget for Scriptable that displays your GitHub contribution heatmap on your home screen.

## 🚀 Quick Setup

### 1. Install Scriptable
Download [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) from the App Store.

### 2. Create the Script
1. Open Scriptable and tap the `+` button.
2. Copy the code from `github.js` and paste it into the new script.
3. Name it **GitHub Heatmap**.

### 3. Configure Your Token
1. Generate a [GitHub Personal Access Token (Classic)](https://github.com/settings/tokens).
   - Select scopes: `read:user`, `repo`, `read:org`.
2. Run this one-line script in Scriptable to save your token securely:
   ```javascript
   Keychain.set("github_token_here", "YOUR_ACTUAL_TOKEN_HERE")
   ```

### 4. Update Username
Edit the top of the script to set your username:
```javascript
const username = "your_username";
```

### 5. Add to Home Screen
1. Add a **Medium** Scriptable widget to your home screen.
2. Edit the widget and select **GitHub Heatmap** as the script.

---

## 🎨 Customization

You can change the theme by editing the **Parameter** field in the widget settings:

- `auto` (default): Adapts to system dark/light mode.
- `dark`: Forces dark mode.
- `light`: Forces light mode.

## 🌐 Offline Support
The widget caches data for 24 hours, so your heatmap remains visible even without an internet connection.
