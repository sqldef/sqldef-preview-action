CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_users_email ON users(email);