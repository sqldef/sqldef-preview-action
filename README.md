# SQLDef Preview Action

[![CI](https://github.com/gfx/sqldef-preview-action/actions/workflows/ci.yaml/badge.svg)](https://github.com/gfx/sqldef-preview-action/actions/workflows/ci.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A GitHub Action that previews SQL schema migrations of [sqldef](https://github.com/sqldef/sqldef) on pull requests. It automatically generates a preview of schema changes between your base branch and PR branch, posting the DDLs as a comment on your pull request.

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
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

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
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### MySQL Example

```yaml
- uses: gfx/sqldef-preview-action@v1
  with:
    command: mysqldef
    schema-file: schema/database.sql
    mysql-user: root
    mysql-password: ${{ secrets.MYSQL_PASSWORD }}
    mysql-host: 127.0.0.1
    mysql-database: testdb
```

### SQLite Example

```yaml
- uses: gfx/sqldef-preview-action@v1
  with:
    command: sqlite3def
    schema-file: schema/database.sql
    sqlite-database: test.db
```

### SQL Server Example

```yaml
- uses: gfx/sqldef-preview-action@v1
  with:
    command: mssqldef
    schema-file: schema/database.sql
    mssql-user: SA
    mssql-password: ${{ secrets.MSSQL_PASSWORD }}
    mssql-database: testdb
```

## Input Parameters

### Required Parameters

| Parameter | Description | Required |
|-----------|-------------|----------|
| `command` | SQLDef command to use: `psqldef`, `mysqldef`, `sqlite3def`, or `mssqldef` | ✅ |
| `schema-file` | Path to the SQL schema file | ✅ |

### Optional Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `version` | Version of sqldef to use (e.g., `v3.0.0` or `latest`) | `v3.0.0` |
| `baseline-schema-file` | Path to baseline schema file for comparison | Auto-fetched from base branch |
| `config-file` | Path to sqldef config file | - |
| `github-token` | GitHub token for commenting on pull requests | `${{ github.token }}` |

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

## Advanced Configuration

### Using sqldef Config Files

You can use sqldef configuration files for additional settings:

```yaml
- uses: gfx/sqldef-preview-action@v1
  with:
    command: psqldef
    schema-file: schema/database.sql
    config-file: .sqldef.yaml
    # ... database connection parameters
```

### Using with Docker Compose

For complex database setups, combine with Docker Compose:

```yaml
steps:
  - uses: actions/checkout@v5
    with:
      fetch-depth: 0

  - name: Start database services
    run: docker-compose up -d

  - name: Wait for database
    run: |
      for i in {1..30}; do
        if docker exec postgres pg_isready; then
          break
        fi
        sleep 2
      done

  - uses: gfx/sqldef-preview-action@v1
    with:
      command: psqldef
      schema-file: schema/database.sql
      # ... connection parameters
```

## Example PR Comment

When schema changes are detected, the action posts a comment like this:

```sql
## SQLDef Migration Preview

~~~sql
ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL;
CREATE INDEX idx_users_email ON users(email);
~~~

This comment was created by sqldef-preview-action.
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
