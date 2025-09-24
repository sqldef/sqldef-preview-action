# SQLDef Preview Action

[![CI](https://github.com/gfx/sqldef-preview-action/actions/workflows/ci.yaml/badge.svg)](https://github.com/gfx/sqldef-preview-action/actions/workflows/ci.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A GitHub Action that previews SQL schema migrations of [sqldef](https://github.com/sqldef/sqldef) on pull requests. It automatically generates a preview of schema changes between your base branch and PR branch, posting the migration DDL as a comment on your pull request.

## Features

- **Automatic Schema Diff Preview**: Automatically compares schema changes between branches and displays the migration SQL
- **Multiple Database Support**: Works with PostgreSQL, MySQL, SQLite, and SQL Server
- **PR Comments**: Posts schema changes as comments on pull requests for easy review

## How It Works

When triggered on a pull request, this action:

1. Downloads the appropriate sqldef binary for your database
2. Sets up database connection using provided credentials
3. Fetches the schema file from the base branch (baseline schema)
4. Applies the baseline schema to the database
5. Applies the new schema from the PR branch and captures the output
6. Posts the schema changes as a comment on the pull request

## Usage

### Basic Example (PostgreSQL)

```yaml
name: Preview Schema Changes

on:
  pull_request:
    paths:
      - 'schema/**/*.sql'

permissions:
  contents: read
  pull-requests: write

jobs:
  preview-schema:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: testdb
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0  # Required to fetch base branch

      - uses: gfx/sqldef-preview-action@v1
        with:
          command: psqldef
          schema-file: schema/database.sql
          pg-user: postgres
          pg-password: postgres
          pg-database: testdb
          github-token: ${{ github.token }}
```

### MySQL Example

```yaml
jobs:
  preview-schema:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: testpassword
          MYSQL_DATABASE: testdb
        options: >-
          --health-cmd "mysqladmin ping -h localhost"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 10
        ports:
          - 3306:3306

    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - uses: gfx/sqldef-preview-action@v1
        with:
          command: mysqldef
          schema-file: schema/database.sql
          mysql-user: root
          mysql-password: testpassword
          mysql-host: 127.0.0.1
          mysql-database: testdb
          github-token: ${{ github.token }}
```

### SQLite Example

```yaml
- uses: gfx/sqldef-preview-action@v1
  with:
    command: sqlite3def
    schema-file: schema/database.sql
    sqlite-database: test.db
    github-token: ${{ github.token }}
```

### SQL Server Example

```yaml
jobs:
  preview-schema:
    runs-on: ubuntu-latest

    services:
      mssql:
        image: mcr.microsoft.com/mssql/server:2022-latest
        env:
          ACCEPT_EULA: Y
          SA_PASSWORD: YourStrong@Passw0rd
        options: >-
          --health-cmd "/opt/mssql-tools18/bin/sqlcmd -S localhost -U SA -P YourStrong@Passw0rd -Q 'SELECT 1' -C"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 10
          --health-start-period 20s
        ports:
          - 1433:1433

    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Create database
        run: |
          sudo apt-get update && sudo apt-get install -y curl gnupg
          curl https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
          curl https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
          sudo apt-get update
          sudo ACCEPT_EULA=Y apt-get install -y mssql-tools18
          /opt/mssql-tools18/bin/sqlcmd -S localhost -U SA -P "YourStrong@Passw0rd" -Q "CREATE DATABASE testdb;" -C

      - uses: gfx/sqldef-preview-action@v1
        with:
          command: mssqldef
          schema-file: schema/database.sql
          mssql-user: SA
          mssql-password: YourStrong@Passw0rd
          mssql-database: testdb
          github-token: ${{ github.token }}
```

## Input Parameters

### Required Parameters

| Parameter | Description | Required |
|-----------|-------------|----------|
| `command` | SQLDef command to use: `psqldef`, `mysqldef`, `sqlite3def`, or `mssqldef` | ✅ |
| `schema-file` | Path to the SQL schema file | ✅ |
| `github-token` | GitHub token for commenting on pull requests | ✅ |

### Optional Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `version` | Version of sqldef to use (e.g., `v3.0.1` or `latest`) | `v3.0.1` |
| `config-file` | Path to sqldef config file | - |

### PostgreSQL Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `pg-user` | PostgreSQL user | - |
| `pg-password` | PostgreSQL password | - |
| `pg-host` | PostgreSQL host | `localhost` |
| `pg-port` | PostgreSQL port | `5432` |
| `pg-database` | PostgreSQL database name | - |

### MySQL Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `mysql-user` | MySQL user | - |
| `mysql-password` | MySQL password | - |
| `mysql-host` | MySQL host | `localhost` |
| `mysql-port` | MySQL port | `3306` |
| `mysql-database` | MySQL database name | - |

### SQLite Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `sqlite-database` | SQLite database file path | - |

### SQL Server Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `mssql-user` | SQL Server user | - |
| `mssql-password` | SQL Server password | - |
| `mssql-host` | SQL Server host | `localhost` |
| `mssql-port` | SQL Server port | `1433` |
| `mssql-database` | SQL Server database name | - |

## Example PR Comment

When schema changes are detected, the action posts a comment like this:

```sql
## SQLDef Migration Preview

~~~sql
ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL;
CREATE INDEX idx_users_email ON users(email);
~~~

This comment was generated by [SQLDef Preview](https://github.com/YOUR_ORGANIZATION/YOUR_REPO/actions/runs/RUN_ID), powered by [sqldef/sqldef-preview-action](https://github.com/sqldef/sqldef-preview-action).
```

## Development

### Building from Source

```bash
# Install dependencies
npm ci

# Build TypeScript
npm run build

# Package for distribution
npm run package

# Run all checks and build packages
npm run all
```

### Running Tests

Example workflows are provided in [.github/workflows/example.yaml](.github/workflows/example.yaml) that demonstrate usage with all supported databases.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
