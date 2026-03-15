// ─── HELPERS ──────────────────────────────────────────────────
const AV_COLORS = ['av-0', 'av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6', 'av-7'];
function avatarClass(name) {
    const code = (name || 'A').charCodeAt(0);
    return AV_COLORS[code % AV_COLORS.length];
}
function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts.replace(' ', 'T'));
    return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── GLOBAL STATE ─────────────────────────────────────────────
let myPhone = sessionStorage.getItem('tab_phone') || "";
let myName = sessionStorage.getItem('tab_name') || "";
let myPhoto = sessionStorage.getItem('tab_photo') || "";
let activeChat = null;
let contacts = [];
let messages = [];
let myPublicKey = null;

// ─── RENDER TRACKING (flicker-free) ───────────────────────────
let _lastContactsKey = '';         // serialized contacts list for diff
let _renderedMsgIds = new Set();   // IDs of already-rendered messages
let _lastRenderedDate = '';        // track date changes inside a chat
let _cachedPrivKey = null;         // cached CryptoKey to avoid re-import every sync
let _cachedPrivPhone = '';         // which phone the cached key belongs to
let _activeFilter = 'all';         // active sidebar filter (all, unread, stranger)

// ─── AUTH LOGIC ───────────────────────────────────────────────
// temp: hold name from check_user until loginUser() saves it
let _pendingName = '';

async function checkUser() {
    const phone = document.getElementById('auth-phone').value;
    if (!phone) return;
    myPhone = phone;

    const res = await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=check_user&phone=${phone}`
    });
    const data = await res.json();

    if (data.status === 'exists') _pendingName = data.name || '';
    document.getElementById('auth-step-1').classList.add('hidden');
    if (data.status === 'exists') {
        document.getElementById('auth-step-2').classList.remove('hidden');
    } else {
        document.getElementById('auth-step-signup').classList.remove('hidden');
    }
}

async function registerUser() {
    const name = document.getElementById('auth-name').value;
    const keyPair = await window.crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true, ["encrypt", "decrypt"]
    );
    const exportedPub = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const pubKeyString = btoa(String.fromCharCode(...new Uint8Array(exportedPub)));
    const exportedPriv = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const privKeyString = btoa(String.fromCharCode(...new Uint8Array(exportedPriv)));
    localStorage.setItem(`priv_key_${myPhone}`, privKeyString);
    localStorage.setItem(`pub_key_${myPhone}`, pubKeyString);

    await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=register&phone=${myPhone}&name=${name}&public_key=${encodeURIComponent(pubKeyString)}`
    });
    sessionStorage.setItem('tab_phone', myPhone);
    // Store the name (fallback to last 4 digits if blank)
    const resolvedName = name.trim() || ('User ' + myPhone.slice(-4));
    sessionStorage.setItem('tab_name', resolvedName);
    location.reload();
}

async function loginUser() {
    if (document.getElementById('auth-otp').value === '1234') {
        await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `action=login&phone=${myPhone}`
        });
        sessionStorage.setItem('tab_phone', myPhone);
        sessionStorage.setItem('tab_name', _pendingName || myPhone);
        location.reload();
    }
}

async function logoutUser() {
    if (!confirm('Are you sure you want to log out of this session?')) return;
    await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=logout`
    });
    sessionStorage.removeItem('tab_phone');
    sessionStorage.removeItem('tab_name');
    sessionStorage.removeItem('tab_photo');
    location.reload();
}

// ─── LOAD OWN PUBLIC KEY ──────────────────────────────────────
async function loadMyPublicKey() {
    let pubKeyStr = localStorage.getItem(`pub_key_${myPhone}`);
    if (!pubKeyStr) {
        const res = await fetch(`api.php?action=get_my_key&phone=${encodeURIComponent(myPhone)}`);
        const data = await res.json();
        // Also grab name if we don't have it yet
        if (data.name && !myName) {
            myName = data.name;
            sessionStorage.setItem('tab_name', myName);
        }
        if (data.profile_photo) {
            myPhoto = data.profile_photo;
            sessionStorage.setItem('tab_photo', myPhoto);
        }
        if (data.public_key) {
            pubKeyStr = data.public_key;
            localStorage.setItem(`pub_key_${myPhone}`, pubKeyStr);
        }
    }
    if (pubKeyStr) {
        myPublicKey = await window.crypto.subtle.importKey(
            "spki", str2ab(atob(pubKeyStr)),
            { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
        );
    }

    setFooter(myName, myPhone, myPhoto);
}

// ─── CONTACTS ────────────────────────────────────────────────
function openAddContact() {
    document.getElementById('contact-error').classList.remove('show');
    document.getElementById('new-contact-phone').value = '';
    document.getElementById('add-contact-modal').classList.add('open');
}
function closeAddContact() {
    document.getElementById('add-contact-modal').classList.remove('open');
}

async function verifyAndAddContact() {
    const target = document.getElementById('new-contact-phone').value;
    const res = await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=add_contact&phone=${encodeURIComponent(myPhone)}&contact_phone=${target}`
    });
    const data = await res.json();
    if (data.status === 'success') {
        closeAddContact();
        syncData();
    } else {
        document.getElementById('contact-error').classList.add('show');
    }
}

// ─── SYNC ────────────────────────────────────────────────────
async function syncData() {
    if (!myPhone) return;
    const res = await fetch(`api.php?action=sync&phone=${encodeURIComponent(myPhone)}`);
    const data = await res.json();
    contacts = data.contacts;
    messages = data.messages;

    // Get current search query to maintain filter during sync
    const searchQuery = document.getElementById('recent-search')?.value || '';
    renderRecentChats(searchQuery);
    if (activeChat) {
        // Find fresh contact data for active chat to see if they changed their avatar/name
        const freshContact = contacts.find(c => c.phone === activeChat.phone);
        if (freshContact) {
            const avatarChanged = freshContact.profile_photo !== activeChat.profile_photo;
            const nameChanged = freshContact.name !== activeChat.name;
            activeChat = freshContact; // update active chat object

            if (avatarChanged || nameChanged) {
                // Update chat header UI
                const av = document.getElementById('chat-avatar');
                if (activeChat.profile_photo) {
                    av.innerHTML = `<img src="${activeChat.profile_photo}" alt="" />`;
                } else {
                    av.textContent = activeChat.name ? activeChat.name[0].toUpperCase() : '?';
                }
                av.className = `contact-avatar ${avatarClass(activeChat.name)}`;
                document.getElementById('chat-name').innerText = activeChat.name;
            }
        }

        // If we have active chat, check for new messages to possibly mark as read
        const chatMsgs = messages.filter(m =>
            (m.sender_phone === myPhone && m.receiver_phone === activeChat.phone) ||
            (m.sender_phone === activeChat.phone && m.receiver_phone === myPhone)
        );
        const hasNewFromPartner = chatMsgs.some(m => m.sender_phone === activeChat.phone && !_renderedMsgIds.has(String(m.id)));
        if (hasNewFromPartner) markAsRead(activeChat.phone);

        // Always call renderMessages when chat is active to update read receipts for already rendered msgs
        renderMessages();
    }

    // Refresh contact modal if it's currently open
    const modal = document.getElementById('contacts-modal');
    if (modal && modal.classList.contains('open')) {
        renderContactsList(document.getElementById('contacts-search-input').value);
    }
}

async function markAsRead(sender) {
    await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=mark_read&phone=${encodeURIComponent(myPhone)}&sender=${encodeURIComponent(sender)}`
    });
    // We don't necessarily need to trigger syncData again here as it might be redundant, 
    // but the next sync will have unread_count=0.
}

function renderRecentChats(filter = '') {
    const list = document.getElementById('contact-list');
    if (!list) return;

    // Build a quick key to detect if anything changed
    const key = contacts.map(c => {
        const photo = c.profile_photo || '';
        const avatarKey = photo ? photo.length + photo.slice(-20) : 'none';
        return c.phone + (activeChat?.phone === c.phone ? '*' : '') + '|' + c.unread_count + '|' + avatarKey + '|' + c.is_contact;
    }).join('|') + `-${activeChat?.phone}-${filter}-${_activeFilter}`;

    if (key === _lastContactsKey) return;
    _lastContactsKey = key;

    // Filter contacts to only show "recent" ones + search match + pill filter
    const recent = contacts.filter(c => {
        // 1. Search filter
        const matchesSearch = (c.name && c.name.toLowerCase().includes(filter.toLowerCase())) || c.phone.includes(filter);
        if (!matchesSearch) return false;

        // 2. Pill filter
        if (_activeFilter === 'unread' && c.unread_count === 0) return false;
        if (_activeFilter === 'stranger' && Number(c.is_contact) !== 0) return false;

        // 3. Recent chat logic (has messages OR unread OR active OR stranger)
        const hasUnread = c.unread_count > 0;
        const isActive = activeChat?.phone === c.phone;
        const isStranger = Number(c.is_contact) === 0;
        const hasMessages = messages.some(m => m.sender_phone === c.phone || m.receiver_phone === c.phone);

        const isSavedContact = Number(c.is_contact) === 1;
        return hasUnread || isActive || hasMessages || isStranger || isSavedContact;
    });

    if (recent.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i data-lucide="${filter ? 'search-x' : 'message-square'}"></i>
                </div>
                <p>${filter ? 'No results found' : 'No recent chats'}</p>
                <span>${filter ? 'Try a different keyword' : 'Start a new conversation from Contacts'}</span>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    list.innerHTML = recent.map(c => `
                <div onclick="selectChat('${c.phone}')"
                     class="contact-item ${activeChat?.phone === c.phone ? 'active' : ''} ${Number(c.is_contact) === 0 ? 'stranger' : ''}">
                    <div class="contact-avatar ${avatarClass(c.name)}">
                        ${c.profile_photo ? `<img src="${c.profile_photo}" alt="" />` : (c.name ? c.name[0].toUpperCase() : '?')}
                    </div>
                    <div class="contact-info">
                        <h3>${c.name} ${Number(c.is_contact) === 0 ? '<span class="stranger-badge">New</span>' : ''}</h3>
                        <p>${activeChat?.phone === c.phone ? 'Active now' : (Number(c.is_contact) === 0 ? 'Stranger' : 'Tap to chat')}</p>
                    </div>
                    ${c.unread_count > 0 ? `<div class="unread-badge">${c.unread_count}</div>` : ''}
                </div>
            `).join('');
}


/**
 * Render All Contacts Modal
 */
function renderContactsList(filter = '') {
    const modalList = document.getElementById('contacts-modal-list');
    if (!modalList) return;

    const filtered = contacts.filter(c => {
        const matchesFilter = (c.name && c.name.toLowerCase().includes(filter.toLowerCase())) || c.phone.includes(filter);
        const isSaved = Number(c.is_contact) === 1;
        const hasHistory = messages.some(m => m.sender_phone === c.phone || m.receiver_phone === c.phone);

        return matchesFilter && (isSaved || hasHistory);
    });

    if (filtered.length === 0) {
        modalList.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim);">No contacts found</div>';
        return;
    }

    modalList.innerHTML = filtered.map(c => `
        <div class="modal-contact-item" onclick="selectChat('${c.phone}')">
            <div class="contact-avatar ${avatarClass(c.name)}">
                ${c.profile_photo ? `<img src="${c.profile_photo}" alt="" />` : (c.name ? c.name[0].toUpperCase() : '?')}
            </div>
            <div class="contact-info">
                <h3>${c.name}</h3>
                <p>${c.phone}</p>
            </div>
        </div>
    `).join('');

    lucide.createIcons();
}

function openContacts() {
    const modal = document.getElementById('contacts-modal');
    if (modal) {
        modal.classList.add('open');
        document.getElementById('contacts-search-input').value = '';
        renderContactsList();
    }
}

function closeContacts() {
    const modal = document.getElementById('contacts-modal');
    if (modal) modal.classList.remove('open');
}

function filterContactsList() {
    const query = document.getElementById('contacts-search-input').value;
    renderContactsList(query);
}

function filterRecentChats() {
    const query = document.getElementById('recent-search').value;
    renderRecentChats(query);
}

function setActiveFilter(filter, el) {
    _activeFilter = filter;

    // Update UI active state
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');

    // Trigger re-render (keeping current search query)
    const query = document.getElementById('recent-search').value;
    renderRecentChats(query);
}

function selectChat(phone) {
    const contact = contacts.find(c => c.phone === phone);
    if (!contact) return;
    activeChat = contact;
    closeContacts(); // Added: close modal if opening chat from there

    const av = document.getElementById('chat-avatar');
    if (contact.profile_photo) {
        av.innerHTML = `<img src="${contact.profile_photo}" alt="" />`;
    } else {
        av.textContent = contact.name ? contact.name[0].toUpperCase() : '?';
    }
    av.className = `contact-avatar ${avatarClass(contact.name)}`;
    av.style.cssText = 'width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;flex-shrink:0;';

    document.getElementById('chat-name').innerText = contact.name;
    document.getElementById('chat-status').classList.remove('hidden');

    // Full re-render when switching chats (reset incremental state)
    _renderedMsgIds.clear();
    _lastRenderedDate = '';
    _lastContactsKey = ''; // force contact highlight update

    // Check if this is a stranger (not in contacts)
    const isStranger = Number(contact.is_contact) === 0;
    const prompt = document.getElementById('safety-prompt');
    if (isStranger) {
        prompt.classList.remove('hidden');
        document.body.classList.add('stranger-active');
    } else {
        prompt.classList.add('hidden');
        document.body.classList.remove('stranger-active');
        markAsRead(phone); // notify backend only if not a stranger
    }

    renderRecentChats(); // Changed: updated name
    renderMessages().then(() => {
        // Force scroll to bottom on new chat opened
        const area = document.getElementById('messages-area');
        if (area) area.scrollTop = area.scrollHeight;
    });

    document.body.classList.add('chat-active');
    lucide.createIcons(); // refresh icons in prompt
}

async function acceptStranger() {
    if (!activeChat) return;
    const res = await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=add_contact&phone=${encodeURIComponent(myPhone)}&contact_phone=${encodeURIComponent(activeChat.phone)}`
    });
    const data = await res.json();
    if (data.status === 'success') {
        activeChat.is_contact = 1;
        document.getElementById('safety-prompt').classList.add('hidden');
        document.body.classList.remove('stranger-active');
        markAsRead(activeChat.phone); // mark as read once accepted
        _renderedMsgIds.clear(); // force full re-render to show hidden msgs
        renderMessages();
        syncData(); // refresh contact list state
    }
}

function closeChat() {
    document.body.classList.remove('chat-active');
    document.body.classList.remove('stranger-active');
    document.getElementById('safety-prompt')?.classList.add('hidden');
    activeChat = null;
    _lastContactsKey = '';
    renderContacts();
}

// ─── RENDER MESSAGES (incremental — never wipes existing bubbles) ──
async function renderMessages() {
    const area = document.getElementById('messages-area');
    const chatMsgs = messages.filter(m =>
        (m.sender_phone === myPhone && m.receiver_phone === activeChat.phone) ||
        (m.sender_phone === activeChat.phone && m.receiver_phone === myPhone)
    );

    const privKeyString = localStorage.getItem(`priv_key_${myPhone}`);
    if (!privKeyString) {
        area.innerHTML = `
                    <div class="key-error">
                        <div class="key-error-icon"><i data-lucide="key"></i></div>
                        <h3>Private key missing</h3>
                        <p>Your encryption key isn't in this browser's storage. Use the same browser you registered with, or clear cache and re-register.</p>
                    </div>`;
        lucide.createIcons();
        return;
    }

    // Cache the imported private key so we don't re-import it every 3 seconds
    if (!_cachedPrivKey || _cachedPrivPhone !== myPhone) {
        _cachedPrivKey = await window.crypto.subtle.importKey(
            "pkcs8", str2ab(atob(privKeyString)),
            { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]
        );
        _cachedPrivPhone = myPhone;
    }

    // If this is a stranger, hide messages
    const isStranger = Number(activeChat?.is_contact) === 0;
    if (isStranger) {
        area.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="eye-off"></i></div>
                <p>Messages are hidden</p>
                <span>Click "Yes, I know them" below to reveal the chat history.</span>
            </div>`;
        lucide.createIcons();
        return;
    }

    // If this is a fresh render (no rendered messages yet), clear old content
    const isInitialRender = _renderedMsgIds.size === 0;
    if (isInitialRender) {
        area.innerHTML = '';
    }

    if (!chatMsgs.length && _renderedMsgIds.size === 0) {
        area.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><i data-lucide="message-circle"></i></div><p>No messages yet</p><span>Say hello! 👋</span></div>`;
        lucide.createIcons();
        return;
    }

    let didAppend = false;

    for (const msg of chatMsgs) {
        if (_renderedMsgIds.has(String(msg.id))) {
            if (msg.sender_phone === myPhone) {
                const statusSpan = document.getElementById(`status-${msg.id}`);
                if (statusSpan) {
                    const isRead = Number(msg.is_read) === 1;
                    statusSpan.className = isRead ? 'msg-status read' : 'msg-status sent';
                    statusSpan.textContent = isRead ? '✓✓' : '✓';
                }
            }
            continue;
        }

        // Remove empty state if present
        const emptyState = area.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        let text = "[Encrypted]";
        try {
            const decryptString = async (cipherStr) => {
                if (!cipherStr) return "[Sent]";
                const parts = cipherStr.split('::');
                let decBytes = new Uint8Array(0);
                for (const part of parts) {
                    if (!part) continue;
                    const dec = await window.crypto.subtle.decrypt(
                        { name: "RSA-OAEP" }, _cachedPrivKey, str2ab(atob(part))
                    );
                    const chunk = new Uint8Array(dec);
                    const newBytes = new Uint8Array(decBytes.length + chunk.length);
                    newBytes.set(decBytes);
                    newBytes.set(chunk, decBytes.length);
                    decBytes = newBytes;
                }
                return new TextDecoder().decode(decBytes);
            };

            if (msg.receiver_phone === myPhone) {
                text = await decryptString(msg.ciphertext);
            } else {
                if (msg.sender_ciphertext) {
                    text = await decryptString(msg.sender_ciphertext);
                } else {
                    text = "[Sent]";
                }
            }
        } catch (e) { text = "[Error decrypting]"; }

        _renderedMsgIds.add(String(msg.id));
        const isMe = msg.sender_phone === myPhone;
        const timeStr = fmtTime(msg.timestamp);

        let msgDateStr = '';
        if (msg.timestamp) {
            const ds = new Date(msg.timestamp.replace(' ', 'T'));
            if (!isNaN(ds)) {
                msgDateStr = ds.toLocaleDateString('en-GB');
            }
        }

        if (msgDateStr && msgDateStr !== _lastRenderedDate) {
            _lastRenderedDate = msgDateStr;

            const ds = new Date(msg.timestamp.replace(' ', 'T'));
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            let displayDate = msgDateStr;
            if (ds.toDateString() === today.toDateString()) {
                displayDate = "Today";
            } else if (ds.toDateString() === yesterday.toDateString()) {
                displayDate = "Yesterday";
            } else {
                displayDate = ds.toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
            }

            const dateDiv = document.createElement('div');
            dateDiv.className = 'date-separator';
            dateDiv.innerHTML = `<span>${displayDate}</span>`;
            area.appendChild(dateDiv);
        }

        const div = document.createElement('div');
        div.className = `msg-row ${isMe ? 'sent' : 'received'}`;

        let statusHtml = '';
        if (isMe) {
            const isRead = Number(msg.is_read) === 1;
            statusHtml = `<span id="status-${msg.id}" class="msg-status ${isRead ? 'read' : 'sent'}">${isRead ? '✓✓' : '✓'}</span>`;
        }

        div.innerHTML = `
                    <div class="bubble">
                        <span class="bubble-text">${text}</span>
                        ${timeStr ? `<span class="msg-spacer"></span><span class="bubble-time">${timeStr} ${statusHtml}</span>` : ''}
                    </div>`;
        area.appendChild(div);
        didAppend = true;
    }

    if (didAppend) {
        // Only auto-scroll to bottom if the user is already near the bottom
        // (so we don't yank their screen if they're reading old messages)
        const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
        if (isInitialRender || isNearBottom) {
            area.scrollTop = area.scrollHeight;
        }
    }
}

// ─── SCROLL TO BOTTOM ────────────────────────────────────────
function scrollToBottom() {
    const area = document.getElementById('messages-area');
    if (area) {
        area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
    }
}

// Watch scroll position to show/hide button
document.getElementById('messages-area')?.addEventListener('scroll', function (e) {
    const btn = document.getElementById('scroll-bottom-btn');
    if (!btn) return;
    const isNearBottom = this.scrollHeight - this.scrollTop - this.clientHeight < 100;
    if (isNearBottom) {
        btn.classList.add('hidden');
    } else {
        btn.classList.remove('hidden');
    }
});

// ─── SEND MESSAGE ────────────────────────────────────────────
async function sendMessage(e) {
    e.preventDefault();
    const text = document.getElementById('msg-input').value.trim();
    if (!text || !activeChat) return;

    const pubKey = await window.crypto.subtle.importKey(
        "spki", str2ab(atob(activeChat.public_key)),
        { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
    );

    const maxChunkSize = 150;
    const textBytes = new TextEncoder().encode(text);

    const encryptString = async (key) => {
        const chunks = [];
        for (let i = 0; i < textBytes.length; i += maxChunkSize) {
            const chunk = textBytes.slice(i, i + maxChunkSize);
            const enc = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, chunk);
            const cipherBin = String.fromCharCode(...new Uint8Array(enc));
            chunks.push(btoa(cipherBin));
        }
        return chunks.join('::');
    };

    const cipher = await encryptString(pubKey);

    let senderCipher = '';
    if (myPublicKey) {
        senderCipher = await encryptString(myPublicKey);
    }

    // Use a URLSearchParams object to safely build the payload, avoiding issues with very long 
    // encrypted strings or special characters breaking the raw string concatenation
    const payload = new URLSearchParams({
        action: 'send',
        phone: myPhone,
        receiver: activeChat.phone,
        ciphertext: cipher,
        sender_ciphertext: senderCipher,
        iv: 'rsa'
    });

    await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString()
    });

    document.getElementById('msg-input').value = '';
    // Force auto-scroll for sent messages
    const area = document.getElementById('messages-area');
    if (area) area.scrollTop = area.scrollHeight;
    syncData();
}

// ─── UTILS ───────────────────────────────────────────────────
function str2ab(str) {
    const buf = new ArrayBuffer(str.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i);
    return buf;
}

function cleanupOldCache() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sent_msg_')) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
}

function setFooter(name, phone, photo) {
    const avatarEl = document.getElementById('footer-avatar');
    if (photo) {
        avatarEl.innerHTML = `<img src="${photo}" alt="Avatar" />`;
    } else {
        avatarEl.textContent = (name || phone)[0].toUpperCase();
    }

    document.getElementById('current-user-name').textContent = name || phone;
    document.getElementById('current-user-display').textContent = phone;
}

async function refreshMyProfile() {
    if (!myPhone) return;
    const res = await fetch(`api.php?action=get_my_key&phone=${encodeURIComponent(myPhone)}`);
    const data = await res.json();
    if (data.name) {
        myName = data.name;
        sessionStorage.setItem('tab_name', myName);
    }
    // Always update myPhoto even if empty (e.g. removed or failed to save previously)
    myPhoto = data.profile_photo || "";
    sessionStorage.setItem('tab_photo', myPhoto);
    setFooter(myName, myPhone, myPhoto);
}

function openSettings() {
    document.getElementById('settings-name').value = myName;
    document.getElementById('settings-phone').value = myPhone;
    _tempPhotoData = myPhoto; // reset temp state
    updateSettingsPreview(myPhoto);
    document.getElementById('settings-modal').classList.add('open');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('open');
}

function updateSettingsPreview(photo) {
    const preview = document.getElementById('settings-photo-preview');
    if (photo) {
        preview.innerHTML = `<img src="${photo}" alt="Profile" />`;
    } else {
        preview.textContent = (myName || myPhone)[0]?.toUpperCase() || '?';
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

let _tempPhotoData = "";

function triggerPhotoUpload() {
    document.getElementById('settings-photo').click();
}

function removePhoto() {
    _tempPhotoData = "";
    updateSettingsPreview("");
}

async function saveSettings() {
    const name = document.getElementById('settings-name').value.trim();
    const photoData = _tempPhotoData;

    const params = new URLSearchParams({
        action: 'update_profile',
        phone: myPhone,
        name,
        profile_photo: photoData
    });

    const res = await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });
    const data = await res.json();
    if (data.status === 'success') {
        myName = name || myName;
        myPhoto = photoData;
        sessionStorage.setItem('tab_name', myName);
        sessionStorage.setItem('tab_photo', myPhoto);
        setFooter(myName, myPhone, myPhoto);
        closeSettings();
        // Update contact list so others see the new photo (and it shows immediately for us)
        syncData();
    } else {
        alert('Could not save settings. Please try again.');
    }
}

// ─── INIT ────────────────────────────────────────────────────
lucide.createIcons();
cleanupOldCache();

document.getElementById('settings-photo')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    _tempPhotoData = dataUrl;
    updateSettingsPreview(dataUrl);
    // Reset file input so same file can be selected again
    event.target.value = '';
});

if (myPhone) {
    setFooter(myName, myPhone, myPhoto);
    document.getElementById('auth-screen').classList.add('hidden');

    fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=login_session&phone=${myPhone}`
    }).then(r => r.json()).then(async data => {
        // Update name if server returned a fresher value
        if (data.name && data.name !== myName) {
            myName = data.name;
            sessionStorage.setItem('tab_name', myName);
        }
        if (data.profile_photo !== undefined) {
            myPhoto = data.profile_photo || "";
            sessionStorage.setItem('tab_photo', myPhoto);
        }
        setFooter(myName, myPhone, myPhoto);

        // Make sure we have the latest profile info (photo/name) and public key.
        await refreshMyProfile();
        await loadMyPublicKey();
        syncData();
        setInterval(syncData, 3000);
    });

    // sync whenever the window/tab regains focus, keeping contact avatars fresh
    window.addEventListener('focus', () => {
        refreshMyProfile();
        syncData();
    });
} else {
    document.getElementById('auth-screen').classList.remove('hidden');
}