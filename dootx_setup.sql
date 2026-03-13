-- ============================================================
--  DoTX — Secure Messenger
--  Database Setup Script
--  Run this once in phpMyAdmin or MySQL CLI
-- ============================================================

CREATE DATABASE IF NOT EXISTS dotx
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE dotx;

-- ------------------------------------------------------------
-- 1. USERS
--    Stores registered users and their RSA public keys
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    phone         VARCHAR(20)  NOT NULL UNIQUE,
    name          VARCHAR(100) NOT NULL DEFAULT 'User',
    public_key    TEXT         NOT NULL,               -- Base64-encoded RSA-2048 SPKI public key
    profile_photo TEXT         NULL,                   -- Optional Data-URL profile image (base64)
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 2. CONTACTS
--    Many-to-many relationship between users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_phone    VARCHAR(20) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    added_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_contact (user_phone, contact_phone),
    FOREIGN KEY (user_phone)    REFERENCES users(phone) ON DELETE CASCADE,
    FOREIGN KEY (contact_phone) REFERENCES users(phone) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 3. MESSAGES
--    End-to-end encrypted messages (RSA-OAEP)
--    ciphertext: Base64-encoded RSA-encrypted payload
--    iv        : Kept for AES hybrid compatibility (currently "rsa")
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sender_phone     VARCHAR(20)  NOT NULL,
    receiver_phone   VARCHAR(20)  NOT NULL,
    ciphertext       TEXT         NOT NULL,              -- Encrypted with RECIPIENT's public key
    sender_ciphertext TEXT        NULL,                  -- Encrypted with SENDER's own public key
    iv               VARCHAR(64)  NOT NULL DEFAULT 'rsa',
    `timestamp`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_phone)   REFERENCES users(phone) ON DELETE CASCADE,
    FOREIGN KEY (receiver_phone) REFERENCES users(phone) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- If the table already exists, run this ALTER to add the new column:
-- ALTER TABLE messages ADD COLUMN sender_ciphertext TEXT NULL AFTER ciphertext;
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Indexes for fast message thread lookups
-- ------------------------------------------------------------
CREATE INDEX idx_msg_sender   ON messages (sender_phone);
CREATE INDEX idx_msg_receiver ON messages (receiver_phone);
