# Infinite Stickers

Tired of Discord’s **5 sticker limit per server**?  
**Infinite Stickers** is a Vencord plugin that adds a **GitHub-powered sticker panel** to Discord’s native sticker picker — letting you browse, search, upload, send, and delete as many stickers as you want, all hosted for free on GitHub.

Instead of storing stickers on each Discord server, this plugin pulls them from a **GitHub repository** you control — so you can access the same sticker library everywhere, instantly.

---

## ✨ Features

- 📂 **Unlimited stickers** — all stored in your GitHub repo, not bound by Discord’s limits.
- 🔍 **Search bar** — instantly filter stickers by name.
- ⬆️ **Upload** new stickers directly from Discord (safe filenames & timestamps added automatically).
- 🗑 **Right-click delete** — instantly remove stickers from your repo.
- 💬 **Send anywhere**:
  - As a **temporary guild sticker** (auto-uploaded to your server, then removed after sending).
  - Or in **Fake Nitro mode** — share stickers anywhere as image links.
- 🔄 **Auto-refresh** after uploads or deletions.
- 🖼 **PNG, APNG, GIF** support.
- ✅ **File size & naming rules** enforced to match Discord’s requirements.

---

## 🚀 Quick Start — Fork & Go

This is the fastest way to set it up:

1. **Fork the ready-to-use stickers repository**  
   👉 [Fork This Stickers Repo](https://github.com/yoan-gilliand/infinite-stickers)  
   _(Already has the required `stickers` folder.)_

2. **Get your Guild ID** (Required!)  
   - In Discord, go to **User Settings → Advanced** and enable **Developer Mode**.  
   - Right-click your server icon → **Copy Server ID**.  
   - This is the **Target Guild ID** you’ll enter in plugin settings.

3. **Get your GitHub Personal Access Token**  
   - Go to [GitHub → Developer settings → Personal access tokens](https://github.com/settings/tokens).  
   - Click **Generate new token (Classic)**.  
   - Give it a name, select **repo** scope, and create it.  
   - Copy the token (starts with `ghp_...`) — you’ll need it for the plugin.

4. **Install the plugin**  
   - Install [Vencord](https://docs.vencord.dev/installing/custom-plugins/) with **custom plugin support**.  
   - Download `InfiniteStickers.tsx` from this repository.  
   - Place it in your **Vencord custom plugins** folder.  
   - Rebuild or reload Vencord.

5. **Configure the plugin** in **Vencord → Settings → Infinite Stickers**:  
   - **GitHub token** → Your `ghp_...` token.  
   - **GitHub repo** → `your-username/your-fork-name`.  
   - **GitHub branch** → `main` (or your branch).  
   - **Target Guild ID** → Your copied server ID.  
   - (Optional) Enable **Share without Nitro** to send stickers anywhere as image links.

---

## 🖱 Usage

1. Open the **sticker picker** in Discord.  
2. Click the **Infinite Stickers** tab.  
3. From here you can:  
   - **Upload** a sticker with the `+` button.  
   - **Search** stickers instantly.  
   - **Send** a sticker by clicking it.  
   - **Delete** a sticker with **right-click → Delete Sticker**.

---

## ⚙️ Technical Constraints

- **Formats:** PNG, APNG, GIF  
- **Max file size:** 512 KiB  
- **Name length:** 2–30 characters (excluding extension)  
- **Description:** Empty or 2–100 characters  
- **Tags:** up to 200 characters  

---

## 📜 License

This project is provided **as-is** without warranty.  
You are free to fork, modify, and use it for personal or public purposes, provided you:  
- Keep a credit link to the original repository.  
- Do not sell access to the plugin or stickers.  
- Use at your own risk — misuse of GitHub API tokens or Discord accounts may result in account restrictions.

---
