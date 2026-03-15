<?php
require_once 'security.php'; // 🛡️ LOAD SECURITY RULES FIRST
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DoTX | Secure Messenger</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
        rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <link rel="stylesheet" href="assets/css/style.css">
</head>

<body>

    <!-- ═══ AUTH SCREEN ═══════════════════════════════════════════ -->
    <div id="auth-screen">
        <div class="auth-bg"></div>
        <div class="auth-orb auth-orb-1"></div>
        <div class="auth-orb auth-orb-2"></div>

        <div class="auth-card">
            <div class="auth-icon">
                <i data-lucide="shield-check"></i>
            </div>
            <h1 class="auth-title">Welcome to DoTX</h1>
            <p class="auth-sub">Private, encrypted messaging — only for you.</p>

            <div id="auth-step-1">
                <input type="tel" id="auth-phone" placeholder="Enter mobile number" class="auth-input"
                    autocomplete="tel" onkeydown="if(event.key === 'Enter') checkUser()">
                <button onclick="checkUser()" class="auth-btn">Continue →</button>
            </div>

            <div id="auth-step-2" class="hidden">
                <p class="auth-note-success">✓ Account found! Enter your OTP.</p>
                <input type="text" id="auth-otp" placeholder="Enter OTP (hint: 1234)" class="auth-input"
                    style="text-align:center;letter-spacing:6px;font-size:20px;font-weight:700;"
                    onkeydown="if(event.key === 'Enter') loginUser()">
                <button onclick="loginUser()" class="auth-btn">Verify & Login</button>
            </div>

            <div id="auth-step-signup" class="hidden" style="text-align:left;">
                <p class="auth-note-info">✦ New number — create your account.</p>
                <label class="auth-label">Your Display Name</label>
                <input type="text" id="auth-name" placeholder="e.g. Abhishek" class="auth-input" autocomplete="name"
                    onkeydown="if(event.key === 'Enter') registerUser()">
                <button onclick="registerUser()" class="auth-btn">Create Account →</button>
            </div>
        </div>
    </div>

    <!-- ═══ APP SHELL ════════════════════════════════════════════ -->
    <div id="app-container">
        <!-- ═══ NAVIGATION SIDEBAR (LEFT) ══════════════ -->
        <nav id="nav-sidebar">
            <div class="nav-top">
                <div class="nav-logo">
                    <i data-lucide="message-square"></i>
                </div>

                <button class="nav-btn" onclick="openContacts()" title="All Contacts">
                    <i data-lucide="users"></i>
                </button>
                <button class="nav-btn" onclick="openAddContact()" title="Add Contact">
                    <i data-lucide="user-plus"></i>
                </button>
            </div>

            <div class="nav-bottom">
                <button class="nav-btn" onclick="openSettings()" title="Settings">
                    <i data-lucide="settings"></i>
                </button>
            </div>
        </nav>

        <!-- ── Sidebar ─────────────────────────────────────────── -->
        <aside>
            <div class="sidebar-header">
                <div class="logo">
                    DoTX
                </div>
                <!-- Icons for mobile (hidden on desktop) -->
                <div class="mobile-nav-actions hidden-desktop">
                    <button class="nav-btn" onclick="openContacts()">
                        <i data-lucide="users"></i>
                    </button>
                    <button class="nav-btn" onclick="openAddContact()">
                        <i data-lucide="user-plus"></i>
                    </button>
                    <button class="nav-btn" onclick="openSettings()">
                        <i data-lucide="settings"></i>
                    </button>
                </div>
            </div>

            <div class="sidebar-search">
                <div class="search-input-wrapper">
                    <i data-lucide="search"></i>
                    <input type="text" id="recent-search" placeholder="Search or start a new chat"
                        oninput="filterRecentChats()">
                </div>
                <div class="filter-pills">
                    <button class="filter-pill active" onclick="setActiveFilter('all', this)">All</button>
                    <button class="filter-pill" onclick="setActiveFilter('unread', this)">Unread</button>
                    <button class="filter-pill" onclick="setActiveFilter('stranger', this)">Strangers</button>
                </div>
            </div>

            <div class="contact-section-label">Recent Messages</div>
            <div id="contact-list"></div>

            <div class="sidebar-footer">
                <div class="footer-avatar" id="footer-avatar">?</div>
                <div class="footer-info">
                    <div class="user-name" id="current-user-name">—</div>
                    <div class="phone" id="current-user-display">—</div>
                </div>
                <button class="logout-btn" onclick="logoutUser()" title="Logout">
                    <i data-lucide="log-out"></i>
                </button>
            </div>
        </aside>

        <!-- ── Main Chat ───────────────────────────────────────── -->
        <main>
            <div class="chat-header">
                <button class="back-btn hidden-desktop" onclick="closeChat()" title="Back">
                    <i data-lucide="arrow-left"></i>
                </button>
                <div id="chat-avatar">?</div>
                <div class="chat-header-info">
                    <h2 id="chat-name">Select a Chat</h2>
                    <div id="chat-status" class="hidden">
                        <i data-lucide="lock"></i> End-to-End Encrypted
                    </div>
                </div>
            </div>

            <div id="messages-area">
                <div class="empty-state">
                    <div class="empty-state-icon"><i data-lucide="lock"></i></div>
                    <p>Your messages are encrypted</p>
                    <span>Select a contact to start chatting</span>
                </div>
            </div>

            <!-- Stranger Security Prompt -->
            <div id="safety-prompt" class="hidden">
                <div class="safety-content">
                    <div class="safety-icon"><i data-lucide="shield-alert"></i></div>
                    <div class="safety-info">
                        <h3>Stranger Alert</h3>
                        <p>This person is not in your contacts. Do you know them?</p>
                    </div>
                    <div class="safety-actions">
                        <button onclick="acceptStranger()" class="safety-btn accept">Yes, I know them</button>
                        <button onclick="closeChat()" class="safety-btn ignore">No, Ignore</button>
                    </div>
                </div>
            </div>

            <button id="scroll-bottom-btn" class="hidden" onclick="scrollToBottom()" title="Scroll to latest">
                <i data-lucide="chevron-down"></i>
            </button>

            <div class="input-area">
                <form onsubmit="sendMessage(event)" class="input-form">
                    <input type="text" id="msg-input" placeholder="Type a message…" autocomplete="off">
                    <button type="submit" class="send-btn">
                        <i data-lucide="send"></i>
                    </button>
                </form>
            </div>
        </main>
    </div>

    <!-- ═══ ADD CONTACT MODAL ════════════════════════════════════ -->
    <div id="add-contact-modal">
        <div class="modal-card">
            <div class="modal-title">
                <div class="modal-title-icon"><i data-lucide="user-plus"></i></div>
                Add New Contact
            </div>
            <input type="tel" id="new-contact-phone" placeholder="Enter mobile number" class="modal-input"
                autocomplete="tel" onkeydown="if(event.key === 'Enter') verifyAndAddContact()">
            <div id="contact-error">⚠ User not found in DoTX. Check the number and try again.</div>
            <div class="modal-actions">
                <button onclick="closeAddContact()" class="modal-btn-cancel">Cancel</button>
                <button onclick="verifyAndAddContact()" class="modal-btn-add">Add Contact</button>
            </div>
        </div>
    </div>

    <!-- ═══ SETTINGS MODAL ════════════════════════════════════════════ -->
    <div id="settings-modal">
        <div class="modal-card">
            <div class="modal-title">
                <div class="modal-title-icon"><i data-lucide="settings"></i></div>
                Settings
            </div>
            <div class="settings-block">
                <div class="settings-label">Profile Photo</div>
                <div class="settings-photo-row">
                    <div id="settings-photo-preview" class="settings-photo-preview">?</div>
                    <div class="settings-photo-actions">
                        <button onclick="triggerPhotoUpload()" class="settings-action-btn">
                            <i data-lucide="upload"></i> Upload Photo
                        </button>
                        <button onclick="removePhoto()" class="settings-action-btn delete">
                            <i data-lucide="trash-2"></i> Remove
                        </button>
                        <input type="file" id="settings-photo" accept="image/*" style="display:none;" />
                    </div>
                </div>
            </div>
            <div class="settings-block">
                <label class="settings-label" for="settings-name">Display Name</label>
                <input type="text" id="settings-name" placeholder="Your display name" class="modal-input" />
            </div>
            <div class="settings-block">
                <label class="settings-label" for="settings-phone">Phone Number</label>
                <input type="text" id="settings-phone" readonly class="modal-input" />
            </div>
            <div class="modal-actions">
                <button onclick="closeSettings()" class="modal-btn-cancel">Cancel</button>
                <button onclick="saveSettings()" class="modal-btn-add">Save</button>
            </div>
        </div>
    </div>

    <!-- ═══ CONTACTS LIST MODAL ════════════════════════════════ -->
    <div id="contacts-modal">
        <div class="modal-card contacts-modal-card">
            <div class="modal-title">
                <div class="modal-title-icon"><i data-lucide="users"></i></div>
                All Contacts
            </div>
            <div class="contacts-search">
                <input type="text" id="contacts-search-input" placeholder="Search contacts..."
                    oninput="filterContactsList()">
            </div>
            <div id="contacts-modal-list" class="modal-scroll-list">
                <!-- Contacts will be rendered here -->
            </div>
            <div class="modal-actions">
                <button onclick="closeContacts()" class="modal-btn-cancel">Close</button>
            </div>
        </div>
    </div>

    <script src="assets/js/main.js"></script>
</body>

</html>