CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    username NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) NULL,
    created_at DATETIME2 NOT NULL
);

CREATE INDEX idx_users_email ON users(email);