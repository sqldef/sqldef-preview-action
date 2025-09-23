# sqldef-preview-action

This is a GitHub Action that runs [sqldef](https://github.com/sqldef/sqldef) to preview the schema changes in pull requests.


## How it works

This action is triggered by a pull request.

1. Prepares a database
2. Downloads an appropriate sqldef binary
3. Gets the schema file from the base branch ("baseline schema")
4. Applies the baseline schema to the database
5. Switches to the current branch
6. Applies the current schema to the database
7. Comment to the output of (6) to the pull request

## Parameters

- `sqldef-version`: the version of sqldef to download (default: `v3.0.0`)
- `command`: `psqldef | mysqldef | sqlite3def | mssqldef`
- `pg-user`: the user of PostgreSQL
- `pg-password`: the password of PostgreSQL
- `pg-host`: the host of PostgreSQL
- `pg-port`: the port of PostgreSQL
- `pg-database`: the database of PostgreSQL
- `mysql-*`: the connection parameters for MySQL
- `sqlite-*`: the connection parameters for SQLite
- `mssql-*`: the connection parameters for Microsoft SQL Server
- `schema-file`: the path to the schema file
- `config-file`: the path to the config file of sqldef
