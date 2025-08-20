import definePlugin, { OptionType } from "@utils/types";
import { React, useState, useEffect, createRoot } from "@webpack/common";
import { definePluginSettings } from "@api/Settings";
import { findByProps } from "@webpack";

/**
 * Functions to fetch GitHub stickers, and clean up download URLs.
 */
function removeTokenParam(url) {
    const urlObj = new URL(url);
    urlObj.searchParams.delete("token");
    return urlObj.toString();
}
async function fetchGitHubStickers(repo, branch = "main", token) {
    const res = await fetch(
        `https://api.github.com/repos/${repo}/contents/stickers?ref=${encodeURIComponent(branch)}&t=${Date.now()}`,
        {
            method: 'GET',
            headers: {
                Accept: 'application/vnd.github.v3+json',
                Authorization: `token ${token}`
            },
            cache: 'no-store'
        }
    );

    if (res.status === 404) {
        return [];
    }

    if (!res.ok) {
        throw new Error("GitHub list request failed: " + res.statusText);
    }

    const json = await res.json();
    return json
        .filter((x) => x.type === "file")
        .map((f) => ({
            name: f.name,
            download_url: removeTokenParam(f.download_url)
        }));
}

/**
 * Functions to upload and delete images to/from GitHub (includes a blobToBase64 converter and downloadAsBlob function).
 */
async function uploadFileToGitHub(repo, branch, token, path, fileBlob, message = "Add sticker") {
    const base64 = await blobToBase64(fileBlob);
    const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const body = { message, content: base64, branch };
    const res = await fetch(url, {
        method: "PUT",
        headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("GitHub upload failed: " + (await res.text()));
    return res.json();
}
async function deleteStickerFromGitHub(repo, branch, token, fileName) {
    if (!repo || !token) throw new Error("GitHub token/repo not configured");
    const path = `stickers/${fileName}`;
    const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;

    const fileInfo = await fetch(url).then(res => {
        if (!res.ok) throw new Error(`Failed to get file info: ${res.statusText}`);
        return res.json();
    });

    const res = await fetch(url, {
        method: "DELETE",
        headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message: `Delete sticker ${fileName}`,
            sha: fileInfo.sha,
            branch: branch || "main",
        }),
    });

    if (!res.ok) throw new Error(`GitHub delete failed: ${await res.text()}`);
    return true;
}
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(blob);
    });
}
async function downloadAsBlob(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Failed to download image: " + r.statusText);
    return await r.blob();
}

/**
 * Functions to create and delete stickers in a guild.
 */
async function createGuildSticker(guildId, token, fileBlob, name) {
    const form = new FormData();
    form.append("file", fileBlob, `${name}`);
    form.append("name", name.replace(/_\d+\.[^.]+$/, "").slice(0, 30));
    form.append("description", "Temporary sticker (uploaded by Vencord plugin)");
    form.append("tags", "auto");

    const res = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/stickers`,
        {
            method: "POST",
            headers: { Authorization: token },
            body: form,
        }
    );
    if (!res.ok) throw new Error("Create sticker failed: " + (await res.text()));
    return res.json();
}
async function deleteGuildSticker(guildId, stickerId, token) {
    const res = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/stickers/${stickerId}`,
        {
            method: "DELETE",
            headers: { Authorization: token },
        }
    );
    if (!res.ok) throw new Error("Delete sticker failed: " + (await res.text()));
    return true;
}

/**
 * Functions to send stickers (First with Nitro, then without). Includes a function to get the current context (channel and guild IDs).
 */
function getCurrentContext() {
    try {
        const m = location.pathname.match(/\/channels\/(?:@me|\d+)\/(\d+)/);
        const channelId = m ? m[1] : null;
        const mg = location.pathname.match(/\/channels\/(\d+)\//);
        const guildId = mg ? mg[1] : null;
        return { channelId, guildId };
    } catch {
        return {};
    }
}
async function sendSticker(channelId, token, stickerId) {
    const body = { sticker_ids: [stickerId] };
    const res = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
            method: "POST",
            headers: { Authorization: token, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }
    );

    const resJson = await res.json();

    if (!res.ok) {
        if (resJson.code === 50081) toast(`Cross-server stickers are only available with Nitro. Please enable "Share Without Nitro" in settings.`);
        else throw new Error("Send sticker failed: " + (await res.text()));
    }
    return resJson;
}
async function sendStickerFakeNitro(channelId, name, stickerId, token) {
    const ext = name.match(/\.([^.]+)$/)?.[1] ?? '';
    const link = `https://media.discordapp.net/stickers/${stickerId}.${ext}?size=160&name=${encodeURIComponent(name.replace(/_\d+\.[^.]+$/, ""))}`;
    const linkText = `[${name}](${link})`;

    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ content: linkText })
    });
}

/**
 * Functions to show toast notifications and context menus.
 */
function toast(text) {
    let root = document.getElementById("vgs-toast-root");
    if (!root) {
        root = document.createElement("div");
        root.id = "vgs-toast-root";
        root.style.position = "fixed";
        root.style.right = "12px";
        root.style.top = "12px";
        root.style.zIndex = "999999";
        document.body.appendChild(root);
    }
    const el = document.createElement("div");
    el.innerText = text;
    el.style.background = "rgba(0,0,0,0.7)";
    el.style.color = "white";
    el.style.padding = "8px 12px";
    el.style.borderRadius = "6px";
    el.style.marginTop = "6px";
    root.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}
function showDeleteContextMenu(e, it, settings, refresh) {
    e.preventDefault();

    document.querySelectorAll(".vgs-delete-context-menu").forEach(el => el.remove());

    const menu = document.createElement("div");
    menu.className = "vgs-delete-context-menu";
    menu.style.position = "absolute";
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    menu.style.background = "var(--background-floating, #2f3136)";
    menu.style.borderRadius = "4px";
    menu.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
    menu.style.padding = "4px 0";
    menu.style.zIndex = "99999";
    menu.style.minWidth = "180px";

    const item = document.createElement("div");
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.justifyContent = "space-between";
    item.style.padding = "8px 12px";
    item.style.cursor = "pointer";
    item.style.color = "var(--status-danger, #f04747)";
    item.style.fontSize = "14px";
    item.style.fontWeight = "500";

    item.onmouseenter = () => {
        item.style.background = "var(--background-modifier-hover, rgba(240,71,71,0.1))";
    };
    item.onmouseleave = () => {
        item.style.background = "transparent";
    };

    const label = document.createElement("div");
    label.innerText = "Delete Sticker";

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("width", "20");
    icon.setAttribute("height", "20");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "currentColor");
    icon.innerHTML = `<path d="M9 3V4H4V6H5V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V6H20V4H15V3H9ZM7 6H17V19H7V6ZM9 8V17H11V8H9ZM13 8V17H15V8H13Z"/>`;

    const iconContainer = document.createElement("div");
    iconContainer.appendChild(icon);

    item.onclick = async () => {
        try {

            await deleteStickerFromGitHub(
                settings.githubRepo,
                settings.githubBranch,
                settings.githubToken,
                it.name
            );
            toast("Deleted");
            await refresh();
        } catch (err) {
            toast("Delete failed: " + err.message);
        }
    };

    item.appendChild(label);
    item.appendChild(iconContainer);
    menu.appendChild(item);
    document.body.appendChild(menu);

    document.addEventListener("click", () => menu.remove(), { once: true });
}

/**
 * GitHubStickersTab component that renders the GitHub stickers tab. Includes handlers for uploading, searching, and sending stickers.
 */
function GitHubStickersTab({ settings }) {
    const s = settings.store;
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);

    async function refresh() {
        setLoading(true);
        try {
            if (!s.githubRepo) throw new Error("Configure GitHub repo in settings");
            const list = await fetchGitHubStickers(
                s.githubRepo,
                s.githubBranch || "main",
                s.githubToken
            );
            setItems(list);
        } catch (e) {
            toast("Error fetching stickers: " + e.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        document.querySelectorAll('[class*="inspector"]').forEach(el => el.remove());

        const tabPanel = document.querySelector('[role="tabpanel"]');
        if (tabPanel) {
            const header = tabPanel.querySelector('[class*="header"]');
            if (header) {
                header.innerHTML = "";

                const filterDiv = document.createElement('div');
                filterDiv.style.background = "var(--background-secondary)";
                filterDiv.style.width = "100%";

                filterDiv.innerHTML = `
                <style>
                    .vgs-search-container {
                        display: flex;
                        align-items: center;
                        border: 1px solid #39393e;
                        border-radius: 6px;
                        padding: 0 8px;
                        height: 40px;
                        width : calc(100% - 16px)
                        background-color: var(--background-tertiary);
                    }
                    .vgs-search-container:focus-within {
                        border-color: #5197ed;
                        box-shadow: 0 0 0 1px #4a90e2;
                    }
                    .vgs-search-container svg {
                        flex-shrink: 0;
                        color: #ccc;
                    }
                    .vgs-search-container input {
                        flex: 1;
                        padding: 0 8px;
                        font-size: 16px;
                        background: none;
                        border: none;
                        outline: none;
                        color: #ccc;
                        caret-color: white;
                    }
                </style>
                <div class="vgs-search-container">
                    <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24">
                    <path fill="var(--icon-primary)" fill-rule="evenodd" d="M15.62 17.03a9 9 0 1 1 1.41-1.41l4.68 4.67a1 1 0 0 1-1.42 1.42l-4.67-4.68ZM17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" clip-rule="evenodd" class=""></path></svg>
                    <input type="text" placeholder="Search stickers...">
                </div>
            `;

                header.appendChild(filterDiv);

                const input = filterDiv.querySelector('input');
                input.addEventListener('input', e => {
                    const query = e.target.value.toLowerCase();
                    document.querySelectorAll('#vgs-stickers-grid img').forEach(img => {
                        const name = img.title.toLowerCase();
                        img.parentElement.style.display = name.includes(query) ? "" : "none";
                    });
                });
            }
        }

        (async () => {
            await refresh();
        })();
    }, []);


    async function handleUpload(file, name, description, tags) {
        try {
            if (typeof name !== "string" || name.length < 2 || name.length > 30) {
                throw new Error("Sticker name must be between 2 and 30 characters.");
            }
            if (typeof description !== "string" ||
                (description.length !== 0 && (description.length < 2 || description.length > 100))) {
                throw new Error("Description must be empty or between 2 and 100 characters.");
            }
            if (typeof tags !== "string" || tags.length > 200) {
                throw new Error("Tags must not exceed 200 characters.");
            }
            const allowedTypes = ["image/png", "image/apng", "image/gif"];
            if (!allowedTypes.includes(file.type)) {
                throw new Error("File must be a PNG, APNG, or GIF.");
            }
            if (file.size > 512 * 1024) {
                throw new Error("File size must be 512 KiB or less.");
            }
            if (!s.githubRepo || !s.githubToken) {
                throw new Error("GitHub token/repo not configured");
            }

            const timestamp = Date.now();
            const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
            const ext = file.name.split(".").pop();
            const safe = nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, "_") + `_${timestamp}.${ext}`;
            const path = `stickers/${safe}`;

            await uploadFileToGitHub(
                s.githubRepo,
                s.githubBranch || "main",
                s.githubToken,
                path,
                file,
                `Add sticker ${safe}`
            );

            toast("Uploaded — refreshing...");
            await refresh();
        } catch (e) {
            toast("Upload failed: " + e.message);
        }
    }

    async function handleSend(item) {
        const s = settings.store;
        let created = null;
        try {
            const Auth = findByProps("getToken");
            const token = Auth.getToken();
            if (!token) throw new Error("Discord token not found.");

            const ctx = getCurrentContext();
            const channelId = ctx.channelId;
            const guildId = s.targetGuildId || ctx.guildId;

            if (!guildId) throw new Error("Target guild not found.");
            if (!channelId) throw new Error("Channel not found.");

            const blob = await downloadAsBlob(item.download_url);

            created = await createGuildSticker(guildId, token, blob, item.name);

            if (s.shareWithoutNitro) {
                await sendStickerFakeNitro(channelId, item.name, created.id, token);
            } else {
                await sendSticker(channelId, token, created.id);
            }
        } catch (e) {
            toast("Send failed: " + e.message);
        } finally {
            if (created) {
                try {
                    const token = findByProps("getToken").getToken();
                    const guildId = s.targetGuildId || getCurrentContext().guildId;
                    await deleteGuildSticker(guildId, created.id, token);
                } catch (cleanupErr) {
                    toast("Failed to delete temp sticker:" + cleanupErr);
                }
            }
        }
    }

    return React.createElement(
        "div",
        { style: { padding: 12, width: "90%", overflowY: "auto", margin: "auto" } },
        loading
            ? React.createElement("div", null, "")
            : React.createElement(
                "div",
                {
                    id: "vgs-stickers-grid",
                    style: {
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 96px)",
                        gap: 40,
                        justifyContent: "center",
                        width: "100%",
                    },
                },
                (() => {
                    let fileInputRef;
                    return [
                        React.createElement(
                            "div",
                            {
                                key: "upload-tile",
                                style: {
                                    cursor: "pointer",
                                    textAlign: "center",
                                    position: "relative",
                                    width: 96,
                                    height: 96,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: 8,
                                    background: "#f0f0f0",
                                    fontSize: 32,
                                    fontWeight: "bold",
                                    color: "#888",
                                },
                                onClick: () => fileInputRef && fileInputRef.click(),
                            },
                            "+",
                            React.createElement("input", {
                                type: "file",
                                accept: "image/apng, image/png, image/gif",
                                style: { display: "none" },
                                ref: (el) => (fileInputRef = el),
                                onChange: (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUpload(file, file.name.replace(/\.[^.]+$/, ""), "", "");
                                    e.target.value = "";
                                },
                            })
                        ),

                        ...items.map((it) =>
                            React.createElement(
                                "div",
                                {
                                    key: it.download_url,
                                    style: {
                                        cursor: "pointer",
                                        textAlign: "center",
                                        position: "relative",
                                    },
                                    onClick: () => handleSend(it),
                                    onContextMenu: (e) => showDeleteContextMenu(e, it, s, refresh),
                                },
                                React.createElement("img", {
                                    src: it.download_url,
                                    style: {
                                        width: 96,
                                        height: 96,
                                        objectFit: "cover",
                                        borderRadius: 8,
                                    },
                                    title: it.name.replace(/_\d+\.[^.]+$/, ""),
                                })
                            )
                        ),
                    ];
                })()
            )
    );
}

/**
 * Injects the GitHub stickers tab into the Discord UI.
 */
function injectTab(plugin) {
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (!(n instanceof HTMLElement)) continue;

                const tabbar = n.querySelector?.('[class^="navList_"][role="tablist"]');
                if (!tabbar) continue;
                if (tabbar.dataset.vgsInjected) continue;
                tabbar.dataset.vgsInjected = "1";

                const getSidebar = () =>
                    (n.querySelector('[class*="categoryList"]') as HTMLElement | null) ||
                    (document.querySelector('[class*="categoryList"]') as HTMLElement | null);

                const getWrapper = (): HTMLElement | null =>
                    document.querySelector('[class*="wrapper__8ef02"], [class*="emojiPicker_c0e32c"]') as HTMLElement | null;

                const adjustWrapperColumns = (zero: boolean) => {
                    const wrapper = getWrapper();
                    if (wrapper) {
                        if (zero) {
                            wrapper.style.setProperty('grid-template-columns', '0px auto', 'important');
                        } else {
                            wrapper.style.removeProperty('grid-template-columns');
                        }
                    }
                };

                const waitForWrapper = (cb: () => void) => {
                    if (getWrapper()) {
                        cb();
                        return;
                    }
                    const mo = new MutationObserver(() => {
                        if (getWrapper()) {
                            mo.disconnect();
                            cb();
                        }
                    });
                    mo.observe(document.body, { childList: true, subtree: true });
                };

                const clearActive = () => {
                    tabbar.querySelectorAll('[class*="navButtonActive"]').forEach((btn) => {
                        const cls = [...btn.classList].find(c => c.includes("navButtonActive"));
                        if (cls) btn.classList.remove(cls);
                    });
                };

                const showNative = () => {
                    const tabPanel = n.querySelector('[role="tabpanel"]');
                    if (!tabPanel) return;

                    const scroller =
                        tabPanel.querySelector('[class*="scroller_"], [class*="scrollerBase_"]');
                    if (!scroller) return;

                    Array.from(scroller.children).forEach((child) => {
                        if (!(child instanceof HTMLElement)) return;
                        if (child.id === 'vgs-github-stickers-container') {
                            child.style.display = 'none';
                        } else {
                            child.style.removeProperty('display');
                        }
                    });

                    const sidebar = getSidebar();
                    if (sidebar) sidebar.style.removeProperty('display');
                    adjustWrapperColumns(false);

                    const pluginContainer = scroller.querySelector('#vgs-github-stickers-container') as any;
                    if (pluginContainer && pluginContainer._vgsRoot) {
                        try { pluginContainer._vgsRoot.unmount(); } catch {}
                        pluginContainer._vgsRoot = null;
                    }
                };

                const stickersTabBtn = tabbar.querySelector('#sticker-picker-tab');
                const gifsTabBtn     = tabbar.querySelector('#gif-picker-tab');
                const emojiTabBtn    = tabbar.querySelector('#emoji-picker-tab');

                [stickersTabBtn, gifsTabBtn, emojiTabBtn].forEach((btn) => {
                    if (!btn) return;
                    if ((btn as any)._vgsBound) return;
                    (btn as any)._vgsBound = true;
                    btn.addEventListener('click', () => {
                        setTimeout(() => {
                            clearActive();
                            showNative();
                            const base = [...btn.classList].find(c => c.includes("navButton"));
                            if (base) btn.classList.add(base + "Active");
                        }, 0);
                    });
                });

                const ghBtn = document.createElement("button");
                ghBtn.innerText = "Infinite Stickers";
                ghBtn.style.padding = "6px 10px";
                ghBtn.style.marginLeft = "8px";
                ghBtn.style.borderRadius = "8px";

                ghBtn.onclick = () => {
                    clearActive();
                    const anyTab = (stickersTabBtn || gifsTabBtn || emojiTabBtn) as HTMLElement | null;
                    const base = anyTab ? [...anyTab.classList].find(c => c.includes("navButton")) : null;
                    if (base) ghBtn.classList.add(base + "Active");

                    const tabPanel = n.querySelector('[role="tabpanel"]');
                    if (!tabPanel) return;

                    const scroller =
                        tabPanel.querySelector('[class*="scroller_"], [class*="scrollerBase_"]') as HTMLElement | null;
                    if (!scroller) return;

                    const prevScroll = scroller.scrollTop;

                    let pluginContainer = scroller.querySelector('#vgs-github-stickers-container') as any;
                    if (!pluginContainer) {
                        pluginContainer = document.createElement('div');
                        pluginContainer.id = 'vgs-github-stickers-container';
                        pluginContainer.style.width = '100%';
                        pluginContainer.style.display = 'none';
                        scroller.appendChild(pluginContainer);
                    }

                    Array.from(scroller.children).forEach((child) => {
                        if (!(child instanceof HTMLElement)) return;
                        if (child.id === 'vgs-github-stickers-container') {
                            child.style.display = '';
                        } else {
                            child.style.display = 'none';
                        }
                    });

                    const sidebar = getSidebar();
                    if (sidebar) sidebar.style.display = 'none';

                    waitForWrapper(() => adjustWrapperColumns(true));

                    if (!pluginContainer._vgsRoot) {
                        const root = createRoot(pluginContainer);
                        pluginContainer._vgsRoot = root;
                        root.render(
                            React.createElement(GitHubStickersTab, {
                                settings: plugin.settings,
                            })
                        );
                    }

                    requestAnimationFrame(() => {
                        scroller.scrollTop = prevScroll;
                    });
                };

                tabbar.appendChild(ghBtn);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    plugin._observer = observer;
}

/**
 * Plugin settings definition
 */
const settings = definePluginSettings({
    githubToken: {
        type: OptionType.STRING,
        description: "GitHub token (ghp_...)",
        default: "",
    },
    githubRepo: {
        type: OptionType.STRING,
        description: "PUBLIC GitHub repo (owner/repo)",
        default: "",
    },
    githubBranch: {
        type: OptionType.STRING,
        description: "Branch",
        default: "main",
    },
    targetGuildId: {
        type: OptionType.STRING,
        description: "Target Guild ID",
        default: "",
    },
    shareWithoutNitro: {
        type: OptionType.BOOLEAN,
        description: "Share stickers to any server without Nitro (uses link text)",
        default: false,
    }
});
export default definePlugin({
    name: "Infinite Stickers",
    description:
        "Adds a GitHub-backed sticker tab inside the native sticker picker.",
    authors: [{ name: "Yoan Gilliand", id: "1405669927632769166" }],
    settings,
    start() {
        injectTab(this);
    },
    stop() {
        this._observer?.disconnect();
    },
});
